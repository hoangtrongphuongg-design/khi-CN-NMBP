-- ============================================================
-- V1.0.6 - GIAO NHẬN NCC 2 BƯỚC
-- Chạy 1 lần trong Neon > SQL Editor SAU khi cập nhật code V1.0.6.
--
-- Quy trình mới:
--   NCC tạo Phiếu -> XSC xác nhận số thực nhận -> PHC xác nhận hoàn tất.
-- Bước XSC không phụ thuộc đơn giá.
-- Bước PHC mới chốt đơn giá + cập nhật tồn + hoàn tất Phiếu.
--
-- Script này cũng bổ sung lại bảng giá HĐ 121/CCKCN-2026 nếu bị thiếu.
-- Không ghi đè đơn giá mới hơn nếu đã có.
-- ============================================================

BEGIN;

ALTER TABLE supplier_deliveries
  ADD COLUMN IF NOT EXISTS phc_confirmed_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS phc_confirmed_at timestamptz;

ALTER TABLE supplier_deliveries
  DROP CONSTRAINT IF EXISTS supplier_deliveries_status_check;
ALTER TABLE supplier_deliveries
  ADD CONSTRAINT supplier_deliveries_status_check
  CHECK (status IN ('pending','feedback','phc_pending','completed','cancelled'));

ALTER TABLE supplier_delivery_items
  DROP CONSTRAINT IF EXISTS supplier_delivery_items_status_check;
ALTER TABLE supplier_delivery_items
  ADD CONSTRAINT supplier_delivery_items_status_check
  CHECK (status IN ('pending','xsc_confirmed','confirmed','feedback'));

-- Bổ sung đơn giá sản phẩm HĐ hiện hành nếu database đang thiếu.
WITH c AS (
  SELECT id
  FROM contracts
  WHERE contract_no='121/CCKCN-2026'
  ORDER BY created_at DESC
  LIMIT 1
)
INSERT INTO price_rules(contract_id,price_type,product_id,unit,unit_price,effective_from,note)
SELECT c.id,'product',p.id,p.unit,v.price,'2026-03-02','Đơn giá HĐ 121/CCKCN-2026'
FROM c
JOIN (VALUES
  ('O2',80000::numeric),
  ('CO2',300000),
  ('N2',154000),
  ('LOX-XL45',2750000),
  ('LIN-XL45',2850000),
  ('AR',350000),
  ('ARCO2',450000),
  ('DRY-CO2',48000),
  ('LIQ-CO2',17000),
  ('LPG45',1650000),
  ('LPG12',440000)
) v(code,price) ON true
JOIN products p ON p.code=v.code
WHERE NOT EXISTS (
  SELECT 1
  FROM price_rules pr
  WHERE pr.contract_id=c.id
    AND pr.price_type='product'
    AND pr.product_id=p.id
    AND pr.effective_from='2026-03-02'
);

COMMIT;

-- Kiểm tra nhanh trạng thái và đơn giá O2 đang có hiệu lực hôm nay.
SELECT
  p.code,
  p.name,
  pr.unit_price,
  pr.effective_from,
  pr.effective_to
FROM products p
LEFT JOIN LATERAL (
  SELECT unit_price,effective_from,effective_to
  FROM price_rules
  WHERE price_type='product'
    AND product_id=p.id
    AND effective_from<=CURRENT_DATE
    AND (effective_to IS NULL OR effective_to>=CURRENT_DATE)
  ORDER BY effective_from DESC,created_at DESC
  LIMIT 1
) pr ON true
WHERE p.code='O2';
