import Link from "next/link";
import {
  AlertTriangle, ArrowLeftRight, Boxes, CheckCircle2, ClipboardCheck, Clock3,
  FileSpreadsheet, Handshake, MessageCircleWarning, Repeat2, RotateCcw, Settings,
  Truck, UsersRound, Warehouse
} from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GroupQuickPanel } from "@/components/group-quick-panel";
import { DeliveryCreateForm } from "@/components/forms/delivery-create-form";
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
  return <div className="grid gap-5">
    <RoleHeading kicker="Nhà cung cấp" title={profile.full_name || "NCC"} subtitle="Tạo phiếu giao và theo dõi tiến độ xác nhận." icon={<Truck size={24}/>}/>
    <section className="role-metrics three"><RoleMetric icon={<Clock3/>} label="Chờ XSC" value={pendingXsc}/><RoleMetric icon={<ClipboardCheck/>} label="Chờ PHC" value={pendingPhc}/><RoleMetric icon={<CheckCircle2/>} label="Hoàn tất" value={completed} tone="success"/></section>
    <Card className="role-card"><div className="flex items-center justify-between gap-3"><div><CardTitle>Tạo phiếu giao</CardTitle><p className="mt-1 text-sm text-[var(--muted-foreground)]">Một phiếu có thể giao nhiều loại khí và nhiều địa điểm.</p></div><Badge tone="info">{stats.monthDeliveries} phiếu tháng</Badge></div><div className="mt-4"><DeliveryCreateForm products={products as any} locations={locations as any} today={toDateInput()}/></div></Card>
    <Card className="role-card"><div className="flex items-center justify-between"><CardTitle>Phiếu gần đây</CardTitle><Link href="/deliveries" className="text-sm font-bold text-[var(--brand)]">Xem tất cả →</Link></div><div className="mt-4 grid gap-2">{recent.map((d:any)=><div key={d.id} className="role-list-row"><div><div className="font-mono-data font-extrabold text-[var(--brand)]">{d.delivery_code}</div><div className="mt-1 text-xs text-[var(--muted-foreground)]">{String(d.delivery_date).slice(0,10)} · {d.trip_code || "Chưa có mã chuyến"}</div></div><Badge tone={d.status === "completed" ? "success" : d.status === "feedback" ? "danger" : "warning"}>{deliveryStatus(d.status)}</Badge></div>)}{!recent.length?<EmptyMini text="Chưa có phiếu giao."/>:null}</div></Card>
  </div>;
}

async function StorekeeperHome({ profile }: { profile: Profile }) {
  const [data, requests] = await Promise.all([getDashboardData(profile), listInternalRequests(profile)]);
  const warehouse = onlyPositive(data.inventory.filter((x)=>x.point_kind === "warehouse"));
  const active = requests.filter((r:any)=>["pending","approved"].includes(r.status));
  const countType = (type:string) => active.filter((r:any)=>r.request_type===type).length;
  const discrepancies = requests.filter((r:any)=>Array.isArray(r.items)&&r.items.some((i:any)=>i.actual_qty!=null&&Number(i.actual_qty)!==Number(i.requested_qty))).length;
  return <div className="grid gap-5">
    <RoleHeading kicker="Kho Hậu cần" title="Thủ kho Hậu cần" subtitle="Xử lý yêu cầu nhanh và cập nhật tồn theo số lượng thực tế." icon={<Warehouse size={24}/>}/>
    <section className="role-metrics four"><RoleMetric icon={<Repeat2/>} label="Đổi chờ xử lý" value={countType("exchange")}/><RoleMetric icon={<Handshake/>} label="Mượn chờ xử lý" value={countType("borrow")} tone="success"/><RoleMetric icon={<RotateCcw/>} label="Trả chờ xử lý" value={countType("return")} tone="warning"/><RoleMetric icon={<MessageCircleWarning/>} label="Có chênh lệch" value={discrepancies}/></section>
    <WarehouseBlock rows={warehouse}/>
    <section className="role-grid-2"><Card className="role-card"><div className="flex items-center justify-between"><CardTitle>Phiếu chờ xử lý</CardTitle><Badge tone="warning">{active.length} phiếu</Badge></div><div className="mt-4 grid gap-2">{active.slice(0,6).map((r:any)=><RequestMini key={r.id} r={r}/>) }{!active.length?<EmptyMini text="Không có phiếu đang chờ."/>:null}</div><Link className="role-primary-link mt-4" href="/internal">Mở danh sách xử lý</Link></Card><QuickActions items={[{href:"/internal",label:"Xử lý Đổi",icon:<Repeat2/>},{href:"/internal",label:"Xử lý Mượn",icon:<Handshake/>},{href:"/internal",label:"Nhận Trả",icon:<RotateCcw/>}]}/></section>
  </div>;
}

async function WarehouseManagerHome({ profile }: { profile: Profile }) {
  const [data, requests] = await Promise.all([getDashboardData(profile), listInternalRequests(profile)]);
  const warehouse = onlyPositive(data.inventory.filter((x)=>x.point_kind === "warehouse"));
  const review = requests.filter((r:any)=>r.status === "executed_pending_review");
  const pendingBorrow = requests.filter((r:any)=>r.request_type === "borrow" && r.status === "pending");
  const discrepancies = review.filter((r:any)=>Array.isArray(r.items)&&r.items.some((i:any)=>i.actual_qty!=null&&Number(i.actual_qty)!==Number(i.requested_qty)));
  return <div className="grid gap-5">
    <RoleHeading kicker="Kho Hậu cần" title="Trưởng kho Hậu cần" subtitle="Duyệt, kiểm soát chênh lệch và theo dõi tồn kho." icon={<ClipboardCheck size={24}/>}/>
    <section className="role-metrics four"><RoleMetric icon={<Clock3/>} label="Phiếu cần duyệt" value={review.length + pendingBorrow.length}/><RoleMetric icon={<MessageCircleWarning/>} label="Phiếu chênh lệch" value={discrepancies.length} tone="warning"/><RoleMetric icon={<AlertTriangle/>} label="Tồn thấp" value={data.lowStock.length} tone="danger"/><RoleMetric icon={<CheckCircle2/>} label="Đã xử lý" value={requests.filter((r:any)=>r.status==="completed").length} tone="success"/></section>
    <section className="role-grid-2"><WarehouseBlock rows={warehouse} compact/><Card className="role-card"><div className="flex items-center justify-between"><CardTitle>Phiếu cần duyệt</CardTitle><Link href="/internal" className="text-sm font-bold text-[var(--brand)]">Xem tất cả →</Link></div><div className="mt-4 grid gap-2">{[...review,...pendingBorrow].slice(0,5).map((r:any)=><RequestMini key={r.id} r={r} showActual/>)}{!review.length&&!pendingBorrow.length?<EmptyMini text="Không có phiếu cần duyệt."/>:null}</div></Card></section>
    <QuickActions items={[{href:"/internal",label:"Duyệt phiếu",icon:<ClipboardCheck/>},{href:"/inventory",label:"Xem tồn",icon:<Warehouse/>},{href:"/deliveries",label:"Giao nhận NCC",icon:<Truck/>},{href:"/reports",label:"Xem chi phí",icon:<FileSpreadsheet/>}]}/>
  </div>;
}

async function WorkshopHome({ profile }: { profile: Profile }) {
  const [data, transfers, deliveries, internal] = await Promise.all([getDashboardData(profile), listTransfers(), listDeliveries(profile), listInternalRequests(profile)]);
  const warehouseQty = sum(data.inventory.filter((x)=>x.point_kind==="warehouse"), "total_qty");
  const mineQty = sum(data.inventory.filter((x)=>x.point_code==="GRP-COI"), "total_qty");
  const groupQty = sum(data.inventory.filter((x)=>x.point_kind==="group"&&x.point_code!=="GRP-COI"), "total_qty");
  const system = warehouseQty + mineQty + groupQty;
  const pending = transfers.filter((t:any)=>t.status==="feedback").length + deliveries.filter((d:any)=>["pending","feedback","phc_pending"].includes(d.status)).length + internal.filter((r:any)=>["pending","executed_pending_review","feedback"].includes(r.status)).length;
  return <div className="grid gap-5">
    <RoleHeading kicker="Điều phối và theo dõi" title="Workshop" subtitle="Một màn hình để nắm tồn, điều chuyển, giao nhận và các phiếu cần xử lý." icon={<ArrowLeftRight size={24}/>}/>
    <section className="role-metrics five"><RoleMetric icon={<Boxes/>} label="Tổng vỏ toàn hệ thống" value={formatNumber(system)}/><RoleMetric icon={<Warehouse/>} label="Kho Hậu cần" value={formatNumber(warehouseQty)} tone="success"/><RoleMetric icon={<Boxes/>} label="Mỏ Tà Thiết" value={formatNumber(mineQty)} tone="warning"/><RoleMetric icon={<UsersRound/>} label="Các nhóm" value={formatNumber(groupQty)}/><RoleMetric icon={<AlertTriangle/>} label="Phiếu cần xử lý" value={pending} tone={pending?"danger":undefined}/></section>
    <section className="role-grid-2"><Card className="role-card"><div className="flex items-center justify-between"><CardTitle>Điều phối tổng thể</CardTitle><Link href="/inventory" className="text-sm font-bold text-[var(--brand)]">Xem tồn chi tiết →</Link></div><div className="mt-4 grid gap-2">{aggregateProducts(data.inventory).slice(0,6).map((r)=><div key={r.product_name} className="role-list-row"><div className="font-bold">{r.product_name}</div><div className="grid grid-cols-3 gap-4 text-right text-xs"><div><span className="text-[var(--muted-foreground)]">Nhà máy</span><div className="font-mono-data text-base font-extrabold text-[var(--success)]">{formatNumber(r.plant)}</div></div><div><span className="text-[var(--muted-foreground)]">Mỏ</span><div className="font-mono-data text-base font-extrabold text-[var(--warning)]">{formatNumber(r.mine)}</div></div><div><span className="text-[var(--muted-foreground)]">Nhóm</span><div className="font-mono-data text-base font-extrabold text-[var(--brand)]">{formatNumber(r.groups)}</div></div></div></div>)}</div></Card><Card className="role-card"><div className="flex items-center justify-between"><CardTitle>Hoạt động gần đây</CardTitle><Badge tone="info">Theo thời gian</Badge></div><div className="mt-4 grid gap-2">{transfers.slice(0,3).map((t:any)=><div key={t.id} className="role-list-row"><div><div className="font-bold">Điều chuyển {t.direction==="plant_to_mine"?"Nhà máy → Mỏ":"Mỏ → Nhà máy"}</div><div className="mt-1 text-xs text-[var(--muted-foreground)]">{t.transfer_code} · {String(t.transfer_date).slice(0,10)}</div></div><Badge tone={t.status==="feedback"?"danger":"success"}>{t.status==="feedback"?"Có phản hồi":"Hoàn tất"}</Badge></div>)}{deliveries.slice(0,2).map((d:any)=><div key={d.id} className="role-list-row"><div><div className="font-bold">Giao nhận NCC</div><div className="mt-1 text-xs text-[var(--muted-foreground)]">{d.delivery_code} · {String(d.delivery_date).slice(0,10)}</div></div><Badge tone={d.status==="completed"?"success":"warning"}>{deliveryStatus(d.status)}</Badge></div>)}</div></Card></section>
    <QuickActions items={[{href:"/transfers",label:"Tạo điều chuyển",icon:<ArrowLeftRight/>},{href:"/inventory",label:"Xem tồn",icon:<Warehouse/>},{href:"/deliveries",label:"Giao nhận NCC",icon:<Truck/>},{href:"/reports",label:"Báo cáo chi phí",icon:<FileSpreadsheet/>}]}/>
  </div>;
}

async function MineHome({ profile }: { profile: Profile }) {
  const [data, transfers] = await Promise.all([getDashboardData(profile), listTransfers()]);
  const mine = onlyPositive(data.inventory.filter((x)=>x.point_code === "GRP-COI"));
  const incoming = transfers.filter((t:any)=>t.direction === "plant_to_mine");
  const feedback = transfers.filter((t:any)=>t.status === "feedback").length;
  return <div className="grid gap-5">
    <RoleHeading kicker="Theo dõi và phản hồi" title="XSC Mỏ Tà Thiết" subtitle="Nắm số chai tại Mỏ, xem lệnh từ Nhà máy và tạo điều chuyển về Nhà máy." icon={<Boxes size={24}/>}/>
    <section className="role-metrics four"><RoleMetric icon={<Boxes/>} label="Số chai tại Mỏ" value={formatNumber(sum(mine,"total_qty"))} tone="success"/><RoleMetric icon={<ClipboardCheck/>} label="Lệnh từ Nhà máy" value={incoming.length}/><RoleMetric icon={<MessageCircleWarning/>} label="Có phản hồi" value={feedback} tone="warning"/><RoleMetric icon={<CheckCircle2/>} label="Đã cập nhật tồn" value={incoming.filter((x:any)=>x.status==="completed").length} tone="success"/></section>
    <section className="role-grid-2"><Card className="role-card"><CardTitle>Số chai tại Mỏ</CardTitle><div className="mt-4 grid gap-2">{mine.map((r)=><GasMini key={r.product_code} row={r} mine/>) }{!mine.length?<EmptyMini text="Chưa có số chai tại Mỏ."/>:null}</div></Card><Card className="role-card"><div className="flex items-center justify-between"><CardTitle>Lệnh từ Nhà máy</CardTitle><Link href="/transfers" className="text-sm font-bold text-[var(--brand)]">Xem tất cả →</Link></div><div className="mt-4 grid gap-2">{incoming.slice(0,5).map((t:any)=><div key={t.id} className="role-list-row"><div><div className="font-mono-data font-extrabold text-[var(--brand)]">{t.transfer_code}</div><div className="mt-1 text-xs text-[var(--muted-foreground)]">{String(t.transfer_date).slice(0,10)}</div></div><Badge tone={t.status==="feedback"?"danger":"success"}>{t.status==="feedback"?"Có phản hồi":"Đã cập nhật tồn"}</Badge></div>)}{!incoming.length?<EmptyMini text="Chưa có lệnh từ Nhà máy."/>:null}</div></Card></section>
    <QuickActions items={[{href:"/transfers",label:"Tạo điều chuyển về NM",icon:<ArrowLeftRight/>},{href:"/inventory",label:"Xem số chai",icon:<Boxes/>},{href:"/deliveries",label:"Xác nhận giao Mỏ",icon:<Truck/>},{href:"/reports",label:"Báo cáo",icon:<FileSpreadsheet/>}]}/>
  </div>;
}

async function ManagementHome({ profile }: { profile: Profile }) {
  const today = toDateInput();
  const start = `${today.slice(0,7)}-01`;
  const window = getDateRangeWindow(start,today);
  const [data, goods, cylinder, xl45, transport, deliveries, internal] = await Promise.all([
    getDashboardData(profile),
    getGoodsCostDetails({startDate:window.startDate,endDateExclusive:window.dataEndExclusive}),
    getCylinderRentalDaily({startDate:window.startDate,endDateExclusive:window.dataEndExclusive}),
    getXL45RentalDaily({startDate:window.startDate,endDateExclusive:window.dataEndExclusive}),
    getTransportCostDetails({startDate:window.startDate,endDateExclusive:window.dataEndExclusive}),
    listDeliveries(profile),listInternalRequests(profile)
  ]);
  const goodsCost=sumAmount(goods,"amount"), cylinderCost=sumAmount(cylinder,"rental_amount"), xl45Cost=sumAmount(xl45,"rental_amount"), transportCost=sumAmount(transport,"amount");
  const warehouseQty = sum(data.inventory.filter((x)=>x.point_kind==="warehouse"),"total_qty");
  const mineQty = sum(data.inventory.filter((x)=>x.point_code==="GRP-COI"),"total_qty");
  const total = sum(data.inventory,"total_qty");
  return <div className="grid gap-5">
    <RoleHeading kicker="Chỉ xem" title="Ban quản đốc" subtitle="Tổng quan tồn, cảnh báo, chi phí và phiếu gần đây." icon={<UsersRound size={24}/>}/>
    <section className="role-metrics four"><RoleMetric icon={<Boxes/>} label="Tổng vỏ NCC" value={formatNumber(total)} tone="success"/><RoleMetric icon={<Warehouse/>} label="Kho Hậu cần" value={formatNumber(warehouseQty)}/><RoleMetric icon={<Boxes/>} label="Mỏ Tà Thiết" value={formatNumber(mineQty)} tone="warning"/><RoleMetric icon={<AlertTriangle/>} label="Cảnh báo" value={data.lowStock.length} tone={data.lowStock.length?"danger":undefined}/></section>
    <section className="role-grid-2"><WarehouseBlock rows={onlyPositive(data.inventory.filter((x)=>x.point_kind==="warehouse"))} compact/><Card className="role-card"><CardTitle>Chi phí kỳ báo cáo · {start} → {today}</CardTitle><div className="mt-4 grid grid-cols-2 gap-3"><CostTile label="Mua khí" amount={goodsCost}/><CostTile label="Thuê vỏ" amount={cylinderCost} tone="success"/><CostTile label="Thuê XL-45" amount={xl45Cost} tone="warning"/><CostTile label="Vận chuyển" amount={transportCost}/></div><div className="mt-3 rounded-xl bg-[var(--brand-deep)] p-4 text-white"><div className="text-xs font-bold uppercase text-white/65">Tổng chi phí</div><div className="font-mono-data mt-1 text-2xl font-extrabold">{formatCurrency(goodsCost+cylinderCost+xl45Cost+transportCost)}</div></div></Card></section>
    <Card className="role-card"><div className="flex items-center justify-between"><CardTitle>Phiếu gần đây</CardTitle><Badge tone="info">Theo dõi</Badge></div><div className="mt-4 grid gap-2">{deliveries.slice(0,3).map((d:any)=><div className="role-list-row" key={d.id}><div><div className="font-bold">Giao nhận NCC</div><div className="text-xs text-[var(--muted-foreground)]">{d.delivery_code} · {String(d.delivery_date).slice(0,10)}</div></div><Badge tone={d.status==="completed"?"success":"warning"}>{deliveryStatus(d.status)}</Badge></div>)}{internal.slice(0,3).map((r:any)=><RequestMini key={r.id} r={r}/>)}{!deliveries.length&&!internal.length?<EmptyMini text="Chưa có phát sinh."/>:null}</div></Card>
    <QuickActions items={[{href:"/inventory",label:"Xem tồn",icon:<Warehouse/>},{href:"/reports",label:"Xem chi phí",icon:<FileSpreadsheet/>},{href:"/deliveries",label:"Xem giao nhận",icon:<Truck/>},{href:"/internal",label:"Xem phiếu",icon:<ClipboardCheck/>}]}/>
  </div>;
}

async function AdminHome({ profile }: { profile: Profile }) {
  const [data, users, prices, products, groups] = await Promise.all([
    getDashboardData(profile),
    sql<{count:number}[]>`SELECT count(*)::int AS count FROM users WHERE active=true`,
    sql<{count:number}[]>`SELECT count(*)::int AS count FROM price_rules`,
    sql<{count:number}[]>`SELECT count(*)::int AS count FROM products WHERE active=true`,
    sql<{count:number}[]>`SELECT count(*)::int AS count FROM work_groups WHERE active=true`,
  ]);
  return <div className="grid gap-5">
    <RoleHeading kicker="Thiết lập và quản lý" title="Quản trị hệ thống" subtitle="Tài khoản, đơn giá, ngưỡng tồn, ngày nghỉ và danh mục." icon={<Settings size={24}/>}/>
    <section className="role-metrics four"><RoleMetric icon={<UsersRound/>} label="Tài khoản hoạt động" value={users[0]?.count ?? 0}/><RoleMetric icon={<FileSpreadsheet/>} label="Phiên bản đơn giá" value={prices[0]?.count ?? 0}/><RoleMetric icon={<Boxes/>} label="Sản phẩm" value={products[0]?.count ?? 0}/><RoleMetric icon={<Warehouse/>} label="Nhóm" value={groups[0]?.count ?? 0}/></section>
    <section className="role-admin-grid"><AdminTile href="/admin?tab=users" title="Tài khoản" text="Tạo, sửa vai trò, đơn vị và reset mật khẩu."/><AdminTile href="/admin?tab=prices" title="Đơn giá" text="Quản lý phiên bản giá có hiệu lực theo ngày."/><AdminTile href="/admin?tab=thresholds" title="Ngưỡng tồn" text={`Hiện có ${data.lowStock.length} loại đang dưới/ngang ngưỡng.`}/><AdminTile href="/admin?tab=calendar" title="Ngày nghỉ" text="Chỉ nhập ngoại lệ: ngày nghỉ/lễ hoặc ngày làm bù."/><AdminTile href="/admin?tab=master" title="Danh mục" text="Khí, nhóm, định mức và số dư đầu kỳ."/><AdminTile href="/admin?tab=audit" title="Lịch sử thao tác" text="Xem audit log, không sửa/xóa trên giao diện."/></section>
  </div>;
}

function GenericHome({ data }: { data: Awaited<ReturnType<typeof getDashboardData>> }) {
  const warehouse = onlyPositive(data.inventory.filter((x)=>x.point_kind === "warehouse"));
  return <div className="grid gap-5"><RoleHeading kicker="Quản lý khí NMBP" title="Tổng quan" subtitle="Việc cần xử lý, tồn khí và tình hình giao nhận." icon={<Boxes size={24}/>}/><section className="role-metrics four"><RoleMetric icon={<ClipboardCheck/>} label="Chờ xử lý" value={data.pendingCount}/><RoleMetric icon={<AlertTriangle/>} label="Tồn thấp" value={data.lowStock.length} tone="warning"/><RoleMetric icon={<Truck/>} label="Chuyến tháng" value={data.monthTrips}/><RoleMetric icon={<FileSpreadsheet/>} label="Cước tháng" value={formatCurrency(data.monthCost)}/></section><WarehouseBlock rows={warehouse}/></div>;
}

function RoleHeading({kicker,title,subtitle,icon}:{kicker:string;title:string;subtitle:string;icon:React.ReactNode}){return <div className="role-page-heading"><div><div className="role-kicker">{kicker}</div><h1>{title}</h1><p>{subtitle}</p></div><div className="role-title-icon">{icon}</div></div>}
function RoleMetric({icon,label,value,tone}:{icon:React.ReactNode;label:string;value:string|number;tone?:"success"|"warning"|"danger"}){return <Card className={`role-metric ${tone?`tone-${tone}`:""}`}><div className="role-metric-icon">{icon}</div><div className="min-w-0"><div className="role-metric-label">{label}</div><div className="role-metric-value">{typeof value==="number"?formatNumber(value):value}</div></div></Card>}
function WarehouseBlock({rows,compact=false}:{rows:InventoryRow[];compact?:boolean}){return <Card className={`role-card ${compact?"":""}`}><div className="flex items-center justify-between"><CardTitle>Tồn Kho Hậu cần</CardTitle><Link href="/inventory" className="text-sm font-bold text-[var(--brand)]">Xem chi tiết →</Link></div><div className="mt-4 grid gap-2">{rows.slice(0,compact?5:8).map((r)=><GasMini key={r.product_code} row={r}/>) }{!rows.length?<EmptyMini text="Kho chưa có số liệu."/>:null}</div></Card>}
function GasMini({row,mine=false}:{row:InventoryRow;mine?:boolean}){return <div className="gas-summary-row"><div><div className="font-bold">{row.product_name}</div><div className="text-[11px] text-[var(--muted-foreground)]">{row.product_code}</div></div>{mine?<div className="text-right"><div className="text-xs font-bold text-[var(--muted-foreground)]">Số chai</div><div className="font-mono-data text-xl font-extrabold text-[var(--success)]">{formatNumber(row.total_qty)}</div></div>:<><div className="text-center"><div className="text-[11px] font-bold text-[var(--success)]">Đầy</div><div className="font-mono-data text-xl font-extrabold text-[var(--success)]">{formatNumber(row.full_qty)}</div></div><div className="text-center"><div className="text-[11px] font-bold text-[var(--muted-foreground)]">Rỗng</div><div className="font-mono-data text-xl font-extrabold text-[var(--neutral)]">{formatNumber(row.empty_qty)}</div></div></>}</div>}
function RequestMini({r,showActual=false}:{r:any;showActual?:boolean}){const items=Array.isArray(r.items)?r.items:[];return <div className="role-list-row"><div className="min-w-0"><div className="font-bold">{r.group_name} · {r.request_type==="exchange"?"Đổi":r.request_type==="borrow"?"Mượn":"Trả"}</div><div className="mt-1 truncate text-xs text-[var(--muted-foreground)]">{r.request_code} · {items.length} loại khí{showActual&&items.some((i:any)=>i.actual_qty!=null)?" · đã có SL thực tế":""}</div></div><Badge tone={r.status==="completed"?"success":r.status==="feedback"?"danger":"warning"}>{internalStatus(r.status)}</Badge></div>}
function QuickActions({items}:{items:Array<{href:string;label:string;icon:React.ReactNode}>}){return <Card className="role-card"><CardTitle>Thao tác nhanh</CardTitle><div className="quick-action-grid mt-4">{items.map((x)=><Link key={x.href+x.label} href={x.href} className="quick-action-button"><span>{x.icon}</span><strong>{x.label}</strong></Link>)}</div></Card>}
function CostTile({label,amount,tone}:{label:string;amount:number;tone?:"success"|"warning"}){return <div className={`cost-tile ${tone?`tone-${tone}`:""}`}><div className="text-xs font-bold text-[var(--muted-foreground)]">{label}</div><div className="font-mono-data mt-1 text-lg font-extrabold">{formatCurrency(amount)}</div></div>}
function AdminTile({href,title,text}:{href:string;title:string;text:string}){return <Link href={href} className="admin-role-tile"><div className="flex items-center justify-between gap-3"><div className="text-lg font-extrabold text-[var(--brand-deep)]">{title}</div><Settings size={18} className="text-[var(--brand)]"/></div><p>{text}</p><span>Quản lý →</span></Link>}
function EmptyMini({text}:{text:string}){return <div className="rounded-xl bg-[var(--paper)] p-4 text-center text-sm text-[var(--muted-foreground)]">{text}</div>}
function onlyPositive(rows:InventoryRow[]){return rows.filter((x)=>Number(x.total_qty)>0||Number(x.full_qty)>0||Number(x.empty_qty)>0)}
function sum(rows:InventoryRow[],key:"total_qty"|"full_qty"|"empty_qty"){return rows.reduce((s,x)=>s+Number(x[key]||0),0)}
function sumAmount(rows:any[],key:string){return rows.reduce((s,x)=>s+Number(x[key]||0),0)}
function deliveryStatus(status:string){return status==="completed"?"Hoàn tất":status==="phc_pending"?"Chờ PHC":status==="feedback"?"Có phản hồi":"Chờ XSC"}
function internalStatus(status:string){return status==="completed"?"Hoàn tất":status==="executed_pending_review"?"Chờ duyệt":status==="approved"?"Đã duyệt":status==="feedback"?"Có phản hồi":"Chờ xử lý"}
function aggregateProducts(rows:InventoryRow[]){const map=new Map<string,{product_name:string;plant:number;mine:number;groups:number}>();for(const r of rows){if(Number(r.total_qty)<=0)continue;const x=map.get(r.product_code)||{product_name:r.product_name,plant:0,mine:0,groups:0};if(r.point_kind==="warehouse")x.plant+=Number(r.total_qty);else if(r.point_code==="GRP-COI")x.mine+=Number(r.total_qty);else if(r.point_kind==="group")x.groups+=Number(r.total_qty);map.set(r.product_code,x)}return Array.from(map.values()).sort((a,b)=>(b.plant+b.mine+b.groups)-(a.plant+a.mine+a.groups))}
