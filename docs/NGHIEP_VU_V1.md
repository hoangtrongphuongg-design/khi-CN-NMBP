# Đặc tả nghiệp vụ V1 — Quản lý khí NMBP

## 1. Phạm vi

Hệ thống quản lý 2 luồng độc lập nhưng dùng chung dữ liệu tồn:

1. **NCC ↔ Nhà máy/Mỏ**: NCC tạo phiếu giao; Nhà máy/Mỏ xác nhận; XSC/PHC tạo phiếu trả vỏ; NCC xác nhận; một mã chuyến dùng chung để tránh tính trùng cước.
2. **Nội bộ Nhà máy**: các nhóm sử dụng theo định mức; Đốc công/Giám sát tạo phiếu đổi, mượn, trả; Kho xử lý; tồn cập nhật theo thao tác vật lý; Trưởng kho/Workshop hậu kiểm khi cần.

Không quản lý seri/mã chai. Seri thuộc nghiệp vụ riêng của Phòng An toàn Môi trường.

## 2. Danh mục hàng hóa seed ban đầu

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

## 3. Địa điểm

- Nhà máy Xi măng Bình Phước
- Mỏ đá Tà Thiết

Một phiếu giao có thể chứa dòng cho cả hai địa điểm.

## 4. Quy tắc chuyến xe

- Cùng một xe đi giao và gom vỏ về trong cùng lượt = **1 chuyến**.
- Chỉ cần xe **có vào Mỏ Tà Thiết** để giao hàng hoặc gom vỏ => toàn chuyến tính cước Mỏ.
- Nếu không vào Mỏ => chuyến Nhà máy.
- CO₂ lỏng bằng xe chuyên dụng có loại cước riêng.
- `transport_trips` là đối tượng chung liên kết Phiếu giao và Phiếu trả vỏ.

## 5. Xác nhận giao NCC

- NCC tạo Phiếu giao.
- Giao Nhà máy: Workshop hoặc PHC (Trưởng kho/Thủ kho) xác nhận.
- Giao Mỏ: chỉ XSC Mỏ xác nhận.
- XSC/PHC được xem toàn bộ và phản hồi; quyền xem/phản hồi tách khỏi quyền xác nhận.
- Nếu số thực nhận khác NCC khai: lưu cả hai con số, không sửa mất dữ liệu NCC.

## 6. Tồn và vỏ chai

- Kho Hậu cần bắt buộc tách **chai đầy / chai rỗng**.
- Các nhóm chỉ theo dõi **tổng số chai đang quản lý** theo loại khí.
- Tổng vỏ NCC đang cho thuê = Kho + tổng các nhóm + Nhóm Cối/Mỏ.
- Nhóm Cối chính là tồn Mỏ; không tạo thêm Kho Mỏ riêng.
- Nhóm Cối chỉ theo dõi số chai đang quản lý; khi cần đổi liên hệ Workshop qua Zalo.

## 7. Phiếu nội bộ

### Đổi chai
Nhóm tạo -> Thủ kho đổi số thực tế -> Kho chai đầy giảm, chai rỗng tăng -> tổng chai nhóm không đổi -> Trưởng kho/Workshop hậu kiểm.

### Mượn thêm
- Trong giờ hành chính: chỉ Workshop hoặc Trưởng kho duyệt trước; sau đó Kho cấp.
- Ngoài giờ: Thủ kho được cấp ngay để xử lý sự cố; tồn cập nhật ngay; sau đó Trưởng kho/Workshop hậu kiểm.
- Mượn làm tăng tổng chai nhóm đang quản lý và giảm chai đầy Kho.

### Trả chai
Nhóm tạo -> Thủ kho nhận số thực tế -> tồn cập nhật ngay -> Trưởng kho/Workshop hậu kiểm. Nhóm giảm, Kho tăng (Thủ kho chọn chai trả đầy/rỗng).

## 8. Giờ hành chính

- Mặc định T2–T6: 07:30–16:30.
- T7/CN: ngoài giờ.
- Admin chỉ cấu hình ngày ngoại lệ: `holiday` hoặc `workday`.
- Không yêu cầu Admin bấm từng ngày.

## 9. Điều chuyển Nhà máy ↔ Mỏ

- Nhà máy → Mỏ: Workshop/Trưởng kho tạo và xuất; XSC Mỏ xác nhận nhận.
- Mỏ → Nhà máy: XSC Mỏ tạo và xuất; Thủ kho Nhà máy nhận; Trưởng kho/Workshop hậu kiểm.
- Khi xuất: giảm nơi gửi, tăng `Đang vận chuyển`.
- Khi nhận: giảm `Đang vận chuyển`, tăng nơi nhận.
- Điều chuyển không làm thay đổi tổng vỏ NCC.

## 10. Phân quyền

- `admin`: quản trị hệ thống, user, giá, lịch, định mức, số dư, ngưỡng.
- `workshop`: Quản lý XSC; quyền nghiệp vụ ngang Trưởng kho.
- `warehouse_manager`: Trưởng kho Hậu cần.
- `storekeeper`: Thủ kho; thực hiện đổi/trả, cấp mượn ngoài giờ.
- `mine_xsc`: XSC Mỏ; xác nhận giao/nhận tại Mỏ và điều chuyển Mỏ.
- `foreman`: Đốc công của một nhóm.
- `supervisor`: Giám sát của một nhóm.
- `worker`: Công nhân, không tạo/duyệt phiếu.
- `management_board`: Ban quản đốc, chỉ xem toàn bộ.
- `supplier`: NCC, chỉ dữ liệu của NCC.

Mỗi nhóm có 1 Đốc công + 1 Giám sát + công nhân. User CBCNV đăng nhập bằng mã danh bộ; NCC dùng username Admin cấp.

## 11. Giá và lịch sử giá

- Admin tạo phiên bản đơn giá mới với `effective_from`.
- Không ghi đè giá cũ.
- Giao dịch lưu snapshot `unit_price`, `line_amount`, `price_rule_id`.
- Dữ liệu quá khứ không đổi khi thêm đơn giá mới.
- Seed có giá HĐ 121/CCKCN-2026 ngày 02/03/2026.

## 12. Cảnh báo tồn thấp

- Admin cấu hình ngưỡng riêng từng loại khí và email nhận.
- Chỉ theo dõi tồn **chai đầy tại Kho**.
- Khi tồn chuyển từ `> ngưỡng` sang `<= ngưỡng`: gửi đúng 1 email.
- Tiếp tục giảm không gửi thêm.
- Khi tồn tăng lại `> ngưỡng`: reset trạng thái; chu kỳ sau mới gửi lại.
- Email có outbox để không mất cảnh báo khi SMTP chưa cấu hình/lỗi.

## 13. Phiếu hoàn tất và điều chỉnh

Không sửa trực tiếp lịch sử đã hoàn tất. Mọi thao tác quan trọng ghi `audit_logs`. Schema có `adjustment_notes` để triển khai phiếu điều chỉnh có lý do và liên kết phiếu gốc.

## 14. UI/UX

- Responsive điện thoại + máy tính.
- Mobile ưu tiên card theo dòng, nút lớn, thao tác ngắn.
- Desktop ưu tiên bảng, lọc, đối soát, báo cáo.
- Màu thương hiệu: `#004a8f`, `#002b55`, `#003b73`; nền `#f6f8fa`.
- Semantic trạng thái, không truyền đạt chỉ bằng màu.
- Tham khảo `docs/DESIGN_MEMORY.md` và `docs/BRAND_SYSTEM.md`.
