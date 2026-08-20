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


## V1.0.31 — Numeric input UX fix
- Bỏ mặc định số lượng `1` ở các form nghiệp vụ client-side; ô mới để trống.
- Cho phép xóa sạch ô số lượng và nhập số nhiều chữ số bình thường, không auto-tab.
- Mobile ưu tiên bàn phím số (`numeric`) hoặc bàn phím số thập phân (`decimal`) theo loại dữ liệu.
- Giữ nguyên toàn bộ layout/role/business flow đã khóa; không có SQL mới.


## V1.0.32
- Sửa lỗi mất focus sau ký tự đầu tiên ở form Tạo phiếu giao NCC trên desktop/mobile.
- Nguyên nhân: component vùng giao được khai báo lồng bên trong DeliveryCreateForm, khiến React remount vùng nhập sau mỗi lần cập nhật state.
- Chuyển sang render helper ổn định, không còn tự rời ô/tự nhảy sang ô khác khi đang gõ số nhiều chữ số.
- Rà soát mã nguồn: không có autoFocus, focus(), maxLength=1 hoặc logic tự chuyển ô trong các form số lượng khác.


## V1.0.33 — Chuẩn hóa múi giờ Việt Nam
- Sửa thời gian XSC xác nhận trên trang Giao nhận NCC về múi giờ `Asia/Ho_Chi_Minh` (GMT+7).
- Sửa thời gian PHC hoàn tất trên trang Giao nhận NCC về múi giờ `Asia/Ho_Chi_Minh` (GMT+7).
- Chỉ sửa cách hiển thị timestamp; không thay đổi dữ liệu lịch sử trong Neon, nghiệp vụ, quyền hoặc giao diện đã khóa.
- Không có SQL mới.


## V1.0.35
- Baseline: V1.0.33.
- Chỉ Trưởng kho Hậu cần được duyệt nhận hàng NCC / hoàn tất Phiếu giao.
- Thủ kho và XSC Mỏ vẫn cập nhật tồn ngay khi xác nhận trả vỏ cùng chuyến.
- Bổ sung hậu kiểm Phiếu trả vỏ: Chờ duyệt / Đã duyệt / Trưởng kho phản hồi.
- Trưởng kho có tác vụ riêng cho duyệt nhận hàng và hậu kiểm trả vỏ Nhà máy/Mỏ.
- Phản hồi hậu kiểm không tự đảo tồn kho.
- SQL 14 bổ sung trường hậu kiểm trên supplier_returns.
