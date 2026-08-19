import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Boxes,
  Building2,
  CircleAlert,
  FileSpreadsheet,
  Search,
  UsersRound,
  Warehouse,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/session";
import { getInventory, getInventoryTotals } from "@/lib/services/inventory";
import { sql } from "@/lib/db";
import { formatNumber } from "@/lib/utils";
import type { InventoryRow } from "@/types/app";

type SearchParams = Promise<{
  place?: string;
  product?: string;
  status?: string;
  q?: string;
  tab?: string;
}>;

type ProductOverview = {
  product_code: string;
  product_name: string;
  unit: string;
  warehouse: number;
  groups: number;
  mine: number;
  total: number;
};

function isMineRow(row: InventoryRow) {
  return row.point_code === "GRP-COI" || row.point_name.toLowerCase().includes("cối");
}

function rowStatus(row: InventoryRow) {
  if (row.point_kind !== "warehouse") return "managed";
  if (row.low_threshold != null && Number(row.full_qty) <= Number(row.low_threshold)) return "low";
  return "normal";
}

function statusLabel(status: string) {
  if (status === "low") return "Tồn thấp";
  if (status === "normal") return "Bình thường";
  return "Đang quản lý";
}

function statusTone(status: string): "warning" | "success" | "info" | "neutral" {
  if (status === "low") return "warning";
  if (status === "normal") return "success";
  return "neutral";
}

function productAccent(code: string) {
  if (code === "O2") return "bg-blue-600";
  if (code === "CO2") return "bg-slate-500";
  if (code === "N2") return "bg-emerald-600";
  if (code === "AR") return "bg-cyan-600";
  if (code.startsWith("LPG")) return "bg-orange-500";
  return "bg-[var(--brand)]";
}

function productMark(code: string) {
  if (code === "O2") return "O₂";
  if (code === "CO2") return "CO₂";
  if (code === "N2") return "N₂";
  if (code === "AR") return "Ar";
  if (code.startsWith("LPG")) return "Gas";
  return code.slice(0, 4);
}

function buildOverview(rows: InventoryRow[], totals: any[]): ProductOverview[] {
  return totals.map((t: any) => {
    const productRows = rows.filter((r) => r.product_code === t.product_code);
    const warehouse = productRows.filter((r) => r.point_kind === "warehouse").reduce((s, r) => s + Number(r.total_qty || 0), 0);
    const mine = productRows.filter((r) => r.point_kind === "group" && isMineRow(r)).reduce((s, r) => s + Number(r.total_qty || 0), 0);
    const groups = productRows.filter((r) => r.point_kind === "group" && !isMineRow(r)).reduce((s, r) => s + Number(r.total_qty || 0), 0);
    return {
      product_code: t.product_code,
      product_name: t.product_name,
      unit: t.unit,
      warehouse,
      groups,
      mine,
      total: warehouse + groups + mine,
    };
  }).filter((x) => x.total > 0);
}

function buildPointSummary(rows: InventoryRow[]) {
  const map = new Map<string, { point_code: string; point_name: string; point_kind: InventoryRow["point_kind"]; rows: InventoryRow[] }>();
  for (const row of rows) {
    const item = map.get(row.point_code) ?? { point_code: row.point_code, point_name: row.point_name, point_kind: row.point_kind, rows: [] };
    item.rows.push(row);
    map.set(row.point_code, item);
  }
  return [...map.values()].map((item) => {
    const activeRows = item.rows.filter((r) => Number(r.total_qty) !== 0 || (r.point_kind === "warehouse" && r.low_threshold != null));
    const nonZero = activeRows.filter((r) => Number(r.total_qty) > 0);
    const main = [...nonZero].sort((a, b) => Number(b.total_qty) - Number(a.total_qty))[0];
    const full = item.rows.reduce((s, r) => s + Number(r.full_qty || 0), 0);
    const empty = item.rows.reduce((s, r) => s + Number(r.empty_qty || 0), 0);
    const total = item.rows.reduce((s, r) => s + Number(r.total_qty || 0), 0);
    const lowRows = item.rows.filter((r) => rowStatus(r) === "low");
    return {
      ...item,
      activeRows,
      gasLabel: nonZero.length === 0 ? "—" : nonZero.length === 1 ? nonZero[0].product_name : `${nonZero.length} loại khí`,
      mainProduct: main?.product_name ?? "—",
      full,
      empty,
      total,
      lowRows,
      status: lowRows.length ? "low" : item.point_kind === "warehouse" ? "normal" : "managed",
    };
  }).sort((a, b) => {
    const rank = (x: typeof a) => x.point_kind === "warehouse" ? 1 : isMineRow(x.rows[0] ?? ({} as InventoryRow)) ? 3 : x.point_kind === "group" ? 2 : 4;
    return rank(a) - rank(b) || a.point_name.localeCompare(b.point_name, "vi");
  });
}

export default async function InventoryPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await requireProfile();
  if (profile.role === "supplier") redirect("/dashboard");

  const p = await searchParams;
  const allRows = await getInventory();
  const limitedRole = ["foreman", "supervisor", "worker"].includes(profile.role);
  const totals = limitedRole ? [] : await getInventoryTotals();

  let permittedRows = allRows;
  if (limitedRole) {
    const [g] = profile.group_id ? await sql`SELECT 'GRP-'||code AS point_code FROM work_groups WHERE id=${profile.group_id}::uuid` : [];
    permittedRows = g ? allRows.filter((x) => x.point_code === g.point_code) : [];
  }

  const q = (p.q || "").trim().toLowerCase();
  const place = p.place || "all";
  const product = p.product || "all";
  const status = p.status || "all";
  const tab = ["location", "product", "warning"].includes(p.tab || "") ? p.tab! : "location";

  const filteredRows = permittedRows.filter((row) => {
    if (place === "warehouse" && row.point_kind !== "warehouse") return false;
    if (place === "groups" && (row.point_kind !== "group" || isMineRow(row))) return false;
    if (place === "mine" && !isMineRow(row)) return false;
    if (product !== "all" && row.product_code !== product) return false;
    if (status !== "all" && rowStatus(row) !== status) return false;
    if (q && !`${row.point_name} ${row.product_name} ${row.product_code}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const overview = buildOverview(permittedRows, totals);
  const pointSummary = buildPointSummary(filteredRows);
  const warehouseRows = permittedRows.filter((r) => r.point_kind === "warehouse");
  const lowRows = warehouseRows.filter((r) => rowStatus(r) === "low");
  const warehouseFull = warehouseRows.reduce((s, r) => s + Number(r.full_qty || 0), 0);
  const warehouseEmpty = warehouseRows.reduce((s, r) => s + Number(r.empty_qty || 0), 0);
  const groupTotal = permittedRows.filter((r) => r.point_kind === "group" && !isMineRow(r)).reduce((s, r) => s + Number(r.total_qty || 0), 0);
  const groupCount = new Set(permittedRows.filter((r) => r.point_kind === "group" && !isMineRow(r) && Number(r.total_qty) > 0).map((r) => r.point_code)).size;
  const mineTotal = permittedRows.filter((r) => r.point_kind === "group" && isMineRow(r)).reduce((s, r) => s + Number(r.total_qty || 0), 0);
  const systemTotal = overview.reduce((s, r) => s + r.total, 0);

  const o2Warehouse = permittedRows.find((r) => r.point_kind === "warehouse" && r.product_code === "O2");
  const o2GroupRows = permittedRows.filter((r) => r.point_kind === "group" && r.product_code === "O2");
  const o2TopGroup = [...o2GroupRows].sort((a, b) => Number(b.total_qty) - Number(a.total_qty))[0];
  const co2Total = overview.find((r) => r.product_code === "CO2");

  const productOptions = [...new Map(permittedRows.map((r) => [r.product_code, r.product_name])).entries()].sort((a, b) => a[1].localeCompare(b[1], "vi"));
  const tabHref = (nextTab: string) => {
    const query = new URLSearchParams();
    if (place !== "all") query.set("place", place);
    if (product !== "all") query.set("product", product);
    if (status !== "all") query.set("status", status);
    if (p.q) query.set("q", p.q);
    query.set("tab", nextTab);
    return `/inventory?${query.toString()}`;
  };

  if (limitedRole) {
    return <div className="grid gap-5">
      <div><h1 className="font-display m-0 text-2xl text-[var(--brand-deep)]">Tồn khí của nhóm</h1><p className="mt-1 text-sm text-[var(--muted-foreground)]">Theo dõi số chai nhóm đang quản lý theo từng loại khí.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filteredRows.filter((r) => Number(r.total_qty) > 0).map((row) => <Card key={`${row.point_code}-${row.product_code}`} className="flex items-center justify-between gap-4"><div><div className="text-xs font-bold text-[var(--muted-foreground)]">{row.product_name}</div><div className="mt-2 text-3xl font-extrabold text-[var(--brand-deep)]">{formatNumber(row.total_qty)} <span className="text-sm font-bold text-[var(--muted-foreground)]">{row.unit}</span></div></div><div className={`flex h-12 w-12 items-center justify-center rounded-full text-xs font-extrabold text-white ${productAccent(row.product_code)}`}>{productMark(row.product_code)}</div></Card>)}</div>
    </div>;
  }

  return <div className="grid gap-5">
    <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
      <div><h1 className="font-display m-0 text-2xl text-[var(--brand-deep)] md:text-3xl">Tồn khí & vỏ chai</h1><p className="mt-1 text-sm text-[var(--muted-foreground)]">Nhìn nhanh tồn Kho, phân bổ theo các nhóm Nhà máy và Mỏ Tà Thiết.</p></div>
      <Link href="/reports" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-4 py-2 font-bold text-white hover:bg-[var(--brand-hover)]"><FileSpreadsheet size={18}/>Xuất Excel</Link>
    </div>

    <Card className="p-3 md:p-4">
      <form method="get" className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1.4fr_auto] xl:items-end">
        <label className="grid gap-1.5 text-xs font-bold text-[var(--neutral)]">Địa điểm<select name="place" defaultValue={place} className="min-h-11 rounded-lg border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"><option value="all">Tất cả</option><option value="warehouse">Kho Hậu cần</option><option value="groups">Các nhóm Nhà máy</option><option value="mine">Mỏ Tà Thiết</option></select></label>
        <label className="grid gap-1.5 text-xs font-bold text-[var(--neutral)]">Loại khí<select name="product" defaultValue={product} className="min-h-11 rounded-lg border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"><option value="all">Tất cả</option>{productOptions.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
        <label className="grid gap-1.5 text-xs font-bold text-[var(--neutral)]">Trạng thái<select name="status" defaultValue={status} className="min-h-11 rounded-lg border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"><option value="all">Tất cả</option><option value="low">Tồn thấp</option><option value="normal">Bình thường</option><option value="managed">Đang quản lý</option></select></label>
        <label className="grid gap-1.5 text-xs font-bold text-[var(--neutral)]">Tìm kiếm<div className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3"><Search size={17} className="text-[var(--muted-foreground)]"/><input name="q" defaultValue={p.q || ""} placeholder="Tìm vị trí / nhóm / loại khí" className="min-w-0 flex-1 border-0 bg-transparent outline-none"/></div></label>
        <button type="submit" className="min-h-11 rounded-lg border border-[var(--border)] bg-white px-4 font-bold hover:bg-[var(--muted)]">Áp dụng</button>
      </form>
    </Card>

    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <Card className="flex items-center gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[var(--brand)]"><Boxes size={22}/></div><div><div className="text-xs font-bold text-[var(--muted-foreground)]">Tổng vỏ NCC quản lý</div><div className="mt-1 text-3xl font-extrabold text-[var(--brand-deep)]">{formatNumber(systemTotal)} <span className="text-sm">chai/bồn</span></div><div className="mt-1 text-xs text-[var(--muted-foreground)]">Toàn hệ thống</div></div></Card>
      <Card className="flex items-center gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[var(--brand)]"><Warehouse size={22}/></div><div className="min-w-0"><div className="text-xs font-bold text-[var(--muted-foreground)]">Kho Hậu cần</div><div className="mt-2 flex items-end gap-4"><div><div className="text-[11px] text-[var(--muted-foreground)]">Đầy</div><div className="text-xl font-extrabold text-[var(--success)]">{formatNumber(warehouseFull)}</div></div><div className="h-8 border-l border-[var(--border)]"/><div><div className="text-[11px] text-[var(--muted-foreground)]">Rỗng</div><div className="text-xl font-extrabold text-[var(--brand)]">{formatNumber(warehouseEmpty)}</div></div></div></div></Card>
      <Card className="flex items-center gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[var(--brand)]"><UsersRound size={22}/></div><div><div className="text-xs font-bold text-[var(--muted-foreground)]">Các nhóm đang quản lý</div><div className="mt-1 text-3xl font-extrabold text-[var(--brand-deep)]">{formatNumber(groupTotal)} <span className="text-sm">chai</span></div><div className="mt-1 text-xs text-[var(--muted-foreground)]">{groupCount} nhóm có tồn</div></div></Card>
      <Card className="flex items-center gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700"><Building2 size={22}/></div><div><div className="text-xs font-bold text-[var(--muted-foreground)]">Mỏ Tà Thiết</div><div className="mt-1 text-3xl font-extrabold text-[var(--brand-deep)]">{formatNumber(mineTotal)} <span className="text-sm">chai</span></div><div className="mt-1 text-xs text-[var(--muted-foreground)]">Tồn Nhóm Cối / Mỏ</div></div></Card>
      <Card className="flex items-center gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-600"><CircleAlert size={24}/></div><div><div className="text-xs font-bold text-[var(--muted-foreground)]">Cảnh báo tồn thấp</div><div className="mt-1 text-3xl font-extrabold text-[var(--danger)]">{lowRows.length} <span className="text-sm">loại</span></div><div className="mt-1 text-xs text-[var(--muted-foreground)]">Cần kiểm tra đặt hàng</div></div></Card>
    </div>

    <Card>
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><h2 className="m-0 text-base font-extrabold">Tổng quan theo loại khí</h2><p className="mt-1 text-xs text-[var(--muted-foreground)]">Mỗi thanh cho biết chai/bồn đang nằm ở đâu trong hệ thống.</p></div><div className="flex flex-wrap gap-3 text-xs font-bold text-[var(--muted-foreground)]"><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-blue-500"/>Kho</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-500"/>Nhóm</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-violet-500"/>Mỏ Tà Thiết</span></div></div>
      <div className="grid gap-3">{overview.length ? overview.map((item) => {
        const max = Math.max(item.total, 1);
        const segments = [
          { value: item.warehouse, className: "bg-blue-500", label: "Kho" },
          { value: item.groups, className: "bg-emerald-500", label: "Nhóm" },
          { value: item.mine, className: "bg-violet-500", label: "Mỏ" },
        ];
        return <div key={item.product_code} className="grid gap-2 md:grid-cols-[220px_1fr_110px] md:items-center">
          <div className="flex items-center gap-3"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-white ${productAccent(item.product_code)}`}>{productMark(item.product_code)}</div><div className="font-bold">{item.product_name}</div></div>
          <div className="flex h-8 overflow-hidden rounded-lg bg-[var(--muted)]">{segments.map((segment) => segment.value > 0 ? <div key={segment.label} title={`${segment.label}: ${formatNumber(segment.value)}`} className={`flex min-w-[28px] items-center justify-center px-1 text-[11px] font-extrabold text-white ${segment.className}`} style={{ width: `${Math.max((segment.value / max) * 100, 4)}%` }}>{formatNumber(segment.value)}</div> : null)}</div>
          <div className="text-right text-sm font-extrabold text-[var(--brand-deep)]">{formatNumber(item.total)} <span className="text-xs font-bold text-[var(--muted-foreground)]">{item.unit}</span></div>
        </div>;
      }) : <div className="rounded-lg bg-[var(--muted)] p-6 text-center text-sm text-[var(--muted-foreground)]">Chưa có số lượng tồn để hiển thị.</div>}</div>
    </Card>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="overflow-hidden p-0">
        <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)] px-4 pt-3">
          <Link href={tabHref("location")} className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-bold ${tab === "location" ? "border-[var(--brand)] text-[var(--brand)]" : "border-transparent text-[var(--neutral)]"}`}>Theo vị trí / nhóm</Link>
          <Link href={tabHref("product")} className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-bold ${tab === "product" ? "border-[var(--brand)] text-[var(--brand)]" : "border-transparent text-[var(--neutral)]"}`}>Theo loại khí</Link>
          <Link href={tabHref("warning")} className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-bold ${tab === "warning" ? "border-[var(--brand)] text-[var(--brand)]" : "border-transparent text-[var(--neutral)]"}`}>Cảnh báo</Link>
        </div>

        {tab === "location" ? <div className="overflow-x-auto p-4"><table className="mobile-card-table w-full border-collapse text-sm"><thead className="bg-[var(--muted)]"><tr className="text-left text-xs uppercase tracking-wide text-[var(--muted-foreground)]"><th className="p-3">Vị trí / Nhóm</th><th className="p-3">Loại khí</th><th className="p-3">Đầy</th><th className="p-3">Rỗng</th><th className="p-3">Tổng</th><th className="p-3">Trạng thái</th></tr></thead><tbody>{pointSummary.map((item) => <tr key={item.point_code} className="border-t border-[var(--border)]"><td data-label="Vị trí / Nhóm" className="p-3"><div className="flex items-center gap-2 font-bold">{item.point_kind === "warehouse" ? <Warehouse size={17} className="text-[var(--brand)]"/> : <UsersRound size={17} className="text-[var(--brand)]"/>}{item.point_name}</div></td><td data-label="Loại khí" className="p-3"><div className="font-bold">{item.gasLabel}</div>{item.gasLabel !== item.mainProduct && item.mainProduct !== "—" ? <div className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">Nhiều nhất: {item.mainProduct}</div> : null}</td><td data-label="Đầy" className="p-3 font-mono-data font-bold text-[var(--success)]">{item.point_kind === "warehouse" ? formatNumber(item.full) : "—"}</td><td data-label="Rỗng" className="p-3 font-mono-data font-bold text-[var(--brand)]">{item.point_kind === "warehouse" ? formatNumber(item.empty) : "—"}</td><td data-label="Tổng" className="p-3 font-mono-data font-extrabold">{formatNumber(item.total)}</td><td data-label="Trạng thái" className="p-3"><Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>{item.lowRows.length > 1 ? <div className="mt-1 text-[11px] text-[var(--warning)]">{item.lowRows.length} loại dưới ngưỡng</div> : null}</td></tr>)}</tbody></table>{pointSummary.length === 0 ? <div className="p-6 text-center text-sm text-[var(--muted-foreground)]">Không có dữ liệu phù hợp bộ lọc.</div> : null}</div> : null}

        {tab === "product" ? <div className="grid gap-3 p-4">{filteredRows.filter((r) => Number(r.total_qty) > 0).map((row) => <div key={`${row.point_code}-${row.product_code}`} className="grid gap-3 rounded-xl border border-[var(--border)] p-4 sm:grid-cols-[1fr_180px_120px] sm:items-center"><div><div className="font-bold">{row.product_name}</div><div className="mt-1 text-xs text-[var(--muted-foreground)]">{row.point_name}</div></div><div className="text-sm"><span className="text-[var(--muted-foreground)]">Số lượng: </span><strong>{formatNumber(row.total_qty)} {row.unit}</strong></div><div className="sm:text-right"><Badge tone={statusTone(rowStatus(row))}>{statusLabel(rowStatus(row))}</Badge></div></div>)}{filteredRows.filter((r) => Number(r.total_qty) > 0).length === 0 ? <div className="p-6 text-center text-sm text-[var(--muted-foreground)]">Không có dữ liệu phù hợp bộ lọc.</div> : null}</div> : null}

        {tab === "warning" ? <div className="grid gap-3 p-4">{lowRows.map((row) => <div key={row.product_code} className="flex flex-col gap-3 rounded-xl border border-orange-200 bg-orange-50/60 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-bold text-[var(--warning)]">{row.product_name}</div><div className="mt-1 text-sm">Kho còn <strong>{formatNumber(row.full_qty)} {row.unit}</strong> đầy · Ngưỡng <strong>{formatNumber(row.low_threshold ?? 0)}</strong></div></div><Badge tone="warning">Tồn thấp</Badge></div>)}{lowRows.length === 0 ? <div className="p-6 text-center text-sm text-[var(--muted-foreground)]">Hiện không có loại khí nào dưới ngưỡng cảnh báo.</div> : null}</div> : null}
      </Card>

      <Card>
        <div className="flex items-center gap-2"><Building2 size={19} className="text-[var(--brand)]"/><h2 className="m-0 text-base font-extrabold">Nhận định nhanh</h2></div>
        <div className="mt-5 grid gap-5">
          <div className="flex gap-3"><div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${o2Warehouse && rowStatus(o2Warehouse) === "low" ? "bg-red-50 text-[var(--danger)]" : "bg-blue-50 text-[var(--brand)]"}`}><CircleAlert size={19}/></div><div className="text-sm leading-6"><strong>O₂ tại Kho Hậu cần</strong><br/>{o2Warehouse ? <>còn <strong>{formatNumber(o2Warehouse.full_qty)} chai đầy</strong>{o2Warehouse.low_threshold != null ? `, ngưỡng ${formatNumber(o2Warehouse.low_threshold)} chai.` : "."}</> : "chưa có dữ liệu tồn."}</div></div>
          <div className="flex gap-3"><div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[var(--brand)]"><UsersRound size={19}/></div><div className="text-sm leading-6"><strong>{o2TopGroup?.point_name || "Các nhóm"}</strong><br/>{o2TopGroup && Number(o2TopGroup.total_qty) > 0 ? <>đang giữ O₂ nhiều nhất với <strong>{formatNumber(o2TopGroup.total_qty)} chai</strong>.</> : "chưa có nhóm nào giữ O₂."}</div></div>
          <div className="flex gap-3"><div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><Boxes size={19}/></div><div className="text-sm leading-6"><strong>CO₂</strong><br/>{co2Total ? <>đang có <strong>{formatNumber(co2Total.total)} {co2Total.unit}</strong> tổng quản lý.</> : "chưa có số lượng tồn."}</div></div>
        </div>
        <Link href={tabHref("warning")} className="mt-6 inline-flex text-sm font-bold text-[var(--brand)] hover:underline">Xem chi tiết cảnh báo →</Link>
      </Card>
    </div>
  </div>;
}
