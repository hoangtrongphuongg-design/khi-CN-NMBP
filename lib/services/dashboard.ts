import { sql } from "@/lib/db";
import { getInventory } from "@/lib/services/inventory";
import {
  getCylinderRentalDaily,
  getGoodsCostDetails,
  getTransportCostDetails,
  getXL45RentalDaily,
} from "@/lib/services/costs";
import { toDateInput } from "@/lib/utils";
import type { DashboardData, Profile } from "@/types/app";

function addDays(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function getDashboardData(profile?: Profile): Promise<DashboardData> {
  const [inventoryAll, pendingRows, tripRows] = await Promise.all([
    getInventory(),
    sql<{ count: number }[]>`
      SELECT (
        (SELECT count(*) FROM internal_requests WHERE status IN ('pending','approved','executed_pending_review','feedback')) +
        (SELECT count(*) FROM supplier_deliveries WHERE status IN ('pending','phc_pending','feedback')) +
        (SELECT count(*) FROM supplier_returns WHERE status IN ('pending','feedback') OR warehouse_review_status IN ('pending','feedback')) +
        (SELECT count(*) FROM transfers WHERE status='feedback')
      )::int AS count
    `,
    sql<{ count: number; cost: number }[]>`
      SELECT count(*)::int AS count,COALESCE(sum(transport_amount),0)::float8 AS cost
      FROM transport_trips
      WHERE trip_date>=date_trunc('month',CURRENT_DATE)::date AND status='completed'
    `,
  ]);
  let inventory = inventoryAll;
  let pendingCount = pendingRows[0]?.count ?? 0;
  if (profile && ["foreman","supervisor","worker"].includes(profile.role)) {
    const pointCode = profile.group_id ? await sql<{ code: string }[]>`SELECT 'GRP-'||code AS code FROM work_groups WHERE id=${profile.group_id}::uuid` : [];
    inventory = pointCode[0] ? inventoryAll.filter((x) => x.point_code === pointCode[0].code) : [];
    if (profile.group_id) {
      const [row] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM internal_requests WHERE group_id=${profile.group_id}::uuid AND status IN ('pending','approved','executed_pending_review','feedback')`;
      pendingCount = row?.count ?? 0;
    }
  }
  const lowStock = inventoryAll.filter((x) =>
    x.point_kind === "warehouse" &&
    Number(x.unclassified_qty || 0) <= 0 &&
    x.low_threshold != null &&
    Number(x.full_qty) <= Number(x.low_threshold)
  );
  return { lowStock, inventory, pendingCount, monthTrips: tripRows[0]?.count ?? 0, monthCost: tripRows[0]?.cost ?? 0 };
}

export async function getSupplierDashboard(profile: Profile) {
  if (!profile.organization_id) return { pending: 0, monthTrips: 0, monthCost: 0, monthDeliveries: 0 };
  const [row] = await sql<{ pending: number; month_trips: number; month_cost: number; month_deliveries: number }[]>`
    SELECT
      ((SELECT count(*) FROM supplier_deliveries WHERE supplier_org_id=${profile.organization_id}::uuid AND status IN ('pending','phc_pending','feedback')) +
       (SELECT count(*) FROM supplier_returns WHERE supplier_org_id=${profile.organization_id}::uuid AND status='feedback'))::int AS pending,
      (SELECT count(*) FROM transport_trips WHERE supplier_org_id=${profile.organization_id}::uuid AND trip_date>=date_trunc('month',CURRENT_DATE)::date AND status='completed')::int AS month_trips,
      (SELECT COALESCE(sum(transport_amount),0) FROM transport_trips WHERE supplier_org_id=${profile.organization_id}::uuid AND trip_date>=date_trunc('month',CURRENT_DATE)::date AND status='completed')::float8 AS month_cost,
      (SELECT count(*) FROM supplier_deliveries WHERE supplier_org_id=${profile.organization_id}::uuid AND delivery_date>=date_trunc('month',CURRENT_DATE)::date)::int AS month_deliveries
  `;
  return { pending: row?.pending ?? 0, monthTrips: row?.month_trips ?? 0, monthCost: row?.month_cost ?? 0, monthDeliveries: row?.month_deliveries ?? 0 };
}

export type CostSnapshot = {
  monthStart: string;
  yearStart: string;
  asOfDate: string;
  monthTotal: number;
  yearTotal: number;
};

/** Tổng chi phí cấp cao dùng riêng cho KPI Tổng quan. Chi tiết vẫn thuộc trang Báo cáo. */
export async function getCostSnapshot(profile: Profile): Promise<CostSnapshot> {
  const today = toDateInput();
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const monthStart = `${today.slice(0, 7)}-01`;
  const endDateExclusive = addDays(today, 1);
  const supplierOrgId = profile.role === "supplier" ? profile.organization_id : null;

  const [goods, transport, cylinder, xl45] = await Promise.all([
    getGoodsCostDetails({ startDate: yearStart, endDateExclusive, supplierOrgId }),
    getTransportCostDetails({ startDate: yearStart, endDateExclusive, supplierOrgId }),
    getCylinderRentalDaily({ startDate: yearStart, endDateExclusive }),
    getXL45RentalDaily({ startDate: yearStart, endDateExclusive, supplierOrgId }),
  ]);

  const sum = (rows: Array<{ amount?: number; rental_amount?: number }>, from: string) => rows.reduce((total, row: any) => {
    const day = String(row.delivery_date || row.trip_date || row.day || "");
    if (day < from) return total;
    return total + Number(row.amount ?? row.rental_amount ?? 0);
  }, 0);

  return {
    monthStart,
    yearStart,
    asOfDate: today,
    monthTotal: sum(goods, monthStart) + sum(transport, monthStart) + sum(cylinder, monthStart) + sum(xl45, monthStart),
    yearTotal: sum(goods, yearStart) + sum(transport, yearStart) + sum(cylinder, yearStart) + sum(xl45, yearStart),
  };
}

export type RentalSnapshotRow = {
  product_code: string;
  product_name: string;
  unit: string;
  returnable_container: boolean;
  opening_qty: number;
  supplier_in: number;
  supplier_out: number;
  current_qty: number;
};

export type RentalSnapshotGroupKey = "industrial" | "xl45" | "lpg12" | "lpg45" | "goods";

export type RentalSnapshotGroup = {
  key: RentalSnapshotGroupKey;
  title: string;
  unitLabel: string;
  mode: "container" | "received";
  totalCurrent: number;
  rows: RentalSnapshotRow[];
};

export type RentalSnapshot = {
  asOfDate: string;
  /** Giữ tương thích KPI cũ: tổng vỏ chai khí công nghiệp, không cộng XL-45/LPG/hàng kg. */
  totalCurrent: number;
  groups: RentalSnapshotGroup[];
};

/**
 * Chuẩn hóa ngày xem số liệu sản phẩm. Chỉ cho phép ngày hợp lệ đến ngày hiện tại (giờ Việt Nam).
 * Giá trị trống/sai/ngày tương lai tự quay về hôm nay.
 */
export function normalizeRentalAsOfDate(value?: string | null) {
  const today = toDateInput();
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return today;
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) return today;
  return raw > today ? today : raw;
}

const rentalGroupMeta: Record<RentalSnapshotGroupKey, { title: string; unitLabel: string; mode: "container" | "received" }> = {
  industrial: { title: "Vỏ chai khí công nghiệp", unitLabel: "vỏ", mode: "container" },
  xl45: { title: "Bồn XL-45", unitLabel: "bồn", mode: "container" },
  lpg12: { title: "Bình Gas 12 kg", unitLabel: "bình", mode: "container" },
  lpg45: { title: "Bình Gas 45 kg", unitLabel: "bình", mode: "container" },
  goods: { title: "Sản phẩm theo khối lượng", unitLabel: "kg", mode: "received" },
};

function rentalGroupKey(productCode: string, returnableContainer = true): RentalSnapshotGroupKey {
  if (!returnableContainer) return "goods";
  if (["LOX-XL45", "LIN-XL45"].includes(productCode)) return "xl45";
  if (productCode === "LPG12") return "lpg12";
  if (productCode === "LPG45") return "lpg45";
  return "industrial";
}

function historyUnitLabel(productCode: string, productUnit: string, returnableContainer: boolean) {
  if (!returnableContainer) return productUnit || "đơn vị";
  const groupKey = rentalGroupKey(productCode, true);
  return rentalGroupMeta[groupKey].unitLabel;
}

/**
 * Tổng quan sản phẩm NCC đến một ngày:
 * - Sản phẩm có vật chứa hoàn trả: số đang giữ = số dư đầu kỳ + thực nhận đã xác nhận - thực trả NCC.
 * - Sản phẩm không có vật chứa hoàn trả (Đá khô/CO2 lỏng): hiển thị lũy kế số thực nhận trong năm đến ngày xem.
 * Trưởng kho hậu kiểm không làm chậm thời điểm ghi nhận số thực tế.
 */
export async function getRentalSnapshot(asOfDate?: string | null): Promise<RentalSnapshot> {
  const resolvedAsOfDate = normalizeRentalAsOfDate(asOfDate);
  const yearStart = `${resolvedAsOfDate.slice(0, 4)}-01-01`;

  const sourceRows = await sql<any[]>`
    SELECT
      p.code AS product_code,
      p.name AS product_name,
      p.unit,
      p.returnable_container,
      p.display_order,
      CASE WHEN p.returnable_container THEN COALESCE(opening.qty,0) ELSE 0 END::float8 AS opening_qty,
      COALESCE(delivery_mv.qty,0)::float8 AS supplier_in,
      CASE WHEN p.returnable_container THEN COALESCE(return_mv.qty,0) ELSE 0 END::float8 AS supplier_out
    FROM products p
    LEFT JOIN LATERAL (
      SELECT ob.opening_date,ob.qty
      FROM supplier_container_opening_balances ob
      WHERE ob.product_id=p.id
        AND ob.opening_date<=${resolvedAsOfDate}::date
      ORDER BY ob.opening_date DESC
      LIMIT 1
    ) opening ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(di.confirmed_qty),0)::numeric AS qty
      FROM supplier_delivery_items di
      JOIN supplier_deliveries d ON d.id=di.delivery_id
      WHERE di.product_id=p.id
        AND d.status<>'cancelled'
        AND d.delivery_date>=CASE
          WHEN p.returnable_container THEN COALESCE(opening.opening_date,DATE '1900-01-01')
          ELSE ${yearStart}::date
        END
        AND d.delivery_date<=${resolvedAsOfDate}::date
        AND di.confirmed_qty IS NOT NULL
        AND di.confirmed_qty>0
        AND (
          di.status IN ('xsc_confirmed','confirmed')
          OR (di.status='feedback' AND di.confirmed_by IS NOT NULL)
        )
    ) delivery_mv ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(COALESCE(ri.confirmed_qty,ri.declared_qty)),0)::numeric AS qty
      FROM supplier_return_items ri
      JOIN supplier_returns r ON r.id=ri.supplier_return_id
      WHERE p.returnable_container=true
        AND ri.product_id=p.id
        AND r.status<>'cancelled'
        AND r.return_date>=COALESCE(opening.opening_date,DATE '1900-01-01')
        AND r.return_date<=${resolvedAsOfDate}::date
        AND ri.status IN ('confirmed','feedback')
        AND COALESCE(ri.confirmed_qty,ri.declared_qty,0)>0
    ) return_mv ON true
    WHERE p.active=true
    ORDER BY p.display_order,p.name
  `;

  const buckets: Record<RentalSnapshotGroupKey, RentalSnapshotRow[]> = {
    industrial: [],
    xl45: [],
    lpg12: [],
    lpg45: [],
    goods: [],
  };

  for (const row of sourceRows) {
    const returnableContainer = Boolean(row.returnable_container);
    const opening = Number(row.opening_qty || 0);
    const supplierIn = Number(row.supplier_in || 0);
    const supplierOut = Number(row.supplier_out || 0);
    const item: RentalSnapshotRow = {
      product_code: String(row.product_code),
      product_name: String(row.product_name),
      unit: String(row.unit || ""),
      returnable_container: returnableContainer,
      opening_qty: opening,
      supplier_in: supplierIn,
      supplier_out: supplierOut,
      // Không ép về 0. Với hàng không hoàn trả, đây là lũy kế thực nhận trong năm.
      current_qty: returnableContainer ? opening + supplierIn - supplierOut : supplierIn,
    };
    buckets[rentalGroupKey(item.product_code, returnableContainer)].push(item);
  }

  const groupOrder: RentalSnapshotGroupKey[] = ["industrial", "xl45", "lpg12", "lpg45", "goods"];
  const groups = groupOrder.map((key): RentalSnapshotGroup => ({
    key,
    title: rentalGroupMeta[key].title,
    unitLabel: rentalGroupMeta[key].unitLabel,
    mode: rentalGroupMeta[key].mode,
    rows: buckets[key],
    totalCurrent: buckets[key].reduce((sum, item) => sum + item.current_qty, 0),
  }));

  return {
    asOfDate: resolvedAsOfDate,
    totalCurrent: groups.find((group) => group.key === "industrial")?.totalCurrent ?? 0,
    groups,
  };
}

export type RentalHistoryRow = {
  event_date: string;
  event_type: "delivery" | "return";
  activity_label: string;
  location_name: string;
  reference_code: string;
  trip_code: string | null;
  quantity: number;
  net_change: number;
  running_qty: number;
};

export type RentalHistory = {
  product_code: string;
  product_name: string;
  unitLabel: string;
  returnableContainer: boolean;
  yearStart: string;
  asOfDate: string;
  openingQty: number;
  supplierIn: number;
  supplierOut: number;
  closingQty: number;
  deliveryCount: number;
  returnCount: number;
  rows: RentalHistoryRow[];
};

/**
 * Lịch sử NCC của bất kỳ sản phẩm nào trong năm đang xem.
 * - Khoảng thời gian: 01/01 của năm đến hết ngày đang chọn.
 * - Sản phẩm có vật chứa: Giao + / Trả -, có tồn đầu năm và tồn lũy kế.
 * - Sản phẩm không có vật chứa hoàn trả: chỉ thống kê các lần giao và lũy kế lượng đã giao trong năm.
 * - Giao được tính ngay khi bên nhận xác nhận confirmed_qty, kể cả Phiếu cha đang chờ Trưởng kho.
 */
export async function getRentalHistory(productCode: string, asOfDate?: string | null): Promise<RentalHistory | null> {
  const resolvedAsOfDate = normalizeRentalAsOfDate(asOfDate);
  const yearStart = `${resolvedAsOfDate.slice(0, 4)}-01-01`;
  const endDateExclusive = addDays(resolvedAsOfDate, 1);
  const code = String(productCode || "").trim();
  if (!code) return null;

  const [product] = await sql<any[]>`
    SELECT id,code,name,unit,returnable_container
    FROM products
    WHERE code=${code} AND active=true
    LIMIT 1
  `;
  if (!product) return null;

  const returnableContainer = Boolean(product.returnable_container);
  const openingPromise = returnableContainer
    ? sql<any[]>`
        SELECT (
          COALESCE(opening.qty,0)
          + COALESCE(delivery_mv.qty,0)
          - COALESCE(return_mv.qty,0)
        )::float8 AS opening_qty
        FROM (SELECT 1) base
        LEFT JOIN LATERAL (
          SELECT ob.opening_date,ob.qty
          FROM supplier_container_opening_balances ob
          WHERE ob.product_id=${product.id}::uuid
            AND ob.opening_date<=${yearStart}::date
          ORDER BY ob.opening_date DESC
          LIMIT 1
        ) opening ON true
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(di.confirmed_qty),0)::numeric AS qty
          FROM supplier_delivery_items di
          JOIN supplier_deliveries d ON d.id=di.delivery_id
          WHERE di.product_id=${product.id}::uuid
            AND d.status<>'cancelled'
            AND d.delivery_date>=COALESCE(opening.opening_date,DATE '1900-01-01')
            AND d.delivery_date<${yearStart}::date
            AND di.confirmed_qty IS NOT NULL
            AND di.confirmed_qty>0
            AND (
              di.status IN ('xsc_confirmed','confirmed')
              OR (di.status='feedback' AND di.confirmed_by IS NOT NULL)
            )
        ) delivery_mv ON true
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(COALESCE(ri.confirmed_qty,ri.declared_qty)),0)::numeric AS qty
          FROM supplier_return_items ri
          JOIN supplier_returns r ON r.id=ri.supplier_return_id
          WHERE ri.product_id=${product.id}::uuid
            AND r.status<>'cancelled'
            AND r.return_date>=COALESCE(opening.opening_date,DATE '1900-01-01')
            AND r.return_date<${yearStart}::date
            AND ri.status IN ('confirmed','feedback')
            AND COALESCE(ri.confirmed_qty,ri.declared_qty,0)>0
        ) return_mv ON true
      `
    : Promise.resolve([{ opening_qty: 0 }]);

  const movementPromise = sql<any[]>`
    SELECT * FROM (
      SELECT
        d.delivery_date::text AS event_date,
        'delivery'::text AS event_type,
        'NCC giao'::text AS activity_label,
        l.name AS location_name,
        d.delivery_code AS reference_code,
        t.trip_code,
        di.confirmed_qty::float8 AS quantity,
        1::int AS event_order
      FROM supplier_delivery_items di
      JOIN supplier_deliveries d ON d.id=di.delivery_id
      JOIN locations l ON l.id=di.destination_location_id
      LEFT JOIN transport_trips t ON t.id=d.trip_id
      WHERE di.product_id=${product.id}::uuid
        AND d.status<>'cancelled'
        AND d.delivery_date>=${yearStart}::date
        AND d.delivery_date<${endDateExclusive}::date
        AND di.confirmed_qty IS NOT NULL
        AND di.confirmed_qty>0
        AND (
          di.status IN ('xsc_confirmed','confirmed')
          OR (di.status='feedback' AND di.confirmed_by IS NOT NULL)
        )

      UNION ALL

      SELECT
        r.return_date::text AS event_date,
        'return'::text AS event_type,
        'Trả NCC'::text AS activity_label,
        l.name AS location_name,
        r.return_code AS reference_code,
        t.trip_code,
        COALESCE(ri.confirmed_qty,ri.declared_qty,0)::float8 AS quantity,
        2::int AS event_order
      FROM supplier_return_items ri
      JOIN supplier_returns r ON r.id=ri.supplier_return_id
      JOIN locations l ON l.id=r.source_location_id
      LEFT JOIN transport_trips t ON t.id=r.trip_id
      WHERE ${returnableContainer}
        AND ri.product_id=${product.id}::uuid
        AND r.status<>'cancelled'
        AND r.return_date>=${yearStart}::date
        AND r.return_date<${endDateExclusive}::date
        AND ri.status IN ('confirmed','feedback')
        AND COALESCE(ri.confirmed_qty,ri.declared_qty,0)>0
    ) x
    ORDER BY event_date,event_order,reference_code,location_name
  `;

  const [openingRows, movementRows] = await Promise.all([openingPromise, movementPromise]);
  const openingQty = Number(openingRows[0]?.opening_qty || 0);
  let running = openingQty;
  let supplierIn = 0;
  let supplierOut = 0;
  let deliveryCount = 0;
  let returnCount = 0;

  const rows: RentalHistoryRow[] = (movementRows as any[]).map((row) => {
    const quantity = Number(row.quantity || 0);
    const eventType = String(row.event_type) === "return" ? "return" : "delivery";
    const netChange = eventType === "delivery" ? quantity : -quantity;
    if (eventType === "delivery") {
      supplierIn += quantity;
      deliveryCount += 1;
    } else {
      supplierOut += quantity;
      returnCount += 1;
    }
    running += netChange;
    return {
      event_date: String(row.event_date).slice(0, 10),
      event_type: eventType,
      activity_label: String(row.activity_label),
      location_name: String(row.location_name),
      reference_code: String(row.reference_code),
      trip_code: row.trip_code ? String(row.trip_code) : null,
      quantity,
      net_change: netChange,
      running_qty: running,
    };
  });

  return {
    product_code: String(product.code),
    product_name: String(product.name),
    unitLabel: historyUnitLabel(String(product.code), String(product.unit || ""), returnableContainer),
    returnableContainer,
    yearStart,
    asOfDate: resolvedAsOfDate,
    openingQty,
    supplierIn,
    supplierOut,
    closingQty: running,
    deliveryCount,
    returnCount,
    rows,
  };
}

export type GroupUsageRow = {
  product_code: string;
  product_name: string;
  unit: string;
  month_qty: number;
  year_qty: number;
};

/**
 * Lũy kế sử dụng khí của một nhóm = SL thực tế của Phiếu Đổi đã HOÀN TẤT.
 * Không cộng Mượn/Trả và không dùng SL yêu cầu.
 * Mốc sử dụng lấy thời điểm thực hiện tại Kho (executed_at), fallback requested_at cho dữ liệu cũ.
 */
export async function getGroupUsageSnapshot(profile: Profile): Promise<{ monthStart: string; yearStart: string; asOfDate: string; rows: GroupUsageRow[] }> {
  const today = toDateInput();
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const monthStart = `${today.slice(0, 7)}-01`;
  if (!profile.group_id || !["foreman","supervisor"].includes(profile.role)) {
    return { monthStart, yearStart, asOfDate: today, rows: [] };
  }

  const rows = await sql<any[]>`
    WITH usage_lines AS (
      SELECT
        iri.product_id,
        COALESCE(iri.actual_qty,0)::float8 AS actual_qty,
        COALESCE(iri.executed_at,ir.executed_at,ir.requested_at) AS used_at
      FROM internal_requests ir
      JOIN internal_request_items iri ON iri.internal_request_id=ir.id
      WHERE ir.group_id=${profile.group_id}::uuid
        AND ir.request_type='exchange'
        AND ir.status='completed'
        AND COALESCE(iri.actual_qty,0)>0

      UNION ALL

      SELECT
        ir.product_id,
        COALESCE(ir.actual_qty,0)::float8 AS actual_qty,
        COALESCE(ir.executed_at,ir.requested_at) AS used_at
      FROM internal_requests ir
      WHERE ir.group_id=${profile.group_id}::uuid
        AND ir.request_type='exchange'
        AND ir.status='completed'
        AND COALESCE(ir.actual_qty,0)>0
        AND NOT EXISTS (SELECT 1 FROM internal_request_items iri WHERE iri.internal_request_id=ir.id)
    )
    SELECT
      p.code AS product_code,
      p.name AS product_name,
      p.unit,
      COALESCE(SUM(CASE WHEN u.used_at >= (${monthStart}::date AT TIME ZONE 'Asia/Ho_Chi_Minh') THEN u.actual_qty ELSE 0 END),0)::float8 AS month_qty,
      COALESCE(SUM(u.actual_qty),0)::float8 AS year_qty
    FROM usage_lines u
    JOIN products p ON p.id=u.product_id
    WHERE u.used_at >= (${yearStart}::date AT TIME ZONE 'Asia/Ho_Chi_Minh')
      AND u.used_at < ((${today}::date + 1) AT TIME ZONE 'Asia/Ho_Chi_Minh')
    GROUP BY p.id,p.code,p.name,p.unit,p.display_order
    HAVING COALESCE(SUM(u.actual_qty),0)>0
    ORDER BY p.display_order,p.name
  `;

  return {
    monthStart,
    yearStart,
    asOfDate: today,
    rows: rows.map((row: any) => ({
      product_code: String(row.product_code),
      product_name: String(row.product_name),
      unit: String(row.unit),
      month_qty: Number(row.month_qty || 0),
      year_qty: Number(row.year_qty || 0),
    })),
  };
}

