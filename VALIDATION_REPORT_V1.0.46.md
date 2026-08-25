# Validation report — V1.0.46

## Phạm vi sửa
- Sửa nguồn tính nợ vỏ NCC từ `stock_ledger` sang chứng từ nghiệp vụ hiện hành.
- Dòng giao được cộng khi bên nhận đã xác nhận `confirmed_qty`, kể cả Phiếu cha đang `phc_pending` hoặc phản hồi sau xác nhận.
- Dòng trả được trừ theo số thực trả đã ghi nhận; Phiếu hủy không tính.
- Đồng bộ Dashboard, lịch sử từng loại, báo cáo thuê vỏ theo ngày, XL-45 và đối soát kiểm kê Admin.

## Kiểm tra tĩnh
- Tổng số file source đóng gói: 85 file (<100).
- ZIP kiểm tra toàn vẹn bằng `unzip -t`: đạt, không có file lỗi.
- TS/TSX: 71 file; parse syntax: 0 lỗi.
- Import nội bộ `@/...`: 217 import; 0 file thiếu.
- `package.json`, `tsconfig.json`: JSON hợp lệ.
- `scripts/db-setup.mjs`, `scripts/create-admin.mjs`: `node --check` đạt.
- So sánh `tsc --noEmit` với V1.0.45 trong cùng môi trường không có `node_modules`: 0 diagnostic mới, 0 diagnostic bị mất; toàn bộ lỗi hiện ra đều là baseline do thiếu dependency/type package của môi trường kiểm tra.
- Kiểm thử logic mẫu N₂ ngày 25/08/2026: 11 + 3 giao đã xác nhận - 2 trả = 12.

## Kiểm soát dữ liệu
- Không thay đổi schema Neon.
- Không cần SQL migration.
- Không sửa/xóa dữ liệu đang có.
- Số tồn âm không bị ép về 0 trên màn hình đối soát; tiền thuê không tính âm.

## Giới hạn kiểm tra
- Chưa chạy `next build` hoàn chỉnh vì gói slim không chứa `node_modules` và môi trường kiểm tra không cài dependency dự án.
- Cần xác nhận build cuối trên Vercel/GitHub sau khi deploy.
