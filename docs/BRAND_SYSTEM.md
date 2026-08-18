# CCDC Design System — bộ nhận diện thương hiệu để copy sang dự án mới

Tài liệu tổng hợp từ code thực tế của 2 dự án đã triển khai (PHC — mua sắm,
Xưởng Sửa Chữa — gia công cơ khí), công ty **Nhà máy xi măng Bình Phước**
("Thương hiệu xi măng đầu tiên từ 1964"). Dùng để dựng lại đúng giao diện
này cho một dự án web mới.

## 1. Màu sắc — 6 token cốt lõi

Copy nguyên khối này vào file token gốc của dự án mới (CSS variables hoặc
theme config). Mọi màu khác trong app nên dẫn xuất từ đây, không thêm hex
rời rạc theo từng component.

| Token | Hex | Vai trò |
|---|---|---|
| `--brand` | `#004a8f` | Nút chính, link, viền focus, logo trên nền sáng |
| `--brand-deep` | `#002b55` | Đầu gradient tối — panel thương hiệu, header |
| `--brand-hover` | `#003b73` | Trạng thái hover/active của nút chính |
| `--ink` | `#111827` | Chữ chính trên nền sáng |
| `--paper` | `#f6f8fa` | Nền trang — xám xanh rất nhạt, **không dùng trắng thuần** |
| `--line` | `#d1d5db` | Viền, đường phân cách |

```css
:root {
  --brand: #004a8f;
  --brand-deep: #002b55;
  --brand-hover: #003b73;
  --ink: #111827;
  --paper: #f6f8fa;
  --line: #d1d5db;
}
```

## 2. Màu trạng thái — đã kiểm tra tương phản WCAG

**Bài học quan trọng:** token trạng thái "mặc định" nhìn có vẻ đủ đậm
nhưng khi tính đúng công thức WCAG ở cỡ chữ nhỏ (badge, nhãn 10-11px) lại
KHÔNG đạt chuẩn — ví dụ xanh lá `#16a34a` chỉ đạt **3.3:1** trên nền
trắng (dưới ngưỡng tối thiểu 4.5:1). Dùng đúng 5 giá trị dưới đây (đã đo
tay, đều ≥5:1 để có biên an toàn) cho mọi chữ/badge nhỏ trên nền sáng:

| Ý nghĩa | Hex | Tỉ lệ tương phản trên nền trắng |
|---|---|---|
| Đang xử lý / info | `#004A8F` | 8.8:1 |
| Cảnh báo | `#92400E` | 7.1:1 |
| Khẩn cấp / lỗi | `#B91C1C` | 6.5:1 |
| Hoàn thành | `#15803D` | 5.0:1 |
| Trung tính | `#4B5563` | 7.6:1 |

Cách tính nhanh: dùng công cụ kiểm tra WCAG contrast checker (nhiều công
cụ online miễn phí) — dán mã hex chữ + mã hex nền, mục tiêu ≥ 4.5:1 cho
chữ thường, ưu tiên ≥ 5:1 nếu là badge/nhãn nhỏ dưới 12px.

## 3. Chữ (typography) — 3 vai trò, không hơn

Bản gốc dùng **Oswald** (display, chữ IN HOA đậm, hơi giãn — dùng cho tiêu
đề/logo text) + **Work Sans** (nội dung, đoạn văn) + **IBM Plex Mono**
(số liệu, mã hex, ngày tháng — mọi thứ cần thẳng hàng).

Nếu dự án mới không có sẵn 3 font này, giữ đặc trưng bằng quy tắc:
- **Display**: luôn IN HOA + `font-weight: 800` + `letter-spacing: 0.02-0.04em`.
- **Body**: font hệ thống mặc định, không in hoa.
- **Mono**: `ui-monospace, "Cascadia Code", "SFMono-Regular", Consolas, monospace` cho mọi con số/hex.

## 4. Bố cục — màn đăng nhập chia đôi màn hình

Mẫu dùng lại ở cả 2 dự án: cột trái tỉ lệ `0.92fr` là panel thương hiệu
(gradient `--brand-deep` → `--brand`, chứa logo + tên công ty + slogan),
cột phải tỉ lệ `1.38fr` là form đăng nhập trên nền `--paper`/`--card`
(trắng). Cột trái **ẩn hẳn** dưới breakpoint `768px` (md), chỉ còn logo
nhỏ phía trên form trên mobile.

```html
<div class="grid grid-cols-1 md:grid-cols-[minmax(360px,0.92fr)_minmax(420px,1.38fr)]">
  <!-- Cột trái: chỉ hiện ở desktop -->
  <div class="hidden md:flex flex-col items-center justify-center gap-5
              bg-gradient-to-br from-[#002b55] to-[#004a8f] text-white p-16 text-center">
    <img src="/brand/company-symbol.png" class="h-[180px] brightness-0 invert" alt="" />
    <div>
      <strong class="font-display text-[28px] uppercase tracking-tight">Tên công ty</strong>
      <p class="text-sm text-white/80">Tên hệ thống / app</p>
    </div>
    <img src="/brand/company-slogan.png" class="w-[300px] brightness-0 invert" alt="" />
  </div>

  <!-- Cột phải: form đăng nhập -->
  <div class="flex items-center justify-center px-5 py-10">
    <div class="w-full max-w-[340px] bg-white border rounded-lg p-7 shadow">
      <!-- input, button... -->
    </div>
  </div>
</div>
```

Asset cần chuẩn bị cho dự án mới:
1. **Logo** — PNG nền trong suốt, dùng `filter: brightness(0) invert(1)`
   để tự động ra màu trắng khi đặt trên nền gradient tối (không cần làm
   riêng 1 bản logo trắng).
2. **Banner slogan** — PNG nền trong suốt, cùng kỹ thuật invert như trên.
3. **(Tuỳ chọn) hoạ tiết nền công nghiệp mờ** — SVG line-art đặt ở đáy
   panel thương hiệu, `opacity: 0.1-0.12`, cũng invert trắng.

## 5. Nguyên tắc thiết kế — 4 điều rút ra khi làm thực tế

1. **Chỉ tô màu mạnh cho 1 trục thông tin quan trọng nhất.** Nếu 1 dòng
   dữ liệu có nhiều thuộc tính cùng lúc (loại việc, mức ưu tiên, trạng
   thái…), đừng tô màu độc lập cho từng trục — cộng dồn thành hiệu ứng
   "cầu vồng" gây rối mắt. Giữ màu mạnh cho trục cần quét nhanh nhất
   (thường là trạng thái); các trục còn lại dùng 1 tông trung tính
   (`#4B5563`), phân biệt bằng CHỮ thay vì bằng màu.

2. **Không đụng dark mode khi chỉ đổi màu thương hiệu cho light mode.**
   Cấu trúc token tách 2 khối: `:root` (mặc định, thường là dark) và
   `:root[data-theme="light"]` (override cho light). Khi rebrand, chỉ
   sửa khối light — dark mode giữ nguyên byte-for-byte. Xác nhận lại
   bằng cách đo màu thật qua DevTools sau khi sửa, không chỉ đọc code.

3. **Luôn tính tỉ lệ tương phản tay, không đoán bằng mắt.** Token "trông
   đủ đậm" trên màn hình vẫn có thể chỉ đạt 3:1 khi tính đúng công thức
   WCAG ở cỡ chữ nhỏ. Nhắm ≥5:1 để có biên an toàn thay vì đúng ngưỡng
   tối thiểu 4.5:1.

4. **Sửa CSS dùng chung theo phạm vi hẹp, không đổi giá trị gốc.** Khi
   cần hành vi riêng cho 1 khu vực/module trong file token dùng chung,
   thêm selector phạm vi hẹp (class hoặc data-attribute riêng cho khu
   vực đó) thay vì đổi thẳng biến gốc — tránh ảnh hưởng ngoài ý muốn tới
   những chỗ khác đang dùng chung token đó.

## 6. Checklist áp dụng sang dự án mới

1. **Copy khối biến màu ở mục 1** vào file token gốc của dự án mới
   (CSS variables hoặc Tailwind theme), thay hoàn toàn màu accent mặc
   định.
2. **Chuẩn bị 3 file brand asset** (mục 4) — logo PNG, slogan PNG, hoạ
   tiết nền SVG (tuỳ chọn) — thay bằng hình ảnh phù hợp thương hiệu của
   dự án mới, giữ nguyên kỹ thuật invert-trắng.
3. **Dựng lại khung màn đăng nhập chia đôi** (mục 4) — copy đúng khối
   CSS/HTML, đổi tên công ty/tên hệ thống/slogan cho dự án mới.
4. **Áp 4 nguyên tắc ở mục 5 ngay từ đầu** — đặc biệt là tách token
   light/dark và kiểm tra tương phản — rẻ hơn nhiều so với sửa lại sau
   khi đã có nhiều UI dùng sai token.
