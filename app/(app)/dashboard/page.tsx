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
import { getAdminControlSummary } from "@/lib/services/admin";
import { getGroupQuickData, listInternalRequests } from "@/lib/services/internal";
import { listDeliveries } from "@/lib/services/deliveries";
import { listSupplierReturns } from "@/lib/services/supplier-returns";
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
  const borrowPending = requests.filter((r) => r.request_type === "borrow" && r.status === "pending").length;
  const reviewPending = requests.filter((r) => r.status === "executed_pending_review").length;
  const transferFeedback = transfers.filter((t:any) => t.status === "feedback").length;
  const actionTotal = borrowPending + reviewPending + transferFeedback;
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
  const [data, deliveriesRaw, requestsRaw, rental, costs, returnReviewRows] = await Promise.all([
    getDashboardData(profile), listDeliveries(profile), listInternalRequests(profile), getRentalSnapshot(), getCostSnapshot(profile),
    sql<any[]>`SELECT count(*) FILTER (WHERE warehouse_review_status='pending')::int AS pending,count(*) FILTER (WHERE warehouse_review_status='feedback')::int AS feedback FROM supplier_returns WHERE status<>'cancelled'`,
  ]);
  const deliveries = deliveriesRaw as any[];
  const requests = requestsRaw as any[];
  const pendingBorrow = requests.filter((r) => r.request_type === "borrow" && r.status === "pending").length;
  const review = requests.filter((r) => r.status === "executed_pending_review").length;
  const discrepancy = requests.filter((r) => Array.isArray(r.items) && r.items.some((i:any) => i.actual_qty != null && Number(i.actual_qty) !== Number(i.requested_qty))).length;
  const phc = deliveries.filter((d) => d.status === "phc_pending").length;
  const returnReview = Number(returnReviewRows[0]?.pending || 0) + Number(returnReviewRows[0]?.feedback || 0);
  const actionTotal = pendingBorrow + review + phc + returnReview;

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
        task(phc, "Phiếu NCC chờ duyệt nhận", "/deliveries?status=phc_pending", "Trưởng kho duyệt nhận hàng", "info"),
        task(returnReview, "Trả vỏ chờ hậu kiểm", "/deliveries?tab=returns", "Duyệt trả vỏ Nhà máy / Mỏ", "warning"),
        task(data.lowStock.length, "Loại khí tồn thấp", "/inventory", "Mở tồn kho để kiểm tra", "danger"),
      ]}/>
      <RentalPanel rental={rental} compact/>
    </div>
    <RecentActivity deliveries={deliveries} requests={requests}/>
  </div>;
}

async function StorekeeperHome({ profile }: { profile: Profile }) {
  const [deliveriesRaw, requestsRaw, supplierReturnsRaw] = await Promise.all([
    listDeliveries(profile),
    listInternalRequests(profile),
    listSupplierReturns(profile),
  ]);
  const deliveries = deliveriesRaw as any[];
  const requests = requestsRaw as any[];
  const supplierReturns = supplierReturnsRaw as any[];

  const active = requests.filter((r) => ["pending","approved"].includes(r.status));
  const exchangeRows = active.filter((r) => r.request_type === "exchange");
  const borrowRows = active.filter((r) => r.request_type === "borrow");
  const returnRows = active.filter((r) => r.request_type === "return");
  const internalFeedbackRows = requests.filter((r) => r.status === "feedback");
  const partialRows = requests.filter((r) => !["completed","cancelled","rejected","feedback"].includes(r.status) && Array.isArray(r.items) && r.items.some((i:any) => i.actual_qty != null && Number(i.actual_qty) < Number(i.requested_qty)));

  const plantReceiveRows = deliveries.filter((d) => (d.items || []).some((i:any) => i.location_code === "PLANT" && i.status === "pending"));
  const plantReceiveFeedbackRows = deliveries.filter((d) => (d.items || []).some((i:any) => i.location_code === "PLANT" && i.status === "feedback" && Boolean(i.confirmed_by_name)));
  const plantReturnFeedbackRows = supplierReturns.filter((r:any) => r.source_location_code === "PLANT" && (r.warehouse_review_status === "feedback" || r.status === "feedback" || (r.items || []).some((i:any) => i.status === "feedback")));
  const plantReturnOpportunityRows = deliveries.filter((d:any) => {
    if (!["pending","phc_pending"].includes(d.status)) return false;
    if (!(d.items || []).some((i:any) => i.location_code === "PLANT")) return false;
    return !supplierReturns.some((r:any) => r.trip_id === d.trip_id && r.source_location_code === "PLANT" && r.status !== "cancelled");
  });

  const correctionTotal = internalFeedbackRows.length + plantReceiveFeedbackRows.length + plantReturnFeedbackRows.length;
  const exchangeHref = taskHref(exchangeRows, "/internal?type=exchange&status=pending");
  const borrowHref = taskHref(borrowRows, "/internal?type=borrow");
  const returnHref = taskHref(returnRows, "/internal?type=return&status=pending");
  const partialHref = taskHref(partialRows, "/internal?status=active&partial=1");
  const internalFeedbackHref = taskHref(internalFeedbackRows, "/internal?status=feedback");
  const plantReceiveHref = deliveryTaskHref(plantReceiveRows, "/deliveries?action=plant_receive");
  const plantReceiveFeedbackHref = deliveryTaskHref(plantReceiveFeedbackRows, "/deliveries?action=plant_receive");
  const plantReturnHref = deliveryTaskHref(plantReturnOpportunityRows, "/deliveries?action=plant_return");
  const plantReturnFeedbackHref = plantReturnFeedbackRows.length === 1
    ? `/deliveries?tab=returns&review=feedback#return-${plantReturnFeedbackRows[0].id}`
    : "/deliveries?tab=returns&review=feedback";

  return <div className="overview-page">
    <PageHeading title="Tổng quan" subtitle="Đăng nhập là thấy ngay nhiệm vụ của Thủ kho; bấm vào để mở đúng phiếu và xử lý."/>
    <MetricGrid>
      <Metric icon={<Truck/>} label="NCC chờ nhận" value={plantReceiveRows.length}/>
      <Metric icon={<Repeat2/>} label="Đổi chờ xử lý" value={exchangeRows.length}/>
      <Metric icon={<RotateCcw/>} label="Trả chờ nhận" value={returnRows.length}/>
      <Metric icon={<MessageCircleWarning/>} label="Cần chỉnh sửa" value={correctionTotal} tone={correctionTotal ? "warning" : "success"}/>
    </MetricGrid>
    <AttentionPanel items={[
      task(plantReceiveRows.length, "NCC giao Nhà máy chờ nhận", plantReceiveHref, "Xác nhận số lượng thực nhận tại Nhà máy", "info"),
      task(exchangeRows.length, "Phiếu Đổi chờ xử lý", exchangeHref, "Nhập số lượng thực tế và hoàn tất", "info"),
      task(borrowRows.length, "Phiếu Mượn chờ xử lý", borrowHref, "Cấp số lượng thực tế", "info"),
      task(returnRows.length, "Phiếu Trả chờ nhận", returnHref, "Nhận chai trả về Kho", "info"),
      task(plantReturnOpportunityRows.length, "Trả vỏ NCC tại Nhà máy", plantReturnHref, "Mở chuyến đang giao để nhập vỏ trả cùng chuyến", "info"),
      task(plantReceiveFeedbackRows.length, "Nhận NCC cần chỉnh sửa", plantReceiveFeedbackHref, "Xem phản hồi của Trưởng kho, sửa số thực nhận và gửi lại", "danger"),
      task(plantReturnFeedbackRows.length, "Trả vỏ NCC cần chỉnh sửa", plantReturnFeedbackHref, "Sửa số trả vỏ theo phản hồi và gửi lại duyệt", "danger"),
      task(internalFeedbackRows.length, "Phiếu nội bộ cần chỉnh sửa", internalFeedbackHref, "Xem phản hồi, chỉnh số thực tế và gửi lại", "danger"),
      task(partialRows.length, "Phiếu xử lý chưa đủ", partialHref, "Kiểm tra các dòng thực tế thấp hơn số lượng yêu cầu", "warning"),
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

function deliveryTaskHref(rows: any[], fallback: string) {
  return rows.length === 1 ? `/deliveries?focus=${rows[0].id}` : fallback;
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
      <Metric icon={<Clock3/>} label="Chờ xác nhận" value={pendingXsc}/>
      <Metric icon={<ClipboardCheck/>} label="Chờ Trưởng kho" value={pendingPhc}/>
      <Metric icon={<MessageCircleWarning/>} label="Có phản hồi" value={feedback} tone={feedback ? "warning" : "success"}/>
      <Metric icon={<CheckCircle2/>} label="Hoàn tất" value={completed}/>
    </MetricGrid>
    <CostSummary costs={costs}/>
    <div className="overview-main-grid">
      <RentalPanel rental={rental}/>
      <AttentionPanel items={[
        task(pendingXsc, "Phiếu chờ xác nhận", "/deliveries?status=pending", "Đang chờ Thủ kho/XSC Mỏ xác nhận thực nhận", "info"),
        task(pendingPhc, "Phiếu chờ Trưởng kho", "/deliveries?status=phc_pending", "Đang chờ duyệt nhận hàng", "warning"),
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
  const [userRow, priceRow, summary, recentAudit] = await Promise.all([
    sql<any[]>`SELECT count(*)::int AS total,count(*) FILTER (WHERE active)::int AS active FROM users`,
    sql<any[]>`SELECT count(*) FILTER (WHERE effective_to IS NOT NULL AND effective_to BETWEEN CURRENT_DATE AND CURRENT_DATE+interval '45 days')::int AS expiring,count(*) FILTER (WHERE effective_to<CURRENT_DATE)::int AS expired FROM price_rules`,
    getAdminControlSummary(),
    sql<any[]>`SELECT a.id,a.action,a.entity_type,a.note,a.created_at,u.full_name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT 6`,
  ]);
  const users = userRow[0] || { total: 0, active: 0 };
  const prices = priceRow[0] || { expiring: 0, expired: 0 };
  const pendingTotal = Number(summary.pending.deliveries||0)+Number(summary.pending.returns||0)+Number(summary.pending.internal||0)+Number(summary.pending.transfers||0);
  const noticeTotal = Number(summary.notifications.failed||0)+Number(summary.notifications.pending||0);
  const live = summary.state.mode === "live";
  return <div className="overview-page admin-overview">
    <PageHeading title="Tổng quan quản trị" subtitle="Trung tâm kiểm soát dữ liệu, Audit, kiểm kê chuyển đổi và cấu hình hệ thống."/>
    <MetricGrid>
      <Link href="/admin?tab=cutover" className={`overview-metric admin-mode-metric ${live?"tone-success":"tone-warning"}`}><div className="overview-metric-icon"><Settings/></div><div className="min-w-0"><div className="overview-metric-label">Chế độ hệ thống</div><div className="overview-metric-value admin-mode-value">{live?"Vận hành":"Hồi nhập"}</div><div className="overview-metric-foot">{live&&summary.state.go_live_date?`Từ ${toDateKey(summary.state.go_live_date)}`:"Chưa chốt vận hành"}</div></div></Link>
      <Link href="/admin?tab=data" className="overview-metric tone-warning"><div className="overview-metric-icon"><ClipboardCheck/></div><div className="min-w-0"><div className="overview-metric-label">Dữ liệu đang xử lý</div><div className="overview-metric-value">{formatNumber(pendingTotal)}<span>phiếu</span></div><div className="overview-metric-foot">Bấm để tra cứu / chỉnh dữ liệu</div></div></Link>
      <Link href="/admin?tab=audit" className="overview-metric tone-brand"><div className="overview-metric-icon"><FileSpreadsheet/></div><div className="min-w-0"><div className="overview-metric-label">Lần chỉnh Admin</div><div className="overview-metric-value">{formatNumber(summary.corrections)}</div><div className="overview-metric-foot">Audit không được sửa/xóa</div></div></Link>
      <Link href="/admin?tab=prices" className={`overview-metric ${Number(prices.expired||0)>0?"tone-warning":"tone-success"}`}><div className="overview-metric-icon"><CircleDollarSign/></div><div className="min-w-0"><div className="overview-metric-label">Đơn giá cần chú ý</div><div className="overview-metric-value">{formatNumber(Number(prices.expiring||0)+Number(prices.expired||0))}</div><div className="overview-metric-foot">Hết hạn: {formatNumber(prices.expired||0)}</div></div></Link>
    </MetricGrid>

    <section className="admin-control-grid">
      <Link href="/admin?tab=data" className="admin-control-card is-primary"><div className="admin-control-icon"><ClipboardCheck/></div><div><strong>Chỉnh sửa dữ liệu nghiệp vụ</strong><span>Giao/Trả NCC, Đổi/Mượn/Trả, Điều chuyển. Bắt buộc lý do và lưu trước/sau.</span></div><b>→</b></Link>
      <Link href="/admin?tab=cutover" className="admin-control-card"><div className="admin-control-icon"><CalendarCheck2/></div><div><strong>Kiểm kê & chốt vận hành</strong><span>Nhập số kiểm kê Kho + nhóm + Mỏ, đối chiếu NCC và thiết lập mốc vận hành.</span></div><b>→</b></Link>
      <Link href="/admin?tab=audit" className="admin-control-card"><div className="admin-control-icon"><FileSpreadsheet/></div><div><strong>Lịch sử Audit</strong><span>Xem ai sửa gì, dữ liệu trước/sau, thời gian GMT+7 và lý do chỉnh sửa.</span></div><b>→</b></Link>
    </section>

    <div className="admin-overview-grid">
      <Card className="overview-panel"><div className="overview-panel-head"><div><CardTitle>Quản trị hệ thống</CardTitle><p>Cấu hình ít thay đổi, tách khỏi nghiệp vụ sửa dữ liệu.</p></div></div><div className="overview-quick-grid">
        <Link href="/admin?tab=users" className="overview-quick"><span><UserRoundCog/></span><strong>User & phân quyền</strong><b>→</b></Link>
        <Link href="/admin?tab=prices" className="overview-quick"><span><CircleDollarSign/></span><strong>Đơn giá</strong><b>→</b></Link>
        <Link href="/admin?tab=thresholds" className="overview-quick"><span><AlertTriangle/></span><strong>Ngưỡng tồn</strong><b>→</b></Link>
        <Link href="/admin?tab=calendar" className="overview-quick"><span><Settings/></span><strong>Lịch làm việc</strong><b>→</b></Link>
        <Link href="/admin?tab=master" className="overview-quick"><span><Boxes/></span><strong>Danh mục & số dư</strong><b>→</b></Link>
      </div><div className="admin-mini-status"><span>User hoạt động <strong>{users.active}/{users.total}</strong></span><span>Email lỗi/chờ <strong className={noticeTotal?"text-[#B91C1C]":"text-[#15803D]"}>{noticeTotal}</strong></span></div></Card>

      <Card className="overview-panel"><div className="overview-panel-head"><div><CardTitle>Audit gần đây</CardTitle><p>Những thay đổi hệ thống mới nhất.</p></div><Link href="/admin?tab=audit" className="text-sm font-bold text-[var(--brand)]">Xem tất cả →</Link></div><div className="recent-list">{recentAudit.length?recentAudit.map((row:any)=><Link href="/admin?tab=audit" key={row.id} className="recent-row"><span className="recent-dot"/><div className="min-w-0"><strong>{row.actor_name || "Hệ thống"} · {row.action}</strong><span>{row.entity_type}{row.note?` · ${row.note}`:""}</span></div><b>→</b></Link>):<div className="attention-empty"><CheckCircle2/><div><strong>Chưa có Audit</strong><span>Chưa phát sinh thay đổi quản trị.</span></div></div>}</div></Card>
    </div>
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
function deliveryStatus(status: string) { return status === "completed" ? "Hoàn tất" : status === "phc_pending" ? "Chờ Trưởng kho" : status === "feedback" ? "Có phản hồi" : "Chờ xác nhận thực nhận"; }
function internalType(type: string) { return type === "exchange" ? "Đổi" : type === "borrow" ? "Mượn" : "Trả"; }
function internalStatus(status: string) { return status === "completed" ? "Hoàn tất" : status === "executed_pending_review" ? "Chờ duyệt" : status === "approved" ? "Đã duyệt" : status === "feedback" ? "Có phản hồi" : "Chờ xử lý"; }
