import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Boxes, Search, UsersRound, Warehouse } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { requireProfile } from "@/lib/auth/session";
import { getInventory } from "@/lib/services/inventory";
import { sql } from "@/lib/db";
import { formatNumber } from "@/lib/utils";
import type { InventoryRow } from "@/types/app";

type SearchParams = Promise<{ product?: string; q?: string; tab?: string }>;

function isMineRow(row: InventoryRow) {
  return row.point_code === "GRP-COI" || row.point_name.toLowerCase().includes("cối");
}

function isLow(row: InventoryRow) {
  return row.point_kind === "warehouse" && Number(row.unclassified_qty || 0) <= 0 && row.low_threshold != null && Number(row.full_qty) <= Number(row.low_threshold);
}

function productShort(code: string) {
  if (code === "O2") return "O₂";
  if (code === "CO2") return "CO₂";
  if (code === "N2") return "N₂";
  if (code === "AR") return "Ar";
  if (code === "ARCO2") return "Ar/CO₂";
  if (code === "LPG12") return "LPG12";
  if (code === "LPG45") return "LPG45";
  return code;
}

function buildGroups(rows: InventoryRow[]) {
  const map = new Map<string, { code: string; name: string; mine: boolean; rows: InventoryRow[] }>();
  for (const row of rows.filter((x) => x.point_kind === "group" && Number(x.total_qty) > 0)) {
    const current = map.get(row.point_code) || { code: row.point_code, name: row.point_name, mine: isMineRow(row), rows: [] };
    current.rows.push(row);
    map.set(row.point_code, current);
  }
  return [...map.values()].sort((a,b) => Number(a.mine)-Number(b.mine) || a.name.localeCompare(b.name, "vi"));
}

export default async function InventoryPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await requireProfile();
  if (profile.role === "supplier") redirect("/dashboard");
  const params = await searchParams;
  const tab = params.tab === "product" ? "product" : "location";
  const q = String(params.q || "").trim().toLowerCase();
  const product = String(params.product || "all");
  const allRows = await getInventory();

  const warehouseRows = allRows.filter((x) => x.point_kind === "warehouse");
  let groupRows = allRows.filter((x) => x.point_kind === "group");
  const limitedRole = ["foreman","supervisor","worker"].includes(profile.role);
  if (limitedRole) {
    const [group] = profile.group_id ? await sql<any[]>`SELECT 'GRP-'||code AS point_code FROM work_groups WHERE id=${profile.group_id}::uuid` : [];
    groupRows = group ? groupRows.filter((x) => x.point_code === group.point_code) : [];
  }

  const permittedRows = [...warehouseRows, ...groupRows];
  const productOptions = [...new Map(permittedRows.map((r) => [r.product_code, r.product_name])).entries()].sort((a,b)=>a[1].localeCompare(b[1], "vi"));
  const filtered = permittedRows.filter((row) => {
    if (product !== "all" && row.product_code !== product) return false;
    if (q && !`${row.point_name} ${row.product_name} ${row.product_code}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const warehouseVisible = warehouseRows.filter((row) => {
    const hasData = Number(row.full_qty) > 0 || Number(row.empty_qty) > 0 || Number(row.unclassified_qty) > 0;
    return hasData || isLow(row);
  }).filter((row) => product === "all" || row.product_code === product)
    .filter((row) => !q || `${row.product_name} ${row.product_code}`.toLowerCase().includes(q));

  const groups = buildGroups(filtered);
  const allPositive = filtered.filter((row) => Number(row.total_qty) > 0);
  const productsForDistribution = [...new Map(allPositive.map((row) => [row.product_code, row.product_name])).entries()]
    .map(([code,name]) => ({ code, name, rows: allPositive.filter((r) => r.product_code === code) }))
    .sort((a,b)=>a.name.localeCompare(b.name,"vi"));

  const queryForTab = (next: string) => {
    const qs = new URLSearchParams();
    if (product !== "all") qs.set("product", product);
    if (params.q) qs.set("q", params.q);
    qs.set("tab", next);
    return `/inventory?${qs.toString()}`;
  };

  return <div className="inventory-v2-page">
    <div className="inventory-v2-heading"><div><h1>Tồn khí & vỏ chai</h1><p>Kho Hậu cần xem đầy/rỗng; các nhóm chỉ theo dõi tổng số chai đang quản lý.</p></div></div>

    <Card className="inventory-warehouse-panel">
      <div className="inventory-section-head"><div><div className="inventory-section-title"><Warehouse size={20}/>Tồn Kho Hậu cần theo loại khí</div><p>Chỉ hiển thị loại có dữ liệu hoặc đang cảnh báo. Cảnh báo tồn thấp nằm ngay trên từng loại khí.</p></div></div>
      {warehouseVisible.length ? <div className="warehouse-product-grid">{warehouseVisible.map((row) => {
        const full = Number(row.full_qty || 0);
        const empty = Number(row.empty_qty || 0);
        const unclassified = Number(row.unclassified_qty || 0);
        const known = full + empty;
        const low = isLow(row);
        const fullPct = known > 0 ? (full/known)*100 : 0;
        const emptyPct = known > 0 ? (empty/known)*100 : 0;
        return <article key={row.product_code} className={`warehouse-product-card ${low ? "is-low" : ""}`}>
          <div className="warehouse-product-top"><div className="warehouse-product-name"><span>{productShort(row.product_code)}</span><div><strong>{row.product_name}</strong><small>{row.product_code}</small></div></div>{low ? <div className="warehouse-low-badge"><AlertTriangle size={14}/>Tồn thấp</div> : null}</div>
          <div className="warehouse-qty-grid"><div className="full"><span>Đầy</span><strong>{formatNumber(full)}</strong></div><div className="empty"><span>Rỗng</span><strong>{formatNumber(empty)}</strong></div><div className="total"><span>Tổng đã phân loại</span><strong>{formatNumber(known)}</strong></div></div>
          <div className="warehouse-split-bar" aria-label={`Đầy ${full}, rỗng ${empty}`}><i className="full" style={{width:`${fullPct}%`}}/><i className="empty" style={{width:`${emptyPct}%`}}/></div>
          {unclassified > 0 ? <div className="warehouse-unclassified">Đầu kỳ chưa phân loại đầy/rỗng: <strong>{formatNumber(unclassified)} {row.unit}</strong></div> : null}
          {low ? <div className="warehouse-low-note">Kho còn <strong>{formatNumber(full)} {row.unit} đầy</strong> · Ngưỡng <strong>{formatNumber(row.low_threshold || 0)}</strong></div> : null}
        </article>;
      })}</div> : <div className="inventory-empty">Kho hiện chưa có loại khí phù hợp bộ lọc.</div>}
    </Card>

    <Card className="inventory-filter-card">
      <form method="get" className="inventory-filter-form"><input type="hidden" name="tab" value={tab}/><label><span>Tìm nhanh</span><div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-3 text-[var(--muted-foreground)]"/><Input name="q" defaultValue={params.q || ""} placeholder="Nhóm hoặc loại khí..." className="pl-9"/></div></label><label><span>Loại khí</span><Select name="product" defaultValue={product}><option value="all">Tất cả loại khí</option>{productOptions.map(([code,name])=><option value={code} key={code}>{name}</option>)}</Select></label><button className="inventory-filter-button" type="submit">Áp dụng</button>{(params.q || product !== "all") ? <Link href={`/inventory?tab=${tab}`} className="inventory-reset">Xóa lọc</Link> : null}</form>
    </Card>

    <Card className="inventory-tabs-card">
      <div className="inventory-tabs"><Link href={queryForTab("location")} className={tab === "location" ? "active" : ""}>Theo vị trí / nhóm</Link><Link href={queryForTab("product")} className={tab === "product" ? "active" : ""}>Theo loại khí</Link></div>

      {tab === "location" ? <div className="group-stock-grid">{groups.length ? groups.map((group) => {
        const max = Math.max(...group.rows.map((r) => Number(r.total_qty)), 1);
        const total = group.rows.reduce((s,r)=>s+Number(r.total_qty),0);
        return <article className="group-stock-card" key={group.code}><div className="group-stock-head"><div className="group-stock-name"><UsersRound size={18}/><div><strong>{group.name}</strong><span>{group.mine ? "Mỏ Tà Thiết" : "Nhóm Nhà máy"}</span></div></div><div className="group-stock-total"><strong>{formatNumber(total)}</strong><span>chai</span></div></div><div className="group-gas-list">{group.rows.sort((a,b)=>Number(b.total_qty)-Number(a.total_qty)).map((row) => <div className="group-gas-row" key={`${group.code}-${row.product_code}`}><div className="group-gas-label"><span>{productShort(row.product_code)}</span><strong>{row.product_name}</strong></div><div className="group-gas-track"><i style={{width:`${Math.max((Number(row.total_qty)/max)*100,8)}%`}}/></div><div className="group-gas-qty">{formatNumber(row.total_qty)}</div></div>)}</div></article>;
      }) : <div className="inventory-empty">Chưa có nhóm nào đang quản lý chai khí phù hợp bộ lọc.</div>}</div> : null}

      {tab === "product" ? <div className="product-distribution-grid">{productsForDistribution.length ? productsForDistribution.map((productItem) => {
        const max = Math.max(...productItem.rows.map((r)=>Number(r.total_qty)),1);
        const total = productItem.rows.reduce((s,r)=>s+Number(r.total_qty),0);
        return <article className="product-distribution-card" key={productItem.code}><div className="product-distribution-head"><div><span>{productShort(productItem.code)}</span><div><strong>{productItem.name}</strong><small>Tổng đang quản lý: {formatNumber(total)}</small></div></div></div><div className="product-location-list">{productItem.rows.sort((a,b)=>Number(b.total_qty)-Number(a.total_qty)).map((row) => <div className="product-location-row" key={`${productItem.code}-${row.point_code}`}><div className="product-location-name">{row.point_kind === "warehouse" ? <Warehouse size={15}/> : <UsersRound size={15}/>}<span>{row.point_name}</span></div><div className="product-location-track"><i style={{width:`${Math.max((Number(row.total_qty)/max)*100,8)}%`}}/></div><strong>{formatNumber(row.total_qty)}</strong></div>)}</div></article>;
      }) : <div className="inventory-empty">Chưa có dữ liệu phân bổ phù hợp bộ lọc.</div>}</div> : null}
    </Card>
  </div>;
}
