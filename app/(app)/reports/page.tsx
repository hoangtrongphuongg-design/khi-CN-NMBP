import Link from "next/link";
import { redirect } from "next/navigation";
import { Calculator, Download, Info } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { requireProfile } from "@/lib/auth/session";
import { getGroups, getLocations, getProducts } from "@/lib/services/catalog";
import { getCylinderRentalDaily, summarizeCylinderRental } from "@/lib/services/costs";
import { formatCurrency, formatNumber } from "@/lib/utils";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ month?: string; location?: string; product?: string; group?: string; status?: string }> }) {
  const profile = await requireProfile();
  if (["foreman","supervisor","worker"].includes(profile.role)) redirect("/dashboard");
  const p = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(p.month || "") ? p.month! : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).slice(0,7);
  const start = `${month}-01`;
  const nextMonth = new Date(`${start}T00:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const endDate = nextMonth.toISOString().slice(0,10);

  const [locations, products, groups, rentalDaily] = await Promise.all([
    getLocations(),
    getProducts(),
    getGroups(),
    getCylinderRentalDaily({ startDate: start, endDateExclusive: endDate, productId: p.product || null }),
  ]);
  const rentalSummary = summarizeCylinderRental(rentalDaily);
  const rentalTotal = rentalSummary.reduce((sum, row) => sum + row.rental_amount, 0);

  const query = new URLSearchParams({ month });
  if (p.location) query.set("location", p.location);
  if (p.product) query.set("product", p.product);
  if (p.group) query.set("group", p.group);
  if (p.status) query.set("status", p.status);

  return <div className="grid gap-5">
    <div><h1 className="font-display m-0 text-2xl text-[var(--brand-deep)]">Báo cáo & Excel</h1><p className="mt-1 text-sm text-[var(--muted-foreground)]">Lọc dữ liệu trước khi xuất để phục vụ đối soát.</p></div>

    <Card><CardTitle>Xuất báo cáo tháng</CardTitle>
      <form method="get" className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6 md:items-end">
        <label className="grid gap-1 text-sm font-bold">Tháng<input className="min-h-10 rounded-lg border border-[var(--border)] bg-white px-3" type="month" name="month" defaultValue={month}/></label>
        <label className="grid gap-1 text-sm font-bold">Địa điểm<Select name="location" defaultValue={p.location || ""}><option value="">Tất cả</option>{locations.map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}</Select></label>
        <label className="grid gap-1 text-sm font-bold">Loại khí / hàng<Select name="product" defaultValue={p.product || ""}><option value="">Tất cả</option>{products.map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}</Select></label>
        {profile.role !== "supplier" ? <label className="grid gap-1 text-sm font-bold">Nhóm<Select name="group" defaultValue={p.group || ""}><option value="">Tất cả</option>{groups.map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}</Select></label> : null}
        <label className="grid gap-1 text-sm font-bold">Trạng thái<Select name="status" defaultValue={p.status || ""}><option value="">Tất cả</option><option value="pending">Chờ xử lý</option><option value="feedback">Có phản hồi</option><option value="completed">Hoàn tất</option></Select></label>
        <button className="min-h-10 rounded-lg border border-[var(--border)] bg-white px-4 font-bold" type="submit">Áp dụng lọc</button>
      </form>
      <div className="mt-4"><Link href={`/api/reports/monthly?${query.toString()}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--brand)] px-4 py-2 font-bold text-white"><Download size={17}/>Xuất Excel {month}</Link></div>
      <p className="mt-4 text-xs text-[var(--muted-foreground)]">File gồm: Tổng hợp chi phí, Giao NCC, Trả vỏ NCC, Chuyến & cước, Thuê vỏ - Tổng hợp, Thuê vỏ - Theo ngày, Tồn hiện tại, Nội bộ, Điều chuyển và XL-45. Tài khoản NCC chỉ nhận dữ liệu của chính NCC.</p>
    </Card>

    <Card className="overflow-hidden p-0">
      <div className="border-b border-[var(--border)] p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><Calculator size={18} className="text-[var(--brand)]"/><CardTitle>Thuê vỏ theo từng loại khí · {month}</CardTitle></div>
            <p className="mt-2 max-w-3xl text-sm text-[var(--muted-foreground)]">Mỗi ngày hệ thống lấy <strong>số vỏ cuối ngày</strong> của từng loại khí trên toàn NMBP. Tổng tháng = tổng vỏ-ngày × đơn giá thuê có hiệu lực từng ngày.</p>
          </div>
          <div className="rounded-lg bg-[var(--paper)] px-4 py-3 text-right">
            <div className="text-xs font-bold uppercase tracking-wide text-[var(--muted-foreground)]">Tổng thuê vỏ</div>
            <div className="mt-1 font-mono-data text-xl font-extrabold text-[var(--brand-deep)]">{formatCurrency(rentalTotal)}</div>
          </div>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--paper)] p-3 text-xs text-[var(--muted-foreground)]"><Info size={16} className="mt-0.5 shrink-0 text-[var(--brand)]"/><span>Điều chuyển Kho ↔ Nhóm hoặc Nhà máy ↔ Mỏ chỉ đổi vị trí giữ vỏ nên <strong>không làm thay đổi tổng vỏ thuê NCC</strong>. Bộ lọc địa điểm/nhóm không phân bổ lại chi phí thuê vỏ.</span></div>
      </div>

      {rentalSummary.length ? <div className="overflow-x-auto">
        <table className="mobile-card-table w-full text-sm">
          <thead className="bg-[var(--muted)]"><tr>
            <th className="p-3 text-left">Loại khí</th>
            <th className="p-3 text-right">Vỏ ngày đầu</th>
            <th className="p-3 text-right">Vỏ ngày cuối</th>
            <th className="p-3 text-right">Tổng vỏ-ngày</th>
            <th className="p-3 text-right">Đơn giá/ngày</th>
            <th className="p-3 text-right">Thành tiền</th>
            <th className="p-3 text-left">Kiểm tra</th>
          </tr></thead>
          <tbody>{rentalSummary.map((row)=><tr key={row.product_id} className="border-t border-[var(--border)]">
            <td data-label="Loại khí" className="p-3"><strong>{row.product_name}</strong><div className="mt-0.5 text-xs text-[var(--muted-foreground)]">{row.product_code}</div></td>
            <td data-label="Vỏ ngày đầu" className="p-3 text-right font-mono-data">{formatNumber(row.opening_qty)}</td>
            <td data-label="Vỏ ngày cuối" className="p-3 text-right font-mono-data">{formatNumber(row.closing_qty)}</td>
            <td data-label="Tổng vỏ-ngày" className="p-3 text-right font-mono-data font-bold">{formatNumber(row.bottle_days)}</td>
            <td data-label="Đơn giá/ngày" className="p-3 text-right font-mono-data">{row.unit_price_from === row.unit_price_to ? formatCurrency(row.unit_price_from) : `${formatCurrency(row.unit_price_from)} → ${formatCurrency(row.unit_price_to)}`}</td>
            <td data-label="Thành tiền" className="p-3 text-right font-mono-data font-extrabold text-[var(--brand-deep)]">{formatCurrency(row.rental_amount)}</td>
            <td data-label="Kiểm tra" className="p-3">{row.missing_price_days > 0 ? <Badge tone="danger">Thiếu giá {row.missing_price_days} ngày</Badge> : <Badge tone="success">Đủ đơn giá</Badge>}</td>
          </tr>)}</tbody>
          <tfoot><tr className="border-t-2 border-[var(--brand)] bg-[var(--paper)]"><td className="p-3 font-extrabold">TỔNG</td><td/><td/><td className="p-3 text-right font-mono-data font-extrabold">{formatNumber(rentalSummary.reduce((s,r)=>s+r.bottle_days,0))}</td><td/><td className="p-3 text-right font-mono-data font-extrabold text-[var(--brand-deep)]">{formatCurrency(rentalTotal)}</td><td/></tr></tfoot>
        </table>
      </div> : <div className="p-5 text-sm text-[var(--muted-foreground)]">Không có loại vỏ nào được cấu hình tính thuê trong bộ lọc hiện tại.</div>}
    </Card>
  </div>;
}
