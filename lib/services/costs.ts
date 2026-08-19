import { sql } from "@/lib/db";
import { toDateKey } from "@/lib/utils";

export type CylinderRentalDailyRow = {
  day: string;
  product_id: string;
  product_code: string;
  product_name: string;
  unit: string;
  held_qty: number;
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
 * Tính tiền thuê vỏ theo nguyên tắc "vỏ-ngày" đã chốt:
 * - Mỗi ngày lấy tổng số vỏ thực tế cuối ngày của TỪNG loại khí trên toàn hệ thống.
 * - Nội bộ Kho <-> Nhóm và Nhà máy <-> Mỏ chỉ đổi vị trí nên tổng delta toàn hệ thống = 0.
 * - Giao NCC / Trả NCC và điều chỉnh số dư làm thay đổi tổng vỏ thực tế.
 * - Tiền tháng = tổng (số vỏ cuối ngày x đơn giá thuê có hiệu lực ngày đó).
 *
 * Không lọc theo vị trí/nhóm vì tiền thuê vỏ là nghĩa vụ của toàn NMBP với NCC,
 * không thay đổi khi vỏ chỉ được luân chuyển nội bộ.
 */
export async function getCylinderRentalDaily(params: {
  startDate: string;
  endDateExclusive: string;
  productId?: string | null;
}) {
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
      COALESCE(pr.unit_price,0)::float8 AS unit_price,
      (GREATEST(0,COALESCE(held.held_qty,0))*COALESCE(pr.unit_price,0))::float8 AS rental_amount
    FROM days
    CROSS JOIN eligible_products p
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(sl.delta),0)::numeric AS held_qty
      FROM stock_ledger sl
      WHERE sl.product_id=p.id
        AND sl.occurred_at < ((days.day + interval '1 day') AT TIME ZONE 'Asia/Ho_Chi_Minh')
    ) held ON true
    LEFT JOIN LATERAL (
      SELECT unit_price
      FROM price_rules
      WHERE price_type='cylinder_rental_day'
        AND product_id IS NULL
        AND effective_from<=days.day
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
    unit_price: Number(r.unit_price ?? 0),
    rental_amount: Number(r.rental_amount ?? 0),
  }));
}

export function summarizeCylinderRental(rows: CylinderRentalDailyRow[]) {
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
