# Quản lý khí NMBP — V1.0.41

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


### Nâng cấp V1.0.38
Chạy `15_KIEM_KE_CHOT_VAN_HANH.sql` trên Neon trước khi deploy code V1.0.38. SQL chỉ tạo cấu trúc chốt vận hành + điểm ledger lịch sử ẩn, không tự thay đổi số tồn hiện có.

### Nâng cấp V1.0.39
Chạy `16_KHOA_AUDIT_ADMIN_CHINH_DU_LIEU.sql` trên Neon sau SQL 15 và trước khi deploy V1.0.39. SQL 16 chỉ khóa `audit_logs` khỏi UPDATE/DELETE; không thay đổi dữ liệu nghiệp vụ hiện có. V1.0.39 bổ sung Trung tâm Admin và chức năng chỉnh dữ liệu nghiệp vụ có Audit.

### Sửa lỗi V1.0.41 — phí lưu bồn XL-45

Quy tắc chuẩn: ngày giao là ngày 1; miễn 15 ngày đầu; từ ngày thứ 16 bắt đầu tính phí; **ngày trả bồn cho NCC không tính phí**. Với bồn đã trả, khoảng chịu phí là từ `delivered_date + 15 ngày` đến `return_date - 1 ngày`. SQL 21 đi kèm dùng một lần để tính lại `charge_days` và `rental_amount` của dữ liệu XL-45 lịch sử.
Khi nâng từ V1.0.39 đang chạy: chạy **SQL 20 trước, SQL 21 sau**, rồi mới deploy code V1.0.41.

### Nâng cấp V1.0.40 — Bảng đơn giá theo tháng

Trên database đang chạy, **chạy SQL trước rồi mới deploy code**:

`NEON_SQL/20_QUAN_LY_DON_GIA_THEO_THANG.sql`

V1.0.40 giữ giá gốc theo hợp đồng, cho phép điều chỉnh nhiều khoảng Từ ngày–Đến ngày trong từng tháng, tự tính lại giao dịch bị ảnh hưởng và khóa bảng giá tháng. Giá là giá chưa VAT. Hợp đồng mới được Admin tạo thủ công và không được chồng thời hạn với hợp đồng khác của cùng NCC.

