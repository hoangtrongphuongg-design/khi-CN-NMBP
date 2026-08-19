"use client";

/**
 * Giữ file để tương thích cấu trúc cũ. Từ V1.0.22 NCC không còn bước xác nhận nhận vỏ.
 * Phiếu trả vỏ được đơn vị Nhà máy/Mỏ xác nhận và cập nhật tồn ngay; NCC chỉ phản hồi nếu sai.
 */
export function SupplierReturnConfirmForm() {
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-[var(--brand-deep)]">
      NCC không cần xác nhận nhận vỏ. Nếu số liệu chưa đúng, sử dụng nút <strong>Phản hồi</strong> trên dòng vỏ tương ứng.
    </div>
  );
}
