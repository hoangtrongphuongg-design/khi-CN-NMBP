# V1.0.46 — Sửa toàn bộ logic cộng/trừ vỏ NCC

## Nguyên nhân lỗi
- V1.0.45 dùng `stock_ledger`/trạng thái Phiếu giao `completed` để tính nợ vỏ.
- Dòng giao đã được Thủ kho/XSC Mỏ xác nhận thực nhận nhưng Phiếu còn `phc_pending` chưa có bút toán cộng vỏ, trong khi Phiếu trả đã trừ ngay.
- Vì vậy cùng ngày có thể chỉ thấy phần `- trả` mà thiếu phần `+ giao`.

Ví dụ N₂ ngày 25/08/2026: tồn trước ngày = 11, thực nhận = +3, trả NCC = -2 => tồn đúng = 12. V1.0.45 có thể hiện 9 do bỏ mất +3.

## Quy tắc mới
- Giao NCC: tính `confirmed_qty` ngay khi bên nhận đã xác nhận thực nhận.
- Không chờ Trưởng kho duyệt mới cộng nợ vỏ.
- Nếu dòng đang `feedback` sau khi đã xác nhận thực nhận, vẫn giữ số thực tế hiện hành.
- Trả NCC: trừ số thực trả của dòng đã ghi nhận; Phiếu `cancelled` không tính.
- Dữ liệu hiển thị không tự ép tồn âm về 0; số âm là dấu hiệu cần đối soát.

## Phạm vi đã đồng bộ
- Tổng quan: KPI tổng vỏ, từng loại vỏ, lọc tồn theo ngày.
- Modal lịch sử O₂/CO₂/N₂/Ar/Ar-CO₂: đầu năm + giao - trả = tồn cuối.
- Báo cáo thuê vỏ theo từng ngày và tiền thuê vỏ.
- XL-45: lô tính thuê nhận số thực nhận đã xác nhận kể cả Phiếu đang chờ Trưởng kho.
- Đối soát vỏ trong kiểm kê/chuyển đổi Admin.

## Database
- Không thay đổi schema Neon.
- Không cần chạy SQL migration.
