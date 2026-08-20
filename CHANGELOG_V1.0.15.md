# V1.0.15 — Giao diện nhóm + phiếu nội bộ nhiều loại khí

- Trang Tổng quan của Đốc công/Giám sát/Công nhân chỉ hiện loại khí có số lượng > 0.
- Đổi tiêu đề thành `Số chai tại nhóm` và `Tồn Kho Hậu cần`.
- Tồn Kho hiển thị chai đầy/rỗng; ưu tiên chai đầy trên mobile.
- Giao diện mobile bám mockup đã duyệt với 3 thao tác Đổi/Mượn/Trả và bottom sheet.
- Một phiếu Đổi/Mượn/Trả có nhiều loại khí.
- Thủ kho nhập số lượng thực tế riêng từng dòng, cho phép thấp hơn yêu cầu khi thiếu hàng.
- Lưu đồng thời số yêu cầu và số thực tế để đối chiếu.
- Thêm xác nhận trước thao tác quan trọng và toast sau thao tác cho toàn ứng dụng.
- Excel `Nội bộ` xuất từng dòng khí của một phiếu.
- Thêm migration `NEON_SQL/08_PHIEU_NOI_BO_NHIEU_LOAI_KHI.sql`.
- Giữ toàn bộ thay đổi V1.0.14: báo cáo Từ ngày–Đến ngày, mua khí, thuê vỏ theo ngày, XL-45, vận chuyển, điều chuyển một bước, tồn khí dashboard.


## V1.0.30 — Mobile text visibility hotfix
- Khóa baseline UI mobile/desktop của tất cả vai trò.
- Chỉ sửa lỗi chữ bị cắt/hiển thị `...` trên mobile.
- Cho phép tên/label dài tự xuống dòng và container tự tăng chiều cao.
- Không thay đổi desktop, nghiệp vụ, quyền hoặc database.
