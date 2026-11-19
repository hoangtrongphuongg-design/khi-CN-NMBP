-- V1.0.49 - KIỂM KÊ TỪNG KHU (Mỏ / Kho Hậu cần / từng nhóm), LẶP LẠI NHIỀU ĐỢT
-- Chạy 01 lần trên Neon. Script chỉ TẠO BẢNG MỚI, không sửa/xóa dữ liệu cũ,
-- nên chạy trước hay sau khi deploy code V1.0.49 đều an toàn. Chạy lại nhiều lần vẫn an toàn.
--
-- Nghiệp vụ:
--   - Mỗi lúc chỉ có 1 đợt kiểm kê đang mở.
--   - Trong đợt, từng khu được đếm vào ngày khác nhau: Bắt đầu (web chụp số máy) -> Xác nhận số đếm.
--   - Điều chỉnh tồn = số đếm - số máy lúc bắt đầu; phiếu phát sinh trong lúc đếm được giữ nguyên.
--   - Đóng đợt: đối chiếu tổng Kho + nhóm + Mỏ với số vỏ theo NCC.

BEGIN;

CREATE TABLE IF NOT EXISTS stocktake_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_code text NOT NULL UNIQUE,
  start_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  note text,
  discrepancy_reason text,
  switched_to_live boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users(id),
  closed_at timestamptz,
  closed_by uuid REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS stocktake_rounds_one_open_uq ON stocktake_rounds(status) WHERE status='open';

CREATE TABLE IF NOT EXISTS stocktake_zone_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES stocktake_rounds(id) ON DELETE CASCADE,
  stock_point_id uuid NOT NULL REFERENCES stock_points(id),
  status text NOT NULL DEFAULT 'counting' CHECK (status IN ('counting','confirmed','cancelled')),
  note text,
  started_at timestamptz NOT NULL DEFAULT now(),
  started_by uuid NOT NULL REFERENCES users(id),
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES users(id)
);
-- Mỗi đợt, mỗi khu chỉ có 1 bản đang đếm hoặc đã chốt (bản đã hủy không tính).
CREATE UNIQUE INDEX IF NOT EXISTS stocktake_zone_counts_active_uq
  ON stocktake_zone_counts(round_id,stock_point_id) WHERE status<>'cancelled';

CREATE TABLE IF NOT EXISTS stocktake_zone_items (
  zone_count_id uuid NOT NULL REFERENCES stocktake_zone_counts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  bucket text NOT NULL CHECK (bucket IN ('full','empty','available','managed','unclassified')),
  system_qty_at_start numeric(14,3) NOT NULL DEFAULT 0,
  counted_qty numeric(14,3) CHECK (counted_qty >= 0),
  PRIMARY KEY (zone_count_id,product_id,bucket)
);

COMMIT;

-- KIỂM TRA: 3 bảng phải tồn tại.
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('stocktake_rounds','stocktake_zone_counts','stocktake_zone_items')
ORDER BY table_name;
