import Link from "next/link";
import {
  AlertTriangle, ArrowLeftRight, Boxes, CheckCircle2, ClipboardCheck, Clock3,
  FileSpreadsheet, Handshake, MessageCircleWarning, Repeat2, RotateCcw, Settings,
  Truck, UsersRound, Warehouse
} from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GroupQuickPanel } from "@/components/group-quick-panel";
import { DeliveryCreateForm, TransferQuickForm } from "@/components/forms/delivery-create-form";
import { requireProfile } from "@/lib/auth/session";
import { canCreateGroupRequest } from "@/lib/auth/permissions";
import { getDashboardData, getSupplierDashboard } from "@/lib/services/dashboard";
import { getGroupQuickData, listInternalRequests } from "@/lib/services/internal";
import { listDeliveries } from "@/lib/services/deliveries";
import { listTransfers } from "@/lib/services/transfers";
import { getLocations, getProducts } from "@/lib/services/catalog";
import { getCylinderRentalDaily, getDateRangeWindow, getGoodsCostDetails, getTransportCostDetails, getXL45RentalDaily } from "@/lib/services/costs";
import { formatCurrency, formatNumber, toDateInput } from "@/lib/utils";
import { sql } from "@/lib/db";
import type { InventoryRow, Profile } from "@/types/app";

export default async function DashboardPage() {
  const profile = await requireProfile();

  if (profile.role === "supplier") return <SupplierHome profile={profile}/>;
  if (["foreman","supervisor","worker"].includes(profile.role)) {
    const [data, products] = await Promise.all([getDashboardData(profile), getGroupQuickData(profile)]);
    return <GroupQuickPanel groupName={profile.group_name || "Nhóm"} products={products} canCreate={canCreateGroupRequest(profile) && profile.location_code !== "MINE"} pendingCount={data.pendingCount}/>;
  }
  if (profile.role === "storekeeper") return <StorekeeperHome profile={profile}/>;
  if (profile.role === "warehouse_manager") return <WarehouseManagerHome profile={profile}/>;
  if (profile.role === "workshop") return <WorkshopHome profile={profile}/>;
  if (profile.role === "mine_xsc") return <MineHome profile={profile}/>;
  if (profile.role === "management_board") return <ManagementHome profile={profile}/>;
  if (profile.role === "admin") return <AdminHome profile={profile}/>;

  const data = await getDashboardData(profile);
  return <GenericHome data={data}/>;
}

async function SupplierHome({ profile }: { profile: Profile }) {
  const [stats, products, locations, deliveries] = await Promise.all([getSupplierDashboard(profile), getProducts(), getLocations(), listDeliveries(profile)]);
  const recent = deliveries.slice(0, 5);
  const pendingXsc = deliveries.filter((d:any)=>d.status === "pending").length;
  const pendingPhc = deliveries.filter((d:any)=>d.status === "phc_pending").length;
  const completed = deliveries.filter((d:any)=>d.status === "completed").length;
  return <div className="exact-dashboard supplier-dashboard">
    <div className="exact-page-title"><h1>{(profile.full_name || "NCC Anh Tân").toUpperCase()}</h1><p>Tạo phiếu giao và theo dõi</p></div>
    <section className="exact-metrics three"><ExactMetric icon={<Clock3/>} label="Chờ XSC" value={pendingXsc} suffix="phiếu" tone="orange"/><ExactMetric icon={<ClipboardCheck/>} label="Chờ PHC" value={pendingPhc} suffix="phiếu" tone="blue"/><ExactMetric icon={<CheckCircle2/>} label="Hoàn tất" value={completed} suffix="phiếu" tone="green"/></section>
    <Card className="exact-card supplier-form-card"><div className="exact-card-head"><CardTitle>Tạo phiếu giao</CardTitle><Badge tone="info">{stats.monthDeliveries} phiếu tháng</Badge></div><div className="mt-4"><DeliveryCreateForm products={products as any} locations={locations as any} today={toDateInput()}/></div></Card>
    <Card className="exact-card"><div className="exact-card-head"><CardTitle>Phiếu gần đây</CardTitle><Link href="/deliveries" className="exact-link">Xem tất cả →</Link></div><div className="activity-table"><div className="activity-head supplier"><span>Mã phiếu</span><span>Ngày giao</span><span>Mã chuyến</span><span>Nơi giao</span><span>Trạng thái</span></div>{recent.map((d:any)=><div className="activity-row supplier" key={d.id}><strong className="font-mono-data text-[var(--brand)]">{d.delivery_code}</strong><span>{String(d.delivery_date).slice(0,10)}</span><span>{d.trip_code||"—"}</span><span>{d.trip_type==="mine"?"Mỏ Tà Thiết":"Nhà máy"}</span><Badge tone={d.status==="completed"?"success":d.status==="feedback"?"danger":"warning"}>{deliveryStatus(d.status)}</Badge></div>)}{!recent.length?<EmptyMini text="Chưa có phiếu giao."/>:null}</div></Card>
  </div>;
}
async function StorekeeperHome({ profile }: { profile: Profile }) {
  const [data, requests] = await Promise.all([getDashboardData(profile), listInternalRequests(profile)]);
  const warehouse = onlyPositive(data.inventory.filter((x)=>x.point_kind === "warehouse"));
  const active = requests.filter((r:any)=>["pending","approved"].includes(r.status));
  const countType = (type:string) => active.filter((r:any)=>r.request_type===type).length;
  const discrepancies = requests.filter((r:any)=>Array.isArray(r.items)&&r.items.some((i:any)=>i.actual_qty!=null&&Number(i.actual_qty)!==Number(i.requested_qty))).length;
  return <div className="exact-dashboard storekeeper-dashboard">
    <section className="exact-metrics four"><ExactMetric icon={<Boxes/>} label="Tồn đầy Kho" value={formatNumber(sum(warehouse,"full_qty"))} suffix="chai" tone="green"/><ExactMetric icon={<Boxes/>} label="Tồn rỗng Kho" value={formatNumber(sum(warehouse,"empty_qty"))} suffix="chai" tone="blue"/><ExactMetric icon={<ClipboardCheck/>} label="Phiếu chờ xử lý" value={active.length} suffix="phiếu" tone="blue"/><ExactMetric icon={<AlertTriangle/>} label="Cảnh báo tồn thấp" value={data.lowStock.length} suffix="loại khí" tone="orange"/></section>
    <WarehouseBlock rows={warehouse}/>
    <section className="storekeeper-work-grid"><Card className="exact-card"><div className="exact-card-head"><CardTitle>Phiếu chờ xử lý</CardTitle><Badge tone="warning">{active.length} phiếu</Badge></div><div className="request-tabs"><span className="active">Đổi · {countType("exchange")}</span><span>Mượn · {countType("borrow")}</span><span>Trả · {countType("return")}</span><span>Chênh lệch · {discrepancies}</span></div><div className="mt-3 grid gap-2">{active.slice(0,6).map((r:any)=><RequestMini key={r.id} r={r} showActual/>)}{!active.length?<EmptyMini text="Không có phiếu đang chờ."/>:null}</div></Card><Card className="exact-card storekeeper-action-card"><CardTitle>Thao tác xử lý</CardTitle><p className="mt-2 text-sm text-[var(--muted-foreground)]">Chọn phiếu để nhập số lượng thực tế từng loại khí. Hệ thống chỉ cập nhật theo số thực tế.</p><div className="exact-quick-grid mt-4"><ExactQuick href="/internal" label="Xử lý Đổi" icon={<Repeat2/>}/><ExactQuick href="/internal" label="Xử lý Mượn" icon={<Handshake/>}/><ExactQuick href="/internal" label="Nhận Trả" icon={<RotateCcw/>}/></div></Card></section>
  </div>;
}
async function WarehouseManagerHome({ profile }: { profile: Profile }) {
  const [data, requests] = await Promise.all([getDashboardData(profile), listInternalRequests(profile)]);
  const warehouse = onlyPositive(data.inventory.filter((x)=>x.point_kind === "warehouse"));
  const review = requests.filter((r:any)=>r.status === "executed_pending_review");
  const pendingBorrow = requests.filter((r:any)=>r.request_type === "borrow" && r.status === "pending");
  const discrepancies = review.filter((r:any)=>Array.isArray(r.items)&&r.items.some((i:any)=>i.actual_qty!=null&&Number(i.actual_qty)!==Number(i.requested_qty)));
  const queue=[...review,...pendingBorrow];
  return <div className="exact-dashboard warehouse-manager-dashboard">
    <section className="exact-metrics four"><ExactMetric icon={<Clock3/>} label="Phiếu chờ duyệt" value={queue.length} suffix="phiếu" tone="blue"/><ExactMetric icon={<MessageCircleWarning/>} label="Phiếu chênh lệch" value={discrepancies.length} suffix="phiếu" tone="orange"/><ExactMetric icon={<AlertTriangle/>} label="Tồn thấp" value={data.lowStock.length} suffix="loại khí" tone="red"/><ExactMetric icon={<ArrowLeftRight/>} label="Đổi ngoài định mức" value={pendingBorrow.length} suffix="phiếu" tone="purple"/></section>
    <section className="manager-main-grid"><div className="grid gap-4"><WarehouseBlock rows={warehouse} compact/><Card className="exact-card"><div className="exact-card-head"><CardTitle>Phiếu cần duyệt</CardTitle><Link href="/internal" className="exact-link">Xem tất cả →</Link></div><div className="activity-table"><div className="activity-head manager"><span>Mã phiếu</span><span>Người tạo</span><span>Nhóm</span><span>Loại</span><span>Trạng thái</span></div>{queue.slice(0,7).map((r:any)=><div className="activity-row manager" key={r.id}><strong className="font-mono-data text-[var(--brand)]">{r.request_code}</strong><span>{r.created_by_name||"—"}</span><span>{r.group_name}</span><span>{r.request_type==="borrow"?"Mượn":r.request_type==="exchange"?"Đổi":"Trả"}</span><Badge tone={r.status==="executed_pending_review"?"warning":"info"}>{internalStatus(r.status)}</Badge></div>)}{!queue.length?<EmptyMini text="Không có phiếu cần duyệt."/>:null}</div></Card></div><Card className="exact-card manager-detail-card"><CardTitle>Chi tiết phiếu</CardTitle>{queue[0]?<><div className="manager-detail-code">{queue[0].request_code}</div><div className="manager-meta"><span>Nhóm</span><strong>{queue[0].group_name}</strong><span>Loại</span><strong>{queue[0].request_type==="borrow"?"Mượn":queue[0].request_type==="exchange"?"Đổi":"Trả"}</strong></div><div className="manager-items">{(queue[0].items||[]).map((i:any)=><div key={i.id}><strong>{i.product_name}</strong><span>Yêu cầu {formatNumber(i.requested_qty)}</span><span>Thực tế {i.actual_qty==null?"—":formatNumber(i.actual_qty)}</span></div>)}</div><Link href="/internal" className="manager-primary">Duyệt phiếu</Link><Link href="/internal" className="manager-secondary">Phản hồi / kiểm tra lại</Link></>:<EmptyMini text="Chưa có phiếu cần duyệt."/>}</Card></section>
  </div>;
}
async function WorkshopHome({ profile }: { profile: Profile }) {
  const [data, transfers, deliveries, internal, products] = await Promise.all([
    getDashboardData(profile), listTransfers(), listDeliveries(profile), listInternalRequests(profile), getProducts()
  ]);
  const warehouseQty = sum(data.inventory.filter((x)=>x.point_kind==="warehouse"), "total_qty");
  const mineQty = sum(data.inventory.filter((x)=>x.point_code==="GRP-COI"), "total_qty");
  const groupRows = data.inventory.filter((x)=>x.point_kind==="group"&&x.point_code!=="GRP-COI");
  const groupQty = sum(groupRows, "total_qty");
  const system = warehouseQty + mineQty + groupQty;
  const groupCount = new Set(groupRows.filter((x)=>Number(x.total_qty)>0).map((x)=>x.point_code)).size;
  const pending = transfers.filter((t:any)=>t.status==="feedback").length + deliveries.filter((d:any)=>["pending","feedback","phc_pending"].includes(d.status)).length + internal.filter((r:any)=>["pending","executed_pending_review","feedback"].includes(r.status)).length;
  const eligible = products.filter((p:any)=>p.returnable_container && p.warehouse_split_full_empty);
  const recent = [
    ...transfers.slice(0,3).map((t:any)=>({id:`t-${t.id}`,code:t.transfer_code,type:"Điều chuyển",from:t.direction==="plant_to_mine"?"Nhà máy":"Mỏ Tà Thiết",to:t.direction==="plant_to_mine"?"Mỏ Tà Thiết":"Kho Hậu cần",date:String(t.transfer_date).slice(0,10),status:t.status==="feedback"?"Có phản hồi":"Hoàn tất",tone:t.status==="feedback"?"danger":"success"})),
    ...deliveries.slice(0,3).map((d:any)=>({id:`d-${d.id}`,code:d.delivery_code,type:"Giao nhận NCC",from:d.supplier_name||"NCC",to:d.trip_type==="mine"?"Mỏ Tà Thiết":"Nhà máy",date:String(d.delivery_date).slice(0,10),status:deliveryStatus(d.status),tone:d.status==="completed"?"success":d.status==="feedback"?"danger":"warning"})),
    ...internal.slice(0,3).map((r:any)=>({id:`i-${r.id}`,code:r.request_code,type:r.request_type==="exchange"?"Đổi":r.request_type==="borrow"?"Mượn":"Trả",from:r.group_name||"Nhóm",to:"Kho Hậu cần",date:String(r.created_at||"").slice(0,10),status:internalStatus(r.status),tone:r.status==="completed"?"success":r.status==="feedback"?"danger":"warning"}))
  ].slice(0,5);
  return <div className="exact-dashboard workshop-dashboard">
    <div className="exact-page-title"><h1>WORKSHOP</h1><p>Điều phối và theo dõi toàn hệ thống</p></div>
    <section className="exact-metrics five">
      <ExactMetric icon={<Boxes/>} label="Tổng vỏ NCC" value={formatNumber(system)} suffix="vỏ" tone="blue"/>
      <ExactMetric icon={<Warehouse/>} label="Kho Hậu cần" value={formatNumber(warehouseQty)} suffix="vỏ" tone="green"/>
      <ExactMetric icon={<Boxes/>} label="Mỏ Tà Thiết" value={formatNumber(mineQty)} suffix="vỏ" tone="orange"/>
      <ExactMetric icon={<UsersRound/>} label="Các nhóm" value={formatNumber(groupCount)} suffix="nhóm" tone="purple"/>
      <ExactMetric icon={<AlertTriangle/>} label="Phiếu chờ xử lý" value={formatNumber(pending)} suffix="phiếu" tone="red"/>
    </section>

    <section className="workshop-main-grid">
      <Card className="exact-card workshop-overview-card">
        <div className="exact-card-head"><CardTitle>Điều phối tổng thể</CardTitle><span className="exact-updated">Cập nhật: {new Date().toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Ho_Chi_Minh"})}</span></div>
        <div className="exact-inventory-table"><div className="exact-table-head"><span>Loại khí</span><span>Nhà máy</span><span>Mỏ</span><span>Các nhóm</span><span>Tổng toàn hệ thống</span></div>{aggregateProducts(data.inventory).slice(0,8).map((r)=><div key={r.product_name} className="exact-table-row"><strong>{r.product_name}</strong><MetricNumber value={r.plant} tone="green"/><MetricNumber value={r.mine} tone="green"/><MetricNumber value={r.groups} tone="blue"/><MetricNumber value={r.plant+r.mine+r.groups} tone="green"/></div>)}{!aggregateProducts(data.inventory).length?<EmptyMini text="Chưa có số liệu tồn."/>:null}</div>
        <div className="exact-footnote">Đơn vị: vỏ/chai theo danh mục. Nhấn vào dòng để xem chi tiết.</div>
      </Card>

      <Card className="exact-card workshop-transfer-card">
        <div className="exact-card-head"><CardTitle>Điều chuyển Nhà máy ↔ Mỏ</CardTitle><Badge tone="success">Cập nhật tồn ngay</Badge></div>
        <TransferQuickForm products={eligible as any} direction="plant_to_mine" today={toDateInput()}/>
      </Card>
    </section>

    <section className="workshop-bottom-grid">
      <Card className="exact-card">
        <div className="exact-card-head"><CardTitle>Phiếu / hoạt động gần đây</CardTitle><Link href="/internal" className="exact-link">Xem tất cả →</Link></div>
        <div className="activity-tabs"><span className="active">Tất cả</span><span>Giao nhận NCC</span><span>Điều chuyển</span><span>Mượn / Trả</span></div>
        <div className="activity-table"><div className="activity-head"><span>Mã phiếu</span><span>Loại hoạt động</span><span>Từ</span><span>Đến</span><span>Ngày tạo</span><span>Trạng thái</span></div>{recent.map((x:any)=><div className="activity-row" key={x.id}><strong className="font-mono-data">{x.code}</strong><span>{x.type}</span><span>{x.from}</span><span>{x.to}</span><span>{x.date}</span><Badge tone={x.tone as any}>{x.status}</Badge></div>)}{!recent.length?<EmptyMini text="Chưa có hoạt động gần đây."/>:null}</div>
      </Card>
      <Card className="exact-card exact-quick-card"><CardTitle>Thao tác nhanh</CardTitle><div className="exact-quick-grid"><ExactQuick href="/transfers" label="Tạo điều chuyển" icon={<ArrowLeftRight/>}/><ExactQuick href="/deliveries" label="Xem giao nhận NCC" icon={<Truck/>}/><ExactQuick href="/reports" label="Xem báo cáo chi phí" icon={<FileSpreadsheet/>}/></div></Card>
    </section>
  </div>;
}
async function MineHome({ profile }: { profile: Profile }) {
  const [data, transfers, products] = await Promise.all([getDashboardData(profile), listTransfers(), getProducts()]);
  const mine = onlyPositive(data.inventory.filter((x)=>x.point_code === "GRP-COI"));
  const incoming = transfers.filter((t:any)=>t.direction === "plant_to_mine");
  const feedback = transfers.filter((t:any)=>t.status === "feedback").length;
  const eligible = products.filter((p:any)=>p.returnable_container && p.warehouse_split_full_empty);
  return <div className="exact-dashboard mine-dashboard">
    <div className="exact-page-title"><h1>XSC MỎ TÀ THIẾT</h1><p>Theo dõi và phản hồi</p></div>
    <section className="exact-metrics four"><ExactMetric icon={<Boxes/>} label="Số chai tại Mỏ" value={formatNumber(sum(mine,"total_qty"))} suffix={`${mine.length} loại khí`} tone="green"/><ExactMetric icon={<ClipboardCheck/>} label="Lệnh từ Nhà máy" value={formatNumber(incoming.length)} suffix={`Chờ cập nhật: ${incoming.filter((x:any)=>x.status!=="completed").length}`} tone="blue"/><ExactMetric icon={<MessageCircleWarning/>} label="Phản hồi mở" value={formatNumber(feedback)} suffix="Cần xử lý" tone="orange"/><ExactMetric icon={<CheckCircle2/>} label="Lệnh đã cập nhật" value={formatNumber(incoming.filter((x:any)=>x.status==="completed").length)} suffix="Đã hoàn tất" tone="green"/></section>
    <section className="mine-three-grid">
      <Card className="exact-card"><CardTitle>Số chai tại Mỏ</CardTitle><div className="mt-4 grid gap-2">{mine.map((r)=><GasMini key={r.product_code} row={r} mine/>)}{!mine.length?<EmptyMini text="Chưa có số chai tại Mỏ."/>:null}</div></Card>
      <Card className="exact-card"><div className="exact-card-head"><CardTitle>Lệnh từ Nhà máy</CardTitle><Link href="/transfers" className="exact-link">Xem tất cả →</Link></div><div className="incoming-list">{incoming.slice(0,6).map((t:any)=><div key={t.id} className="incoming-item"><div><strong className="font-mono-data text-[var(--brand)]">{t.transfer_code}</strong><small>{String(t.transfer_date).slice(0,10)}</small></div><Badge tone={t.status==="feedback"?"danger":"info"}>{t.status==="feedback"?"Có phản hồi":"Đã cập nhật tồn"}</Badge></div>)}{!incoming.length?<EmptyMini text="Chưa có lệnh từ Nhà máy."/>:null}</div></Card>
      <Card className="exact-card mine-transfer-card"><CardTitle>Tạo điều chuyển về Nhà máy</CardTitle><div className="mt-4"><TransferQuickForm products={eligible as any} direction="mine_to_plant" today={toDateInput()}/></div></Card>
    </section>
  </div>;
}
async function ManagementHome({ profile }: { profile: Profile }) {
  const today = toDateInput(); const start = `${today.slice(0,7)}-01`; const window = getDateRangeWindow(start,today);
  const [data, goods, cylinder, xl45, transport, deliveries, internal] = await Promise.all([getDashboardData(profile),getGoodsCostDetails({startDate:window.startDate,endDateExclusive:window.dataEndExclusive}),getCylinderRentalDaily({startDate:window.startDate,endDateExclusive:window.dataEndExclusive}),getXL45RentalDaily({startDate:window.startDate,endDateExclusive:window.dataEndExclusive}),getTransportCostDetails({startDate:window.startDate,endDateExclusive:window.dataEndExclusive}),listDeliveries(profile),listInternalRequests(profile)]);
  const goodsCost=sumAmount(goods,"amount"), cylinderCost=sumAmount(cylinder,"rental_amount"), xl45Cost=sumAmount(xl45,"rental_amount"), transportCost=sumAmount(transport,"amount");
  const warehouseRows=data.inventory.filter((x)=>x.point_kind==="warehouse"), mineRows=data.inventory.filter((x)=>x.point_code==="GRP-COI");
  const warehouseQty=sum(warehouseRows,"total_qty"), mineQty=sum(mineRows,"total_qty"), total=sum(data.inventory,"total_qty");
  return <div className="exact-dashboard management-dashboard"><div className="exact-page-title"><h1>BAN QUẢN ĐỐC</h1><p>Tổng quan theo dõi</p></div><section className="exact-metrics four"><ExactMetric icon={<Boxes/>} label="Tổng vỏ NCC" value={formatNumber(total)} suffix={`Đầy: ${formatNumber(sum(warehouseRows,"full_qty"))} · Rỗng: ${formatNumber(sum(warehouseRows,"empty_qty"))}`} tone="green"/><ExactMetric icon={<Warehouse/>} label="Kho Hậu cần" value={formatNumber(warehouseQty)} suffix="vỏ" tone="blue"/><ExactMetric icon={<Boxes/>} label="Mỏ Tà Thiết" value={formatNumber(mineQty)} suffix="vỏ" tone="orange"/><ExactMetric icon={<AlertTriangle/>} label="Cảnh báo" value={data.lowStock.length} suffix="mục" tone="red"/></section><section className="management-two-grid"><WarehouseBlock rows={onlyPositive(warehouseRows)} compact/><Card className="exact-card"><CardTitle>Chi phí kỳ báo cáo</CardTitle><div className="management-cost-grid"><CostTile label="Mua khí" amount={goodsCost}/><CostTile label="Thuê vỏ" amount={cylinderCost} tone="success"/><CostTile label="Thuê XL-45" amount={xl45Cost} tone="warning"/><CostTile label="Vận chuyển" amount={transportCost}/></div><div className="management-total"><span>Tổng</span><strong>{formatCurrency(goodsCost+cylinderCost+xl45Cost+transportCost)}</strong></div></Card></section><Card className="exact-card"><div className="exact-card-head"><CardTitle>Phiếu gần đây</CardTitle><Link href="/internal" className="exact-link">Xem tất cả phiếu →</Link></div><div className="activity-table"><div className="activity-head management"><span>Mã phiếu</span><span>Loại phiếu</span><span>Đơn vị / Người yêu cầu</span><span>Thời gian</span><span>Trạng thái</span></div>{deliveries.slice(0,3).map((d:any)=><div className="activity-row management" key={d.id}><strong className="font-mono-data text-[var(--brand)]">{d.delivery_code}</strong><span>Giao nhận NCC</span><span>{d.supplier_name||"NCC"}</span><span>{String(d.delivery_date).slice(0,10)}</span><Badge tone={d.status==="completed"?"success":"warning"}>{deliveryStatus(d.status)}</Badge></div>)}{internal.slice(0,3).map((r:any)=><div className="activity-row management" key={r.id}><strong className="font-mono-data text-[var(--brand)]">{r.request_code}</strong><span>{r.request_type==="borrow"?"Mượn":r.request_type==="exchange"?"Đổi":"Trả"}</span><span>{r.group_name}</span><span>{String(r.created_at||"").slice(0,10)}</span><Badge tone={r.status==="completed"?"success":"warning"}>{internalStatus(r.status)}</Badge></div>)}</div></Card><div className="management-actions"><ExactQuick href="/inventory" label="Xem tồn" icon={<Warehouse/>}/><ExactQuick href="/reports" label="Xem chi phí" icon={<FileSpreadsheet/>}/><ExactQuick href="/internal" label="Xem phiếu" icon={<ClipboardCheck/>}/></div></div>;
}
async function AdminHome({ profile }: { profile: Profile }) {
  const [data, users, priceRows, products, groups] = await Promise.all([
    getDashboardData(profile),
    sql<any[]>`SELECT id,username,full_name,role,email,active FROM users ORDER BY created_at DESC LIMIT 6`,
    sql<any[]>`SELECT pr.id,pr.price_type,pr.unit_price::float8 AS unit_price,pr.unit,p.name AS product_name FROM price_rules pr LEFT JOIN products p ON p.id=pr.product_id ORDER BY pr.effective_from DESC LIMIT 8`,
    sql<{count:number}[]>`SELECT count(*)::int AS count FROM products WHERE active=true`,
    sql<{count:number}[]>`SELECT count(*)::int AS count FROM work_groups WHERE active=true`
  ]);
  return <div className="exact-dashboard admin-dashboard"><div className="exact-page-title"><h1>QUẢN TRỊ HỆ THỐNG</h1><p>Thiết lập và quản lý</p></div><div className="admin-tabs"><Link className="active" href="/admin?tab=users">Tài khoản</Link><Link href="/admin?tab=prices">Đơn giá</Link><Link href="/admin?tab=thresholds">Ngưỡng tồn</Link><Link href="/admin?tab=calendar">Ngày nghỉ</Link><Link href="/admin?tab=master">Danh mục</Link></div><section className="admin-exact-grid"><Card className="exact-card"><div className="exact-card-head"><CardTitle>Tài khoản</CardTitle><Link href="/admin?tab=users" className="exact-link">+ Thêm tài khoản</Link></div><div className="admin-user-grid">{users.slice(0,3).map((u:any)=><div className="admin-user-card" key={u.id}><div className="admin-user-avatar"><UsersRound size={20}/></div><strong>{u.full_name}</strong><Badge tone={u.active?"success":"neutral"}>{u.active?"Hoạt động":"Đã khóa"}</Badge><span>{u.role}</span></div>)}</div><Link href="/admin?tab=users" className="admin-dashed-button">+ Quản lý tài khoản</Link></Card><Card className="exact-card"><div className="exact-card-head"><CardTitle>Đơn giá</CardTitle><Link href="/admin?tab=prices" className="exact-link">Cập nhật →</Link></div><div className="admin-price-list">{priceRows.slice(0,6).map((r:any)=><div key={r.id}><strong>{r.product_name||r.price_type}</strong><span className="font-mono-data">{formatCurrency(r.unit_price)} / {r.unit}</span></div>)}</div></Card></section><section className="exact-metrics four"><ExactMetric icon={<UsersRound/>} label="Tài khoản" value={users.length} suffix="mới nhất" tone="blue"/><ExactMetric icon={<Boxes/>} label="Sản phẩm" value={products[0]?.count??0} suffix="đang hoạt động" tone="green"/><ExactMetric icon={<Warehouse/>} label="Nhóm" value={groups[0]?.count??0} suffix="đang hoạt động" tone="orange"/><ExactMetric icon={<AlertTriangle/>} label="Tồn thấp" value={data.lowStock.length} suffix="cần kiểm tra" tone="red"/></section></div>;
}
function ExactMetric({icon,label,value,suffix,tone="blue"}:{icon:React.ReactNode;label:string;value:string|number;suffix?:string;tone?:"blue"|"green"|"orange"|"purple"|"red"}) { return <Card className={`exact-metric tone-${tone}`}><div className="exact-metric-icon">{icon}</div><div><div className="exact-metric-label">{label}</div><div className="exact-metric-number">{value}</div>{suffix?<div className="exact-metric-suffix">{suffix}</div>:null}</div></Card> }
function MetricNumber({value,tone}:{value:number;tone:"green"|"blue"}) { return <div className={`metric-number tone-${tone}`}><strong>{formatNumber(value)}</strong><small>vỏ</small></div> }
function ExactQuick({href,label,icon}:{href:string;label:string;icon:React.ReactNode}) { return <Link href={href} className="exact-quick-button"><span>{icon}</span><strong>{label}</strong></Link> }

function GenericHome({ data }: { data: Awaited<ReturnType<typeof getDashboardData>> }) {
  const warehouse = onlyPositive(data.inventory.filter((x)=>x.point_kind === "warehouse"));
  return <div className="grid gap-5"><RoleHeading kicker="Quản lý khí NMBP" title="Tổng quan" subtitle="Việc cần xử lý, tồn khí và tình hình giao nhận." icon={<Boxes size={24}/>}/><section className="role-metrics four"><RoleMetric icon={<ClipboardCheck/>} label="Chờ xử lý" value={data.pendingCount}/><RoleMetric icon={<AlertTriangle/>} label="Tồn thấp" value={data.lowStock.length} tone="warning"/><RoleMetric icon={<Truck/>} label="Chuyến tháng" value={data.monthTrips}/><RoleMetric icon={<FileSpreadsheet/>} label="Cước tháng" value={formatCurrency(data.monthCost)}/></section><WarehouseBlock rows={warehouse}/></div>;
}

function RoleHeading({kicker,title,subtitle,icon}:{kicker:string;title:string;subtitle:string;icon:React.ReactNode}){return <div className="role-page-heading"><div><div className="role-kicker">{kicker}</div><h1>{title}</h1><p>{subtitle}</p></div><div className="role-title-icon">{icon}</div></div>}
function RoleMetric({icon,label,value,tone}:{icon:React.ReactNode;label:string;value:string|number;tone?:"success"|"warning"|"danger"}){return <Card className={`role-metric ${tone?`tone-${tone}`:""}`}><div className="role-metric-icon">{icon}</div><div className="min-w-0"><div className="role-metric-label">{label}</div><div className="role-metric-value">{typeof value==="number"?formatNumber(value):value}</div></div></Card>}
function WarehouseBlock({rows,compact=false}:{rows:InventoryRow[];compact?:boolean}){return <Card className={`role-card ${compact?"":""}`}><div className="flex items-center justify-between"><CardTitle>Tồn Kho Hậu cần</CardTitle><Link href="/inventory" className="text-sm font-bold text-[var(--brand)]">Xem chi tiết →</Link></div><div className="mt-4 grid gap-2">{rows.slice(0,compact?5:8).map((r)=><GasMini key={r.product_code} row={r}/>) }{!rows.length?<EmptyMini text="Kho chưa có số liệu."/>:null}</div></Card>}
function GasMini({row,mine=false}:{row:InventoryRow;mine?:boolean}){return <div className="gas-summary-row"><div><div className="font-bold">{row.product_name}</div><div className="text-[11px] text-[var(--muted-foreground)]">{row.product_code}</div></div>{mine?<div className="text-right"><div className="text-xs font-bold text-[var(--muted-foreground)]">Số chai</div><div className="font-mono-data text-xl font-extrabold text-[var(--success)]">{formatNumber(row.total_qty)}</div></div>:<><div className="text-center"><div className="text-[11px] font-bold text-[var(--success)]">Đầy</div><div className="font-mono-data text-xl font-extrabold text-[var(--success)]">{formatNumber(row.full_qty)}</div></div><div className="text-center"><div className="text-[11px] font-bold text-[var(--muted-foreground)]">Rỗng</div><div className="font-mono-data text-xl font-extrabold text-[var(--neutral)]">{formatNumber(row.empty_qty)}</div></div>{Number(row.unclassified_qty)>0?<div className="text-center"><div className="text-[11px] font-bold text-amber-700">Đầu kỳ</div><div className="font-mono-data text-xl font-extrabold text-amber-700">{formatNumber(row.unclassified_qty)}</div></div>:null}</>}</div>}
function RequestMini({r,showActual=false}:{r:any;showActual?:boolean}){const items=Array.isArray(r.items)?r.items:[];return <div className="role-list-row"><div className="min-w-0"><div className="font-bold">{r.group_name} · {r.request_type==="exchange"?"Đổi":r.request_type==="borrow"?"Mượn":"Trả"}</div><div className="mt-1 truncate text-xs text-[var(--muted-foreground)]">{r.request_code} · {items.length} loại khí{showActual&&items.some((i:any)=>i.actual_qty!=null)?" · đã có SL thực tế":""}</div></div><Badge tone={r.status==="completed"?"success":r.status==="feedback"?"danger":"warning"}>{internalStatus(r.status)}</Badge></div>}
function QuickActions({items}:{items:Array<{href:string;label:string;icon:React.ReactNode}>}){return <Card className="role-card"><CardTitle>Thao tác nhanh</CardTitle><div className="quick-action-grid mt-4">{items.map((x)=><Link key={x.href+x.label} href={x.href} className="quick-action-button"><span>{x.icon}</span><strong>{x.label}</strong></Link>)}</div></Card>}
function CostTile({label,amount,tone}:{label:string;amount:number;tone?:"success"|"warning"}){return <div className={`cost-tile ${tone?`tone-${tone}`:""}`}><div className="text-xs font-bold text-[var(--muted-foreground)]">{label}</div><div className="font-mono-data mt-1 text-lg font-extrabold">{formatCurrency(amount)}</div></div>}
function AdminTile({href,title,text}:{href:string;title:string;text:string}){return <Link href={href} className="admin-role-tile"><div className="flex items-center justify-between gap-3"><div className="text-lg font-extrabold text-[var(--brand-deep)]">{title}</div><Settings size={18} className="text-[var(--brand)]"/></div><p>{text}</p><span>Quản lý →</span></Link>}
function EmptyMini({text}:{text:string}){return <div className="rounded-xl bg-[var(--paper)] p-4 text-center text-sm text-[var(--muted-foreground)]">{text}</div>}
function onlyPositive(rows:InventoryRow[]){return rows.filter((x)=>Number(x.total_qty)>0||Number(x.full_qty)>0||Number(x.empty_qty)>0||Number(x.unclassified_qty)>0)}
function sum(rows:InventoryRow[],key:"total_qty"|"full_qty"|"empty_qty"){return rows.reduce((s,x)=>s+Number(x[key]||0),0)}
function sumAmount(rows:any[],key:string){return rows.reduce((s,x)=>s+Number(x[key]||0),0)}
function deliveryStatus(status:string){return status==="completed"?"Hoàn tất":status==="phc_pending"?"Chờ PHC":status==="feedback"?"Có phản hồi":"Chờ XSC"}
function internalStatus(status:string){return status==="completed"?"Hoàn tất":status==="executed_pending_review"?"Chờ duyệt":status==="approved"?"Đã duyệt":status==="feedback"?"Có phản hồi":"Chờ xử lý"}
function aggregateProducts(rows:InventoryRow[]){const map=new Map<string,{product_name:string;plant:number;mine:number;groups:number}>();for(const r of rows){if(Number(r.total_qty)<=0)continue;const x=map.get(r.product_code)||{product_name:r.product_name,plant:0,mine:0,groups:0};if(r.point_kind==="warehouse")x.plant+=Number(r.total_qty);else if(r.point_code==="GRP-COI")x.mine+=Number(r.total_qty);else if(r.point_kind==="group")x.groups+=Number(r.total_qty);map.set(r.product_code,x)}return Array.from(map.values()).sort((a,b)=>(b.plant+b.mine+b.groups)-(a.plant+a.mine+a.groups))}
