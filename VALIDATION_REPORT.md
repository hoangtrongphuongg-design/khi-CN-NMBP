# Báo cáo rà soát V1.0.1

## Đã kiểm tra

- Cấu trúc Next.js/TypeScript/Tailwind/Neon.
- Không còn tham chiếu Supabase trong source.
- 63 file TypeScript/TSX được kiểm tra cú pháp: không phát hiện lỗi parse TypeScript/JSX.
- Toàn bộ import nội bộ dạng `@/...` đều trỏ tới file tồn tại.
- `package.json` và `tsconfig.json` hợp lệ JSON.
- Hai script `.mjs` (`db:setup`, `admin:create`) qua `node --check`.
- Không có `.env.local`, `node_modules`, `.next` trong gói xuất.
- Không đóng gói secret Neon/SMTP thật.

## Các điểm đã sửa trong bản rà soát

1. Phiếu trả vỏ có thể liên kết với chuyến giao đã hoàn tất trong cùng ngày, tránh phát sinh thêm cước cho cùng một lượt xe.
2. Form trả vỏ chỉ hiện các chuyến đúng ngày đang chọn.
3. XSC Mỏ chỉ tạo Phiếu trả vỏ tại Mỏ; Workshop/PHC/Thủ kho tạo tại Nhà máy.
4. Thêm `/api/health` để kiểm tra Vercel đã kết nối Neon sau deploy.
5. Cho phép endpoint retry email đi qua middleware; endpoint vẫn được bảo vệ bằng `CRON_SECRET`.
6. Thay đổi ngưỡng tồn thấp không tự tạo email. Email chỉ phát sinh khi biến động tồn thực tế làm tồn chuyển từ trên ngưỡng xuống chạm/thấp hơn ngưỡng.
7. Bổ sung `npm run check` và yêu cầu Node.js >= 20.11.

## Chưa thể xác nhận trong môi trường đóng gói

Môi trường đóng gói không tải được `node_modules` từ Internet trong thời gian cho phép, nên chưa chạy được `npm run build` hoàn chỉnh với toàn bộ dependency. Sau khi upload GitHub và cấu hình Vercel/Neon, cần chạy build thực tế. Nếu build lỗi, dùng log Vercel để sửa trực tiếp trên bản này.
