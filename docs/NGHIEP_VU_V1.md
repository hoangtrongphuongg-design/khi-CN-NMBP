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
- Workshop / Trưởng kho / NCC / Ban quản đốc được xem 2 KPI tài chính: `Chi phí tháng này đến hôm nay` và `Lũy kế năm đến hôm nay`. Đốc công/Giám sát chỉ được xem số lượng vỏ/bồn NCC theo V1.0.29, không được xem chi phí.
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

## Tổng quan Đốc công / Giám sát — mobile + desktop (V1.0.29)

### Mobile đã chốt
- Chỉ ưu tiên 4 khu vực: `Việc cần xử lý` → `Đổi / Mượn / Trả` → `Tồn Kho Hậu cần` → `Số chai nhóm đang quản lý`.
- `Việc cần xử lý` chỉ hiện mục có số lượng >0. Nếu đúng 1 phiếu thì mở thẳng phiếu; nếu nhiều phiếu thì mở danh sách đã lọc đúng điều kiện.
- Tồn Kho Hậu cần chỉ hiện tên đầy đủ + Đầy + Rỗng từng loại; tên dài được xuống dòng, không dùng `...`.
- Số chai nhóm đang quản lý chỉ hiện tổng từng loại của chính nhóm; không tách đầy/rỗng; loại bằng 0 ẩn.
- Ẩn `Số chai & tồn kho` khỏi điều hướng mobile của Đốc công/Giám sát vì dữ liệu cần thiết đã có ngay trên Tổng quan. Desktop vẫn giữ menu này.
- Không hiển thị Vỏ thuê NCC, lũy kế sử dụng hoặc hoạt động dài trên mobile.

### Desktop đã chốt
- Hàng KPI: Yêu cầu đang chờ / Có phản hồi / Xử lý chưa đủ / Tổng chai nhóm đang quản lý. Ba KPI công việc là deep-link tác vụ.
- Hai khối song song: Tồn Kho Hậu cần (Đầy/Rỗng) và Số chai nhóm đang quản lý (tổng từng loại).
- Bảng `Lũy kế sử dụng khí của nhóm`: Tháng này + từ 01/01 đến hôm nay, tính duy nhất theo SL thực tế Phiếu Đổi đã hoàn tất; không cộng Mượn/Trả.
- Đốc công/Giám sát được xem `Vỏ/bồn NCC` trên Tổng quan desktop giống Workshop, chỉ xem số lượng và không xem chi phí.
- Cuối trang có hoạt động gần đây của chính nhóm.
- Đốc công/Giám sát không được xem chi phí/Báo cáo tài chính.



## Khóa baseline giao diện + sửa hiển thị chữ mobile (V1.0.30)

- Giao diện mobile và desktop của toàn bộ vai trò đã được người dùng kiểm tra và chốt. Không tự thay đổi bố cục, vị trí, chức năng hay luồng nghiệp vụ nếu không có yêu cầu trực tiếp, cụ thể.
- V1.0.30 chỉ sửa lỗi nội dung chữ bị cắt trên điện thoại; không thay đổi nghiệp vụ, quyền, API dữ liệu, cấu trúc trang hay desktop.
- Trên mobile không dùng ellipsis/`...` cho tên loại khí, tên sản phẩm, tên chức năng, tiêu đề, mô tả, tài khoản/role và nhãn trạng thái.
- Nội dung dài được phép xuống dòng; container/card/nút giữ nguyên vị trí nhưng tự tăng chiều cao khi cần.
- Không thu nhỏ font để ép vừa. Số liệu/mã ngắn vẫn giữ cách trình bày tabular hiện tại.
- Sửa theo CSS mobile toàn cục để các bản sau không tái phát tình trạng `truncate`, `line-clamp` hoặc `text-overflow: ellipsis` trên màn hình điện thoại.


## Chuẩn nhập số lượng toàn hệ thống (V1.0.31)

- Không mặc định `1` hoặc `0` trong các ô số lượng khi tạo dòng nghiệp vụ mới; ô bắt đầu ở trạng thái trống và dùng placeholder `Nhập SL`/`SL`.
- Cho phép nhập liên tục số có 1, 2, 3... chữ số; không có logic auto-tab/auto-focus sang trường kế tiếp sau một chữ số.
- Người dùng có thể xóa sạch giá trị đang nhập. Trạng thái trống được phép trong lúc nhập; chỉ kiểm tra `> 0` khi gửi/xác nhận nghiệp vụ.
- Các ô số lượng chai/vỏ dùng `inputMode="numeric"` + `pattern="[0-9]*"` để ưu tiên bàn phím số trên điện thoại. Các ô có thể cần số thập phân (ví dụ lượng giao theo kg/bồn) dùng `inputMode="decimal"`.
- Các form client-side giữ giá trị đang gõ ở dạng chuỗi để tránh trường hợp xóa hết bị ép lại thành `0`/`1`; chỉ chuyển sang số khi validate hoặc tạo payload gửi backend.
- Nút `+/-` vẫn giữ nguyên bố cục đã khóa; nếu ô đang trống và người dùng bấm `+`, giá trị bắt đầu từ 1.
- Áp dụng cho các luồng tạo Phiếu giao NCC, trả vỏ cùng chuyến, Đổi/Mượn/Trả của nhóm và Điều chuyển Nhà máy ↔ Mỏ. Component Input chung cũng tự ưu tiên bàn phím số/decimal cho các trường `type=number` còn lại.
- Không thay đổi layout mobile/desktop, quyền, nghiệp vụ, database hoặc các giao diện đã khóa chốt.


### Chuẩn nhập số lượng (V1.0.32)
- Không tự chuyển focus/tab sau khi nhập một chữ số.
- Người dùng phải nhập liên tục được các giá trị như 3, 30, 125 trong cùng một ô.
- Chỉ đổi focus khi người dùng chủ động chạm/click/Tab/Next.
- Mobile ưu tiên bàn phím số thông qua inputMode phù hợp.
- Không dùng autoFocus/focus tự động/maxLength=1 cho ô số lượng.


### Chuẩn thời gian hiển thị
- Mọi timestamp hiển thị cho người dùng tại NMBP dùng múi giờ `Asia/Ho_Chi_Minh` (GMT+7).
- Timestamp trong database giữ nguyên chuẩn lưu trữ; không dịch/chỉnh dữ liệu lịch sử bằng SQL chỉ để thay đổi cách hiển thị.


## V1.0.35 — Trưởng kho duyệt nhận và hậu kiểm trả vỏ NCC

- Phiếu giao NCC: XSC Nhà máy/Mỏ xác nhận số thực nhận trước. Chỉ **Trưởng kho Hậu cần** được duyệt nhận hàng và hoàn tất Phiếu giao. Thủ kho không còn quyền hoàn tất Phiếu giao NCC.
- Phiếu trả vỏ cùng chuyến: **Thủ kho tại Nhà máy / XSC Mỏ tại Mỏ xác nhận là tồn kho và số vỏ thuê NCC cập nhật ngay**, đúng như vận hành thực tế.
- Sau khi trả vỏ đã cập nhật tồn, Phiếu trả chuyển sang trạng thái hậu kiểm `Chờ Trưởng kho duyệt`. Trưởng kho duyệt riêng Phiếu trả Nhà máy và Phiếu trả Mỏ.
- Duyệt hậu kiểm không phát sinh bút toán tồn lần hai. Nếu Trưởng kho phản hồi, hệ thống chỉ ghi trạng thái/nội dung phản hồi và **không tự hoàn tác tồn**.
- Phiếu trả hiện có trước V1.0.35 được SQL 14 đưa vào hàng chờ hậu kiểm mà không thay đổi số tồn.
- Dữ liệu giao/nhận NCC gốc không bị xóa.

## V1.0.36 — Nguyên tắc phản hồi → chỉnh sửa → gửi lại

- Khi một nghiệp vụ đang ở bước bên nhận/hậu kiểm và bị **Phản hồi**, quyền chỉnh sửa được mở lại cho đúng vai trò đã nhập/xác nhận phần dữ liệu đó.
- Dữ liệu đã làm thay đổi tồn trước phản hồi không bị đảo toàn bộ. Khi người nhập sửa lại, hệ thống chỉ ghi bút toán **chênh lệch** giữa số cũ và số mới, đồng thời lưu audit trước/sau.
- Phiếu giao NCC có hai tầng phản hồi:
  - XSC phản hồi số NCC khai báo → NCC sửa số khai báo và gửi lại XSC.
  - Trưởng kho phản hồi số XSC đã xác nhận → Workshop tại Nhà máy / XSC Mỏ tại Mỏ sửa số thực nhận và gửi lại Trưởng kho.
- Phiếu trả vỏ NCC: Thủ kho tại Nhà máy / XSC Mỏ tại Mỏ được sửa số lượng, thêm loại còn thiếu hoặc xóa loại nhập nhầm sau phản hồi; tồn và số vỏ NCC chỉ thay đổi theo chênh lệch; phiếu quay lại `Chờ Trưởng kho duyệt`.
- Phiếu Đổi/Mượn/Trả nội bộ: Thủ kho được sửa số thực tế sau phản hồi hậu kiểm và gửi lại.
- Điều chuyển: bên lập phiếu được sửa sau phản hồi của bên nhận (Nhà máy → Mỏ: Workshop/Trưởng kho; Mỏ → Nhà máy: XSC Mỏ).
- Khi đã được duyệt cuối cùng thì dữ liệu bị khóa; sai sau duyệt cuối phải xử lý bằng cơ chế điều chỉnh/audit riêng, không sửa âm thầm.
- Không thay đổi bố cục mobile/desktop đã khóa ngoài các nút/form chỉnh sửa chỉ xuất hiện khi phiếu thật sự ở trạng thái phản hồi.


## V1.0.37 — Hộp công việc Thủ kho và thứ tự Phiếu giao NCC

- Xác nhận thực nhận NCC theo địa điểm: **Nhà máy = Thủ kho Hậu cần**, **Mỏ = XSC Mỏ**. Sau khi tất cả dòng được bên nhận xác nhận, **Trưởng kho Hậu cần** duyệt nhận hàng và hoàn tất Phiếu giao.
- Workshop không còn thao tác xác nhận thực nhận tại Nhà máy; chỉ giữ quyền xem/kiểm soát phù hợp với vai trò.
- Tổng quan Thủ kho (mobile + desktop) phải ưu tiên nhiệm vụ thực tế: Đổi, Mượn, Trả nội bộ; NCC giao Nhà máy chờ nhận; trả vỏ NCC Nhà máy trong chuyến đang xử lý; các phiếu bị phản hồi cần sửa; các phiếu xử lý chưa đủ.
- Deep-link: nếu một nhóm tác vụ chỉ có 1 phiếu thì mở thẳng phiếu; nếu nhiều thì mở danh sách đã lọc đúng tác vụ.
- Danh sách Phiếu giao NCC mặc định: **Có phản hồi → Chờ xác nhận thực nhận → Chờ Trưởng kho → đang xử lý khác → Hoàn tất**, và trong từng nhóm **mới nhất → cũ nhất**.
- Phiếu chưa hoàn tất phải nổi bật hơn lịch sử hoàn tất, đặc biệt trên màn hình điện thoại.
- Thay đổi này không sửa database và không thay đổi các giao diện/luồng khác đã khóa nếu không liên quan trực tiếp.


## Mốc kiểm kê chuyển đổi / đưa hệ thống vào vận hành (V1.0.38)
- Chỉ Admin có chức năng `Kiểm kê & chốt vận hành`.
- Trước khi chốt, hệ thống ở `historical_import`: dùng lịch sử NCC từ 01/01 để tính mua khí, cước, thuê vỏ, XL-45 và nợ vỏ; không dùng lịch sử này để khẳng định tồn vật lý Kho/Nhóm vì thiếu Đổi/Mượn/Trả nội bộ.
- Admin nhập kiểm kê: Kho Hậu cần (Đầy/Rỗng; XL-45 theo số bồn), từng nhóm (tổng từng loại), Mỏ/Nhóm Cối (tổng từng loại).
- Hệ thống đối chiếu từng sản phẩm: `Theo NCC = số dư đầu kỳ + NCC giao - trả NCC`; `Kiểm kê = Kho + nhóm + Mỏ`; hiển thị chênh lệch.
- Chỉ được chốt khi toàn bộ Phiếu giao/trả NCC đến ngày kiểm kê đã hoàn tất và Phiếu trả đã được Trưởng kho hậu kiểm.
- Nếu còn chênh lệch, Admin phải nhập lý do.
- Khi chốt: tạo bút toán `inventory_cutover`, đưa tồn về đúng số kiểm kê, xóa bucket đầu kỳ chưa phân loại còn sót, lưu audit, chuyển hệ thống sang `live`.
- Không sửa/xóa lịch sử NCC hoặc chi phí trước mốc kiểm kê.
- Sau go-live, các nghiệp vụ mới cập nhật tồn vật lý theo luồng chuẩn; không cho back-date Phiếu NCC trước go-live bằng luồng vận hành thường.


## Admin - chỉnh dữ liệu có Audit (V1.0.39)
- Admin là quyền hậu kiểm cao nhất và có thể sửa dữ liệu nghiệp vụ khi user nhập sai.
- Phạm vi: Phiếu giao NCC, Phiếu trả vỏ NCC, Phiếu Đổi/Mượn/Trả nội bộ, Điều chuyển Nhà máy ↔ Mỏ.
- Có thể chỉnh ngày, nơi/nhóm, loại khí, số lượng, ghi chú, thêm hoặc bỏ dòng.
- Không cho sửa/xóa Audit, mã kỹ thuật hoặc người tạo gốc.
- Bắt buộc lý do. Hệ thống lưu dữ liệu trước/sau, người sửa và thời gian.
- Nếu nghiệp vụ đã ảnh hưởng tồn/chi phí, hệ thống ghi bút toán điều chỉnh chênh lệch và tính lại phần phụ thuộc.
