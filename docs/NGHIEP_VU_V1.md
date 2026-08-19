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

