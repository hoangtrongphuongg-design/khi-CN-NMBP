
## V1.0.38 - Kiểm kê & chốt vận hành
- Admin có tab Kiểm kê & chốt vận hành.
- Trước khi chốt: chế độ Hồi nhập lịch sử NCC; giao/trả phục vụ chi phí + nợ vỏ nhưng không ép tồn vật lý.
- Nhập kiểm kê Kho Hậu cần (đầy/rỗng), từng nhóm và Mỏ/Nhóm Cối.
- Đối chiếu tự động số vỏ theo NCC với tổng kiểm kê theo từng loại.
- Chốt một lần: đặt tồn vật lý theo kiểm kê, lưu audit và chuyển sang Vận hành chính thức.
- Sau mốc vận hành, chặn nhập Phiếu NCC có ngày trước ngày go-live bằng luồng vận hành thông thường.
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

## V1.0.36 — Phản hồi mở lại quyền chỉnh sửa
- Baseline: V1.0.35. Không thay đổi database, không có SQL mới.
- Chuẩn chung: khi bên nhận/hậu kiểm phản hồi, đúng bên đã nhập/xác nhận dữ liệu được mở lại quyền chỉnh sửa và gửi lại.
- Phiếu giao NCC: phản hồi trước XSC → NCC sửa SL khai báo; phản hồi sau XSC → Workshop (Nhà máy) / XSC Mỏ sửa SL thực nhận rồi gửi lại Trưởng kho.
- Phiếu trả vỏ NCC: Thủ kho (Nhà máy) / XSC Mỏ được sửa số lượng, thêm/xóa loại sau phản hồi; hệ thống chỉ cập nhật phần chênh lệch tồn và đưa phiếu về Chờ Trưởng kho duyệt.
- Phiếu Đổi/Mượn/Trả nội bộ: khi hậu kiểm phản hồi, Thủ kho sửa SL thực tế/tình trạng trả và gửi lại; tồn chỉ điều chỉnh phần chênh lệch.
- Điều chuyển Nhà máy ↔ Mỏ: bên lập điều chuyển được sửa sau phản hồi của bên nhận; tồn chỉ điều chỉnh phần chênh lệch rồi phiếu trở lại trạng thái đã cập nhật.
- Các điều chỉnh sau phản hồi đều ghi audit; dữ liệu đã cập nhật tồn trước đó không bị chạy lại toàn bộ.
- Báo cáo thuê vỏ và Tổng quan vỏ NCC đã tính cả bút toán điều chỉnh trả vỏ để số hiện tại/chi phí không lệch.


## V1.0.37 — Thủ kho nhận NCC + ưu tiên phiếu dang dở
- Baseline: V1.0.36. Không thay đổi database, không có SQL mới.
- Nhà máy: Thủ kho Hậu cần là người xác nhận số lượng thực nhận từ NCC; Mỏ: XSC Mỏ xác nhận; Trưởng kho vẫn duyệt cuối. Workshop chỉ xem/kiểm soát, không còn là người xác nhận thực nhận tại Nhà máy.
- Tổng quan Thủ kho trên mobile và desktop chuyển khối `Việc cần xử lý` thành hộp công việc thực tế: NCC chờ nhận, Đổi, Mượn, Trả, trả vỏ cùng chuyến, phản hồi cần sửa và phiếu xử lý chưa đủ. Deep-link mở thẳng phiếu nếu chỉ có 1, hoặc danh sách đã lọc nếu có nhiều.
- KPI Thủ kho ưu tiên đúng nhiệm vụ: `NCC chờ nhận`, `Đổi chờ xử lý`, `Trả chờ nhận`, `Cần chỉnh sửa`; không còn KPI `NCC chờ Trưởng kho` trên Tổng quan Thủ kho.
- Danh sách Phiếu giao NCC ưu tiên trạng thái: Có phản hồi → Chờ xác nhận thực nhận → Chờ Trưởng kho → trạng thái đang xử lý khác → Hoàn tất; trong từng nhóm sắp mới nhất → cũ nhất.
- Phiếu dang dở được nhấn trực quan, đặc biệt trên mobile, và chia rõ `Cần xử lý trước` / `Đã hoàn tất`.
- Giữ nguyên design system và các giao diện đã khóa ngoài các thay đổi chức năng nêu trên.
