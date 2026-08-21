# V1.0.40 — Quản lý đơn giá theo tháng / khoảng ngày

## Nghiệp vụ đã chốt

- Giá gốc lấy theo hợp đồng đang hiệu lực; đơn giá lưu là **chưa VAT**.
- Admin chọn tháng để xem toàn bộ bảng giá.
- Mỗi tháng mặc định quay về **giá gốc hợp đồng**, không kế thừa giá biến động của tháng trước.
- Trong tháng có thể có nhiều mức giá cho cùng một hạng mục bằng các khoảng **Từ ngày → Đến ngày**.
- Các khoảng điều chỉnh của cùng hạng mục không được chồng nhau và không được vượt thời hạn hợp đồng.
- Hết `Đến ngày`, hệ thống tự quay về giá HĐ.
- Lưu/sửa/xóa điều chỉnh giá sẽ **tự động tính lại** snapshot các Phiếu giao, chuyến vận chuyển và phân bổ XL-45 bị ảnh hưởng; không hỏi xác nhận lần hai.
- Cuối kỳ Admin có thể **Chốt & khóa bảng giá tháng**. Tháng đã khóa không sửa giá. Muốn sửa phải mở khóa và nhập lý do; toàn bộ thao tác ghi Audit.
- Hợp đồng mới do Admin nhập thủ công: NCC, số hợp đồng, tên hợp đồng, ngày ký, hiệu lực từ/đến.
- Hai hợp đồng đang hoạt động của cùng NCC không được chồng thời gian hiệu lực; kiểm tra ở cả API và Database.

## Thay đổi kỹ thuật

- `price_rules.rule_kind`: `base | adjustment | legacy`.
- Thêm bảng `price_month_locks`.
- Resolver giá ưu tiên `adjustment` → `base` → fallback `legacy` cho dữ liệu cũ.
- Thay màn hình Admin > Đơn giá bằng bảng theo tháng, có giá HĐ và các khoảng điều chỉnh.
- Bổ sung nhập bảng giá gốc cho hợp đồng mới.
- Dashboard chỉ cảnh báo hết hạn đối với giá gốc HĐ, không tính các dòng điều chỉnh tháng.
- Cập nhật các phép tính thuê vỏ/XL-45 để ưu tiên giá điều chỉnh theo khoảng ngày.

## Nâng cấp Database đang chạy

Chạy **một file** trước khi deploy code:

`NEON_SQL/20_QUAN_LY_DON_GIA_THEO_THANG.sql`

SQL 20 không xóa giao dịch và không xóa snapshot giá cũ.
