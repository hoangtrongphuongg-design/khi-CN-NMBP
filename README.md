# Quản lý khí NMBP — V1.0.15

Hệ thống quản lý khí công nghiệp/vỏ chai tại Nhà máy Xi măng Bình Phước và Mỏ đá Tà Thiết.

## Công nghệ

- Next.js App Router + TypeScript
- Tailwind CSS v4
- Neon PostgreSQL (`postgres` driver)
- GitHub + Vercel
- Nodemailer/SMTP cho cảnh báo tồn thấp
- ExcelJS cho báo cáo Excel
- Không dùng Supabase

## Nghiệp vụ chính

- Giao NCC: **NCC tạo → Thủ kho xác nhận thực nhận tại Nhà máy / XSC Mỏ xác nhận tại Mỏ → Trưởng kho Hậu cần duyệt hoàn tất**.
- Phiếu trả vỏ NCC có thể liên kết cùng mã chuyến để chỉ tính 1 cước.
- Kho Hậu cần tách **chai đầy/rỗng**; nhóm chỉ theo dõi **tổng số chai tại nhóm**.
- Mượn/Đổi/Trả nội bộ hỗ trợ **nhiều loại khí trong một phiếu**; Thủ kho nhập số thực tế từng dòng.
- Điều chuyển Nhà máy ↔ Mỏ **một bước**, cập nhật tồn ngay; bên nhận chỉ phản hồi nếu sai.
- Báo cáo chi phí theo **Từ ngày – Đến ngày**: mua khí, thuê vỏ theo vỏ-ngày, XL-45, vận chuyển và tổng hợp.
- Thuê vỏ tính riêng từng loại theo **số vỏ cuối từng ngày**; không tính ngày tương lai.
- Cảnh báo tồn thấp theo chai đầy Kho Hậu cần.
- Không quản lý seri chai, không upload ảnh/PDF, không thay Zalo trong bước yêu cầu NCC.

Chi tiết: `docs/NGHIEP_VU_V1.md`.

## Cập nhật từ bản đang chạy

Nếu database đã chạy tới SQL 07, cập nhật code V1.0.15 rồi chạy đúng **một file mới**:

`NEON_SQL/08_PHIEU_NOI_BO_NHIEU_LOAI_KHI.sql`

SQL 08 tạo bảng dòng chi tiết cho phiếu Mượn/Đổi/Trả và tự chuyển các phiếu cũ 1 loại khí sang cấu trúc mới. Script có thể chạy lại an toàn.

## Cài mới database

Dùng:

```bash
npm install
cp .env.example .env.local
npm run db:setup
```

Hoặc trên Neon SQL Editor chạy bộ SQL theo thứ tự trong `NEON_SQL`.

## Biến môi trường tối thiểu

- `DATABASE_URL` — Neon pooled connection string
- `DB_POOL_MAX=3`
- `SESSION_COOKIE_NAME=khicn_session`
- `SESSION_TTL_DAYS=7`
- `NEXT_PUBLIC_APP_NAME=Quản lý khí NMBP`

SMTP tùy chọn:

- `SMTP_HOST`
- `SMTP_PORT=587`
- `SMTP_SECURE=false`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

## Kiểm tra

```bash
npm install
npm run check
npm run build
```

Health endpoint: `/api/health`.
