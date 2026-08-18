-- ============================================================
-- QUẢN LÝ KHÍ NMBP - TẠO ADMIN ĐẦU TIÊN
-- Chạy SAU file 01_TAO_DATABASE_VA_DU_LIEU_MAU.sql
--
-- TRƯỚC KHI RUN:
-- 1) Thay ADMIN01 nếu muốn username khác.
-- 2) Thay MAT_KHAU_CUA_ANH_2026 bằng mật khẩu thật của anh.
-- 3) Thay "Quản trị hệ thống" nếu muốn tên khác.
--
-- KHÔNG đưa mật khẩu thật vào GitHub.
-- Nên chỉnh trực tiếp trong Neon SQL Editor rồi Run.
-- ============================================================

BEGIN;

INSERT INTO users (
  username,
  full_name,
  password_hash,
  role,
  location_id,
  active,
  must_change_password
)
SELECT
  UPPER('ADMIN01'),
  'Quản trị hệ thống',
  crypt('MAT_KHAU_CUA_ANH_2026', gen_salt('bf', 12)),
  'admin',
  l.id,
  true,
  false
FROM locations l
WHERE l.code = 'PLANT'
ON CONFLICT (username) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  password_hash = EXCLUDED.password_hash,
  role = 'admin',
  location_id = EXCLUDED.location_id,
  active = true,
  must_change_password = false,
  session_version = users.session_version + 1,
  updated_at = now();

COMMIT;

-- Kiểm tra:
SELECT username, full_name, role, active
FROM users
WHERE username = UPPER('ADMIN01');
