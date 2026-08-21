-- V1.0.41 - SỬA PHÍ LƯU BỒN XL-45: NGÀY TRẢ KHÔNG TÍNH PHÍ
-- Chạy 01 lần sau SQL 20 khi nâng từ V1.0.40 (hoặc baseline cũ) lên V1.0.41.
--
-- Quy tắc chuẩn:
--   - Ngày giao = ngày 1.
--   - Miễn phí 15 ngày đầu.
--   - Bắt đầu tính phí từ delivered_date + 15 ngày (ngày thứ 16).
--   - Ngày trả bồn cho NCC KHÔNG tính phí.
--   - Khoảng chịu phí của bồn đã trả: [delivered_date + 15 ngày, return_date - 1 ngày].
--
-- Script chỉ tính lại xl45_return_allocations. Không xóa/sửa phiếu giao, phiếu trả,
-- tồn kho, chuyến vận chuyển hoặc snapshot tiền hàng.

BEGIN;

-- 1) Backup trước khi hiệu chỉnh. Nếu chạy lại SQL 21, backup đầu tiên vẫn được giữ nguyên.
CREATE TABLE IF NOT EXISTS xl45_return_allocations_backup_before_v1041 AS
SELECT * FROM xl45_return_allocations;

-- 2) Tính lại số ngày và tiền thuê của toàn bộ allocation đã trả.
--    Giá được lấy theo từng ngày chịu phí:
--      adjustment của đúng HĐ/NCC -> base của đúng HĐ/NCC -> legacy (fallback lịch sử).
WITH recalculated AS (
  SELECT
    a.id,
    GREATEST(0, (a.return_date - l.delivered_date) - 15)::int AS new_charge_days,
    (
      COALESCE((
        SELECT SUM(COALESCE((
          SELECT pr.unit_price
          FROM price_rules pr
          LEFT JOIN contracts c ON c.id=pr.contract_id
          WHERE pr.price_type='xl45_rental_day'
            AND pr.product_id IS NULL
            AND pr.effective_from<=gs.day::date
            AND (pr.effective_to IS NULL OR pr.effective_to>=gs.day::date)
            AND (
              (
                pr.rule_kind IN ('adjustment','base')
                AND c.supplier_org_id=d.supplier_org_id
                AND c.active=true
                AND c.valid_from<=gs.day::date
                AND (c.valid_to IS NULL OR c.valid_to>=gs.day::date)
              )
              OR pr.rule_kind='legacy'
            )
          ORDER BY
            CASE pr.rule_kind WHEN 'adjustment' THEN 0 WHEN 'base' THEN 1 ELSE 2 END,
            pr.effective_from DESC,
            pr.created_at DESC
          LIMIT 1
        ),0))
        FROM generate_series(
          l.delivered_date + interval '15 day',
          a.return_date - interval '1 day',
          interval '1 day'
        ) AS gs(day)
      ),0) * a.quantity
    )::numeric AS new_rental_amount
  FROM xl45_return_allocations a
  JOIN xl45_lots l ON l.id=a.xl45_lot_id
  JOIN supplier_delivery_items di ON di.id=l.delivery_item_id
  JOIN supplier_deliveries d ON d.id=di.delivery_id
), changed AS (
  UPDATE xl45_return_allocations a
  SET
    charge_days=r.new_charge_days,
    rental_amount=r.new_rental_amount
  FROM recalculated r
  WHERE a.id=r.id
    AND (
      a.charge_days IS DISTINCT FROM r.new_charge_days
      OR a.rental_amount IS DISTINCT FROM r.new_rental_amount
    )
  RETURNING a.id
)
SELECT count(*) AS allocations_da_cap_nhat FROM changed;

-- 3) Ghi dấu vết migration. actor_user_id để NULL vì đây là SQL kỹ thuật chạy trực tiếp.
INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data,note)
VALUES (
  NULL,
  'migration_recalculate',
  'xl45_return_allocations',
  NULL,
  NULL,
  jsonb_build_object(
    'version','V1.0.41',
    'rule','Ngày trả bồn XL-45 không tính phí',
    'formula','charge from delivered_date + 15 through return_date - 1'
  ),
  'SQL 21: tính lại charge_days và rental_amount XL-45, loại ngày trả khỏi ngày tính phí.'
);

COMMIT;

-- KIỂM TRA SAU KHI CHẠY
-- Không có allocation nào được phép có charge_days âm.
SELECT count(*) AS so_dong_charge_days_am
FROM xl45_return_allocations
WHERE charge_days<0;

-- So sánh nhanh tổng trước/sau (backup là snapshot trước lần chạy SQL 21 đầu tiên).
SELECT
  (SELECT count(*) FROM xl45_return_allocations_backup_before_v1041) AS rows_before,
  (SELECT count(*) FROM xl45_return_allocations) AS rows_after,
  (SELECT COALESCE(sum(rental_amount),0) FROM xl45_return_allocations_backup_before_v1041) AS rental_before,
  (SELECT COALESCE(sum(rental_amount),0) FROM xl45_return_allocations) AS rental_after;

-- Chi tiết để kiểm thử công thức. expected_charge_days phải bằng charge_days.
SELECT
  a.id,
  l.delivered_date,
  a.return_date,
  a.quantity,
  GREATEST(0,(a.return_date-l.delivered_date)-15)::int AS expected_charge_days,
  a.charge_days,
  a.rental_amount
FROM xl45_return_allocations a
JOIN xl45_lots l ON l.id=a.xl45_lot_id
ORDER BY a.return_date DESC,l.delivered_date DESC
LIMIT 100;
