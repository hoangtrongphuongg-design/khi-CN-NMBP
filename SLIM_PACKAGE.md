# KHÍ CN–NMBP V1.0.40 — Slim package

Gói tinh gọn để phát triển/deploy từ baseline V1.0.40.

- Chỉ giữ source runtime, cấu hình, asset đang dùng, schema/seed tiện bảo trì và migration SQL 20 mới nhất.
- Đã loại bỏ changelog cũ, tài liệu lịch sử, validation report cũ và SQL migration 01–08.
- Khi cập nhật database từ V1.0.39 đang chạy, dùng `NEON_SQL/20_QUAN_LY_DON_GIA_THEO_THANG.sql`.
- Không chạy lại các migration lịch sử đã loại khỏi gói.
- Quy ước bàn giao các bản tiếp theo: dưới 100 file.
