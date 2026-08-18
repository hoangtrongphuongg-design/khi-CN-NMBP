# HƯỚNG DẪN CÀI ĐẶT V1 — QUẢN LÝ KHÍ NMBP

> Kiến trúc: Next.js + TypeScript + Tailwind CSS v4 + Neon PostgreSQL + Vercel + GitHub.
> Không dùng Supabase.

---

## A. Chuẩn bị

Anh đã có sẵn:
1. Project Neon.
2. Repository GitHub.

Cần thêm trên máy tính:
- Node.js 20 LTS hoặc mới hơn.
- Git.
- VS Code (khuyến nghị).

Kiểm tra:

```bash
node -v
npm -v
git --version
```

---

## B. Đưa code vào GitHub repo đã tạo

### Cách an toàn nhất

1. Tải và giải nén ZIP.
2. Mở thư mục `khicn-nmbp-v1`.
3. Mở Terminal tại thư mục này.
4. Nếu GitHub repo của anh đang trống:

```bash
git init
git branch -M main
git remote add origin URL_GITHUB_CUA_ANH
git add .
git commit -m "Initial V1 - Quan ly khi NMBP"
git push -u origin main
```

### Nếu GitHub repo đã có README hoặc file khác

Clone repo trước:

```bash
git clone URL_GITHUB_CUA_ANH
cd TEN_REPO
```

Sau đó copy toàn bộ file bên trong `khicn-nmbp-v1` vào repo đã clone, rồi:

```bash
git add .
git commit -m "Add V1 Neon"
git push
```

Không commit `.env.local`.

---

## C. Lấy DATABASE_URL từ Neon

1. Đăng nhập Neon.
2. Mở đúng project database của hệ thống khí.
3. Chọn `Connect`.
4. Chọn connection kiểu **Pooled connection**.
5. Copy connection string dạng:

```text
postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
```

Không gửi chuỗi này lên GitHub/chat công khai.

---

## D. Tạo file môi trường local

Trong thư mục project:

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Hoặc CMD:

```cmd
copy .env.example .env.local
```

Mở `.env.local` và điền:

```env
DATABASE_URL="postgresql://..."
DB_POOL_MAX="3"

NEXT_PUBLIC_APP_NAME="Quản lý khí NMBP"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"

SESSION_COOKIE_NAME="khicn_session"
SESSION_TTL_DAYS="7"
```

Phần SMTP có thể để trống khi chạy thử lần đầu.

---

## E. Cài thư viện

```bash
npm install
```

Nếu thành công sẽ tạo `node_modules`.

---

## F. Tạo database trên Neon

Chạy:

```bash
npm run db:setup
```

Lệnh này tạo schema và seed dữ liệu ban đầu.

Dữ liệu seed có:
- Nhà máy.
- Mỏ Tà Thiết.
- Nhóm Cối.
- Nhóm CBL.
- Nhóm NBS-NT.
- Nhóm Lò.
- Nhóm NXM.
- Nhà thầu.
- Danh mục khí/sản phẩm.
- Kho Hậu cần.
- Điểm Đang vận chuyển.
- NCC Anh Tân.
- Hợp đồng 121/CCKCN-2026.
- Bảng giá khởi điểm theo hợp đồng.

Chỉ chạy `db:setup` trên database thử nghiệm/lần khởi tạo theo hướng dẫn của schema.
Trước khi chạy lại trên database đã có dữ liệu thật, phải kiểm tra nội dung script trước.

---

## G. Tạo tài khoản Admin đầu tiên

Ví dụ:

```bash
npm run admin:create -- ADMIN01 MatKhauTam123 "Quản trị hệ thống"
```

Có thể thay:
- `ADMIN01` bằng username Admin anh muốn.
- `MatKhauTam123` bằng mật khẩu tạm mạnh hơn.
- Tên hiển thị tùy ý.

Sau khi đăng nhập, đổi mật khẩu.

---

## H. Chạy thử trên máy tính

```bash
npm run dev
```

Mở:

```text
http://localhost:3000
```

Kiểm tra theo thứ tự:
1. Đăng nhập Admin.
2. Mở Dashboard.
3. Mở Admin.
4. Kiểm tra danh mục khí.
5. Kiểm tra nhóm.
6. Kiểm tra hợp đồng/bảng giá.
7. Tạo user thử.
8. Kiểm tra tồn Kho.
9. Tạo thử Phiếu giao.
10. Tạo thử Phiếu đổi/mượn/trả nội bộ.

---

## I. Kiểm tra build trước khi deploy

```bash
npm run build
```

Chỉ deploy khi `npm run build` chạy thành công.

---

## J. Đưa lên Vercel

1. Đăng nhập Vercel.
2. `Add New` → `Project`.
3. Import GitHub repo đã push code.
4. Framework để Vercel tự nhận là Next.js.
5. Chưa bấm deploy vội nếu chưa thêm biến môi trường.

Trong:

`Project Settings → Environment Variables`

thêm:

```env
DATABASE_URL=...
DB_POOL_MAX=3
NEXT_PUBLIC_APP_NAME=Quản lý khí NMBP
NEXT_PUBLIC_SITE_URL=https://TEN-DOMAIN.vercel.app
SESSION_COOKIE_NAME=khicn_session
SESSION_TTL_DAYS=7
```

Sau đó Deploy.

---

## K. Cấu hình email cảnh báo tồn thấp

Có thể chạy hệ thống trước mà chưa cấu hình SMTP.

Khi có tài khoản SMTP, thêm vào `.env.local` và Vercel:

```env
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Quản lý khí NMBP <email_gui@domain>"
```

Quy tắc:
- Admin cấu hình ngưỡng riêng cho từng loại khí.
- Khi tồn chai đầy chuyển từ trên ngưỡng xuống chạm/thấp hơn ngưỡng:
  → gửi đúng 1 email.
- Tồn tiếp tục giảm:
  → không gửi thêm.
- Khi tồn tăng trở lại trên ngưỡng:
  → reset.
- Lần sau lại chạm ngưỡng:
  → gửi 1 email mới.

---

## L. Nguyên tắc nhập dữ liệu ban đầu

Sau khi app chạy:
1. Admin tạo user.
2. CBCNV dùng mã danh bộ làm username.
3. NCC dùng username riêng.
4. Gán đúng role.
5. Gán Đốc công/Giám sát vào đúng nhóm.
6. Nhập định mức nhóm.
7. Nhập tồn đầu kỳ.
8. Cấu hình ngưỡng tồn thấp.
9. Cấu hình email nhận cảnh báo.
10. Kiểm tra đơn giá/hợp đồng.

Không nhập tồn bằng cách sửa DB trực tiếp sau khi hệ thống đã vận hành thật, trừ thao tác quản trị/điều chỉnh có kiểm soát.

---

## M. Các role V1

- ADMIN
- WORKSHOP
- WAREHOUSE_MANAGER (Trưởng kho Hậu cần)
- STOREKEEPER (Thủ kho)
- QUARRY_XSC (XSC Mỏ)
- FOREMAN (Đốc công)
- SUPERVISOR (Giám sát)
- WORKER (Công nhân)
- BOARD_VIEWER (Ban quản đốc)
- SUPPLIER (NCC)

---

## N. Các nghiệp vụ chính V1

### 1. NCC giao hàng
XSC yêu cầu qua Zalo → NCC tạo Phiếu giao → Nhà máy/Mỏ xác nhận → hoàn tất.

### 2. Trả vỏ cho NCC
XSC/PHC tạo → NCC xác nhận.

### 3. Đổi chai nội bộ
Nhóm tạo → Thủ kho thực hiện → tồn cập nhật ngay → Trưởng kho hậu kiểm.

### 4. Mượn thêm
Trong giờ hành chính:
- Workshop hoặc Trưởng kho duyệt.

Ngoài giờ/ngày nghỉ:
- Thủ kho được cấp mượn.
- Tồn cập nhật ngay.
- Trưởng kho hậu kiểm.

Giờ hành chính:
- Thứ Hai đến Thứ Sáu.
- 07:30–16:30.

Admin chỉ nhập ngày ngoại lệ:
- ngày lễ/nghỉ;
- ngày làm bù.

### 5. Trả chai nội bộ
Nhóm tạo → Thủ kho nhận → tồn cập nhật ngay → Trưởng kho hậu kiểm.

### 6. Điều chuyển Nhà máy ↔ Mỏ
Có tồn trung gian `Đang vận chuyển`.
Điều chuyển không làm thay đổi tổng số vỏ NCC đang cho Nhà máy quản lý.

---

## O. Quy tắc chuyến xe

- Một xe đi giao hàng và gom vỏ trong cùng lượt = 1 chuyến.
- Nếu xe có vào Mỏ Tà Thiết vì giao hoặc gom vỏ → tính chuyến Mỏ.
- Nếu không vào Mỏ → tính chuyến Nhà máy.
- CO₂ lỏng xe chuyên dụng quản lý theo loại cước riêng.

---

## P. Nguyên tắc bảng giá

Không sửa đè đơn giá cũ.

Ví dụ:
- O₂ 80.000 đ/chai hiệu lực đến 31/08.
- O₂ 85.000 đ/chai hiệu lực từ 01/09.

Giao dịch quá khứ giữ đơn giá cũ.
Giao dịch mới dùng giá mới.

Khi giao dịch chốt, hệ thống lưu snapshot:
- đơn giá áp dụng;
- phiên bản giá/hợp đồng;
- thành tiền.

---

## Q. Không nằm trong V1

- Không quản lý serial/mã chai.
- Không upload ảnh/PDF.
- Không thay Zalo bằng module yêu cầu NCC.
- Không theo dõi từng serial trong mượn/đổi/trả nội bộ.

---

## R. Lưu ý trước khi dùng dữ liệu thật

1. Test toàn bộ luồng bằng dữ liệu giả.
2. Kiểm tra quyền từng role.
3. Kiểm tra tồn đầy/rỗng Kho.
4. Kiểm tra mượn ngoài giờ.
5. Kiểm tra ngày lễ.
6. Kiểm tra chuyến Mỏ.
7. Kiểm tra đổi giá theo ngày hiệu lực.
8. Kiểm tra Excel.
9. Kiểm tra email.
10. Sau khi đúng mới nhập tồn đầu kỳ thật.
