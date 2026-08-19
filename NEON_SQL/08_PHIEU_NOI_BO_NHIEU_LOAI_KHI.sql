-- V1.0.15 - Một phiếu Mượn/Đổi/Trả có nhiều loại khí
-- Chạy 1 lần trên Neon sau khi cập nhật code V1.0.15. Script an toàn khi chạy lại.

BEGIN;

CREATE TABLE IF NOT EXISTS internal_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_request_id uuid NOT NULL REFERENCES internal_requests(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  requested_qty numeric(14,3) NOT NULL CHECK (requested_qty > 0),
  actual_qty numeric(14,3) CHECK (actual_qty >= 0),
  return_bucket text CHECK (return_bucket IN ('full','empty')),
  line_status text NOT NULL DEFAULT 'pending' CHECK (line_status IN ('pending','executed')),
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(internal_request_id, product_id)
);

CREATE INDEX IF NOT EXISTS internal_request_items_request_idx
  ON internal_request_items(internal_request_id, created_at);

-- Chuyển các phiếu cũ (1 loại khí/phiếu) sang cấu trúc dòng chi tiết.
INSERT INTO internal_request_items(
  internal_request_id, product_id, requested_qty, actual_qty, return_bucket, line_status, executed_at, created_at
)
SELECT
  ir.id, ir.product_id, ir.requested_qty, ir.actual_qty, ir.return_bucket,
  CASE WHEN ir.actual_qty IS NULL THEN 'pending' ELSE 'executed' END,
  ir.executed_at, ir.created_at
FROM internal_requests ir
WHERE NOT EXISTS (
  SELECT 1 FROM internal_request_items iri WHERE iri.internal_request_id=ir.id
)
ON CONFLICT (internal_request_id, product_id) DO NOTHING;

COMMIT;

-- Kiểm tra nhanh
SELECT
  (SELECT count(*) FROM internal_requests) AS so_phieu_noi_bo,
  (SELECT count(*) FROM internal_request_items) AS so_dong_chi_tiet;
