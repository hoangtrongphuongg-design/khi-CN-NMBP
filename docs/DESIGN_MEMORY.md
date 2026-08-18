# Bộ ghi nhớ thiết kế giao diện (dùng chung, copy sang dự án khác)

> File này rút ra từ hệ thiết kế đã xây cho dự án Xưởng Sửa Chữa (Next.js + Tailwind v4 +
> shadcn/ui). Đây là các **nguyên tắc + giá trị mặc định khởi điểm** — khi dùng cho dự án mới, giữ
> nguyên phần nguyên tắc, còn bảng màu/tên module thì đổi theo bộ nhận diện của dự án đó.
>
> Cách dùng: copy nguyên file này vào dự án mới (ví dụ đặt tên `docs/DESIGN_MEMORY.md`), rồi nói
> Claude "đọc file này trước khi làm UI" — hoặc dán thẳng nội dung vào đầu cuộc trò chuyện.

## 1. Nguyên tắc tổng quát

- Một ngôn ngữ thiết kế dùng chung cho toàn bộ app: font, màu, spacing, radius, shadow, focus
  state, và các component khung (header, bảng, badge, dialog...) — nghiệp vụ từng phần vẫn độc
  lập, hệ thiết kế không chứa business logic.
- Component dùng chung **không hard-code** tên tính năng/module cụ thể — nhận nội dung/dữ liệu
  qua props, không tự gọi API/DB.
- Chỉ **bổ sung** token/component còn thiếu khi cần — không đổi giá trị hoặc xoá token/component
  đang được dùng nếu không có lý do rõ ràng (tránh vỡ giao diện những chỗ khác đang dùng chung).
- Nếu 1 phần UI cũ đã ổn định/đang chạy thật, việc đồng bộ nó theo hệ thiết kế mới là 1 giai đoạn
  riêng, cần xác nhận riêng — không âm thầm đổi khi đang làm việc khác.

## 2. Font — 3-4 vai trò rõ ràng, không dùng lẫn

| Vai trò | Khi nào dùng |
|---|---|
| Font mặc định (sans-serif) | Toàn bộ nội dung, bảng dữ liệu, form, badge, nút — không cần khai báo thêm |
| Font tiêu đề (display, thường có tracking rộng/viết hoa) | Tiêu đề trang/khu vực. **Không dùng cho bảng dữ liệu dài** — tracking rộng làm khó đọc khi nhiều dòng |
| Font mono | Ngày tháng, badge dạng nhãn, số liệu — tạo cảm giác "dữ liệu chính xác" |
| Font accent (script/viết tay, nếu có) | Hiếm khi dùng, không dùng cho UI chức năng |

Quy mô chữ tối thiểu 12px toàn app. Badge/tiêu đề cột: 12px. Nội dung/dữ liệu bảng: 13–14px.
Không viết hoa toàn bộ đoạn văn dài, chỉ viết hoa tiêu đề ngắn.

Ví dụ bộ đã dùng (Work Sans + Oswald + IBM Plex Mono qua `next/font/google`) — đổi sang font khác
tuỳ gu từng dự án, miễn giữ đúng 3-4 vai trò trên.

## 3. Màu — token ngữ nghĩa, không hard-code hex trong component

- Định nghĩa toàn bộ màu là **CSS variable ngữ nghĩa** (`--background`, `--primary`, `--border`,
  `--success`...) ở 1 nơi duy nhất (1 file CSS gốc) — component chỉ dùng tên token
  (`bg-primary`, `text-muted-foreground`), không viết hex trực tiếp trong component.
- Chọn 1 theme làm **mặc định** (`:root`), theme còn lại **override** qua selector kiểu
  `:root[data-theme="light"]` — bấm đổi theme chỉ cần đổi 1 attribute, không cần đổi class ở từng
  component.
- Có 1 bộ semantic tone dùng chung, tối thiểu: `success`, `warning`, `danger`, `info`, `neutral`
  (+ `primary` là màu thương hiệu). Badge/trạng thái luôn map về 1 trong các tone này, không tự
  chế màu riêng cho từng màn hình.
- **Không bao giờ chỉ dùng màu để truyền đạt trạng thái** — luôn có nhãn chữ đi kèm màu (WCAG,
  cũng vì không phải ai cũng phân biệt màu tốt).
- Kiểm tra contrast WCAG cho chữ cỡ nhỏ (badge 10-12px) riêng — màu gốc dùng cho vùng lớn có thể
  không đủ tương phản ở cỡ nhỏ, cần bản đậm hơn 1 bậc riêng cho trường hợp đó (không đổi token
  gốc, chỉ thêm biến thể).

**Bảng token khởi điểm đã dùng** (đổi giá trị theo bộ nhận diện dự án mới, giữ nguyên tên/vai trò):

```css
:root {
  color-scheme: dark; /* hoặc light nếu muốn light-first */
  --radius: 0.5rem;
  --background: #12161b;
  --foreground: #eee8da;
  --card: #1b2129;
  --primary: #ff6a3d;         /* màu thương hiệu chính */
  --primary-hover: #ff8259;
  --primary-foreground: #12161b;
  --muted: #242c35;
  --muted-foreground: #b8b0a0;
  --border: #4a5763;
  --ring: #ff6a3d;            /* focus ring mặc định, thường = primary */
  --destructive: #e5484d;

  /* semantic tone dùng cho badge/trạng thái */
  --warning: #f2b705;
  --info: #3d6d8c;
  --success: #4caf6d;
  --danger: #e5484d;
  --neutral: #8a97a5;
  --text: #eee8da;
  --text-muted: #b8b0a0;

  /* focus ring riêng cho vùng điều hướng/toggle lớn, tách khỏi --ring gốc */
  --focus-ring: rgba(255, 106, 61, 0.35);
}

:root[data-theme="light"] {
  color-scheme: light;
  --background: #f6f8fa;
  --foreground: #111827;
  --card: #ffffff;
  --primary: #004a8f;
  --primary-hover: #003b73;
  --border: #d1d5db;
  --warning: #b45309;
  --info: #2c6e94;
  --success: #16a34a;
  --danger: #dc2626;
  --text: #111827;
  --text-muted: #6b7280;
  --focus-ring: rgba(0, 74, 143, 0.24);
}
```

## 4. Spacing

Không tự đặt thang spacing riêng — dùng trực tiếp thang mặc định của framework CSS (Tailwind:
`px-4`, `py-2.5`, `gap-3`...). Container ngang: `px-4 md:px-6`. Khoảng cách các vùng trong
header/toolbar: `gap-2`/`gap-3`. Tự bịa thang spacing riêng chỉ tạo thêm quyết định phải nhớ mà
không có lợi ích rõ ràng.

## 5. Radius — 1 biến gốc, các bậc còn lại tính theo hệ số

```css
--radius: 0.5rem;
--radius-sm: calc(var(--radius) * 0.6);   /* badge nhỏ, phần tử compact */
--radius-md: calc(var(--radius) * 0.8);   /* input, button nhỏ */
--radius-lg: var(--radius);               /* button/control mặc định */
--radius-xl: calc(var(--radius) * 1.4);   /* card, panel */
--radius-2xl: calc(var(--radius) * 1.8);  /* khối lớn, hiếm dùng */
```

Đổi 1 biến gốc là đổi được cả hệ thống radius đồng bộ — không đặt số cứng (`rounded-[10px]`) rải
rác trong component.

## 6. Shadow

Giữ tối giản: 1-2 shadow dùng chung là đủ cho phần lớn app (ví dụ 1 shadow nhẹ cho badge/tag kiểu
nổi khối). Không dùng shadow nặng, không dùng gradient trang trí — giữ giao diện "phẳng, rõ ràng"
thay vì "hào nhoáng".

## 7. Focus state (bàn phím)

- Base layer: mọi phần tử đều có `outline-ring/50` mặc định.
- Control chuẩn (Button, Input, Select...) dùng `focus-visible:ring-3 focus-visible:ring-ring/50`
  — không đổi cho từng component riêng lẻ.
- Vùng điều hướng/toggle lớn (thanh header, thanh chuyển theme...) nơi `--ring` gốc không đủ nổi
  bật trên nền lớn: dùng token riêng `--focus-ring` (mục 3) thay vì chỉnh `--ring` gốc (tránh ảnh
  hưởng ngược lại toàn bộ control chuẩn).

## 8. Accessibility — checklist ngắn

- Ảnh/icon thuần trang trí: `aria-hidden="true"`.
- Trạng thái luôn có nhãn chữ, không chỉ dựa vào màu (mục 3).
- Bảng dữ liệu dùng đúng thẻ ngữ nghĩa `<table>/<thead>/<tbody>/<th scope="col">`, cột sort có
  `aria-sort`, nút sort có `aria-label`.
- Vùng loading có `role="status"` (thường ẩn, sr-only), vùng lỗi có `role="alert"`.
- Dialog xác nhận kế thừa focus trap + focus return + đóng bằng Escape từ thư viện primitive
  (Radix/shadcn), không tự viết lại tay.
- Không giảm độ tương phản chữ dưới mức token `text`/`text-muted` hiện có.

## 9. Nguyên tắc thiết kế component dùng chung

- **Controlled hoàn toàn**: component nhận `value` + `onChange`/`onValueChange` từ component cha,
  không tự giữ state ẩn mà cha không kiểm soát được (trừ state UI thuần tuý như "đang hover").
  Không tự gọi API bên trong component dùng chung.
- **Props-driven, không hard-code**: không viết cứng tên tính năng, tên trạng thái nghiệp vụ, hay
  route cụ thể trong component dùng chung — module gọi tự map dữ liệu của mình sang props chung
  (ví dụ tự map "Đang thực hiện"/"Đã xong" sang tone `info`/`success`).
  - **Test trước khi merge**: nếu grep tên module đã biết (`gia_cong`, tên route cụ thể...) trong
    file component dùng chung mà ra kết quả, đó là dấu hiệu đang hard-code — nên sửa lại thành
    prop trước khi coi là xong.
- **3 trạng thái bắt buộc cho mọi thứ hiển thị danh sách/bảng**: Loading (skeleton hoặc spinner,
  không đổi kích thước layout), Empty (tiêu đề trung lập mặc định + có thể tuỳ biến), Error
  (thông báo do module cha truyền vào, không tự sinh câu chữ kỹ thuật khó hiểu).
- **Responsive cho bảng nhiều cột**: bảng rộng trên desktop → chế độ "card theo dòng" trên mobile
  (mỗi dòng bảng thành 1 khối, tên cột hiện qua `content: attr(data-label)` hoặc tương đương) thay
  vì bắt người dùng cuộn ngang liên tục trên điện thoại. Container bảng tự `overflow-x-auto` bên
  trong chính nó, không tràn ra layout ngoài.
- Không đặt breakpoint riêng ngoài breakpoint mặc định của framework, trừ khi có nhu cầu cụ thể
  (dùng class arbitrary như `max-[720px]:...` khi cần 1 điểm gãy đặc biệt).

## 10. Danh sách "loại component nền tảng" nên có sẵn cho mọi dự án mới

Button, Badge/StatusBadge, Card, Input/Textarea, Select, DatePicker, Dialog/Modal xác nhận
(ConfirmationDialog), Drawer/Sheet, Tooltip, Spinner, IconButton, FormField (label + error +
hint gộp sẵn), bảng dữ liệu generic (cột/sort/sticky/loading/empty/error qua props), phân trang,
ô tìm kiếm (SearchInput, không tự debounce — để module cha tự debounce), bộ lọc dạng select
(FilterSelect, có tuỳ chọn "Tất cả" + nút xoá lọc), Tabs.

Xây các component này **1 lần, dùng lại ở mọi màn hình** — tránh mỗi màn hình tự dựng lại bảng/
badge/dialog riêng, dẫn tới giao diện lệch nhau dần theo thời gian.
