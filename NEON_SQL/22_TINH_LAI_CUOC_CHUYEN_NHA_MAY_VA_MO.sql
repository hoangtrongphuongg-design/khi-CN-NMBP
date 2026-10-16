-- V1.0.48 - TÍNH LẠI CƯỚC PHIẾU GIAO CÓ CẢ NHÀ MÁY + MỎ
-- Chạy 01 lần trên Neon SAU KHI đã deploy code V1.0.48.
--
-- Quy ước cước (theo từng Phiếu giao NCC):
--   - Chỉ giao Nhà máy  -> 1 chuyến Nhà máy (vd 1.600.000).
--   - Chỉ giao Mỏ       -> 1 chuyến Mỏ      (vd 1.900.000).
--   - Có cả Nhà máy + Mỏ -> 2 chuyến = cước Nhà máy + cước Mỏ (vd 3.500.000).
--   - CO2 lỏng chuyên dụng giữ nguyên đơn giá riêng, không đổi.
--
-- Trước V1.0.48, phiếu có cả Nhà máy + Mỏ chỉ được tính cước Mỏ.
-- Script chỉ sửa transport_trips từ 01/09/2026 (tháng 9 và tháng 10 bị sai).
-- Không đụng phiếu giao, phiếu trả, tồn kho, tiền hàng, thuê vỏ, XL-45.
-- Chạy lại nhiều lần vẫn an toàn: chỉ cập nhật chuyến có số tiền khác số đúng.

BEGIN;

-- 1) Backup. Nếu chạy lại, backup đầu tiên vẫn được giữ nguyên.
CREATE TABLE IF NOT EXISTS transport_trips_backup_before_v1048 AS
SELECT * FROM transport_trips;

-- 2) Cước đúng = cước Mỏ (theo price_rule_id đã gắn) + cước Nhà máy có hiệu lực ngày giao.
--    Giá Nhà máy chọn giống code: adjustment -> base của đúng HĐ/NCC; không có thì legacy.
WITH target AS (
  SELECT
    t.id,
    t.transport_amount AS old_amount,
    mine_pr.unit_price AS mine_price,
    COALESCE(
      (
        SELECT pr.unit_price
        FROM price_rules pr
        JOIN contracts c ON c.id=pr.contract_id
        WHERE pr.price_type='trip_plant'
          AND pr.product_id IS NULL
          AND pr.rule_kind IN ('adjustment','base')
          AND c.supplier_org_id=t.supplier_org_id
          AND c.active=true
          AND c.valid_from<=t.trip_date
          AND (c.valid_to IS NULL OR c.valid_to>=t.trip_date)
          AND pr.effective_from<=t.trip_date
          AND (pr.effective_to IS NULL OR pr.effective_to>=t.trip_date)
        ORDER BY CASE pr.rule_kind WHEN 'adjustment' THEN 0 ELSE 1 END,pr.effective_from DESC,pr.created_at DESC
        LIMIT 1
      ),
      (
        SELECT pr.unit_price
        FROM price_rules pr
        WHERE pr.price_type='trip_plant'
          AND pr.product_id IS NULL
          AND pr.rule_kind='legacy'
          AND pr.effective_from<=t.trip_date
          AND (pr.effective_to IS NULL OR pr.effective_to>=t.trip_date)
        ORDER BY pr.effective_from DESC,pr.created_at DESC
        LIMIT 1
      )
    ) AS plant_price
  FROM transport_trips t
  JOIN price_rules mine_pr ON mine_pr.id=t.price_rule_id AND mine_pr.price_type='trip_mine'
  WHERE t.trip_kind='mine'
    AND t.visits_plant=true
    AND t.visits_mine=true
    AND t.co2_liquid_special=false
    AND t.status<>'cancelled'
    AND t.trip_date>=DATE '2026-09-01'
), changed AS (
  UPDATE transport_trips t
  SET transport_unit_price=x.mine_price+x.plant_price,
      transport_amount=x.mine_price+x.plant_price
  FROM target x
  WHERE t.id=x.id
    AND x.plant_price IS NOT NULL
    AND t.transport_amount IS DISTINCT FROM x.mine_price+x.plant_price
  RETURNING t.id
)
SELECT count(*) AS so_chuyen_da_tinh_lai FROM changed;

-- 3) Ghi dấu vết.
INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data,note)
VALUES (
  NULL,
  'migration_recalculate',
  'transport_trips',
  NULL,
  NULL,
  jsonb_build_object(
    'version','V1.0.48',
    'rule','Phiếu giao có cả Nhà máy + Mỏ = cước Nhà máy + cước Mỏ',
    'from_date','2026-09-01'
  ),
  'SQL 22: tính lại cước chuyến có cả Nhà máy + Mỏ từ 01/09/2026.'
);

COMMIT;

-- KIỂM TRA SAU KHI CHẠY: danh sách chuyến Nhà máy + Mỏ từ 01/09/2026, cước cũ và cước mới.
SELECT
  t.trip_date AS ngay,
  t.trip_code AS chuyen,
  b.transport_amount AS cuoc_cu,
  t.transport_amount AS cuoc_moi
FROM transport_trips t
LEFT JOIN transport_trips_backup_before_v1048 b ON b.id=t.id
WHERE t.trip_kind='mine' AND t.visits_plant AND t.visits_mine
  AND t.co2_liquid_special=false
  AND t.status<>'cancelled'
  AND t.trip_date>=DATE '2026-09-01'
ORDER BY t.trip_date,t.trip_code;
