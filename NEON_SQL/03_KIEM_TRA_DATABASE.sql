-- ============================================================
-- QUẢN LÝ KHÍ NMBP - KIỂM TRA SAU KHI SETUP
-- Có thể chạy bất kỳ lúc nào trong Neon SQL Editor.
-- ============================================================

-- 1. Các bảng chính đã được tạo chưa?
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 2. Danh mục địa điểm
SELECT code, name, kind, active
FROM locations
ORDER BY code;

-- 3. Danh sách nhóm
SELECT g.code, g.name, l.name AS location
FROM work_groups g
JOIN locations l ON l.id = g.location_id
ORDER BY g.name;

-- 4. Danh mục khí/sản phẩm
SELECT code, name, specification, unit,
       returnable_container,
       warehouse_split_full_empty,
       internal_group_tracking
FROM products
ORDER BY display_order;

-- 5. Hợp đồng
SELECT contract_no, contract_name, signed_date, valid_from, valid_to, active
FROM contracts
ORDER BY valid_from DESC;

-- 6. Bảng giá đang có
SELECT
  pr.price_type,
  p.code AS product_code,
  p.name AS product_name,
  pr.unit,
  pr.unit_price,
  pr.effective_from,
  pr.effective_to
FROM price_rules pr
LEFT JOIN products p ON p.id = pr.product_id
ORDER BY pr.price_type, p.display_order NULLS LAST, pr.effective_from;

-- 7. Tài khoản
SELECT username, full_name, role, active
FROM users
ORDER BY role, username;
