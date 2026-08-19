-- ============================================================
-- V1.0.8 - RÀ SOÁT + SỬA DÒNG THỜI GIAN ĐƠN GIÁ
-- Chạy 1 lần trong Neon > SQL Editor.
-- Mục tiêu:
--   1) Bảo đảm có HĐ 121/CCKCN-2026 và giá gốc theo HĐ.
--   2) KHÔNG ghi đè các phiên bản giá mới mà Admin đã tạo.
--   3) Tự nối hiệu lực liên tục: giá trước kết thúc đúng 1 ngày trước giá kế tiếp.
--   4) Kiểm tra riêng O2 tại ngày 2026-08-19.
-- ============================================================

BEGIN;

-- 1) Bảo đảm NCC Anh Tân và hợp đồng tồn tại.
INSERT INTO organizations(code,name,kind,active)
VALUES ('ANHTAN','Công ty TNHH Anh Tân','supplier',true)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,kind='supplier',active=true;

INSERT INTO contracts(supplier_org_id,contract_no,contract_name,signed_date,valid_from,valid_to,active)
SELECT o.id,'121/CCKCN-2026','Cung cấp các loại khí công nghiệp năm 2026',
       DATE '2026-03-02',DATE '2026-03-02',DATE '2027-03-01',true
FROM organizations o
WHERE o.code='ANHTAN'
ON CONFLICT (supplier_org_id,contract_no) DO UPDATE SET
  contract_name=EXCLUDED.contract_name,
  signed_date=EXCLUDED.signed_date,
  valid_from=EXCLUDED.valid_from,
  valid_to=EXCLUDED.valid_to,
  active=true;

-- 2) Bổ sung giá gốc HĐ nếu CHƯA có đúng mốc 02/03/2026.
--    ON CONFLICT DO NOTHING để không ghi đè giá đã tồn tại.
WITH c AS (
  SELECT id FROM contracts WHERE contract_no='121/CCKCN-2026' ORDER BY created_at DESC LIMIT 1
), base(code,price) AS (
  VALUES
    ('O2',80000::numeric),
    ('CO2',300000::numeric),
    ('N2',154000::numeric),
    ('LOX-XL45',2750000::numeric),
    ('LIN-XL45',2850000::numeric),
    ('AR',350000::numeric),
    ('ARCO2',450000::numeric),
    ('DRY-CO2',48000::numeric),
    ('LIQ-CO2',17000::numeric),
    ('LPG45',1650000::numeric),
    ('LPG12',440000::numeric)
)
INSERT INTO price_rules(contract_id,price_type,product_id,unit,unit_price,effective_from,note)
SELECT c.id,'product',p.id,p.unit,b.price,DATE '2026-03-02','Giá gốc HĐ 121/CCKCN-2026'
FROM c
JOIN base b ON true
JOIN products p ON p.code=b.code
ON CONFLICT (product_id,effective_from) WHERE price_type='product' DO NOTHING;

-- Giá dịch vụ/vận chuyển gốc.
WITH c AS (
  SELECT id FROM contracts WHERE contract_no='121/CCKCN-2026' ORDER BY created_at DESC LIMIT 1
), base(price_type,unit,price) AS (
  VALUES
    ('trip_plant','chuyến',1600000::numeric),
    ('trip_mine','chuyến',1900000::numeric),
    ('trip_co2_liquid','chuyến',7000000::numeric),
    ('cylinder_rental_day','vỏ/ngày',2000::numeric),
    ('xl45_rental_day','bồn/ngày',150000::numeric)
)
INSERT INTO price_rules(contract_id,price_type,unit,unit_price,effective_from,note)
SELECT c.id,b.price_type,b.unit,b.price,DATE '2026-03-02','Giá gốc HĐ 121/CCKCN-2026'
FROM c
JOIN base b ON true
ON CONFLICT (price_type,effective_from) WHERE price_type<>'product' DO NOTHING;

-- 3) Chuẩn hóa khoảng hiệu lực sản phẩm theo nguyên tắc:
--    giá mới có hiệu lực từ ngày X -> giá trước kết thúc X-1.
WITH ordered AS (
  SELECT id,
         LEAD(effective_from) OVER (
           PARTITION BY product_id
           ORDER BY effective_from, created_at, id
         ) AS next_from
  FROM price_rules
  WHERE price_type='product'
)
UPDATE price_rules pr
SET effective_to = CASE WHEN o.next_from IS NULL THEN NULL ELSE (o.next_from - 1) END
FROM ordered o
WHERE pr.id=o.id
  AND pr.effective_to IS DISTINCT FROM CASE WHEN o.next_from IS NULL THEN NULL ELSE (o.next_from - 1) END;

-- 4) Chuẩn hóa khoảng hiệu lực các loại giá không phải sản phẩm.
WITH ordered AS (
  SELECT id,
         LEAD(effective_from) OVER (
           PARTITION BY price_type
           ORDER BY effective_from, created_at, id
         ) AS next_from
  FROM price_rules
  WHERE price_type<>'product'
)
UPDATE price_rules pr
SET effective_to = CASE WHEN o.next_from IS NULL THEN NULL ELSE (o.next_from - 1) END
FROM ordered o
WHERE pr.id=o.id
  AND pr.effective_to IS DISTINCT FROM CASE WHEN o.next_from IS NULL THEN NULL ELSE (o.next_from - 1) END;

COMMIT;

-- 5) KIỂM TRA BẮT BUỘC: O2 phải có giá hiệu lực tại 19/08/2026.
SELECT
  p.code,
  p.name,
  pr.unit_price,
  pr.unit,
  pr.effective_from,
  pr.effective_to,
  c.contract_no
FROM products p
LEFT JOIN LATERAL (
  SELECT *
  FROM price_rules x
  WHERE x.price_type='product'
    AND x.product_id=p.id
    AND x.effective_from<=DATE '2026-08-19'
    AND (x.effective_to IS NULL OR x.effective_to>=DATE '2026-08-19')
  ORDER BY x.effective_from DESC,x.created_at DESC
  LIMIT 1
) pr ON true
LEFT JOIN contracts c ON c.id=pr.contract_id
WHERE p.code='O2';

-- 6) Rà tất cả sản phẩm: cột active_price_on_2026_08_19 không được NULL
--    đối với hàng có trong HĐ đang sử dụng.
SELECT
  p.code,
  p.name,
  x.unit_price AS active_price_on_2026_08_19,
  x.effective_from,
  x.effective_to
FROM products p
LEFT JOIN LATERAL (
  SELECT unit_price,effective_from,effective_to
  FROM price_rules pr
  WHERE pr.price_type='product'
    AND pr.product_id=p.id
    AND pr.effective_from<=DATE '2026-08-19'
    AND (pr.effective_to IS NULL OR pr.effective_to>=DATE '2026-08-19')
  ORDER BY pr.effective_from DESC,pr.created_at DESC
  LIMIT 1
) x ON true
WHERE p.active=true
ORDER BY p.display_order;
