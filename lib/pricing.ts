import { sql } from "@/lib/db";

export type PriceType = "product" | "trip_plant" | "trip_mine" | "trip_co2_liquid" | "cylinder_rental_day" | "xl45_rental_day";

export async function resolvePriceRule(priceType: PriceType, businessDate: string, productId?: string | null, tx: any = sql) {
  // Nghiệp vụ đã chốt: một đơn giá có hiệu lực từ ngày X và tiếp tục áp dụng
  // cho đến khi có phiên bản giá mới. Vì vậy quy tắc xác định giá chuẩn là:
  // "phiên bản mới nhất có effective_from <= ngày nghiệp vụ".
  // effective_to chỉ là dữ liệu dẫn xuất để hiển thị/đối soát, không được
  // phép tạo khoảng trống làm chặn giao nhận.
  if (priceType === "product") {
    if (!productId) return null;
    const rows = await tx`
      SELECT id,unit_price,unit,contract_id,effective_from,effective_to
      FROM price_rules
      WHERE price_type='product'
        AND product_id=${productId}::uuid
        AND effective_from<=${businessDate}::date
      ORDER BY effective_from DESC,created_at DESC
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  const rows = await tx`
    SELECT id,unit_price,unit,contract_id,effective_from,effective_to
    FROM price_rules
    WHERE price_type=${priceType}
      AND product_id IS NULL
      AND effective_from<=${businessDate}::date
    ORDER BY effective_from DESC,created_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export function tripPriceType(visitsMine: boolean, co2LiquidSpecial: boolean): PriceType {
  if (co2LiquidSpecial) return "trip_co2_liquid";
  if (visitsMine) return "trip_mine";
  return "trip_plant";
}

export async function closePreviousPriceRule(priceType: PriceType, effectiveFrom: string, productId?: string | null, tx: any = sql) {
  await tx`
    UPDATE price_rules
    SET effective_to=(${effectiveFrom}::date - interval '1 day')::date
    WHERE price_type=${priceType}
      AND (${productId ?? null}::uuid IS NULL OR product_id=${productId ?? null}::uuid)
      AND effective_from<${effectiveFrom}::date
      AND (effective_to IS NULL OR effective_to>=${effectiveFrom}::date)
  `;
}
