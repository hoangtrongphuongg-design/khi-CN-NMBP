# Validation report — V1.0.47

## Phạm vi sửa
- Mở rộng chức năng lịch sử trên Tổng quan từ riêng chai khí công nghiệp sang toàn bộ 11 sản phẩm hiện có.
- Các nhóm được hỗ trợ: chai khí CN, XL-45, LPG 12 kg, LPG 45 kg, Đá khô CO₂ và CO₂ lỏng.
- Ngày đang chọn áp dụng thống nhất cho toàn bộ khối sản phẩm NCC; các KPI khác của Tổng quan vẫn giữ số hiện tại.
- Sản phẩm có vật chứa hoàn trả dùng công thức: số dư đầu kỳ + thực nhận đã xác nhận - thực trả NCC.
- Sản phẩm không có vật chứa hoàn trả chỉ hiển thị lũy kế lượng NCC giao đã xác nhận trong năm, không gán khái niệm tồn/trả vỏ.

## Kiểm tra tĩnh
- Tổng số file source đóng gói: **85 file** (<100).
- TS/TSX: **71 file**; parse bằng TypeScript compiler API: **0 lỗi cú pháp**.
- Import nội bộ `@/...`: **217 import**; **0 file thiếu**.
- `package.json`, `tsconfig.json`: JSON hợp lệ.
- `scripts/db-setup.mjs`, `scripts/create-admin.mjs`: `node --check` đạt.
- 11/11 mã sản phẩm seed được phân đúng nhóm hiển thị/lịch sử.
- `tsc --noEmit` trong môi trường không có `node_modules` chỉ phát sinh lỗi baseline do thiếu Next/React/type package; không xuất hiện lỗi logic/type mới trong `lib/services/dashboard.ts`. Số dòng JSX tăng làm tăng các cảnh báo `JSX.IntrinsicElements` của môi trường thiếu React types.

## Kiểm tra logic chính
- N₂ mẫu ngày 25/08/2026: **11 + 3 giao đã xác nhận - 2 trả = 12 vỏ**.
- XL-45/LPG: có thể bấm mở lịch sử giao/trả và dùng đúng đơn vị bồn/bình.
- Đá khô CO₂/CO₂ lỏng: có thể bấm mở lịch sử giao nhận theo kg; không hiển thị “Trả NCC” hoặc “Tồn vỏ”.
- Modal luôn giới hạn từ 01/01 của năm đến hết ngày đang chọn; ngày sau không được tính.

## Kiểm soát dữ liệu
- Không thay đổi schema Neon.
- Không cần SQL migration.
- Không sửa/xóa dữ liệu hiện có.
- Không chứa `.env`, `node_modules`, `.next`, ZIP lồng hoặc `tsconfig.tsbuildinfo`.

## Giới hạn kiểm tra
- Chưa chạy `next build` hoàn chỉnh vì gói slim không chứa `node_modules` và môi trường hiện tại không cài dependency dự án.
- Cần xác nhận build cuối trên Vercel/GitHub sau khi deploy.
