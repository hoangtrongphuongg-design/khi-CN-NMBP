import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  CalendarCheck2,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  FileSpreadsheet,
  Handshake,
  MessageCircleWarning,
  Repeat2,
  RotateCcw,
  Settings,
  Truck,
  UserRoundCog,
} from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireProfile } from "@/lib/auth/session";
import { canCreateGroupRequest } from "@/lib/auth/permissions";
import { getCostSnapshot, getDashboardData, getGroupUsageSnapshot, getRentalSnapshot } from "@/lib/services/dashboard";
import { getGroupQuickData, listInternalRequests } from "@/lib/services/internal";
import { listDeliveries } from "@/lib/services/deliveries";
import { listTransfers } from "@/lib/services/transfers";
import { formatCurrency, formatNumber, toDateInput, toDateKey } from "@/lib/utils";
import { sql } from "@/lib/db";
import type { Profile } from "@/types/app";

export default async function DashboardPage() {
  const profile = await requireProfile();

  if (profile.role === "admin") return <AdminHome/>;
  if (profile.role === "supplier") return <SupplierHome profile={profile}/>;
  if (["foreman","supervisor","worker"].includes(profile.role)) return <GroupHome profile={profile}/>;
  if (profile.role === "storekeeper") return <StorekeeperHome profile={profile}/>;
  if (profile.role === "warehouse_manager") return <WarehouseManagerHome profile={profile}/>;
  if (profile.role === "workshop") return <WorkshopHome profile={profile}/>;
  if (profile.role === "mine_xsc") return <MineHome profile={profile}/>;
  if (profile.role === "management_board") return <ManagementHome profile={profile}/>;

  const data = await getDashboardData(profile);
  return <div className="grid gap-5"><PageHeading title="Tổng quan" subtitle="Thông tin cần chú ý trong hệ thống."/><MetricGrid><Metric icon={<ClipboardCheck/>} label="Việc cần xử lý" value={data.pendingCount}/><Metric icon={<AlertTriangle/>} label="Cảnh báo" value={data.lowStock.length} tone="warning"/></MetricGrid></div>;
}

async function WorkshopHome({ profile }: { profile: Profile }) {
  const [data, deliveriesRaw, requestsRaw, transfersRaw, rental, costs] = await Promise.all([
    getDashboardData(profile), listDeliveries(profile), listInternalRequests(profile), listTransfers(), getRentalSnapshot(), getCostSnapshot(profile),
  ]);
  const deliveries = deliveriesRaw as any[];
  const requests = requestsRaw as any[];
  const transfers = transfersRaw as any[];
  const today = toDateInput();
  const todayDeliveries = deliveries.filter((d) => toDateKey(d.delivery_date) === today).length;
  const pendingXsc = deliveries.filter((d) => d.status === "pending").length;
  const borrowPending = requests.filter((r) => r.request_type === "borrow" && r.status === "pending").length;
  const reviewPending = requests.filter((r) => r.status === "executed_pending_review").length;
  const transferFeedback = transfers.filter((t:any) => t.status === "feedback").length;
  const actionTotal = pendingXsc + borrowPending + reviewPending + transferFeedback;
  const feedbackCount = deliveries.filter((d) => d.status === "feedback").length + transferFeedback;
  const alerts = data.lowStock.length + feedbackCount;

  return <div className="overview-page">
    <PageHeading title="Tổng quan" subtitle="Nhìn nhanh tình trạng hệ thống và các việc cần xử lý."/>
    <MetricGrid>
      <Metric icon={<Boxes/>} label="Vỏ chai khí CN" value={rental.totalCurrent} suffix="vỏ"/>
      <Metric icon={<Truck/>} label="Giao nhận hôm nay" value={todayDeliveries} suffix="chuyến"/>
      <Metric icon={<ClipboardCheck/>} label="Phiếu cần xử lý" value={actionTotal} suffix="phiếu"/>
      <Metric icon={<AlertTriangle/>} label="Cảnh báo" value={alerts} tone={alerts ? "warning" : "success"}/>
    </MetricGrid>
    <CostSummary costs={costs}/>
    <div className="overview-main-grid">
      <RentalPanel rental={rental}/>
      <AttentionPanel items={[
        task(pendingXsc, "Phiếu giao chờ XSC", "/deliveries?status=pending", "Xác nhận số lượng thực nhận", "info"),
        task(borrowPending, "Phiếu Mượn chờ duyệt", "/internal?type=borrow&status=pending", "Duyệt mượn trong giờ hành chính", "warning"),
        task(reviewPending, "Phiếu nội bộ chờ duyệt", "/internal?status=executed_pending_review", "Hậu kiểm số lượng thực tế", "warning"),
        task(transferFeedback, "Điều chuyển có phản hồi", "/transfers?status=feedback", "Kiểm tra sai lệch Nhà máy ↔ Mỏ", "danger"),
        task(data.lowStock.length, "Loại khí tồn thấp", "/inventory", "Cảnh báo hiển thị ngay tại Tồn Kho Hậu cần", "danger"),
      ]}/>
    </div>
    <QuickActions items={[
      { href: "/transfers", label: "Tạo điều chuyển", icon: <ArrowLeftRight/> },
      { href: "/deliveries", label: "Giao nhận NCC", icon: <Truck/> },
      { href: "/reports", label: "Xem báo cáo", icon: <FileSpreadsheet/> },
    ]}/>
    <RecentActivity deliveries={deliveries} requests={requests} transfers={transfers}/>
  </div>;
}

async function WarehouseManagerHome({ profile }: { profile: Profile }) {
  const [data, deliveriesRaw, requestsRaw, rental, costs] = await Promise.all([
    getDashboardData(profile), listDeliveries(profile), listInternalRequests(profile), getRentalSnapshot(), getCostSnapshot(profile),
  ]);
  const deliveries = deliveriesRaw as any[];
  const requests = requestsRaw as any[];
  const pendingBorrow = requests.filter((r) => r.request_type === "borrow" && r.status === "pending").length;
  const review = requests.filter((r) => r.status === "executed_pending_review").length;
  const discrepancy = requests.filter((r) => Array.isArray(r.items) && r.items.some((i:any) => i.actual_qty != null && Number(i.actual_qty) !== Number(i.requested_qty))).length;
  const phc = deliveries.filter((d) => d.status === "phc_pending").length;
  const actionTotal = pendingBorrow + review + phc;

  return <div className="overview-page">
    <PageHeading title="Tổng quan" subtitle="Duyệt, hậu kiểm và các vấn đề cần chú ý của Kho Hậu cần."/>
    <MetricGrid>
      <Metric icon={<ClipboardCheck/>} label="Phiếu cần xử lý" value={actionTotal} suffix="phiếu"/>
      <Metric icon={<MessageCircleWarning/>} label="Phiếu chênh lệch" value={discrepancy} suffix="phiếu" tone={discrepancy ? "warning" : "success"}/>
      <Metric icon={<AlertTriangle/>} label="Tồn thấp" value={data.lowStock.length} suffix="loại" tone={data.lowStock.length ? "warning" : "success"}/>
      <Metric icon={<Boxes/>} label="Vỏ chai khí CN" value={rental.totalCurrent} suffix="vỏ"/>
    </MetricGrid>
    <CostSummary costs={costs}/>
    <div className="overview-main-grid">
      <AttentionPanel items={[
        task(pendingBorrow, "Phiếu Mượn chờ duyệt", "/internal?type=borrow&status=pending", "Duyệt yêu cầu mượn", "warning"),
        task(review, "Phiếu chờ hậu kiểm", "/internal?status=executed_pending_review", "Đối chiếu yêu cầu / thực tế", "warning"),
        task(phc, "Phiếu NCC chờ PHC", "/deliveries?status=phc_pending", "Xác nhận hoàn tất giao nhận", "info"),
        task(data.lowStock.length, "Loại khí tồn thấp", "/inventory", "Mở tồn kho để kiểm tra", "danger"),
      ]}/>
      <RentalPanel rental={rental} compact/>
    </div>
    <RecentActivity deliveries={deliveries} requests={requests}/>
  </div>;
}

async function StorekeeperHome({ profile }: { profile: Profile }) {
  const [data, deliveriesRaw, requestsRaw] = await Promise.all([getDashboardData(profile), listDeliveries(profile), listInternalRequests(profile)]);
  const deliveries = deliveriesRaw as any[];
  const requests = requestsRaw as any[];
  const active = requests.filter((r) => ["pending","approved"].includes(r.status));
  const exchange = active.filter((r) => r.request_type === "exchange").length;
  const borrow = active.filter((r) => r.request_type === "borrow").length;
  const returns = active.filter((r) => r.request_type === "return").length;
  const phc = deliveries.filter((d) => d.status === "phc_pending").length;

  return <div className="overview-page">
    <PageHeading title="Tổng quan" subtitle="Chỉ hiển thị những việc cần xử lý ngay trong ca làm việc."/>
    <MetricGrid>
      <Metric icon={<Repeat2/>} label="Đổi chờ xử lý" value={exchange}/>
      <Metric icon={<Handshake/>} label="Mượn chờ xử lý" value={borrow}/>
      <Metric icon={<RotateCcw/>} label="Trả chờ nhận" value={returns}/>
      <Metric icon={<Truck/>} label="NCC chờ PHC" value={phc}/>
    </MetricGrid>
    <AttentionPanel items={[
      task(exchange, "Phiếu Đổi chờ xử lý", "/internal?type=exchange&status=pending", "Nhập số lượng thực tế và hoàn tất", "info"),
      task(borrow, "Phiếu Mượn chờ xử lý", "/internal?type=borrow", "Cấp số lượng thực tế", "info"),
      task(returns, "Phiếu Trả chờ nhận", "/internal?type=return&status=pending", "Nhận chai trả về", "info"),
      task(phc, "Phiếu NCC chờ PHC", "/deliveries?status=phc_pending", "Xác nhận hoàn tất giao nhận", "warning"),
      task(data.lowStock.length, "Loại khí tồn thấp", "/inventory", "Kiểm tra tồn đầy tại Kho", "danger"),
    ]}/>
    <QuickActions items={[
      { href: "/internal?type=exchange&status=pending", label: "Xử lý Đổi", icon: <Repeat2/> },
      { href: "/internal?type=borrow", label: "Xử lý Mượn", icon: <Handshake/> },
      { href: "/internal?type=return&status=pending", label: "Nhận Trả", icon: <RotateCcw/> },
    ]}/>
    <RecentActivity deliveries={deliveries} requests={requests}/>
  </div>;
}

async function GroupHome({ profile }: { profile: Profile }) {
  const isWorker = profile.role === "worker";
  if (isWorker) {
    const requests = await listInternalRequests(profile) as any[];
    return <div className="overview-page">
      <PageHeading title="Tổng quan" subtitle="Theo dõi hoạt động gần đây của nhóm."/>
      <RecentActivity requests={requests}/>
    </div>;
  }

  const [requestsRaw, quickProductsRaw, usage, rental] = await Promise.all([
    listInternalRequests(profile),
    getGroupQuickData(profile),
    getGroupUsageSnapshot(profile),
    getRentalSnapshot(),
  ]);
  const requests = requestsRaw as any[];
  const quickProducts = sortGroupProducts(quickProductsRaw as any[]);
  const waitingRows = requests.filter((r) => ["pending","approved","executed_pending_review"].includes(r.status));
  const feedbackRows = requests.filter((r) => r.status === "feedback");
  const partialRows = requests.filter((r) => !["completed","cancelled","rejected"].includes(r.status) && Array.isArray(r.items) && r.items.some((i:any) => i.actual_qty != null && Number(i.actual_qty) < Number(i.requested_qty)));
  const groupRows = quickProducts.filter((p:any) => Number(p.groupQty || 0) > 0);
  const warehouseRows = quickProducts.filter((p:any) => Number(p.warehouseFull || 0) !== 0 || Number(p.warehouseEmpty || 0) !== 0);
  const groupTotal = groupRows.reduce((sum:number, p:any) => sum + Number(p.groupQty || 0), 0);
  const canCreate = canCreateGroupRequest(profile) && profile.location_code !== "MINE";

  const waitingHref = taskHref(waitingRows, "/internal?status=waiting");
  const feedbackHref = taskHref(feedbackRows, "/internal?status=feedback");
  const partialHref = taskHref(partialRows, "/internal?status=active&partial=1");

  return <div className="overview-page group-role-dashboard">
    <PageHeading title="Tổng quan" subtitle={`${profile.group_name || "Nhóm"} · công việc, tồn Kho và số chai đang quản lý.`}/>

    <section className="group-task-desktop" aria-label="Tình trạng công việc của nhóm">
      <Link className="group-task-metric" href={waitingHref}><div><span>Yêu cầu đang chờ</span><strong>{formatNumber(waitingRows.length)}</strong></div><b>→</b></Link>
      <Link className={`group-task-metric${feedbackRows.length ? " is-warning" : ""}`} href={feedbackHref}><div><span>Có phản hồi</span><strong>{formatNumber(feedbackRows.length)}</strong></div><b>→</b></Link>
      <Link className={`group-task-metric${partialRows.length ? " is-warning" : ""}`} href={partialHref}><div><span>Xử lý chưa đủ</span><strong>{formatNumber(partialRows.length)}</strong></div><b>→</b></Link>
      <div className="group-task-metric is-static"><div><span>Nhóm đang quản lý</span><strong>{formatNumber(groupTotal)} <small>chai</small></strong></div><Boxes/></div>
    </section>

    <section className="group-task-mobile" aria-label="Việc cần xử lý">
      <div className="group-mobile-section-title"><strong>Việc cần xử lý</strong><span>Bấm để đi thẳng tới tác vụ</span></div>
      <div className="group-mobile-task-list">
        {waitingRows.length ? <Link href={waitingHref}><strong>{formatNumber(waitingRows.length)}</strong><span>Yêu cầu đang chờ</span><b>→</b></Link> : null}
        {feedbackRows.length ? <Link href={feedbackHref} className="is-warning"><strong>{formatNumber(feedbackRows.length)}</strong><span>Có phản hồi</span><b>→</b></Link> : null}
        {partialRows.length ? <Link href={partialHref} className="is-warning"><strong>{formatNumber(partialRows.length)}</strong><span>Xử lý chưa đủ</span><b>→</b></Link> : null}
        {!waitingRows.length && !feedbackRows.length && !partialRows.length ? <div className="group-mobile-clear"><CheckCircle2/><span>Hiện không có việc cần xử lý.</span></div> : null}
      </div>
    </section>

    {canCreate ? <QuickActions items={[
      { href: "/internal?action=exchange", label: "Đổi", icon: <Repeat2/> },
      { href: "/internal?action=borrow", label: "Mượn", icon: <Handshake/> },
      { href: "/internal?action=return", label: "Trả", icon: <RotateCcw/> },
    ]}/> : null}

    <section className="group-stock-overview-grid">
      <GroupWarehousePanel rows={warehouseRows}/>
      <GroupManagedPanel groupName={profile.group_name || "Nhóm"} rows={groupRows} total={groupTotal}/>
    </section>

    <div className="group-desktop-only">
      <GroupUsagePanel usage={usage}/>
    </div>

    <div className="group-desktop-only">
      <RentalPanel rental={rental}/>
    </div>

    <div className="group-desktop-only">
      <RecentActivity requests={requests}/>
    </div>
  </div>;
}

function taskHref(rows: any[], fallback: string) {
  return rows.length === 1 ? `/internal?focus=${rows[0].id}` : fallback;
}

const groupProductOrder: Record<string, number> = { O2: 1, CO2: 2, N2: 3, ARCO2: 4, LPG12: 5, LPG45: 6, AR: 7 };
function sortGroupProducts<T extends { code?: string }>(rows: T[]) {
  return [...rows].sort((a,b) => (groupProductOrder[String(a.code)] ?? 100) - (groupProductOrder[String(b.code)] ?? 100));
}

function GroupWarehousePanel({ rows }: { rows: any[] }) {
  return <Card className="overview-panel group-stock-panel">
    <div className="overview-panel-head"><div><CardTitle>Tồn Kho Hậu cần</CardTitle><p>Số chai đầy/rỗng hiện có để phục vụ Đổi · Mượn · Trả.</p></div></div>
    <div className="group-simple-table group-warehouse-table">
      <div className="group-simple-head"><span>Loại khí</span><span>Đầy</span><span>Rỗng</span></div>
      {rows.length ? rows.map((row:any) => <div className="group-simple-row" key={row.id}>
        <div><strong>{row.name}</strong><small>{row.code}</small></div>
        <strong className="qty-full">{formatNumber(Number(row.warehouseFull || 0))}</strong>
        <strong className="qty-empty">{formatNumber(Number(row.warehouseEmpty || 0))}</strong>
      </div>) : <div className="group-simple-empty">Chưa có số liệu tồn Kho Hậu cần.</div>}
    </div>
  </Card>;
}

function GroupManagedPanel({ groupName, rows, total }: { groupName: string; rows: any[]; total: number }) {
  return <Card className="overview-panel group-stock-panel">
    <div className="overview-panel-head"><div><CardTitle>Số chai nhóm đang quản lý</CardTitle><p>{groupName} · chỉ hiển thị tổng từng loại, không tách đầy/rỗng.</p></div><div className="group-managed-total"><strong>{formatNumber(total)}</strong><span>chai</span></div></div>
    <div className="group-simple-table group-managed-table">
      <div className="group-simple-head"><span>Loại khí</span><span>Số lượng</span></div>
      {rows.length ? rows.map((row:any) => <div className="group-simple-row" key={row.id}>
        <div><strong>{row.name}</strong><small>{row.code}</small></div>
        <strong className="qty-managed">{formatNumber(Number(row.groupQty || 0))}</strong>
      </div>) : <div className="group-simple-empty">Nhóm hiện chưa quản lý chai nào.</div>}
    </div>
  </Card>;
}

function GroupUsagePanel({ usage }: { usage: Awaited<ReturnType<typeof getGroupUsageSnapshot>> }) {
  return <Card className="overview-panel group-usage-panel">
    <div className="overview-panel-head"><div><CardTitle>Lũy kế sử dụng khí của nhóm</CardTitle><p>Tính theo số lượng thực tế của Phiếu Đổi đã hoàn tất; không cộng Mượn và Trả.</p></div></div>
    <div className="group-usage-table-wrap">
      <table className="group-usage-table"><thead><tr><th>Loại khí</th><th>Tháng này</th><th>Lũy kế từ 01/01/{usage.asOfDate.slice(0,4)}</th></tr></thead><tbody>
        {usage.rows.map((row) => <tr key={row.product_code}><td><strong>{row.product_name}</strong><small>{row.product_code}</small></td><td>{formatNumber(row.month_qty)} <span>{row.unit}</span></td><td>{formatNumber(row.year_qty)} <span>{row.unit}</span></td></tr>)}
      </tbody></table>
      {!usage.rows.length ? <div className="group-simple-empty">Chưa có Phiếu Đổi hoàn tất trong năm {usage.asOfDate.slice(0,4)}.</div> : null}
    </div>
  </Card>;
}

async function MineHome({ profile }: { profile: Profile }) {
  const [deliveriesRaw, transfersRaw] = await Promise.all([listDeliveries(profile), listTransfers()]);
  const deliveries = deliveriesRaw as any[];
  const transfers = transfersRaw as any[];
  const pendingXsc = deliveries.filter((d) => d.status === "pending" && d.items?.some((i:any) => i.location_code === "MINE")).length;
  const incoming = transfers.filter((t:any) => t.direction === "plant_to_mine" && t.status !== "feedback").length;
  const feedback = transfers.filter((t:any) => t.status === "feedback").length;
  const today = toDateInput();
  const todayCount = deliveries.filter((d) => toDateKey(d.delivery_date) === today && d.items?.some((i:any) => i.location_code === "MINE")).length;

  return <div className="overview-page">
    <PageHeading title="Tổng quan" subtitle="Các việc cần xử lý tại Mỏ Tà Thiết."/>
    <MetricGrid>
      <Metric icon={<Truck/>} label="NCC chờ XSC" value={pendingXsc}/>
      <Metric icon={<ArrowLeftRight/>} label="Điều chuyển vào Mỏ" value={incoming}/>
      <Metric icon={<MessageCircleWarning/>} label="Có phản hồi" value={feedback} tone={feedback ? "warning" : "success"}/>
      <Metric icon={<CalendarCheck2/>} label="Phát sinh hôm nay" value={todayCount}/>
    </MetricGrid>
    <AttentionPanel items={[
      task(pendingXsc, "Phiếu NCC chờ xác nhận", "/deliveries?status=pending&location=MINE", "Xác nhận số lượng thực nhận tại Mỏ", "info"),
      task(feedback, "Điều chuyển có phản hồi", "/transfers?status=feedback", "Kiểm tra sai lệch", "danger"),
    ]}/>
    <QuickActions items={[
      { href: "/deliveries?status=pending&location=MINE", label: "Xác nhận giao NCC", icon: <Truck/> },
      { href: "/transfers", label: "Điều chuyển về Nhà máy", icon: <ArrowLeftRight/> },
    ]}/>
    <RecentActivity deliveries={deliveries} transfers={transfers}/>
  </div>;
}

async function SupplierHome({ profile }: { profile: Profile }) {
  const [deliveriesRaw, rental, costs] = await Promise.all([listDeliveries(profile), getRentalSnapshot(), getCostSnapshot(profile)]);
  const deliveries = deliveriesRaw as any[];
  const pendingXsc = deliveries.filter((d) => d.status === "pending").length;
  const pendingPhc = deliveries.filter((d) => d.status === "phc_pending").length;
  const feedback = deliveries.filter((d) => d.status === "feedback").length;
  const completed = deliveries.filter((d) => d.status === "completed").length;

  return <div className="overview-page">
    <PageHeading title="Tổng quan" subtitle="Theo dõi Phiếu giao, phản hồi và số vỏ đang cho NMBP thuê."/>
    <MetricGrid>
      <Metric icon={<Clock3/>} label="Chờ XSC" value={pendingXsc}/>
      <Metric icon={<ClipboardCheck/>} label="Chờ PHC" value={pendingPhc}/>
      <Metric icon={<MessageCircleWarning/>} label="Có phản hồi" value={feedback} tone={feedback ? "warning" : "success"}/>
      <Metric icon={<CheckCircle2/>} label="Hoàn tất" value={completed}/>
    </MetricGrid>
    <CostSummary costs={costs}/>
    <div className="overview-main-grid">
      <RentalPanel rental={rental}/>
      <AttentionPanel items={[
        task(pendingXsc, "Phiếu chờ XSC", "/deliveries?status=pending", "Đang chờ xác nhận thực nhận", "info"),
        task(pendingPhc, "Phiếu chờ PHC", "/deliveries?status=phc_pending", "Đang chờ hoàn tất", "warning"),
        task(feedback, "Phiếu có phản hồi", "/deliveries?status=feedback", "Mở phiếu để xem nội dung", "danger"),
      ]}/>
    </div>
    <QuickActions items={[
      { href: "/deliveries", label: "Tạo Phiếu giao", icon: <Truck/> },
      { href: "/reports", label: "Xem báo cáo", icon: <FileSpreadsheet/> },
    ]}/>
    <RecentActivity deliveries={deliveries}/>
  </div>;
}

async function ManagementHome({ profile }: { profile: Profile }) {
  const [data, deliveriesRaw, requestsRaw, rental, costs] = await Promise.all([
    getDashboardData(profile), listDeliveries(profile), listInternalRequests(profile), getRentalSnapshot(), getCostSnapshot(profile),
  ]);
  const deliveries = deliveriesRaw as any[];
  const requests = requestsRaw as any[];
  const pending = deliveries.filter((d) => ["pending","phc_pending","feedback"].includes(d.status)).length + requests.filter((r) => !["completed","cancelled","rejected"].includes(r.status)).length;

  return <div className="overview-page">
    <PageHeading title="Tổng quan" subtitle="Góc nhìn quản lý: số vỏ thuê, chi phí và các vấn đề cần chú ý."/>
    <MetricGrid>
      <Metric icon={<Boxes/>} label="Vỏ chai khí CN" value={rental.totalCurrent} suffix="vỏ"/>
      <Metric icon={<ClipboardCheck/>} label="Phiếu đang tồn" value={pending} suffix="phiếu"/>
      <Metric icon={<AlertTriangle/>} label="Cảnh báo" value={data.lowStock.length} tone={data.lowStock.length ? "warning" : "success"}/>
    </MetricGrid>
    <CostSummary costs={costs}/>
    <div className="overview-main-grid"><RentalPanel rental={rental}/><AttentionPanel items={[
      task(data.lowStock.length, "Loại khí tồn thấp", "/inventory", "Xem trực tiếp tại Tồn Kho Hậu cần", "danger"),
      task(pending, "Phiếu đang xử lý", "/internal", "Theo dõi hoạt động vận hành", "info"),
    ]}/></div>
    <RecentActivity deliveries={deliveries} requests={requests}/>
  </div>;
}

async function AdminHome() {
  const [userRow, priceRow, notificationRow] = await Promise.all([
    sql<any[]>`SELECT count(*)::int AS total,count(*) FILTER (WHERE active)::int AS active FROM users`,
    sql<any[]>`SELECT count(*) FILTER (WHERE effective_to IS NOT NULL AND effective_to BETWEEN CURRENT_DATE AND CURRENT_DATE+interval '45 days')::int AS expiring,count(*) FILTER (WHERE effective_to<CURRENT_DATE)::int AS expired FROM price_rules`,
    sql<any[]>`SELECT count(*) FILTER (WHERE status='failed')::int AS failed,count(*) FILTER (WHERE status='pending')::int AS pending FROM notification_outbox`,
  ]);
  const users = userRow[0] || { total: 0, active: 0 };
  const prices = priceRow[0] || { expiring: 0, expired: 0 };
  const notices = notificationRow[0] || { failed: 0, pending: 0 };
  return <div className="overview-page">
    <PageHeading title="Tổng quan quản trị" subtitle="Chỉ hiển thị cấu hình và tình trạng hệ thống; không lặp dữ liệu vận hành."/>
    <MetricGrid>
      <Metric icon={<UserRoundCog/>} label="User hoạt động" value={users.active} suffix={`/ ${users.total}`}/>
      <Metric icon={<Clock3/>} label="Đơn giá sắp hết hạn" value={prices.expiring} tone={prices.expiring ? "warning" : "success"}/>
      <Metric icon={<AlertTriangle/>} label="Đơn giá đã hết hạn" value={prices.expired} tone={prices.expired ? "warning" : "success"}/>
      <Metric icon={<MessageCircleWarning/>} label="Email lỗi/chờ" value={Number(notices.failed || 0)+Number(notices.pending || 0)} tone={notices.failed ? "warning" : "success"}/>
    </MetricGrid>
    <QuickActions items={[
      { href: "/admin", label: "Quản lý user", icon: <UserRoundCog/> },
      { href: "/admin", label: "Cập nhật đơn giá", icon: <CircleDollarSign/> },
      { href: "/admin", label: "Ngưỡng tồn", icon: <AlertTriangle/> },
      { href: "/admin", label: "Lịch làm việc", icon: <Settings/> },
    ]}/>
  </div>;
}

function PageHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="overview-heading"><div><h1>{title}</h1><p>{subtitle}</p></div><div className="overview-date">Cập nhật đến {new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date())}</div></div>;
}

function MetricGrid({ children }: { children: React.ReactNode }) {
  return <section className="overview-metrics">{children}</section>;
}

function Metric({ icon, label, value, suffix, tone = "brand" }: { icon: React.ReactNode; label: string; value: string | number; suffix?: string; tone?: "brand" | "warning" | "success" }) {
  return <Card className={`overview-metric tone-${tone}`}><div className="overview-metric-icon">{icon}</div><div className="min-w-0"><div className="overview-metric-label">{label}</div><div className="overview-metric-value">{typeof value === "number" ? formatNumber(value) : value}{suffix ? <span>{suffix}</span> : null}</div></div></Card>;
}

function CostSummary({ costs }: { costs: Awaited<ReturnType<typeof getCostSnapshot>> }) {
  return <section className="cost-summary-grid">
    <Link href="/reports" className="cost-summary-card"><div className="cost-summary-icon"><CircleDollarSign/></div><div><div className="cost-summary-label">Chi phí tháng này đến hôm nay</div><div className="cost-summary-value">{formatCurrency(costs.monthTotal)}</div><div className="cost-summary-period">{dateLabel(costs.monthStart)} → {dateLabel(costs.asOfDate)}</div></div><span className="cost-summary-link">Xem báo cáo →</span></Link>
    <Link href="/reports" className="cost-summary-card"><div className="cost-summary-icon"><FileSpreadsheet/></div><div><div className="cost-summary-label">Lũy kế năm {costs.asOfDate.slice(0,4)}</div><div className="cost-summary-value">{formatCurrency(costs.yearTotal)}</div><div className="cost-summary-period">01/01 → {dateLabel(costs.asOfDate)}</div></div><span className="cost-summary-link">Xem báo cáo →</span></Link>
  </section>;
}

function RentalPanel({ rental, compact = false }: { rental: Awaited<ReturnType<typeof getRentalSnapshot>>; compact?: boolean }) {
  return <section className={`rental-group-stack${compact ? " is-compact" : ""}`} aria-label="Vỏ và bồn đang giữ của NCC">
    {rental.groups.map((group) => {
      const max = Math.max(...group.rows.map((r) => r.current_qty), 1);
      return <Card className="overview-panel rental-panel" key={group.key}>
        <div className="overview-panel-head">
          <div><CardTitle>{group.title}</CardTitle><p>Số lượng NMBP đang giữ của NCC</p></div>
          <div className="rental-total"><strong>{formatNumber(group.totalCurrent)}</strong><span>{group.unitLabel}</span></div>
        </div>
        <div className="rental-bars">
          {group.rows.length ? group.rows.map((row) => <div key={row.product_code} className="rental-row">
            <div className="rental-name"><strong>{row.product_name}</strong><span>{row.product_code}</span></div>
            <div className="rental-track"><i style={{ width: `${Math.max((row.current_qty / max) * 100, row.current_qty > 0 ? 5 : 0)}%` }}/></div>
            <div className="rental-qty">{formatNumber(row.current_qty)}</div>
          </div>) : <div className="rental-empty">Chưa có danh mục sản phẩm trong nhóm này.</div>}
        </div>
      </Card>;
    })}
  </section>;
}

type AttentionItem = { count: number; title: string; href: string; subtitle: string; tone: "info" | "warning" | "danger" };
function task(count: number, title: string, href: string, subtitle: string, tone: AttentionItem["tone"]): AttentionItem { return { count, title, href, subtitle, tone }; }

function AttentionPanel({ items }: { items: AttentionItem[] }) {
  const active = items.filter((x) => x.count > 0);
  return <Card className="overview-panel attention-panel"><div className="overview-panel-head"><div><CardTitle>Việc cần xử lý</CardTitle><p>Bấm vào từng việc để đi thẳng tới màn hình xử lý.</p></div>{active.length ? <Badge tone="warning">{active.reduce((s,x)=>s+x.count,0)} việc</Badge> : <Badge tone="success">Đã rõ</Badge>}</div>
    <div className="attention-list">{active.length ? active.map((item) => <Link href={item.href} key={item.href+item.title} className={`attention-item tone-${item.tone}`}><div className="attention-count">{formatNumber(item.count)}</div><div className="min-w-0"><strong>{item.title}</strong><span>{item.subtitle}</span></div><b>→</b></Link>) : <div className="attention-empty"><CheckCircle2/><div><strong>Không có việc tồn đọng</strong><span>Hiện chưa có tác vụ cần xử lý ngay.</span></div></div>}</div>
  </Card>;
}

function QuickActions({ items }: { items: Array<{ href: string; label: string; icon: React.ReactNode }> }) {
  return <Card className="overview-panel quick-panel"><div className="overview-panel-head"><div><CardTitle>Thao tác nhanh</CardTitle><p>Đi thẳng đến đúng nghiệp vụ, không qua màn hình trung gian.</p></div></div><div className="overview-quick-grid">{items.map((item) => <Link href={item.href} className="overview-quick" key={item.href+item.label}><span>{item.icon}</span><strong>{item.label}</strong><b>→</b></Link>)}</div></Card>;
}

function RecentActivity({ deliveries = [], requests = [], transfers = [] }: { deliveries?: any[]; requests?: any[]; transfers?: any[] }) {
  const rows = [
    ...deliveries.slice(0,5).map((d) => ({ key: `d-${d.id}`, at: new Date(d.phc_confirmed_at || `${toDateKey(d.delivery_date)}T00:00:00+07:00`).getTime(), title: `Phiếu giao ${d.delivery_code}`, meta: `${d.supplier_name || "NCC"} · ${deliveryStatus(d.status)}`, href: `/deliveries?focus=${d.id}` })),
    ...requests.slice(0,5).map((r) => ({ key: `r-${r.id}`, at: new Date(r.requested_at).getTime(), title: `${internalType(r.request_type)} · ${r.group_name}`, meta: `${r.request_code} · ${internalStatus(r.status)}`, href: `/internal?focus=${r.id}` })),
    ...transfers.slice(0,5).map((t) => ({ key: `t-${t.id}`, at: new Date(`${toDateKey(t.transfer_date)}T00:00:00+07:00`).getTime(), title: t.direction === "plant_to_mine" ? "Điều chuyển Nhà máy → Mỏ" : "Điều chuyển Mỏ → Nhà máy", meta: `${t.transfer_code} · ${t.status === "feedback" ? "Có phản hồi" : "Đã cập nhật tồn"}`, href: `/transfers?focus=${t.id}` })),
  ].sort((a,b)=>b.at-a.at).slice(0,7);
  if (!rows.length) return null;
  return <Card className="overview-panel recent-panel"><div className="overview-panel-head"><div><CardTitle>Hoạt động gần đây</CardTitle><p>Chỉ hiển thị các phát sinh mới nhất.</p></div></div><div className="recent-list">{rows.map((row) => <Link href={row.href} key={row.key} className="recent-row"><span className="recent-dot"/><div className="min-w-0"><strong>{row.title}</strong><span>{row.meta}</span></div><b>→</b></Link>)}</div></Card>;
}

function dateLabel(value: string) { const [y,m,d] = value.split("-"); return `${d}/${m}/${y}`; }
function deliveryStatus(status: string) { return status === "completed" ? "Hoàn tất" : status === "phc_pending" ? "Chờ PHC" : status === "feedback" ? "Có phản hồi" : "Chờ XSC"; }
function internalType(type: string) { return type === "exchange" ? "Đổi" : type === "borrow" ? "Mượn" : "Trả"; }
function internalStatus(status: string) { return status === "completed" ? "Hoàn tất" : status === "executed_pending_review" ? "Chờ duyệt" : status === "approved" ? "Đã duyệt" : status === "feedback" ? "Có phản hồi" : "Chờ xử lý"; }
