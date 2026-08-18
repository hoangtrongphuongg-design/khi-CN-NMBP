# Upload GitHub → Vercel (hướng dẫn ngắn cho người không chuyên)

## 1. Upload GitHub
- Vào repository đã tạo.
- Add file → Upload files.
- Kéo toàn bộ **nội dung bên trong** thư mục project lên repository.
- Không upload `.env.local`, `node_modules`, `.next`.
- Commit message: `V1.0.1 - Quan ly khi NMBP`.

## 2. Tạo database Neon
Trên máy cá nhân, sau khi tạo `.env.local` bằng connection string Neon:

```bash
npm install
npm run db:setup
npm run admin:create -- ADMIN01 MatKhauTam123 "Quản trị hệ thống"
```

## 3. Kết nối Vercel
- Vercel → Add New → Project.
- Import repository GitHub.
- Settings → Environment Variables.
- Thêm tối thiểu:
  - `DATABASE_URL`
  - `DB_POOL_MAX=3`
  - `SESSION_COOKIE_NAME=khicn_session`
  - `SESSION_TTL_DAYS=7`
  - `NEXT_PUBLIC_APP_NAME=Quản lý khí NMBP`
  - `NEXT_PUBLIC_SITE_URL=https://<domain-vercel-của-bạn>`
- Deploy.

## 4. Kiểm tra sau deploy
Mở:

`https://<domain-vercel-của-bạn>/api/health`

Nếu thấy:

```json
{"ok":true,"database":"connected"}
```

thì Vercel đã kết nối Neon.

Sau đó mở `/login` và đăng nhập Admin.

## 5. Email cảnh báo
Cấu hình SMTP sau khi web chạy ổn. Không có SMTP thì hệ thống vẫn vận hành, email pending nằm trong outbox.
