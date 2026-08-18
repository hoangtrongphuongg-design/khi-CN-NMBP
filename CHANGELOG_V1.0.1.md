# V1.0.1 — Rà soát trước GitHub/Vercel

- Cho phép Phiếu trả vỏ liên kết cả chuyến đã hoàn tất trong cùng ngày để không tính trùng cước.
- Form trả vỏ chỉ hiển thị chuyến cùng ngày trả.
- Giới hạn nguồn trả vỏ: XSC Mỏ chỉ tạo tại Mỏ; Workshop/PHC tạo tại Nhà máy.
- Thêm `/api/health` để kiểm tra nhanh kết nối Neon sau deploy.
- Cho phép `/api/notifications/flush` đi qua middleware để CRON_SECRET có thể bảo vệ endpoint retry mail.
- Thay đổi cấu hình ngưỡng tồn không tự gửi email; email chỉ phát sinh do biến động tồn thực tế vượt qua ngưỡng.
- Thêm `npm run check` và yêu cầu Node >=20.11.
