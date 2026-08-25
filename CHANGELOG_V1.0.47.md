# CHANGELOG V1.0.47

## Tổng quan — lịch sử cho toàn bộ sản phẩm

- Mở rộng chức năng bấm xem lịch sử từ riêng chai khí công nghiệp sang toàn bộ danh mục sản phẩm đang quản lý.
- Áp dụng cho: O₂, CO₂, N₂, Ar, Ar/CO₂, LOX XL-45, LIN XL-45, LPG 12 kg, LPG 45 kg, Đá khô CO₂ và CO₂ lỏng.
- Ngày được chọn trên khối Tổng quan áp dụng thống nhất cho toàn bộ nhóm sản phẩm; các KPI khác của trang vẫn giữ theo ngày hiện tại.
- Với sản phẩm có vật chứa hoàn trả: modal hiển thị tồn đầu năm, NCC giao, trả NCC, tồn đến ngày xem và tồn lũy kế từng dòng.
- Với sản phẩm không có vật chứa hoàn trả (Đá khô CO₂, CO₂ lỏng): modal chỉ thống kê các lần NCC giao đã xác nhận và lũy kế lượng giao trong năm; không hiển thị khái niệm trả vỏ/tồn vỏ.
- Giữ nguyên quy tắc V1.0.46: giao được cộng ngay khi bên nhận xác nhận `confirmed_qty`; trả NCC được trừ theo số thực trả; phiếu hủy không tính.
- Không thay đổi schema Neon và không cần SQL migration.
