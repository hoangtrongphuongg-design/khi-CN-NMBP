# V1.0.42 — Transport Trip Source of Truth

## Sửa lỗi
- Cước vận chuyển trên Web/Excel lấy trực tiếp từ `transport_trips`.
- Không còn loại chuyến ra khỏi báo cáo chỉ vì không có Phiếu giao NCC.
- Chuyến chỉ trả vỏ hoặc chuyến lịch sử độc lập vẫn hiển thị.
- Chứng từ tham chiếu hiển thị Phiếu giao, Phiếu trả; nếu không có thì hiển thị mã chuyến.
- Không thay đổi schema database; không cần SQL migration mới.
