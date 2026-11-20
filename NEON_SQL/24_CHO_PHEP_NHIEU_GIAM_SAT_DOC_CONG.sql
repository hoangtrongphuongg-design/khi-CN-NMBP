-- V1.0.50 - CHO PHÉP 1 NHÓM CÓ NHIỀU GIÁM SÁT VÀ NHIỀU ĐỐC CÔNG
-- Chạy 01 lần trên Neon. Chỉ bỏ 2 ràng buộc "mỗi nhóm 1 người"; không sửa/xóa dữ liệu.
-- Chạy lại nhiều lần vẫn an toàn.

DROP INDEX IF EXISTS users_one_supervisor_per_group_idx;
DROP INDEX IF EXISTS users_one_foreman_per_group_idx;

-- KIỂM TRA: kết quả phải RỖNG (không còn 2 ràng buộc trên).
SELECT indexname FROM pg_indexes
WHERE indexname IN ('users_one_supervisor_per_group_idx','users_one_foreman_per_group_idx');
