import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";

function diffLabel(value: number) {
  if (Math.abs(value) < 0.000001) return "0";
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

/**
 * Bảng đối chiếu số vỏ vận hành trên web ↔ NCC cho thuê (chỉ xem).
 * Dùng chung cho Quản trị → Kiểm kê & chốt và trang Số chai & tồn kho.
 */
export function ContainerReconciliationCard({ rows }: { rows: any[] }) {
  const hasShortage = rows.some((r:any)=>Number(r.difference || 0) < -0.000001);
  // Dòng tổng chỉ cộng vỏ chai khí CN; XL-45/LPG khác đơn vị nên không cộng chung.
  const cylinderRows = rows.filter((r:any)=>r.cylinder_rental_eligible);
  const sumOf = (field: string) => cylinderRows.reduce((s:number,r:any)=>s+Number(r[field] || 0),0);

  return <Card className="overflow-hidden p-0">
    <div className="border-b border-[var(--border)] p-4 md:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><CardTitle>Đối chiếu số vỏ: vận hành trên web ↔ NCC cho thuê (tính đến hôm nay)</CardTitle><p className="mt-1 max-w-4xl text-xs text-[var(--muted-foreground)]">Tổng vận hành = Kho Hậu cần (đầy + rỗng + bồn/khác) + các nhóm + Mỏ. NCC cho thuê = số dư đầu kỳ + NCC giao − trả NCC. Chênh lệch dương (trên web nhiều hơn NCC) không tô màu; dòng tô vàng là thiếu chai so với NCC hoặc còn nhóm chưa kiểm kê.</p></div><Badge tone={hasShortage ? "warning" : "success"}>{hasShortage ? "Thiếu so với NCC" : "Không thiếu so với NCC"}</Badge></div></div>
    <div className="overflow-x-auto"><table className="mobile-card-table w-full text-sm">
      <thead className="bg-[var(--muted)]"><tr><th className="p-3 text-left">Loại</th><th className="p-3 text-right">Kho đầy</th><th className="p-3 text-right">Kho rỗng</th><th className="p-3 text-right">Kho khác</th><th className="p-3 text-right">Các nhóm</th><th className="p-3 text-right">Mỏ</th><th className="p-3 text-right">Tổng vận hành</th><th className="p-3 text-right">NCC cho thuê</th><th className="p-3 text-right">Chênh lệch</th></tr></thead>
      <tbody>{rows.map((row:any)=><tr key={row.product_id} className={`border-t border-[var(--border)] ${Number(row.difference || 0) < -0.000001 ? "bg-amber-50" : ""}`}>
        <td data-label="Loại" className="p-3"><strong>{row.product_name}</strong><div className="text-xs text-[var(--muted-foreground)]">{row.unit}</div></td>
        <td data-label="Kho đầy" className="p-3 text-right font-mono-data">{formatNumber(row.warehouse_full)}</td>
        <td data-label="Kho rỗng" className="p-3 text-right font-mono-data">{formatNumber(row.warehouse_empty)}</td>
        <td data-label="Kho khác" className="p-3 text-right font-mono-data">{formatNumber(row.warehouse_other)}</td>
        <td data-label="Các nhóm" className="p-3 text-right font-mono-data">{formatNumber(row.groups_qty)}</td>
        <td data-label="Mỏ" className="p-3 text-right font-mono-data">{formatNumber(row.mine_qty)}</td>
        <td data-label="Tổng vận hành" className="p-3 text-right font-mono-data font-bold">{formatNumber(row.system_qty)}</td>
        <td data-label="NCC cho thuê" className="p-3 text-right font-mono-data font-bold">{formatNumber(row.supplier_qty)}</td>
        <td data-label="Chênh lệch" className="p-3 text-right font-mono-data font-extrabold">{diffLabel(Number(row.difference || 0))}</td>
      </tr>)}</tbody>
      {cylinderRows.length ? <tfoot><tr className="border-t-2 border-[var(--brand)] bg-[var(--paper)] font-extrabold">
        <td className="p-3">Tổng vỏ chai khí công nghiệp<div className="text-xs font-normal text-[var(--muted-foreground)]">Không gồm XL-45, LPG</div></td>
        <td data-label="Kho đầy" className="p-3 text-right font-mono-data">{formatNumber(sumOf("warehouse_full"))}</td>
        <td data-label="Kho rỗng" className="p-3 text-right font-mono-data">{formatNumber(sumOf("warehouse_empty"))}</td>
        <td data-label="Kho khác" className="p-3 text-right font-mono-data">{formatNumber(sumOf("warehouse_other"))}</td>
        <td data-label="Các nhóm" className="p-3 text-right font-mono-data">{formatNumber(sumOf("groups_qty"))}</td>
        <td data-label="Mỏ" className="p-3 text-right font-mono-data">{formatNumber(sumOf("mine_qty"))}</td>
        <td data-label="Tổng vận hành" className="p-3 text-right font-mono-data">{formatNumber(sumOf("system_qty"))}</td>
        <td data-label="NCC cho thuê" className="p-3 text-right font-mono-data">{formatNumber(sumOf("supplier_qty"))}</td>
        <td data-label="Chênh lệch" className="p-3 text-right font-mono-data">{diffLabel(sumOf("difference"))}</td>
      </tr></tfoot> : null}
    </table></div>
  </Card>;
}
