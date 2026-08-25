# V1.0.45 — Rà soát và gói triển khai tinh gọn

## Giữ nguyên nghiệp vụ đã chốt
- Mặc định tồn vỏ khí công nghiệp tính đến ngày hiện tại.
- Chọn ngày lịch sử và bấm **Áp dụng** thì chỉ tính giao/trả đến hết ngày đó.
- Bấm từng loại khí mở modal lịch sử từ 01/01 của năm đến đúng ngày đang xem.
- Modal hiển thị tồn đầu năm, NCC giao, trả NCC, tồn cuối và bảng giao/trả có tồn lũy kế.

## Chỉnh sau rà soát
- KPI **Vỏ chai khí CN** ở đầu trang dùng cùng số tồn của ngày đang xem với khối chi tiết, tránh trường hợp chọn ngày lịch sử nhưng KPI vẫn hiện số của hôm nay.
- Các KPI khác trên Tổng quan không bị bộ lọc lịch sử tác động.

## Gói source
- Loại tài liệu lịch sử, thư mục migration SQL cũ, ZIP lồng và `tsconfig.tsbuildinfo` khỏi gói triển khai.
- Giữ source ứng dụng, cấu hình Next/Vercel, `db/schema.sql`, scripts, README và báo cáo rà soát.
- Không thay đổi schema Neon; không cần chạy SQL migration.
