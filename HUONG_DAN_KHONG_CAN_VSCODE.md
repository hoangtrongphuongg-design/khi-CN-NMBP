# CÀI ĐẶT KHÔNG CẦN VS CODE — GITHUB + NEON + VERCEL

Anh KHÔNG cần cài VS Code và KHÔNG cần chạy lệnh trên máy.

## Giai đoạn A — GitHub

1. Giải nén bộ code.
2. Mở repo GitHub đã tạo.
3. Chọn `Add file` → `Upload files`.
4. Kéo toàn bộ file/thư mục bên trong project lên.
5. Không upload `.env.local`, `node_modules`, `.next`.
6. Commit changes.

## Giai đoạn B — Neon database

1. Mở Neon project.
2. Vào `SQL Editor`.
3. Mở file:
   `NEON_SQL/01_TAO_DATABASE_VA_DU_LIEU_MAU.sql`
4. Copy toàn bộ nội dung.
5. Paste vào Neon SQL Editor.
6. Bấm `Run`.
7. Chờ báo thành công.

Tiếp theo:

8. Mở `NEON_SQL/02_TAO_ADMIN_DAU_TIEN.sql`.
9. Copy vào Neon SQL Editor.
10. Trước khi Run, thay:
    - `ADMIN01` nếu muốn username khác.
    - `MAT_KHAU_CUA_ANH_2026` bằng mật khẩu thật.
11. Bấm `Run`.
12. Không commit mật khẩu thật lên GitHub.

Muốn kiểm tra database:
13. Chạy `NEON_SQL/03_KIEM_TRA_DATABASE.sql`.

## Giai đoạn C — Lấy DATABASE_URL Neon

1. Trong Neon chọn `Connect`.
2. Chọn `Pooled connection`.
3. Copy connection string.
4. Giữ bí mật chuỗi này.

## Giai đoạn D — Vercel

1. Mở Vercel.
2. `Add New` → `Project`.
3. Import đúng GitHub repo.
4. Trước khi Deploy, thêm Environment Variables:

- `DATABASE_URL` = connection string Neon
- `DB_POOL_MAX` = `3`
- `NEXT_PUBLIC_APP_NAME` = `Quản lý khí NMBP`
- `SESSION_COOKIE_NAME` = `khicn_session`
- `SESSION_TTL_DAYS` = `7`

SMTP chưa cần cấu hình ngay.

5. Deploy.

## Giai đoạn E — Kiểm tra sau Deploy

Mở:

`https://TEN-DOMAIN-VERCEL/api/health`

Nếu database kết nối đúng sẽ báo `database: connected`.

Sau đó mở:

`https://TEN-DOMAIN-VERCEL/login`

Đăng nhập bằng Admin đã tạo trong Neon SQL Editor.

## Email tồn thấp

Sau khi web chạy ổn mới cấu hình SMTP trong Vercel.
Không cần làm ở lần Deploy đầu.

## Cập nhật V1.0.15 từ V1.0.14

1. Upload các file trong PATCH V1.0.15 lên GitHub và ghi đè đúng đường dẫn.
2. Chờ Vercel deploy xong.
3. Vào Neon → SQL Editor.
4. Mở file `NEON_SQL/08_PHIEU_NOI_BO_NHIEU_LOAI_KHI.sql`, copy toàn bộ và bấm **Run** một lần.
5. Đăng nhập lại và thử: Đốc công/Giám sát → Tổng quan → Đổi/Mượn/Trả → thêm 2–3 loại khí → gửi yêu cầu → Thủ kho nhập số thực tế từng dòng.

Không chạy lại SQL 01–07 khi chỉ cập nhật bản này.
