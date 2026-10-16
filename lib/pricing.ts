import { sql } from "@/lib/db";

export type PriceType = "product" | "trip_plant" | "trip_mine" | "trip_co2_liquid" | "cylinder_rental_day" | "xl45_rental_day";
export type PriceRuleKind = "base" | "adjustment" | "legacy";

export const SERVICE_PRICE_ITEMS: Array<{ priceType: Exclude<PriceType, "product">; label: string; unit: string }> = [
  { priceType: "trip_plant", label: "Vận chuyển Nhà máy", unit: "chuyến" },
  { priceType: "trip_mine", label: "Vận chuyển Mỏ Tà Thiết", unit: "chuyến" },
  { priceType: "trip_co2_liquid", label: "Vận chuyển CO₂ lỏng", unit: "chuyến" },
  { priceType: "cylinder_rental_day", label: "Thuê vỏ chai", unit: "vỏ/ngày" },
  { priceType: "xl45_rental_day", label: "Thuê bồn XL-45 từ ngày thứ 16", unit: "bồn/ngày" },
];

export function priceTypeLabel(priceType: PriceType) {
  if (priceType === "product") return "Hàng hóa";
  return SERVICE_PRICE_ITEMS.find((item) => item.priceType === priceType)?.label ?? priceType;
}

/**
 * Quy tắc giá V1.0.41:
 * 1) Nếu có điều chỉnh trong đúng khoảng ngày -> dùng adjustment.
 * 2) Nếu không -> quay về giá gốc hợp đồng (base).
 * 3) Nếu dữ liệu lịch sử chưa gắn hợp đồng -> fallback legacy để không làm hỏng lịch sử cũ.
 *
 * supplierOrgId nên được truyền ở các nghiệp vụ NCC để luôn chọn đúng hợp đồng của NCC.
 */
export async function resolvePriceRule(
  priceType: PriceType,
  businessDate: string,
  productId?: string | null,
  tx: any = sql,
  supplierOrgId?: string | null,
) {
  if (priceType === "product" && !productId) return null;

  if (supplierOrgId) {
    const rows = await tx`
      SELECT pr.id,pr.unit_price,pr.unit,pr.contract_id,pr.effective_from,pr.effective_to,pr.rule_kind
      FROM price_rules pr
      JOIN contracts c ON c.id=pr.contract_id
      WHERE pr.price_type=${priceType}
        AND (${priceType === "product" ? productId ?? null : null}::uuid IS NULL OR pr.product_id=${priceType === "product" ? productId ?? null : null}::uuid)
        AND (${priceType === "product"} OR pr.product_id IS NULL)
        AND pr.rule_kind IN ('adjustment','base')
        AND c.supplier_org_id=${supplierOrgId}::uuid
        AND c.active=true
        AND c.valid_from<=${businessDate}::date
        AND (c.valid_to IS NULL OR c.valid_to>=${businessDate}::date)
        AND pr.effective_from<=${businessDate}::date
        AND (pr.effective_to IS NULL OR pr.effective_to>=${businessDate}::date)
      ORDER BY CASE pr.rule_kind WHEN 'adjustment' THEN 0 ELSE 1 END,pr.effective_from DESC,pr.created_at DESC
      LIMIT 1
    `;
    if (rows[0]) return rows[0];
  }

  // Fallback tương thích dữ liệu cũ trước V1.0.40 / dữ liệu quyết toán lịch sử chưa gắn hợp đồng.
  // Khi đã biết NCC, tuyệt đối không lấy base/adjustment của hợp đồng thuộc NCC khác.
  const rows = await tx`
    SELECT pr.id,pr.unit_price,pr.unit,pr.contract_id,pr.effective_from,pr.effective_to,pr.rule_kind
    FROM price_rules pr
    LEFT JOIN contracts c ON c.id=pr.contract_id
    WHERE pr.price_type=${priceType}
      AND (${priceType === "product" ? productId ?? null : null}::uuid IS NULL OR pr.product_id=${priceType === "product" ? productId ?? null : null}::uuid)
      AND (${priceType === "product"} OR pr.product_id IS NULL)
      AND pr.effective_from<=${businessDate}::date
      AND (pr.effective_to IS NULL OR pr.effective_to>=${businessDate}::date)
      AND (${supplierOrgId ?? null}::uuid IS NULL OR pr.rule_kind='legacy')
      AND (${supplierOrgId ?? null}::uuid IS NULL OR pr.contract_id IS NULL OR c.supplier_org_id=${supplierOrgId ?? null}::uuid)
    ORDER BY CASE pr.rule_kind WHEN 'adjustment' THEN 0 WHEN 'base' THEN 1 ELSE 2 END,pr.effective_from DESC,pr.created_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export function tripPriceType(visitsMine: boolean, co2LiquidSpecial: boolean): PriceType {
  if (co2LiquidSpecial) return "trip_co2_liquid";
  if (visitsMine) return "trip_mine";
  return "trip_plant";
}

/**
 * Cước 1 Phiếu giao NCC (V1.0.48):
 * - Chỉ Nhà máy -> 1 chuyến Nhà máy; chỉ Mỏ -> 1 chuyến Mỏ.
 * - Có cả Nhà máy + Mỏ -> tính 2 chuyến: cước Nhà máy + cước Mỏ.
 * - CO2 lỏng chuyên dụng giữ nguyên 1 cước riêng.
 * trip_kind giữ 'mine' cho chuyến Nhà máy + Mỏ (price_rule_id = giá Mỏ);
 * transport_unit_price = transport_amount = tổng cước.
 */
export async function resolveTripCharge(
  visitsPlant: boolean,
  visitsMine: boolean,
  co2LiquidSpecial: boolean,
  businessDate: string,
  tx: any = sql,
  supplierOrgId?: string | null,
) {
  const kind = co2LiquidSpecial ? "co2_liquid" : visitsMine ? "mine" : "plant";
  const mainRule = await resolvePriceRule(tripPriceType(visitsMine, co2LiquidSpecial), businessDate, null, tx, supplierOrgId);
  if (!mainRule) return null;
  let amount = Number(mainRule.unit_price);
  if (!co2LiquidSpecial && visitsPlant && visitsMine) {
    const plantRule = await resolvePriceRule("trip_plant", businessDate, null, tx, supplierOrgId);
    if (!plantRule) return null;
    amount += Number(plantRule.unit_price);
  }
  return { kind, priceRuleId: String(mainRule.id), amount };
}

export function tripKindLabel(tripKind: string, visitsPlant: boolean, visitsMine: boolean) {
  if (tripKind === "co2_liquid") return "CO₂ lỏng chuyên dụng";
  if (tripKind === "mine" && visitsPlant && visitsMine) return "Nhà máy + Mỏ (2 chuyến)";
  if (tripKind === "mine") return "Mỏ Tà Thiết";
  return "Nhà máy";
}

/** @deprecated V1.0.40 không còn dùng cơ chế đóng phiên bản trước khi tạo giá mới. */
export async function closePreviousPriceRule(priceType: PriceType, effectiveFrom: string, productId?: string | null, tx: any = sql) {
  await tx`
    UPDATE price_rules
    SET effective_to=(${effectiveFrom}::date - interval '1 day')::date
    WHERE price_type=${priceType}
      AND (${productId ?? null}::uuid IS NULL OR product_id=${productId ?? null}::uuid)
      AND rule_kind='legacy'
      AND effective_from<${effectiveFrom}::date
      AND (effective_to IS NULL OR effective_to>=${effectiveFrom}::date)
  `;
}
