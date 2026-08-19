import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Download,
  Droplets,
  Info,
  PackageOpen,
  ReceiptText,
  Truck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { requireProfile } from "@/lib/auth/session";
import { getLocations, getProducts } from "@/lib/services/catalog";
import {
  getCylinderRentalDaily,
  getGoodsCostDetails,
  getReportWindow,
  getSixMonthCostTrend,
  getTransportCostDetails,
  getXL45RentalDaily,
  summarizeCylinderRental,
  summarizeGoodsCost,
  summarizeXL45Rental,
} from "@/lib/services/costs";
import { formatCurrency, formatNumber } from "@/lib/utils";

function pct(value: number, total: number) {
  if (total <= 0) return "0%";
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format((value / total) * 100)}%`;
}

function shortDate(value: string) {
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
}

function moneyRange(min: number, max: number) {
  if (min === max) return formatCurrency(min);
  return `${formatCurrency(min)} → ${formatCurrency(max)}`;
}

function CostCard({
  title,
  value,
  subtitle,
  icon,
  tone = "brand",
}: {
  title: string;
  value: number;
  subtitle: string;
  icon: ReactNode;
  tone?: "brand" | "success" | "warning" | "neutral";
}) {
  const toneClass = tone === "success"
    ? "status-success"
    : tone === "warning"
      ? "status-warning"
      : tone === "neutral"
        ? "status-neutral"
        : "status-info";
  return <div className={`rounded-xl border p-4 ${toneClass}`}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-xs font-extrabold uppercase tracking-wide">{title}</div>
        <div className="mt-2 font-mono-data text-xl font-extrabold text-[var(--brand-deep)]">{formatCurrency(value)}</div>
        <div className="mt-1 text-xs text-[var(--muted-foreground)]">{subtitle}</div>
      </div>
      <div className="rounded-lg bg-white/80 p-2">{icon}</div>
    </div>
  </div>;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; location?: string; product?: string }>;
}) {
  const profile = await requireProfile();
  if (["foreman", "supervisor", "worker"].includes(profile.role)) redirect("/dashboard");
  const p = await searchParams;
  const requestedMonth = /^\d{4}-\d{2}$/.test(p.month || "") ? p.month! : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).slice(0, 7);
  const window = getReportWindow(requestedMonth);
  const supplierOrgId = profile.role === "supplier" ? profile.organization_id : null;

  const locations = await getLocations();
  const products = await getProducts();
  const goodsRows = await getGoodsCostDetails({
    startDate: window.startDate,
    endDateExclusive: window.dataEndExclusive,
    productId: p.product || null,
    locationId: p.location || null,
    supplierOrgId,
  });
  const rentalDaily = await getCylinderRentalDaily({
    startDate: window.startDate,
    endDateExclusive: window.dataEndExclusive,
    productId: p.product || null,
  });
  const transportRows = await getTransportCostDetails({
    startDate: window.startDate,
    endDateExclusive: window.dataEndExclusive,
    supplierOrgId,
    locationId: p.location || null,
    productId: p.product || null,
  });
  const xl45Daily = await getXL45RentalDaily({
    startDate: window.startDate,
    endDateExclusive: window.dataEndExclusive,
    productId: p.product || null,
    locationId: p.location || null,
    supplierOrgId,
  });
  const trend = await getSixMonthCostTrend(window.month, supplierOrgId);

  const goodsSummary = summarizeGoodsCost(goodsRows);
  const rentalSummary = summarizeCylinderRental(rentalDaily);
  const xl45Summary = summarizeXL45Rental(xl45Daily);

  const goodsCost = goodsRows.reduce((s, r) => s + r.amount, 0);
  const rentalCost = rentalDaily.reduce((s, r) => s + r.rental_amount, 0);
  const transportCost = transportRows.reduce((s, r) => s + r.amount, 0);
  const xl45Cost = xl45Daily.reduce((s, r) => s + r.rental_amount, 0);
  const totalCost = goodsCost + rentalCost + transportCost + xl45Cost;
  const maxTrend = Math.max(1, ...trend.map((x) => x.total));
  const missingGoodsPrice = goodsRows.filter((x) => x.price_missing).length;
  const missingRentalPriceDays = rentalSummary.reduce((s, x) => s + x.missing_price_days, 0);

  const productCostMap = new Map<string, {
    product_id: string;
    code: string;
    name: string;
    goods: number;
    cylinder: number;
    xl45: number;
  }>();
  for (const row of goodsSummary) productCostMap.set(row.product_id, { product_id: row.product_id, code: row.product_code, name: row.product_name, goods: row.amount, cylinder: 0, xl45: 0 });
  for (const row of rentalSummary) {
    const item = productCostMap.get(row.product_id) ?? { product_id: row.product_id, code: row.product_code, name: row.product_name, goods: 0, cylinder: 0, xl45: 0 };
    item.cylinder = row.rental_amount;
    productCostMap.set(row.product_id, item);
  }
  for (const row of xl45Summary) {
    const item = productCostMap.get(row.product_id) ?? { product_id: row.product_id, code: row.product_code, name: row.product_name, goods: 0, cylinder: 0, xl45: 0 };
    item.xl45 = row.amount;
    productCostMap.set(row.product_id, item);
  }
  const productCosts = Array.from(productCostMap.values())
    .map((x) => ({ ...x, total: x.goods + x.cylinder + x.xl45 }))
    .sort((a, b) => b.total - a.total);
  const maxProductGoods = Math.max(1, ...goodsSummary.map((x) => x.amount));

  const query = new URLSearchParams({ month: window.month });
  if (p.location) query.set("location", p.location);
  if (p.product) query.set("product", p.product);

  const periodLabel = window.isCurrentMonth
    ? `01/${window.month.slice(5, 7)}/${window.month.slice(0, 4)} → ${shortDate(window.asOfDate)}`
    : `${shortDate(window.startDate)} → ${shortDate(new Date(new Date(`${window.calendarEndExclusive}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10))}`;

  return <div className="grid gap-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display m-0 text-2xl text-[var(--brand-deep)]">Báo cáo chi phí</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">Theo dõi tiền mua khí, thuê vỏ, XL-45 và cước vận chuyển trên cùng một màn hình.</p>
      </div>
      <Link href={`/api/reports/monthly?${query.toString()}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--brand)] px-4 py-2 font-bold text-white">
        <Download size={17}/>Xuất Excel
      </Link>
    </header>

    <Card className="p-3 md:p-4">
      <form method="get" className="grid gap-3 md:grid-cols-4 md:items-end">
        <label className="grid gap-1 text-sm font-bold">Tháng
          <input className="min-h-10 rounded-lg border border-[var(--border)] bg-white px-3" type="month" name="month" defaultValue={window.month}/>
        </label>
        <label className="grid gap-1 text-sm font-bold">Địa điểm
          <Select name="location" defaultValue={p.location || ""}><option value="">Tất cả</option>{locations.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
        </label>
        <label className="grid gap-1 text-sm font-bold">Loại khí / hàng
          <Select name="product" defaultValue={p.product || ""}><option value="">Tất cả</option>{products.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
        </label>
        <button className="min-h-10 rounded-lg border border-[var(--border)] bg-white px-4 font-bold text-[var(--brand-deep)]" type="submit">Áp dụng bộ lọc</button>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
        <CalendarDays size={15}/><strong>Kỳ báo cáo:</strong> {periodLabel}
        {window.isCurrentMonth ? <Badge tone="info">Tính đến hôm nay, không tính ngày tương lai</Badge> : null}
      </div>
    </Card>

    <nav className="flex gap-2 overflow-x-auto rounded-xl border border-[var(--border)] bg-white p-2 text-sm font-bold">
      <a className="whitespace-nowrap rounded-lg bg-[var(--brand)] px-3 py-2 text-white" href="#tong-quan">Tổng quan</a>
      <a className="whitespace-nowrap rounded-lg px-3 py-2 text-[var(--brand-deep)] hover:bg-[var(--paper)]" href="#mua-khi">Chi phí mua khí</a>
      <a className="whitespace-nowrap rounded-lg px-3 py-2 text-[var(--brand-deep)] hover:bg-[var(--paper)]" href="#thue-vo">Thuê vỏ theo ngày</a>
      <a className="whitespace-nowrap rounded-lg px-3 py-2 text-[var(--brand-deep)] hover:bg-[var(--paper)]" href="#xl45">Thuê XL-45</a>
      <a className="whitespace-nowrap rounded-lg px-3 py-2 text-[var(--brand-deep)] hover:bg-[var(--paper)]" href="#van-chuyen">Vận chuyển</a>
      <a className="whitespace-nowrap rounded-lg px-3 py-2 text-[var(--brand-deep)] hover:bg-[var(--paper)]" href="#tong-hop">Tổng hợp</a>
    </nav>

    <section id="tong-quan" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <CostCard title="Tiền mua khí" value={goodsCost} subtitle={`${pct(goodsCost, totalCost)} tổng chi phí`} icon={<Droplets size={21}/>} />
      <CostCard title="Thuê vỏ" value={rentalCost} subtitle={`${pct(rentalCost, totalCost)} tổng chi phí`} icon={<PackageOpen size={21}/>} tone="success" />
      <CostCard title="Thuê XL-45" value={xl45Cost} subtitle={`${pct(xl45Cost, totalCost)} tổng chi phí`} icon={<ReceiptText size={21}/>} tone="warning" />
      <CostCard title="Vận chuyển" value={transportCost} subtitle={`${transportRows.length} chuyến hoàn tất`} icon={<Truck size={21}/>} tone="neutral" />
      <div className="rounded-xl border border-[var(--brand)] bg-[var(--brand-deep)] p-4 text-white">
        <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-extrabold uppercase tracking-wide text-white/75">Tổng chi phí kỳ</div><div className="mt-2 font-mono-data text-xl font-extrabold">{formatCurrency(totalCost)}</div><div className="mt-1 text-xs text-white/70">Trước VAT</div></div><CircleDollarSign size={24}/></div>
      </div>
    </section>

    {(missingGoodsPrice > 0 || missingRentalPriceDays > 0) ? <div className="status-danger flex items-start gap-2 rounded-xl border p-3 text-sm">
      <AlertTriangle className="mt-0.5 shrink-0" size={18}/><span>Cần kiểm tra đơn giá: {missingGoodsPrice} dòng mua khí và {missingRentalPriceDays} ngày thuê vỏ đang thiếu giá. Các khoản thiếu giá được hiển thị 0 đ, không âm thầm ước tính.</span>
    </div> : null}

    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <div className="flex items-center gap-2"><BarChart3 size={18} className="text-[var(--brand)]"/><CardTitle>Cơ cấu chi phí</CardTitle></div>
        <div className="mt-5 grid gap-4">
          {[
            ["Mua khí", goodsCost, "var(--brand)"],
            ["Thuê vỏ", rentalCost, "var(--success)"],
            ["Thuê XL-45", xl45Cost, "var(--warning)"],
            ["Vận chuyển", transportCost, "var(--neutral)"],
          ].map(([label, value, color]) => <div key={String(label)}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm"><strong>{label}</strong><span className="font-mono-data">{formatCurrency(Number(value))} · {pct(Number(value), totalCost)}</span></div>
            <div className="h-3 overflow-hidden rounded-full bg-[var(--muted)]"><div className="h-full rounded-full" style={{ width: `${totalCost ? Math.max(0, (Number(value) / totalCost) * 100) : 0}%`, backgroundColor: String(color) }}/></div>
          </div>)}
        </div>
      </Card>

      <Card>
        <CardTitle>Top loại khí có tiền mua cao nhất</CardTitle>
        <div className="mt-4 grid gap-3">
          {goodsSummary.slice(0, 5).map((row) => <div key={row.product_id} className="grid grid-cols-[minmax(90px,150px)_1fr_auto] items-center gap-3 text-sm">
            <strong className="truncate">{row.product_name}</strong>
            <div className="h-3 overflow-hidden rounded-full bg-[var(--muted)]"><div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${(row.amount / maxProductGoods) * 100}%` }}/></div>
            <span className="font-mono-data font-bold">{formatCurrency(row.amount)}</span>
          </div>)}
          {!goodsSummary.length ? <div className="text-sm text-[var(--muted-foreground)]">Chưa có giao dịch mua khí hoàn tất trong kỳ.</div> : null}
        </div>
      </Card>
    </div>

    <Card>
      <CardTitle>Xu hướng chi phí · 6 tháng gần nhất</CardTitle>
      <div className="mt-4 grid gap-3">
        {trend.map((row) => <div key={row.month} className="grid grid-cols-[72px_1fr_120px] items-center gap-3 text-xs">
          <strong>{row.month.slice(5, 7)}/{row.month.slice(0, 4)}</strong>
          <div className="flex h-5 overflow-hidden rounded-md bg-[var(--muted)]" style={{ width: `${Math.max(4, (row.total / maxTrend) * 100)}%` }}>
            {row.total > 0 ? <>
              <div style={{ width: `${(row.goods / row.total) * 100}%`, backgroundColor: "var(--brand)" }}/>
              <div style={{ width: `${(row.cylinder / row.total) * 100}%`, backgroundColor: "var(--success)" }}/>
              <div style={{ width: `${(row.xl45 / row.total) * 100}%`, backgroundColor: "var(--warning)" }}/>
              <div style={{ width: `${(row.transport / row.total) * 100}%`, backgroundColor: "var(--neutral)" }}/>
            </> : null}
          </div>
          <span className="text-right font-mono-data font-bold">{formatCurrency(row.total)}</span>
        </div>)}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--muted-foreground)]"><span>■ Mua khí</span><span className="text-[var(--success)]">■ Thuê vỏ</span><span className="text-[var(--warning)]">■ XL-45</span><span className="text-[var(--neutral)]">■ Vận chuyển</span></div>
    </Card>

    <section id="tong-hop"><Card className="overflow-hidden p-0">
      <div className="border-b border-[var(--border)] p-4 md:p-5"><CardTitle>Chi phí theo từng loại</CardTitle><p className="mt-1 text-xs text-[var(--muted-foreground)]">Vận chuyển là chi phí theo chuyến nên không phân bổ giả định vào từng loại khí.</p></div>
      <div className="overflow-x-auto"><table className="mobile-card-table w-full text-sm">
        <thead className="bg-[var(--muted)]"><tr><th className="p-3 text-left">Loại</th><th className="p-3 text-right">Mua khí</th><th className="p-3 text-right">Thuê vỏ</th><th className="p-3 text-right">Thuê XL-45</th><th className="p-3 text-right">Cộng theo loại</th></tr></thead>
        <tbody>{productCosts.map((row) => <tr key={row.product_id} className="border-t border-[var(--border)]"><td data-label="Loại" className="p-3"><strong>{row.name}</strong><div className="text-xs text-[var(--muted-foreground)]">{row.code}</div></td><td data-label="Mua khí" className="p-3 text-right font-mono-data">{formatCurrency(row.goods)}</td><td data-label="Thuê vỏ" className="p-3 text-right font-mono-data">{formatCurrency(row.cylinder)}</td><td data-label="Thuê XL-45" className="p-3 text-right font-mono-data">{formatCurrency(row.xl45)}</td><td data-label="Cộng theo loại" className="p-3 text-right font-mono-data font-extrabold text-[var(--brand-deep)]">{formatCurrency(row.total)}</td></tr>)}</tbody>
        <tfoot><tr className="border-t-2 border-[var(--brand)] bg-[var(--paper)]"><td className="p-3 font-extrabold">Vận chuyển (không phân bổ)</td><td/><td/><td/><td className="p-3 text-right font-mono-data font-extrabold">{formatCurrency(transportCost)}</td></tr><tr className="bg-[var(--brand-deep)] text-white"><td className="p-3 font-extrabold">TỔNG CHI PHÍ</td><td/><td/><td/><td className="p-3 text-right font-mono-data text-base font-extrabold">{formatCurrency(totalCost)}</td></tr></tfoot>
      </table></div>
    </Card></section>

    <section id="mua-khi"><Card className="overflow-hidden p-0">
      <div className="border-b border-[var(--border)] p-4 md:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>Chi phí mua khí</CardTitle><p className="mt-1 text-sm text-[var(--muted-foreground)]">Tính theo số lượng PHC đã xác nhận × đơn giá có hiệu lực tại ngày giao. Giá đã chốt trên phiếu được ưu tiên.</p></div><div className="text-right"><div className="text-xs font-bold uppercase text-[var(--muted-foreground)]">Tổng mua khí</div><div className="font-mono-data text-xl font-extrabold text-[var(--brand-deep)]">{formatCurrency(goodsCost)}</div></div></div></div>
      <div className="overflow-x-auto"><table className="mobile-card-table w-full text-sm"><thead className="bg-[var(--muted)]"><tr><th className="p-3 text-left">Loại khí</th><th className="p-3 text-right">SL thực nhận</th><th className="p-3 text-right">Đơn giá</th><th className="p-3 text-right">Thành tiền</th><th className="p-3 text-left">Kiểm tra</th></tr></thead><tbody>{goodsSummary.map((row) => <tr key={row.product_id} className="border-t border-[var(--border)]"><td data-label="Loại khí" className="p-3"><strong>{row.product_name}</strong><div className="text-xs text-[var(--muted-foreground)]">{row.product_code} · {row.unit}</div></td><td data-label="SL thực nhận" className="p-3 text-right font-mono-data">{formatNumber(row.quantity)}</td><td data-label="Đơn giá" className="p-3 text-right font-mono-data">{moneyRange(row.min_unit_price, row.max_unit_price)}</td><td data-label="Thành tiền" className="p-3 text-right font-mono-data font-extrabold">{formatCurrency(row.amount)}</td><td data-label="Kiểm tra" className="p-3">{row.missing_price_lines ? <Badge tone="danger">Thiếu giá {row.missing_price_lines} dòng</Badge> : <Badge tone="success">Đủ đơn giá</Badge>}</td></tr>)}</tbody></table></div>
      <details className="border-t border-[var(--border)]"><summary className="cursor-pointer p-4 font-bold text-[var(--brand)]">Xem chi tiết từng phiếu mua khí ({goodsRows.length} dòng)</summary><div className="overflow-x-auto px-4 pb-4"><table className="mobile-card-table w-full text-xs"><thead className="bg-[var(--paper)]"><tr><th className="p-2 text-left">Ngày</th><th className="p-2 text-left">Phiếu</th><th className="p-2 text-left">Loại</th><th className="p-2 text-left">Địa điểm</th><th className="p-2 text-right">SL</th><th className="p-2 text-right">Đơn giá</th><th className="p-2 text-right">Thành tiền</th></tr></thead><tbody>{goodsRows.map((r, i) => <tr key={`${r.delivery_code}-${r.product_id}-${i}`} className="border-t border-[var(--border)]"><td data-label="Ngày" className="p-2">{shortDate(r.delivery_date)}</td><td data-label="Phiếu" className="p-2 font-mono-data">{r.delivery_code}</td><td data-label="Loại" className="p-2">{r.product_name}</td><td data-label="Địa điểm" className="p-2">{r.destination}</td><td data-label="SL" className="p-2 text-right font-mono-data">{formatNumber(r.quantity)} {r.unit}</td><td data-label="Đơn giá" className="p-2 text-right font-mono-data">{formatCurrency(r.unit_price)}</td><td data-label="Thành tiền" className="p-2 text-right font-mono-data font-bold">{formatCurrency(r.amount)}</td></tr>)}</tbody></table></div></details>
    </Card></section>

    <section id="thue-vo"><Card className="overflow-hidden p-0">
      <div className="border-b border-[var(--border)] p-4 md:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>Thuê vỏ theo từng loại khí · {window.month}</CardTitle><p className="mt-1 max-w-3xl text-sm text-[var(--muted-foreground)]">Mỗi ngày lấy số vỏ cuối ngày của từng loại khí. Tổng tiền = Σ (vỏ cuối ngày × đơn giá thuê của ngày đó).</p></div><div className="text-right"><div className="text-xs font-bold uppercase text-[var(--muted-foreground)]">Tổng thuê vỏ</div><div className="font-mono-data text-xl font-extrabold text-[var(--brand-deep)]">{formatCurrency(rentalCost)}</div></div></div><div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--paper)] p-3 text-xs text-[var(--muted-foreground)]"><Info size={16} className="mt-0.5 shrink-0 text-[var(--brand)]"/><span>Chỉ giao/trả với NCC làm thay đổi tổng vỏ thuê. Kho ↔ Nhóm và Nhà máy ↔ Mỏ chỉ đổi vị trí giữ vỏ. Tháng hiện tại chỉ tính đến <strong>{shortDate(window.asOfDate)}</strong>.</span></div></div>
      <div className="overflow-x-auto"><table className="mobile-card-table w-full text-sm"><thead className="bg-[var(--muted)]"><tr><th className="p-3 text-left">Loại khí</th><th className="p-3 text-right">Vỏ cuối ngày đầu kỳ</th><th className="p-3 text-right">Vỏ cuối hiện tại/kỳ</th><th className="p-3 text-right">Tổng vỏ-ngày</th><th className="p-3 text-right">Đơn giá/ngày</th><th className="p-3 text-right">Thành tiền</th></tr></thead><tbody>{rentalSummary.map((row) => <tr key={row.product_id} className="border-t border-[var(--border)]"><td data-label="Loại khí" className="p-3"><strong>{row.product_name}</strong><div className="text-xs text-[var(--muted-foreground)]">{row.product_code}</div></td><td data-label="Vỏ cuối ngày đầu kỳ" className="p-3 text-right font-mono-data">{formatNumber(row.opening_qty)}</td><td data-label="Vỏ cuối hiện tại/kỳ" className="p-3 text-right font-mono-data">{formatNumber(row.closing_qty)}</td><td data-label="Tổng vỏ-ngày" className="p-3 text-right font-mono-data font-bold">{formatNumber(row.bottle_days)}</td><td data-label="Đơn giá/ngày" className="p-3 text-right font-mono-data">{moneyRange(row.unit_price_from, row.unit_price_to)}</td><td data-label="Thành tiền" className="p-3 text-right font-mono-data font-extrabold">{formatCurrency(row.rental_amount)}</td></tr>)}</tbody></table></div>
      <details className="border-t border-[var(--border)]"><summary className="cursor-pointer p-4 font-bold text-[var(--brand)]">Xem chi tiết vỏ theo từng ngày</summary><div className="overflow-x-auto px-4 pb-4"><table className="mobile-card-table w-full text-xs"><thead className="bg-[var(--paper)]"><tr><th className="p-2 text-left">Ngày</th><th className="p-2 text-left">Loại khí</th><th className="p-2 text-right">NCC giao</th><th className="p-2 text-right">Trả NCC</th><th className="p-2 text-right">Tăng/giảm</th><th className="p-2 text-right">Vỏ cuối ngày</th><th className="p-2 text-right">Tiền ngày</th></tr></thead><tbody>{rentalDaily.filter((r) => r.held_qty !== 0 || r.supplier_in !== 0 || r.supplier_out !== 0).map((r) => <tr key={`${r.day}-${r.product_id}`} className="border-t border-[var(--border)]"><td data-label="Ngày" className="p-2">{shortDate(r.day)}</td><td data-label="Loại khí" className="p-2"><strong>{r.product_name}</strong></td><td data-label="NCC giao" className="p-2 text-right font-mono-data">{formatNumber(r.supplier_in)}</td><td data-label="Trả NCC" className="p-2 text-right font-mono-data">{formatNumber(r.supplier_out)}</td><td data-label="Tăng/giảm" className="p-2 text-right font-mono-data">{r.net_change > 0 ? "+" : ""}{formatNumber(r.net_change)}</td><td data-label="Vỏ cuối ngày" className="p-2 text-right font-mono-data font-bold">{formatNumber(r.held_qty)}</td><td data-label="Tiền ngày" className="p-2 text-right font-mono-data font-bold">{formatCurrency(r.rental_amount)}</td></tr>)}</tbody></table></div></details>
    </Card></section>

    <section id="xl45"><Card className="overflow-hidden p-0"><div className="border-b border-[var(--border)] p-4 md:p-5"><div className="flex flex-wrap justify-between gap-3"><div><CardTitle>Thuê / lưu bồn XL-45</CardTitle><p className="mt-1 text-sm text-[var(--muted-foreground)]">Miễn 15 ngày; từ ngày thứ 16 tính theo bồn-ngày và đơn giá có hiệu lực từng ngày.</p></div><div className="font-mono-data text-xl font-extrabold text-[var(--brand-deep)]">{formatCurrency(xl45Cost)}</div></div></div><div className="overflow-x-auto"><table className="mobile-card-table w-full text-sm"><thead className="bg-[var(--muted)]"><tr><th className="p-3 text-left">Loại</th><th className="p-3 text-right">Bồn-ngày tính phí</th><th className="p-3 text-right">Thành tiền</th></tr></thead><tbody>{xl45Summary.map((r) => <tr key={r.product_id} className="border-t border-[var(--border)]"><td data-label="Loại" className="p-3"><strong>{r.product_name}</strong><div className="text-xs text-[var(--muted-foreground)]">{r.product_code}</div></td><td data-label="Bồn-ngày tính phí" className="p-3 text-right font-mono-data">{formatNumber(r.bon_days)}</td><td data-label="Thành tiền" className="p-3 text-right font-mono-data font-extrabold">{formatCurrency(r.amount)}</td></tr>)}</tbody></table></div></Card></section>

    <section id="van-chuyen"><Card className="overflow-hidden p-0"><div className="border-b border-[var(--border)] p-4 md:p-5"><div className="flex flex-wrap justify-between gap-3"><div><CardTitle>Cước vận chuyển</CardTitle><p className="mt-1 text-sm text-[var(--muted-foreground)]">Một chuyến giao + gom vỏ cùng mã chuyến chỉ tính một cước; chuyến có vào Mỏ áp dụng cước Mỏ.</p></div><div className="font-mono-data text-xl font-extrabold text-[var(--brand-deep)]">{formatCurrency(transportCost)}</div></div></div><div className="overflow-x-auto"><table className="mobile-card-table w-full text-sm"><thead className="bg-[var(--muted)]"><tr><th className="p-3 text-left">Ngày</th><th className="p-3 text-left">Mã chuyến</th><th className="p-3 text-left">Loại chuyến</th><th className="p-3 text-right">Đơn giá</th><th className="p-3 text-right">Thành tiền</th></tr></thead><tbody>{transportRows.map((r) => <tr key={r.trip_code} className="border-t border-[var(--border)]"><td data-label="Ngày" className="p-3">{shortDate(r.trip_date)}</td><td data-label="Mã chuyến" className="p-3 font-mono-data">{r.trip_code}</td><td data-label="Loại chuyến" className="p-3">{r.trip_kind === "mine" ? "Mỏ Tà Thiết" : r.trip_kind === "co2_liquid" ? "CO₂ lỏng chuyên dụng" : "Nhà máy"}</td><td data-label="Đơn giá" className="p-3 text-right font-mono-data">{formatCurrency(r.unit_price)}</td><td data-label="Thành tiền" className="p-3 text-right font-mono-data font-extrabold">{formatCurrency(r.amount)}</td></tr>)}</tbody></table></div></Card></section>

    <div className="flex items-start gap-2 rounded-xl border border-[var(--border)] bg-white p-4 text-xs text-[var(--muted-foreground)]"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-[var(--success)]"/><span><strong>Nguyên tắc đối soát:</strong> mua khí lấy số thực nhận PHC; thuê vỏ lấy số vỏ cuối từng ngày; XL-45 tính bồn-ngày sau 15 ngày miễn phí; vận chuyển tính theo mã chuyến. Không phân bổ cước vận chuyển vào từng loại khí nếu chưa có quy tắc phân bổ chính thức.</span></div>
  </div>;
}
