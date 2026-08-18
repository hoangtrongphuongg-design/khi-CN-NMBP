# Quản lý khí NMBP — V1.0.1

## Bản rà soát

Bản này đã được rà lại trước khi đưa lên GitHub/Vercel. Các chỉnh sửa chính: liên kết đúng một chuyến giao + gom vỏ, giới hạn người tạo Phiếu trả vỏ theo địa điểm, endpoint kiểm tra Neon sau deploy, và bảo đảm chỉnh ngưỡng tồn không tự phát email.

# Quản lý khí NMBP — V1

Bộ code đầu tiên cho hệ thống quản lý khí/vỏ chai của Nhà máy Xi măng Bình Phước.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS v4
- Neon PostgreSQL (`postgres` driver)
- Custom username/password authentication + DB session trong Neon
- Nodemailer/SMTP cho email cảnh báo tồn thấp
- ExcelJS cho xuất báo cáo Excel
- Vercel deploy, GitHub source control

**Không dùng Supabase.**

## 1. Cài đặt local

```bash
npm install
cp .env.example .env.local
```

Điền `DATABASE_URL` bằng **pooled connection string** của project Neon đã tạo.

Không commit `.env.local` lên GitHub.

## 2. Tạo schema + dữ liệu danh mục ban đầu

```bash
npm run db:setup
```

Lệnh này chạy:

- `db/schema.sql`
- `db/seed.sql`

Seed có sẵn:

- Nhà máy + Mỏ Tà Thiết
- Nhóm Cối, CBL, NBS-NT, Lò, NXM, Nhà thầu
- 11 loại khí/sản phẩm đã thống nhất
- Kho Hậu cần + điểm `Đang vận chuyển`
- Công ty Anh Tân
- HĐ 121/CCKCN-2026 và đơn giá hiện tại từ 02/03/2026

Danh sách nhóm còn thiếu có thể thêm sau từ Admin mà không sửa code.

## 3. Tạo Admin đầu tiên

```bash
npm run admin:create -- ADMIN01 MatKhauTam123 "Quản trị hệ thống"
```

Sau đó đăng nhập bằng `ADMIN01`.

## 4. Chạy ứng dụng

```bash
npm run dev
```

Mở `http://localhost:3000`.

## 5. Cấu hình Vercel

Trong Project Settings → Environment Variables, thêm tối thiểu:

- `DATABASE_URL`
- `DB_POOL_MAX=3`
- `SESSION_COOKIE_NAME=khicn_session`
- `SESSION_TTL_DAYS=7`

Để gửi email thật, thêm:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

Nếu chưa có SMTP, cảnh báo vẫn được ghi vào `notification_outbox`; hệ thống không làm mất sự kiện cảnh báo.

## 6. Chức năng có trong bộ V1 đầu tiên

- Đăng nhập mã danh bộ / username NCC
- Session lưu Neon; mật khẩu hash bcrypt
- Admin tạo user, khóa/mở, reset password
- Bắt đổi mật khẩu sau khi Admin tạo/reset
- Phân quyền: Admin, Workshop, Trưởng kho, Thủ kho, XSC Mỏ, Đốc công, Giám sát, Công nhân, Ban quản đốc, NCC
- Danh mục khí/sản phẩm; Admin có thể bổ sung loại mới
- Tồn Kho tách đầy/rỗng
- Tồn tổng theo nhóm
- Phiếu giao NCC nhiều dòng/nhiều địa điểm
- Xác nhận theo Nhà máy/Mỏ
- Phản hồi khi số lượng không khớp
- Phiếu trả vỏ NCC, liên kết cùng mã chuyến
- Quy tắc 1 lượt xe giao + gom vỏ = 1 chuyến
- Quy tắc có vào Mỏ => cước chuyến Mỏ
- Mượn / đổi / trả nội bộ
- Duyệt mượn theo giờ hành chính / ngoài giờ
- Hậu kiểm sau khi tồn đã cập nhật theo thao tác vật lý
- Điều chuyển Nhà máy ↔ Mỏ với tồn `Đang vận chuyển`
- Lịch ngày nghỉ/ngày làm bù thủ công
- Quản lý hợp đồng + đơn giá có hiệu lực theo thời gian, không làm đổi lịch sử
- Ngưỡng tồn thấp riêng từng loại khí
- Email đúng 1 lần khi tồn chuyển sang thấp
- Tính chi phí trước VAT theo bảng giá hợp đồng (hàng hóa, cước, thuê vỏ/ngày, XL-45)
- Audit log
- Xuất Excel theo tháng
- Responsive mobile + desktop theo nhận diện Vicem Hà Tiên

## 7. Việc cố ý không đưa vào hệ thống

- Seri/mã chai và chứng từ ATMT
- Upload ảnh/PDF
- Yêu cầu NCC qua web (V1 vẫn dùng Zalo)

Các mục trên được loại bỏ để giữ hệ thống gọn và đúng phạm vi.

## 8. Trước khi chạy thật

Admin cần nhập:

1. Danh sách nhóm còn lại.
2. User/mã danh bộ và vai trò.
3. Định mức từng nhóm.
4. Số dư đầu kỳ Kho/nhóm/Mỏ.
5. Ngưỡng tồn thấp từng loại khí.
6. Email nhận cảnh báo.
7. Ngày lễ/ngày làm bù.
8. SMTP nếu muốn gửi email thật.

## 9. Tài liệu

- `docs/NGHIEP_VU_V1.md` — nghiệp vụ V1
- `docs/DESIGN_MEMORY.md` — nguyên tắc UI dùng chung
- `docs/BRAND_SYSTEM.md` — nhận diện thương hiệu

## 10. Kiểm tra trước khi commit/deploy

```bash
npm install
npm run build
```

Bộ ZIP không chứa `node_modules`, `.env.local` hoặc secret của Neon/SMTP. Trong môi trường tạo bộ code này đã kiểm tra cú pháp toàn bộ file TS/TSX và kiểm tra import nội bộ; bước `next build` đầy đủ cần chạy sau khi cài dependencies.
