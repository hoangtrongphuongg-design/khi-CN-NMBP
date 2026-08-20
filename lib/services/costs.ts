import { sql } from "@/lib/db";
import { toDateInput, toDateKey } from "@/lib/utils";

export type ReportWindow = {
  month: string;
  startDate: string;
  calendarEndExclusive: string;
  dataEndExclusive: string;
  asOfDate: string;
  isCurrentMonth: boolean;
  isFutureMonth: boolean;
};

function addDays(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonths(month: string, delta: number) {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
}

export function getReportWindow(month: string): ReportWindow {
  const today = toDateInput(new Date());
  const currentMonth = today.slice(0, 7);
  const safeMonth = /^\d{4}-\d{2}$/.test(month) ? month : currentMonth;
  const startDate = `${safeMonth}-01`;
  const calendarEndExclusive = `${addMonths(safeMonth, 1)}-01`;
  const isCurrentMonth = safeMonth === currentMonth;
  const isFutureMonth = safeMonth > currentMonth;
  const dataEndExclusive = isFutureMonth ? startDate : isCurrentMonth ? addDays(today, 1) : calendarEndExclusive;
  const asOfDate = isFutureMonth ? startDate : addDays(dataEndExclusive, -1);
  return { month: safeMonth, startDate, calendarEndExclusive, dataEndExclusive, asOfDate, isCurrentMonth, isFutureMonth };
}


export type DateRangeWindow = {
  requestedStartDate: string;
  requestedEndDate: string;
  startDate: string;
  selectedEndDate: string;
  dataEndExclusive: string;
  asOfDate: string;
  includesFuture: boolean;
  isAllFuture: boolean;
};

function isValidDateKey(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function getDateRangeWindow(startInput?: string | null, endInput?: string | null): DateRangeWindow {
  const today = toDateInput(new Date());
  const defaultStart = `${today.slice(0, 7)}-01`;
  let requestedStartDate = isValidDateKey(startInput) ? String(startInput) : defaultStart;
  let requestedEndDate = isValidDateKey(endInput) ? String(endInput) : today;

  // Nếu nhập ngược, tự đổi thứ tự để người dùng vẫn xem được báo cáo.
  if (requestedStartDate > requestedEndDate) {
    [requestedStartDate, requestedEndDate] = [requestedEndDate, requestedStartDate];
  }

  const includesFuture = requestedEndDate > today;
  const isAllFuture = requestedStartDate > today;
  const effectiveEndDate = requestedEndDate > today ? today : requestedEndDate;
  const dataEndExclusive = isAllFuture ? requestedStartDate : addDays(effectiveEndDate, 1);

  return {
    requestedStartDate,
    requestedEndDate,
    startDate: requestedStartDate,
    selectedEndDate: requestedEndDate,
    dataEndExclusive,
    asOfDate: effectiveEndDate,
    includesFuture,
    isAllFuture,
  };
}

export type CylinderRentalDailyRow = {
  day: string;
  product_id: string;
  product_code: string;
  product_name: string;
  unit: string;
  held_qty: number;
  supplier_in: number;
  supplier_out: number;
  net_change: number;
  unit_price: number;
  rental_amount: number;
};

export type CylinderRentalSummaryRow = {
  product_id: string;
  product_code: string;
  product_name: string;
  unit: string;
  opening_qty: number;
  closing_qty: number;
  bottle_days: number;
  unit_price_from: number;
  unit_price_to: number;
  rental_amount: number;
  missing_price_days: number;
};

/**
 * Thuê vỏ = tổng số vỏ cuối từng ngày của từng loại khí × đơn giá thuê có hiệu lực ngày đó.
 * Số vỏ tính thuê được dựng từ "nợ vỏ đầu kỳ" + giao NCC - trả NCC.
 * Nghiệp vụ nội bộ Kho/Nhóm/Mỏ không ảnh hưởng số vỏ thuê.
 */
export async function getCylinderRentalDaily(params: {
  startDate: string;
  endDateExclusive: string;
  productId?: string | null;
}): Promise<CylinderRentalDailyRow[]> {
  if (params.endDateExclusive <= params.startDate) return [] as CylinderRentalDailyRow[];
  const rows = await sql`
    WITH days AS (
      SELECT d::date AS day
      FROM generate_series(
        ${params.startDate}::date,
        (${params.endDateExclusive}::date - interval '1 day')::date,
        interval '1 day'
      ) gs(d)
    ), eligible_products AS (
      SELECT id,code,name,unit,display_order
      FROM products
      WHERE active=true
        AND cylinder_rental_eligible=true
        AND (${params.productId ?? null}::uuid IS NULL OR id=${params.productId ?? null}::uuid)
    )
    SELECT
      days.day,
      p.id AS product_id,
      p.code AS product_code,
      p.name AS product_name,
      p.unit,
      GREATEST(0,COALESCE(held.held_qty,0))::float8 AS held_qty,
      COALESCE(mv.supplier_in,0)::float8 AS supplier_in,
      COALESCE(mv.supplier_out,0)::float8 AS supplier_out,
      (COALESCE(mv.supplier_in,0)-COALESCE(mv.supplier_out,0))::float8 AS net_change,
      COALESCE(pr.unit_price,0)::float8 AS unit_price,
      (GREATEST(0,COALESCE(held.held_qty,0))*COALESCE(pr.unit_price,0))::float8 AS rental_amount
    FROM days
    CROSS JOIN eligible_products p
    LEFT JOIN LATERAL (
      SELECT ob.opening_date,ob.qty
      FROM supplier_container_opening_balances ob
      WHERE ob.product_id=p.id
        AND ob.opening_date<=days.day
      ORDER BY ob.opening_date DESC
      LIMIT 1
    ) opening ON true
    LEFT JOIN LATERAL (
      SELECT (
        COALESCE(opening.qty,0)
        + COALESCE(SUM(
            CASE
              WHEN sl.reference_type IN ('supplier_delivery','supplier_delivery_mine') AND sl.delta>0 THEN sl.delta
              WHEN sl.reference_type='supplier_return' AND sl.delta<0 THEN sl.delta
              ELSE 0
            END
          ),0)
      )::numeric AS held_qty
      FROM stock_ledger sl
      WHERE sl.product_id=p.id
        AND sl.occurred_at >= COALESCE(
          opening.opening_date AT TIME ZONE 'Asia/Ho_Chi_Minh',
          '1900-01-01 00:00:00+07'::timestamptz
        )
        AND sl.occurred_at < ((days.day + interval '1 day') AT TIME ZONE 'Asia/Ho_Chi_Minh')
    ) held ON true
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(CASE WHEN sl.reference_type IN ('supplier_delivery','supplier_delivery_mine') AND sl.delta>0 THEN sl.delta ELSE 0 END),0)::numeric AS supplier_in,
        COALESCE(SUM(CASE WHEN sl.reference_type='supplier_return' AND sl.delta<0 THEN -sl.delta ELSE 0 END),0)::numeric AS supplier_out
      FROM stock_ledger sl
      WHERE sl.product_id=p.id
        AND sl.occurred_at >= (days.day AT TIME ZONE 'Asia/Ho_Chi_Minh')
        AND sl.occurred_at < ((days.day + interval '1 day') AT TIME ZONE 'Asia/Ho_Chi_Minh')
    ) mv ON true
    LEFT JOIN LATERAL (
      SELECT unit_price
      FROM price_rules
      WHERE price_type='cylinder_rental_day'
        AND product_id IS NULL
        AND effective_from<=days.day
        AND (effective_to IS NULL OR effective_to>=days.day)
      ORDER BY effective_from DESC,created_at DESC
      LIMIT 1
    ) pr ON true
    ORDER BY days.day,p.display_order,p.name
  `;

  return rows.map((r: any): CylinderRentalDailyRow => ({
    day: toDateKey(r.day),
    product_id: String(r.product_id),
    product_code: String(r.product_code),
    product_name: String(r.product_name),
    unit: String(r.unit),
    held_qty: Number(r.held_qty ?? 0),
    supplier_in: Number(r.supplier_in ?? 0),
    supplier_out: Number(r.supplier_out ?? 0),
    net_change: Number(r.net_change ?? 0),
    unit_price: Number(r.unit_price ?? 0),
    rental_amount: Number(r.rental_amount ?? 0),
  }));
}

export function summarizeCylinderRental(rows: CylinderRentalDailyRow[]): CylinderRentalSummaryRow[] {
  const grouped = new Map<string, CylinderRentalSummaryRow & { _firstDay: string; _lastDay: string }>();
  for (const row of rows) {
    let item = grouped.get(row.product_id);
    if (!item) {
      item = {
        product_id: row.product_id,
        product_code: row.product_code,
        product_name: row.product_name,
        unit: row.unit,
        opening_qty: row.held_qty,
        closing_qty: row.held_qty,
        bottle_days: 0,
        unit_price_from: row.unit_price,
        unit_price_to: row.unit_price,
        rental_amount: 0,
        missing_price_days: 0,
        _firstDay: row.day,
        _lastDay: row.day,
      };
      grouped.set(row.product_id, item);
    }
    if (row.day < item._firstDay) {
      item._firstDay = row.day;
      item.opening_qty = row.held_qty;
      item.unit_price_from = row.unit_price;
    }
    if (row.day >= item._lastDay) {
      item._lastDay = row.day;
      item.closing_qty = row.held_qty;
      item.unit_price_to = row.unit_price;
    }
    item.bottle_days += row.held_qty;
    item.rental_amount += row.rental_amount;
    if (row.held_qty > 0 && row.unit_price <= 0) item.missing_price_days += 1;
  }
  return Array.from(grouped.values())
    .map(({ _firstDay, _lastDay, ...item }) => item)
    .sort((a, b) => a.product_name.localeCompare(b.product_name, "vi"));
}

export type GoodsCostDetail = {
  delivery_date: string;
  delivery_code: string;
  supplier_name: string;
  destination: string;
  product_id: string;
  product_code: string;
  product_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  amount: number;
  price_missing: boolean;
};

export async function getGoodsCostDetails(params: {
  startDate: string;
  endDateExclusive: string;
  productId?: string | null;
  locationId?: string | null;
  supplierOrgId?: string | null;
}): Promise<GoodsCostDetail[]> {
  if (params.endDateExclusive <= params.startDate) return [] as GoodsCostDetail[];
  const rows = await sql`
    SELECT d.delivery_date,d.delivery_code,o.name AS supplier_name,l.name AS destination,
      p.id AS product_id,p.code AS product_code,p.name AS product_name,p.unit,
      COALESCE(di.confirmed_qty,0)::float8 AS quantity,
      COALESCE(di.unit_price,pr.unit_price,0)::float8 AS unit_price,
      COALESCE(di.line_amount,COALESCE(di.confirmed_qty,0)*COALESCE(di.unit_price,pr.unit_price,0),0)::float8 AS amount,
      (COALESCE(di.unit_price,pr.unit_price) IS NULL) AS price_missing
    FROM supplier_delivery_items di
    JOIN supplier_deliveries d ON d.id=di.delivery_id
    JOIN organizations o ON o.id=d.supplier_org_id
    JOIN locations l ON l.id=di.destination_location_id
    JOIN products p ON p.id=di.product_id
    LEFT JOIN LATERAL (
      SELECT x.unit_price
      FROM price_rules x
      WHERE x.price_type='product' AND x.product_id=di.product_id AND x.effective_from<=d.delivery_date
        AND (x.effective_to IS NULL OR x.effective_to>=d.delivery_date)
      ORDER BY x.effective_from DESC,x.created_at DESC
      LIMIT 1
    ) pr ON true
    WHERE d.status='completed' AND di.status='confirmed'
      AND d.delivery_date>=${params.startDate}::date AND d.delivery_date<${params.endDateExclusive}::date
      AND (${params.productId ?? null}::uuid IS NULL OR di.product_id=${params.productId ?? null}::uuid)
      AND (${params.locationId ?? null}::uuid IS NULL OR di.destination_location_id=${params.locationId ?? null}::uuid)
      AND (${params.supplierOrgId ?? null}::uuid IS NULL OR d.supplier_org_id=${params.supplierOrgId ?? null}::uuid)
    ORDER BY d.delivery_date DESC,d.delivery_code DESC,p.display_order
  `;
  return rows.map((r: any): GoodsCostDetail => ({
    delivery_date: toDateKey(r.delivery_date),
    delivery_code: String(r.delivery_code),
    supplier_name: String(r.supplier_name),
    destination: String(r.destination),
    product_id: String(r.product_id),
    product_code: String(r.product_code),
    product_name: String(r.product_name),
    unit: String(r.unit),
    quantity: Number(r.quantity ?? 0),
    unit_price: Number(r.unit_price ?? 0),
    amount: Number(r.amount ?? 0),
    price_missing: Boolean(r.price_missing),
  }));
}

export type GoodsCostSummary = {
  product_id: string;
  product_code: string;
  product_name: string;
  unit: string;
  quantity: number;
  amount: number;
  min_unit_price: number;
  max_unit_price: number;
  missing_price_lines: number;
};

export function summarizeGoodsCost(rows: GoodsCostDetail[]): GoodsCostSummary[] {
  const map = new Map<string, GoodsCostSummary>();
  for (const row of rows) {
    const item = map.get(row.product_id) ?? {
      product_id: row.product_id,
      product_code: row.product_code,
      product_name: row.product_name,
      unit: row.unit,
      quantity: 0,
      amount: 0,
      min_unit_price: row.unit_price,
      max_unit_price: row.unit_price,
      missing_price_lines: 0,
    };
    item.quantity += row.quantity;
    item.amount += row.amount;
    item.min_unit_price = Math.min(item.min_unit_price, row.unit_price);
    item.max_unit_price = Math.max(item.max_unit_price, row.unit_price);
    if (row.price_missing) item.missing_price_lines += 1;
    map.set(row.product_id, item);
  }
  return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
}

export type TransportCostRow = {
  trip_date: string;
  trip_code: string;
  delivery_code: string;
  trip_kind: string;
  visits_mine: boolean;
  unit_price: number;
  amount: number;
};

export async function getTransportCostDetails(params: {
  startDate: string;
  endDateExclusive: string;
  supplierOrgId?: string | null;
  locationId?: string | null;
  productId?: string | null;
}): Promise<TransportCostRow[]> {
  if (params.endDateExclusive <= params.startDate) return [] as TransportCostRow[];
  const rows = await sql`
    SELECT t.trip_date,t.trip_code,d.delivery_code,t.trip_kind,t.visits_mine,
      t.transport_unit_price::float8 AS unit_price,t.transport_amount::float8 AS amount
    FROM transport_trips t
    JOIN supplier_deliveries d ON d.trip_id=t.id AND d.status='completed'
    WHERE t.status='completed'
      AND t.trip_date>=${params.startDate}::date AND t.trip_date<${params.endDateExclusive}::date
      AND (${params.supplierOrgId ?? null}::uuid IS NULL OR t.supplier_org_id=${params.supplierOrgId ?? null}::uuid)
      AND (${params.locationId ?? null}::uuid IS NULL
        OR EXISTS (SELECT 1 FROM supplier_delivery_items di WHERE di.delivery_id=d.id AND di.destination_location_id=${params.locationId ?? null}::uuid))
      AND (${params.productId ?? null}::uuid IS NULL
        OR EXISTS (SELECT 1 FROM supplier_delivery_items di WHERE di.delivery_id=d.id AND di.product_id=${params.productId ?? null}::uuid))
    ORDER BY t.trip_date DESC,d.delivery_code DESC
  `;
  return rows.map((r: any): TransportCostRow => ({
    trip_date: toDateKey(r.trip_date),
    trip_code: String(r.trip_code),
    delivery_code: String(r.delivery_code),
    trip_kind: String(r.trip_kind),
    visits_mine: Boolean(r.visits_mine),
    unit_price: Number(r.unit_price ?? 0),
    amount: Number(r.amount ?? 0),
  }));
}

export type XL45RentalDailyRow = {
  day: string;
  product_id: string;
  product_code: string;
  product_name: string;
  held_qty: number;
  charge_qty: number;
  unit_price: number;
  rental_amount: number;
};

/**
 * XL-45: miễn 15 ngày; từ ngày thứ 16 tính theo bồn-ngày. Ngày trả vẫn được tính phí
 * để khớp cách phân bổ hiện hữu của hệ thống (generate_series đến return_date, inclusive).
 */
export async function getXL45RentalDaily(params: {
  startDate: string;
  endDateExclusive: string;
  productId?: string | null;
  locationId?: string | null;
  supplierOrgId?: string | null;
}): Promise<XL45RentalDailyRow[]> {
  if (params.endDateExclusive <= params.startDate) return [] as XL45RentalDailyRow[];
  const rows = await sql`
    WITH days AS (
      SELECT d::date AS day
      FROM generate_series(${params.startDate}::date,(${params.endDateExclusive}::date-interval '1 day')::date,interval '1 day') gs(d)
    ), lots AS (
      SELECT x.id,x.product_id,x.delivered_date,x.qty_received,p.code AS product_code,p.name AS product_name
      FROM xl45_lots x
      JOIN supplier_delivery_items di ON di.id=x.delivery_item_id
      JOIN supplier_deliveries d ON d.id=di.delivery_id
      JOIN products p ON p.id=x.product_id
      WHERE x.delivered_date<${params.endDateExclusive}::date
        AND (${params.productId ?? null}::uuid IS NULL OR x.product_id=${params.productId ?? null}::uuid)
        AND (${params.locationId ?? null}::uuid IS NULL OR x.location_id=${params.locationId ?? null}::uuid)
        AND (${params.supplierOrgId ?? null}::uuid IS NULL OR d.supplier_org_id=${params.supplierOrgId ?? null}::uuid)
    )
    SELECT days.day,l.product_id,l.product_code,l.product_name,
      SUM(CASE WHEN days.day>=l.delivered_date THEN GREATEST(0,l.qty_received-COALESCE(ret.returned_before_day,0)) ELSE 0 END)::float8 AS held_qty,
      SUM(CASE WHEN days.day>=l.delivered_date+15 THEN GREATEST(0,l.qty_received-COALESCE(ret.returned_before_day,0)) ELSE 0 END)::float8 AS charge_qty,
      COALESCE(pr.unit_price,0)::float8 AS unit_price,
      (SUM(CASE WHEN days.day>=l.delivered_date+15 THEN GREATEST(0,l.qty_received-COALESCE(ret.returned_before_day,0)) ELSE 0 END)*COALESCE(pr.unit_price,0))::float8 AS rental_amount
    FROM days
    CROSS JOIN lots l
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(a.quantity),0)::numeric AS returned_before_day
      FROM xl45_return_allocations a
      WHERE a.xl45_lot_id=l.id AND a.return_date<days.day
    ) ret ON true
    LEFT JOIN LATERAL (
      SELECT unit_price FROM price_rules
      WHERE price_type='xl45_rental_day' AND product_id IS NULL AND effective_from<=days.day
        AND (effective_to IS NULL OR effective_to>=days.day)
      ORDER BY effective_from DESC,created_at DESC LIMIT 1
    ) pr ON true
    WHERE days.day>=l.delivered_date
    GROUP BY days.day,l.product_id,l.product_code,l.product_name,pr.unit_price
    ORDER BY days.day,l.product_name
  `;
  return rows.map((r: any): XL45RentalDailyRow => ({
    day: toDateKey(r.day),
    product_id: String(r.product_id),
    product_code: String(r.product_code),
    product_name: String(r.product_name),
    held_qty: Number(r.held_qty ?? 0),
    charge_qty: Number(r.charge_qty ?? 0),
    unit_price: Number(r.unit_price ?? 0),
    rental_amount: Number(r.rental_amount ?? 0),
  }));
}

export function summarizeXL45Rental(rows: XL45RentalDailyRow[]): Array<{ product_id: string; product_code: string; product_name: string; bon_days: number; amount: number }> {
  const map = new Map<string, { product_id: string; product_code: string; product_name: string; bon_days: number; amount: number }>();
  for (const row of rows) {
    const item = map.get(row.product_id) ?? { product_id: row.product_id, product_code: row.product_code, product_name: row.product_name, bon_days: 0, amount: 0 };
    item.bon_days += row.charge_qty;
    item.amount += row.rental_amount;
    map.set(row.product_id, item);
  }
  return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
}

export type CostTrendRow = {
  month: string;
  goods: number;
  cylinder: number;
  xl45: number;
  transport: number;
  total: number;
};

export async function getSixMonthCostTrend(endMonth: string, supplierOrgId?: string | null): Promise<CostTrendRow[]> {
  const firstMonth = addMonths(endMonth, -5);
  const startDate = `${firstMonth}-01`;
  const selectedWindow = getReportWindow(endMonth);
  const endDateExclusive = selectedWindow.dataEndExclusive;
  if (endDateExclusive <= startDate) return [] as CostTrendRow[];

  const [goods, transport, cylinder, xl45] = await Promise.all([
    getGoodsCostDetails({ startDate, endDateExclusive, supplierOrgId }),
    getTransportCostDetails({ startDate, endDateExclusive, supplierOrgId }),
    getCylinderRentalDaily({ startDate, endDateExclusive }),
    getXL45RentalDaily({ startDate, endDateExclusive, supplierOrgId }),
  ]);
  const months = Array.from({ length: 6 }, (_, i) => addMonths(firstMonth, i));
  const map = new Map(months.map((m) => [m, { month: m, goods: 0, cylinder: 0, xl45: 0, transport: 0, total: 0 }]));
  for (const row of goods) { const m = row.delivery_date.slice(0, 7); const x = map.get(m); if (x) x.goods += row.amount; }
  for (const row of transport) { const m = row.trip_date.slice(0, 7); const x = map.get(m); if (x) x.transport += row.amount; }
  for (const row of cylinder) { const m = row.day.slice(0, 7); const x = map.get(m); if (x) x.cylinder += row.rental_amount; }
  for (const row of xl45) { const m = row.day.slice(0, 7); const x = map.get(m); if (x) x.xl45 += row.rental_amount; }
  return months.map((m) => {
    const x = map.get(m)!;
    x.total = x.goods + x.cylinder + x.xl45 + x.transport;
    return x;
  });
}
