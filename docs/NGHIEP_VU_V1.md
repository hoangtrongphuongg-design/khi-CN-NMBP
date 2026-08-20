# Đặc tả nghiệp vụ V1.0.15 — Quản lý khí NMBP

## 1. Phạm vi

Hệ thống quản lý khí công nghiệp và LPG tại Nhà máy Xi măng Bình Phước (NMBP), gồm Nhà máy và Mỏ đá Tà Thiết. Không quản lý seri/mã chai; seri thuộc nghiệp vụ riêng của Phòng An toàn Môi trường.

Các luồng chính:
1. NCC giao khí/vỏ cho Nhà máy/Mỏ.
2. NMBP trả vỏ cho NCC.
3. Mượn · Đổi · Trả nội bộ giữa Kho Hậu cần và các nhóm.
4. Điều chuyển Nhà máy ↔ Mỏ.
5. Theo dõi tồn, chi phí mua khí, thuê vỏ, XL-45 và vận chuyển.

## 2. Hàng hóa seed ban đầu

- O₂ 6 m³/chai
- CO₂ 20–25 kg/chai
- N₂ 6 m³/chai
- Argon 40 L, 120–150 bar
- Khí trộn Ar/CO₂
- Oxy lỏng XL-45 170 kg
- Nitơ lỏng XL-45 125 kg
- Đá khô CO₂ (kg)
- CO₂ lỏng (kg)
- LPG 45 kg/chai
- LPG 12 kg/chai

Danh mục có thể được Admin bổ sung mà không sửa code.

## 3. Địa điểm và nhóm

- Nhà máy Xi măng Bình Phước
- Mỏ đá Tà Thiết

Nhóm Cối chính là thực thể tồn của Mỏ; không tạo thêm một “Kho Mỏ” riêng để tránh đếm trùng. Các nhóm Nhà máy gồm CBL, NBS-NT, Lò, NXM, Nhà thầu, Workshop, Phòng Hậu cần và các nhóm được Admin bổ sung.

## 4. Giao nhận NCC — xác nhận 2 bước

Quy trình chuẩn:

**NCC tạo phiếu → XSC xác nhận thực nhận theo địa điểm → PHC xác nhận hoàn tất.**

- Dòng giao Nhà máy: Workshop/XSC Nhà máy xác nhận bước 1.
- Dòng giao Mỏ: XSC Mỏ xác nhận bước 1.
- Phiếu giao cả Nhà máy + Mỏ chỉ chuyển sang bước PHC sau khi mọi dòng liên quan đã được XSC xác nhận.
- PHC hoàn tất: Trưởng kho Hậu cần hoặc Thủ kho.
- XSC xác nhận bước 1 không bị chặn bởi thiếu đơn giá và chưa cập nhật tồn.
- PHC xác nhận cuối mới chốt đơn giá, cập nhật tồn và hoàn tất phiếu.
- Nếu số thực nhận khác NCC khai, lưu cả số NCC khai và số thực nhận; không ghi đè lịch sử.

## 5. Phiếu trả vỏ NCC và chuyến xe

- PHC/XSC có thể tạo Phiếu trả vỏ NCC; NCC xác nhận số thực nhận.
- Nếu lệch số, lưu cả số khai và số xác nhận.
- Cùng một xe vừa giao vừa gom vỏ trong một lượt = 1 chuyến.
- Chỉ cần chuyến có vào Mỏ để giao hoặc gom vỏ → toàn chuyến tính cước Mỏ.
- CO₂ lỏng xe chuyên dụng có loại cước riêng.
- `transport_trips` liên kết Phiếu giao và Phiếu trả vỏ để tránh tính trùng cước.

## 6. Tồn và vỏ chai

- Kho Hậu cần tách **chai đầy / chai rỗng**.
- Các nhóm chỉ theo dõi **tổng số chai tại nhóm** theo từng loại; không tách đầy/rỗng.
- Tổng vỏ NCC đang để NMBP quản lý = Kho Hậu cần + các nhóm + Nhóm Cối/Mỏ.
- Các nghiệp vụ nội bộ chỉ đổi vị trí giữ chai, không làm thay đổi tổng vỏ thuê NCC.

### Giao diện nhóm

- Tiêu đề trên: **Số chai tại nhóm**.
- Chỉ hiện loại khí có số lượng > 0. Loại = 0 được ẩn trên cả desktop và mobile.
- Phần dưới: **Tồn Kho Hậu cần**, hiển thị chai đầy/rỗng; chỉ hiện loại có dữ liệu > 0.
- Mobile ưu tiên số chai đầy tại Kho và 3 thao tác lớn: **Đổi – Mượn – Trả**.

## 7. Mượn · Đổi · Trả nội bộ — nhiều loại khí trong một phiếu

Một phiếu có thể có nhiều dòng khí, ví dụ: O₂ 3 chai + CO₂ 2 chai + Ar/CO₂ 1 chai.

- Đốc công/Giám sát tạo phiếu cho nhóm; Công nhân chỉ xem.
- Nhóm Cối/Mỏ không tạo phiếu đổi web; khi cần đổi liên hệ Workshop qua Zalo.
- Thủ kho nhập **số lượng thực tế riêng từng dòng**.
- Có thể thực hiện thấp hơn số yêu cầu khi Kho không đủ; hệ thống giữ cả `Yêu cầu` và `Thực tế`.
- Phiếu được xử lý khi toàn bộ các dòng đã được nhập số thực tế.

### Đổi chai

Nhóm tạo → Thủ kho nhập thực tế từng loại → Kho chai đầy giảm, chai rỗng tăng → tổng số chai tại nhóm không đổi → Trưởng kho/Workshop hậu kiểm.

Số lượng đổi không được lớn hơn số chai nhóm đang giữ của loại đó.

### Mượn thêm

- Trong giờ hành chính: chỉ Workshop hoặc Trưởng kho duyệt trước; sau đó Thủ kho cấp.
- Ngoài giờ/ngày nghỉ: Thủ kho được cấp ngay; sau đó Trưởng kho/Workshop hậu kiểm.
- Mượn làm tăng số chai tại nhóm và giảm chai đầy Kho.
- Nếu sau khi mượn vượt định mức, giao diện cảnh báo phần vượt nhưng vẫn cho gửi yêu cầu đúng quyền.

### Trả chai

Nhóm tạo → Thủ kho nhập số thực tế từng dòng và tình trạng chai trả (đầy/rỗng) → nhóm giảm → Kho tăng → Trưởng kho/Workshop hậu kiểm.

Số lượng trả không được lớn hơn số chai nhóm đang giữ.

## 8. Giờ hành chính

- Mặc định T2–T6: 07:30–16:30.
- T7/CN: ngoài giờ.
- Admin chỉ cấu hình ngày ngoại lệ: `holiday` hoặc `workday`.
- Không cần Admin nhập lịch từng ngày.

## 9. Điều chuyển Nhà máy ↔ Mỏ — một bước

### Nhà máy → Mỏ

Workshop hoặc Trưởng kho tạo lệnh và bấm xác nhận → Kho/Nhà máy giảm và Nhóm Cối/Mỏ tăng ngay. XSC Mỏ chỉ xem và phản hồi nếu phát hiện sai.

### Mỏ → Nhà máy

XSC Mỏ tạo lệnh và bấm xác nhận → Mỏ giảm và Kho Hậu cần tăng ngay. Workshop/Trưởng kho chỉ phản hồi nếu sai.

- Không có trạng thái “Đang vận chuyển”.
- Không yêu cầu bên nhận xác nhận lần hai.
- Điều chuyển không làm thay đổi tổng vỏ thuê NCC.
- Phiếu hoàn tất không sửa trực tiếp; nếu sai dùng phản hồi/điều chỉnh có audit.

## 10. Phân quyền

- `admin`: quản trị hệ thống/cấu hình.
- `workshop`: Quản lý XSC, quyền nghiệp vụ tương đương Trưởng kho.
- `warehouse_manager`: Trưởng kho Hậu cần.
- `storekeeper`: Thủ kho.
- `mine_xsc`: XSC Mỏ.
- `foreman`: Đốc công.
- `supervisor`: Giám sát.
- `worker`: Công nhân, chỉ xem.
- `management_board`: Ban quản đốc, chỉ xem toàn bộ.
- `supplier`: NCC.

CBCNV đăng nhập bằng mã danh bộ. Admin có thể đổi vai trò/nhóm và đặt lại mật khẩu; username/mã danh bộ không đổi.

## 11. Giá và chi phí mua khí

- Giá có phiên bản theo `effective_from`; không ghi đè giá cũ.
- Giao dịch hoàn tất lưu snapshot đơn giá/thành tiền.
- Tiền mua khí = tổng `SL thực nhận PHC × đơn giá có hiệu lực tại ngày giao` của từng phiếu.
- Báo cáo tách riêng từng loại khí và từng phiếu.

## 12. Thuê vỏ theo từng loại và từng ngày

Thuê vỏ tính riêng từng loại O₂, CO₂, N₂, Argon, Ar/CO₂... theo **vỏ-ngày**.

Mỗi ngày:

`Vỏ cuối ngày = Vỏ cuối ngày trước + vỏ/chai NCC giao thêm - vỏ trả NCC`

`Tiền thuê ngày = Vỏ cuối ngày × đơn giá thuê vỏ có hiệu lực trong ngày`

Cuối kỳ:

`Tiền thuê kỳ = tổng số vỏ cuối từng ngày × đơn giá tương ứng từng ngày`

- Giao/đổi nội bộ Kho ↔ Nhóm hoặc Nhà máy ↔ Mỏ không làm đổi tổng vỏ thuê.
- Nếu xem kỳ có ngày kết thúc ở tương lai, báo cáo thực tế chỉ tính đến ngày hiện tại; không tính ngày tương lai.
- Báo cáo có tổng hợp theo loại và chi tiết theo ngày: NCC giao / trả NCC / tăng giảm ròng / vỏ cuối ngày / tiền thuê ngày.

## 13. XL-45

- Miễn 15 ngày.
- Từ ngày 16: tính phí bồn-ngày theo đơn giá có hiệu lực.
- Theo dõi lô giao/trả để tính đúng số ngày phát sinh.

## 14. Báo cáo chi phí

Người dùng chọn tự do **Từ ngày – Đến ngày**, có thể qua nhiều tháng.

Dashboard chi phí gồm:
1. Tiền mua khí.
2. Thuê vỏ.
3. Thuê XL-45.
4. Vận chuyển.
5. Tổng chi phí.

Có cơ cấu chi phí, xu hướng, top loại khí, bảng tổng hợp theo loại và chi tiết giao dịch. Excel xuất đúng khoảng ngày đang chọn, gồm các sheet mua khí, thuê vỏ theo ngày/tổng hợp, XL-45, vận chuyển, tồn, nội bộ nhiều dòng và điều chuyển.

## 15. Cảnh báo tồn thấp

- Admin cấu hình ngưỡng riêng từng sản phẩm và email nhận.
- Chỉ theo dõi chai đầy Kho Hậu cần.
- Chỉ gửi một email khi chuyển từ trên ngưỡng xuống bằng/dưới ngưỡng.
- Khi tồn phục hồi lên trên ngưỡng thì reset; lần giảm sau mới gửi lại.

## 16. UI/UX và xác nhận thao tác

- Responsive desktop + mobile; mobile không thu nhỏ bảng desktop mà dùng card/sheet thao tác.
- Giao diện nhóm bám mockup đã duyệt: Số chai tại nhóm → Tồn Kho Hậu cần → Đổi/Mượn/Trả → bottom sheet tạo phiếu nhiều loại.
- Khi bấm **Gửi yêu cầu**, hiển thị hộp xác nhận nhỏ với tóm tắt số liệu trước khi gửi.
- Các form thao tác quan trọng trên hệ thống (Lưu, Gửi, Duyệt, Xác nhận, Hoàn tất, Xóa...) đều có hộp xác nhận trước thao tác.
- Sau thao tác, hiển thị toast nhỏ **Thành công** hoặc **Không thành công**.
- Phiếu hoàn tất không sửa trực tiếp; mọi thay đổi quan trọng có audit log.



## V1.0.17 — Chuẩn giao diện theo vai trò
- Đốc công/Giám sát: Số chai tại nhóm; Tồn Kho Hậu cần; thao tác nhanh Đổi/Mượn/Trả; loại = 0 được ẩn mặc định.
- Thủ kho: ưu tiên tồn đầy/rỗng, phiếu chờ xử lý và nhập SL thực tế từng dòng.
- Trưởng kho: ưu tiên phiếu cần duyệt, chênh lệch, tồn thấp và hậu kiểm.
- Workshop: dashboard điều phối toàn hệ thống, điều chuyển nhiều loại khí trong 1 lệnh, tồn và giao nhận.
- XSC Mỏ: số chai tại Mỏ, lệnh từ Nhà máy, tạo điều chuyển về Nhà máy và phản hồi khi sai.
- NCC: tạo phiếu giao nhiều loại/địa điểm và theo dõi Chờ XSC → Chờ PHC → Hoàn tất.
- Ban quản đốc: chỉ xem tổng quan tồn, cảnh báo, chi phí và phiếu gần đây.
- Admin: tài khoản, đơn giá, ngưỡng tồn, lịch ngoại lệ, danh mục và audit.
- Desktop/mobile dùng cùng design system; mobile ưu tiên thao tác nhanh và bottom navigation.
- Mọi POST quan trọng có hộp xác nhận; sau thao tác có toast thành công/thất bại.
- Điều chuyển Nhà máy ↔ Mỏ: một lần xác nhận, cập nhật tồn ngay; một lệnh có thể gồm nhiều loại khí; bên nhận chỉ phản hồi nếu sai.


## Chuẩn giao diện theo vai trò — V1.0.18
- Dashboard từng vai trò phải bám sát mockup đã duyệt, không dùng một bố cục generic rồi đổi nhãn.
- Desktop và mobile có bố cục riêng theo vai trò; dữ liệu = 0 được ẩn ở các khối tồn/nhóm theo nguyên tắc đã chốt.
- Workshop: 5 KPI, bảng Điều phối tổng thể, form Điều chuyển Nhà máy ↔ Mỏ luôn hiện, bảng hoạt động gần đây, thao tác nhanh.
- Thủ kho: tồn đầy/rỗng, phiếu chờ xử lý Đổi/Mượn/Trả, xử lý số lượng thực tế từng dòng.
- Trưởng kho: KPI duyệt/chênh lệch/tồn thấp/vượt định mức, danh sách và panel chi tiết phiếu.
- XSC Mỏ: số chai tại Mỏ, lệnh từ Nhà máy, phản hồi, form điều chuyển về Nhà máy.
- NCC: KPI Chờ XSC/Chờ PHC/Hoàn tất, form tạo phiếu giao nhiều dòng, phiếu gần đây.
- Ban quản đốc: dashboard chỉ xem tồn, cảnh báo, chi phí, phiếu gần đây.
- Admin: tab Tài khoản/Đơn giá/Ngưỡng tồn/Ngày nghỉ/Danh mục theo mockup.
- Thao tác quan trọng: confirm modal trước khi thực hiện và toast sau khi thành công/thất bại.


## 16. Chuẩn giao diện thống nhất V1.0.21

### Khung giao diện chung
- Tất cả tài khoản dùng cùng một khung desktop/mobile: logo, sidebar, header, vị trí chuông, vị trí thông tin tài khoản, khoảng cách, card, bảng, form, modal xác nhận và toast.
- Desktop: góc trái header luôn hiển thị **Quản lý khí NMBP / Hệ thống quản lý khí công nghiệp**. Góc phải luôn hiển thị **Tên tài khoản** ở dòng 1 và **Chức vụ / vai trò / đơn vị** ở dòng 2. Không lặp tên NCC hoặc tên người dùng ở hai vị trí.
- Mobile: giữ ngôn ngữ thiết kế của mockup Nhóm CBL đã duyệt: header xanh, card trắng bo lớn, thao tác nhanh, bottom-sheet; tên tài khoản và vai trò luôn ở cùng một vị trí.
- Nội dung, dữ liệu và nút nghiệp vụ vẫn thay đổi theo quyền; hình thức hiển thị và vị trí thành phần không thay đổi giữa các vai trò.

### Typography
- Dùng **Be Vietnam Pro** toàn hệ thống, gồm tiêu đề, sidebar, KPI, bảng, form, nút và số liệu.
- Số liệu dùng `font-variant-numeric: tabular-nums` để thẳng cột nhưng không dùng font mono cứng.
- Giảm font-weight tổng thể: nội dung 400-500, nút/sidebar 600, heading/KPI 700.

### Màu nhận diện và độ tương phản
- Primary: `#004A8F` + chữ trắng, tương phản ~8.84:1.
- Primary hover: `#003B73` + chữ trắng, ~11.21:1.
- Header/sidebar đậm: `#002B55` + chữ trắng, ~14.22:1.
- Success: `#15803D` + chữ trắng, ~5.02:1.
- Warning đậm: `#92400E` + chữ trắng, ~7.09:1.
- Danger: `#B91C1C` + chữ trắng, ~6.47:1.
- Return/action orange đổi sang `#C2410C` + chữ trắng, ~5.18:1; không dùng `#F97316` với chữ trắng vì độ tương phản thấp.
- Nút nền xanh/đỏ/xanh lá đậm bắt buộc chữ/icon trắng. Nút outline dùng nền trắng + chữ xanh đậm. Badge nền nhạt dùng chữ đậm cùng tông.
- Heading: `#0F2747`; body: `#344054`; secondary: `#667085`; placeholder: `#98A2B3`.

### Quy tắc thao tác
- Mọi thao tác quan trọng (Gửi, Lưu, Xác nhận, Duyệt, Hoàn tất, Xóa, Điều chỉnh) hiện modal xác nhận trước khi thực hiện.
- Sau thao tác hiển thị toast thành công/thất bại rõ ràng.
- Không dùng chữ tối trên nút nền màu đậm.

## V1.0.22 — Chuyến giao NCC và trả vỏ cùng chuyến

- 1 Phiếu giao NCC = 1 chuyến xe = 1 lần tính cước.
- Khi NCC tạo Phiếu giao chỉ chọn 1 địa điểm cho toàn phiếu: Nhà máy hoặc Mỏ Tà Thiết; một phiếu có thể có nhiều loại khí.
- Nếu xe quay về NCC rồi lên lần nữa trong cùng ngày, NCC tạo Phiếu giao thứ hai; hệ thống tính cước thứ hai.
- Cước lấy theo địa điểm Phiếu giao (CO₂ lỏng chuyên dụng vẫn dùng loại cước chuyên dụng nếu sản phẩm thuộc trường hợp này).
- Không có nghiệp vụ xe chạy riêng chỉ để lấy vỏ.
- Phiếu trả vỏ chỉ được tạo từ một Phiếu giao hiện hữu bằng nút **Trả vỏ cùng chuyến**.
- Hệ thống tự lấy NCC, ngày, địa điểm và chuyến từ Phiếu giao; người dùng chỉ nhập loại vỏ + số lượng và ghi chú nếu cần.
- Phiếu trả vỏ không tạo transport_trip mới, không thay đổi cước của Phiếu giao và luôn có chi phí vận chuyển tăng thêm = 0.
- Nhà máy: Workshop/Trưởng kho/Thủ kho thực hiện; số vỏ trả trừ ngay tồn rỗng/available của Kho Hậu cần.
- Mỏ: XSC Mỏ thực hiện; số vỏ trả trừ ngay tổng số chai Nhóm Cối/Mỏ đang quản lý.
- NCC không cần xác nhận nhận vỏ. NCC chỉ xem; nếu có sai lệch thì phản hồi. Phản hồi không tự đảo tồn; sai số được xử lý bằng điều chỉnh có lịch sử.
- Báo cáo cước chỉ lấy các chuyến gắn với Phiếu giao đã PHC hoàn tất. Phiếu trả vỏ không thể tạo thêm cước.


## Số dư vỏ đầu kỳ 2026
- NMBP bắt đầu nhập giao dịch mới từ 01/01/2026 nhưng số vỏ thuê được kế thừa từ nợ vỏ cuối năm 2025.
- Mốc đầu kỳ 01/01/2026 theo bảng nợ vỏ 24/12/2025:
  - O2: 71 vỏ
  - Ar/CO2: 16 vỏ
  - N2: 8 vỏ
  - CO2: 10 vỏ
  - Argon: 2 vỏ
  - XL-45: 0
  - Tổng chai khí tính thuê: 107 vỏ
  - LPG 12 kg: 15 chai
  - LPG 45 kg: 8 chai
- Phí thuê vỏ 2.000 đồng/vỏ/ngày áp dụng cho 107 chai khí công nghiệp từ 01/01/2026.
- LPG được lưu số dư đầu kỳ để đối chiếu nhưng không thuộc nhóm `cylinder_rental_eligible` theo cấu hình hiện tại.
- Số liệu đầu kỳ này đồng thời được ghi nhận là tồn vật lý Kho Hậu cần tại 01/01/2026 ở bucket `unclassified` (đầu kỳ chưa phân loại đầy/rỗng).
- Tồn Kho = Đầy + Rỗng + Đầu kỳ chưa phân loại. Khi phát sinh trả NCC, hệ thống ưu tiên trừ Rỗng; nếu Rỗng chưa đủ thì phần còn lại được trừ từ đầu kỳ chưa phân loại và lưu lịch sử rõ ràng.

## V1.0.26 — Kiến trúc thông tin Tổng quan / Tồn khí / Mobile

### Nguyên tắc không lặp dữ liệu
- Tổng quan = KPI cấp cao + việc cần xử lý + hoạt động gần đây.
- Số chai & tồn kho = nơi duy nhất sở hữu tồn chi tiết và vị trí phân bổ.
- Giao nhận NCC = giao dịch NCC, xác nhận XSC/PHC, trả vỏ cùng chuyến.
- Phiếu / Hoạt động = Mượn · Đổi · Trả nội bộ.
- Điều phối = Nhà máy ↔ Mỏ.
- Báo cáo = chi phí, lịch sử phân tích, Excel.
- Admin = tài khoản, đơn giá, ngưỡng, lịch, cấu hình.
- Chỉ được lặp số liệu khi cần cho thao tác, cảnh báo hoặc KPI tóm tắt.

### Trang Số chai & tồn kho
- Phần trên chỉ hiển thị Tồn Kho Hậu cần theo từng loại khí.
- Kho tách Đầy / Rỗng bằng 2 màu; số đầu kỳ chưa phân loại chỉ là dòng phụ trung tính.
- Cảnh báo tồn thấp hiển thị ngay tại card loại khí; bỏ tab Cảnh báo riêng.
- Phần dưới chỉ còn `Theo vị trí / nhóm` và `Theo loại khí`.
- Mỗi nhóm chỉ hiển thị tổng số chai từng loại đang quản lý, không tách đầy/rỗng.
- Loại bằng 0 ở nhóm được ẩn. Nhóm Cối chính là Mỏ Tà Thiết.
- Bỏ khối Nhận định nhanh.

### Trang Tổng quan
- Không lặp bảng tồn Kho Hậu cần.
- Workshop / Trưởng kho / NCC / Ban quản đốc được xem 2 KPI tài chính: `Chi phí tháng này đến hôm nay` và `Lũy kế năm đến hôm nay`.
- Hai KPI tài chính gồm: mua khí + thuê vỏ + XL-45 + vận chuyển. Chi tiết vẫn thuộc trang Báo cáo.
- Chỉ 4 vai trò trên được mở Báo cáo chi phí; khóa đồng thời menu, page và API.
- Bảng `Vỏ đang thuê NCC` hiển thị riêng từng loại khí theo công thức số dư đầu kỳ + NCC giao - trả NCC.
- Có dòng biến động vỏ thuê: Đầu kỳ → NCC giao → Trả NCC → Hiện tại.
- Các card `Việc cần xử lý` là deep-link: bấm vào mở đúng trang và đúng bộ lọc tác vụ.

### Tổng quan theo vai trò
- Workshop: vỏ thuê NCC, giao nhận hôm nay, phiếu cần xử lý, cảnh báo, 2 KPI chi phí, việc cần chú ý, hoạt động gần đây.
- Trưởng kho: phiếu cần duyệt/hậu kiểm, chênh lệch, tồn thấp, vỏ thuê NCC, 2 KPI chi phí.
- Thủ kho: Đổi/Mượn/Trả chờ xử lý, NCC chờ PHC, cảnh báo; không thấy chi phí.
- Đốc công/Giám sát: yêu cầu đang chờ, phản hồi, thực hiện thiếu; 3 nút nhanh Đổi/Mượn/Trả.
- Công nhân: chỉ theo dõi hoạt động nhóm; không tạo yêu cầu.
- XSC Mỏ: NCC chờ XSC, điều chuyển, phản hồi, phát sinh hôm nay; không thấy chi phí.
- NCC: Chờ XSC/PHC, phản hồi, hoàn tất, vỏ đang thuê, 2 KPI chi phí, tạo Phiếu giao.
- Ban quản đốc: chỉ xem số vỏ thuê, cảnh báo, phiếu đang tồn và 2 KPI chi phí.
- Admin: chỉ tình trạng user/đơn giá/email/cấu hình; không hiện chi phí vận hành.

### Mobile-first
- Vai trò vận hành ưu tiên điện thoại: card ngắn, nút ≥ 48px, bottom-sheet, không có bảng kéo ngang.
- Bottom navigation tối đa 4 mục; chức năng ít dùng nằm dưới `Thêm`.
- Một nghiệp vụ thông thường hướng đến 3 bước: bấm nghiệp vụ → nhập số lượng → xác nhận.
- Desktop dùng cùng design system nhưng ưu tiên bảng, filter, đối chiếu, lịch sử, Excel và quản trị.


## Phiếu giao NCC nhiều địa điểm trong cùng chuyến (V1.0.27)
- 1 Phiếu giao NCC = 1 chuyến xe = 1 cước vận chuyển.
- Một Phiếu giao có thể chứa dòng giao tại Nhà máy, Mỏ Tà Thiết hoặc đồng thời cả hai.
- Form NCC chia cố định thành 2 vùng `Giao Nhà máy` và `Giao Mỏ Tà Thiết`; không dùng dropdown chọn một địa điểm chung cho cả Phiếu.
- Cùng một loại khí được phép xuất hiện 1 lần tại Nhà máy và 1 lần tại Mỏ trong cùng Phiếu; không được lặp cùng loại tại cùng địa điểm.
- Nếu Phiếu có bất kỳ dòng giao Mỏ thì toàn chuyến tính cước Mỏ; nếu chỉ có Nhà máy thì tính cước Nhà máy. CO2 lỏng chuyên dụng vẫn theo quy tắc cước chuyên dụng hiện hành.
- XSC xác nhận theo địa điểm: Workshop chỉ xác nhận dòng Nhà máy, XSC Mỏ chỉ xác nhận dòng Mỏ. PHC hoàn tất sau khi toàn bộ dòng cần xác nhận đã đủ.
- Trả vỏ cùng chuyến không tạo cước mới và có thể có 2 Phiếu trả độc lập cùng `trip_id`: 1 tại Nhà máy và 1 tại Mỏ.
- Chỉ `storekeeper` được tạo trả vỏ tại Nhà máy; chỉ `mine_xsc` được tạo trả vỏ tại Mỏ. Backend tự suy ra địa điểm từ vai trò, không nhận dropdown địa điểm từ user.
- Nút trả vỏ chỉ xuất hiện nếu Phiếu giao thực sự có dòng giao tại đúng địa điểm của user.
- NCC không xác nhận lại Phiếu trả; chỉ xem và phản hồi nếu sai lệch.

## Giao diện tồn Kho Hậu cần dạng bảng điều hành (V1.0.28)

- Desktop bỏ lưới card lớn cho từng loại khí; chuyển sang bảng một dòng/một sản phẩm với các cột: Loại khí / sản phẩm, Đầy, Rỗng, Tổng vỏ, Trạng thái.
- Thứ tự ưu tiên cố định: O₂ → CO₂ → N₂ → Ar/CO₂ → LPG 12 kg → LPG 45 kg → Argon → các loại khác.
- Loại có tổng số liệu bằng 0 và không có cảnh báo sẽ tự ẩn.
- Trạng thái tồn thấp dựa trên số chai đầy so với ngưỡng cấu hình; nếu chưa có ngưỡng hiển thị trạng thái trung tính "Chưa đặt ngưỡng".
- Cảnh báo tồn thấp nằm ngay trên dòng tương ứng, không tạo tab cảnh báo riêng.
- Header Kho hiển thị tổng nhanh: Tổng vỏ, Đầy, Rỗng.
- Mobile dùng card compact một dòng sản phẩm với 3 chỉ số Đầy / Rỗng / Tổng vỏ, giữ cùng thứ tự và logic trạng thái với desktop; không có bảng kéo ngang.

## Vỏ/bồn NCC trên Tổng quan (V1.0.29)

- Bỏ dòng biến động `Đầu kỳ → NCC giao → Trả NCC → Hiện tại` khỏi Tổng quan.
- Hiển thị bung sẵn 4 nhóm độc lập, không cộng khác đơn vị vào một tổng chung:
  1. **Vỏ chai khí công nghiệp**: O₂, CO₂, N₂, Argon, Ar/CO₂ và các khí đóng chai tương tự.
  2. **Bồn XL-45**: O₂ lỏng XL-45, N₂ lỏng XL-45.
  3. **Bình Gas 12 kg**: LPG 12 kg.
  4. **Bình Gas 45 kg**: LPG 45 kg.
- Mỗi nhóm giữ phong cách thanh ngang hiện có: tên sản phẩm, thanh tỷ lệ và số lượng hiện tại ở bên phải.
- Dữ liệu hiện tại = số dư đầu kỳ + Phiếu giao NCC đã hoàn tất - Phiếu trả NCC; không dùng luân chuyển nội bộ để tính.
- KPI `Vỏ chai khí CN` chỉ là tổng nhóm chai khí công nghiệp; XL-45 và LPG hiển thị riêng vì khác đơn vị.

