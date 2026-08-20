import { redirect } from "next/navigation";
import { ClipboardCheck, Handshake, MessageCircleWarning, Repeat2, RotateCcw } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { GroupQuickPanel } from "@/components/group-quick-panel";
import { requireProfile } from "@/lib/auth/session";
import { canApproveOfficeBorrow, canCreateGroupRequest, canExecuteWarehouse, canReviewWarehouse } from "@/lib/auth/permissions";
import { getGroupQuickData, listInternalRequests } from "@/lib/services/internal";
import { isOfficeHours } from "@/lib/working-hours";
import { formatNumber } from "@/lib/utils";

const typeLabel: Record<string,string> = { exchange: "Đổi chai", borrow: "Mượn thêm", return: "Trả chai" };

export default async function InternalPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; type?: string; status?: string; focus?: string; action?: string; partial?: string }> }) {
  const profile = await requireProfile();
  if (profile.role === "supplier") redirect("/dashboard");
  const params = await searchParams;
  const isGroupUser = ["foreman","supervisor","worker"].includes(profile.role);
  const [requestsRaw, office, quickProducts] = await Promise.all([listInternalRequests(profile),isOfficeHours(),isGroupUser ? getGroupQuickData(profile) : Promise.resolve([])]);
  const requestsAll = requestsRaw as any[];
  const typeFilter = ["exchange","borrow","return"].includes(String(params.type || "")) ? String(params.type) : null;
  const statusFilter = String(params.status || "");
  const focusId = String(params.focus || "");
  const partialOnly = params.partial === "1";
  const requests = requestsAll.filter((r:any) => {
    if (focusId && r.id !== focusId) return false;
    if (typeFilter && r.request_type !== typeFilter) return false;
    if (statusFilter === "active" && ["completed","cancelled","rejected"].includes(r.status)) return false;
    if (statusFilter === "waiting" && !["pending","approved","executed_pending_review"].includes(r.status)) return false;
    if (statusFilter && !["active","waiting"].includes(statusFilter) && r.status !== statusFilter) return false;
    if (partialOnly && !(Array.isArray(r.items) && r.items.some((i:any) => i.actual_qty != null && Number(i.actual_qty) < Number(i.requested_qty)))) return false;
    return true;
  });
  const canCreate = canCreateGroupRequest(profile) && profile.location_code !== "MINE";
  const active = requestsAll.filter((r:any)=>!["completed","cancelled","rejected"].includes(r.status));
  const count = (type:string)=>active.filter((r:any)=>r.request_type===type).length;
  const discrepancy = requestsAll.filter((r:any)=>Array.isArray(r.items)&&r.items.some((i:any)=>i.actual_qty!=null&&Number(i.actual_qty)!==Number(i.requested_qty))).length;

  return <div className="grid gap-5">
    {!isGroupUser ? <><div className="role-page-heading"><div><div className="role-kicker">Phiếu nội bộ</div><h1>{profile.role === "storekeeper" ? "Phiếu chờ xử lý" : profile.role === "warehouse_manager" ? "Phiếu cần duyệt" : "Mượn · Đổi · Trả nội bộ"}</h1><p>Một phiếu có thể gồm nhiều loại khí. Kho nhập số lượng thực tế riêng từng dòng; hệ thống luôn giữ cả số yêu cầu và số thực tế.</p></div><div className="role-title-icon"><ClipboardCheck size={24}/></div></div>
    <section className="role-metrics four"><MiniMetric icon={<Repeat2/>} label="Đổi" value={count("exchange")}/><MiniMetric icon={<Handshake/>} label="Mượn" value={count("borrow")}/><MiniMetric icon={<RotateCcw/>} label="Trả" value={count("return")}/><MiniMetric icon={<MessageCircleWarning/>} label="Có chênh lệch" value={discrepancy}/></section></> : null}
    <div className="rounded-xl border border-[var(--border)] bg-white p-3 text-sm"><strong>Chế độ:</strong> {office ? "Trong giờ hành chính · T2–T6, 07:30–16:30" : "Ngoài giờ hành chính / ngày nghỉ"}</div>
    {params.error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-[var(--danger)]">{params.error}</div> : null}
    {(typeFilter || statusFilter || focusId || partialOnly) ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm"><span><strong>Đang mở đúng tác vụ từ Tổng quan.</strong> {requests.length} phiếu phù hợp.</span><a href="/internal" className="font-bold text-[var(--brand)]">Xem tất cả →</a></div> : null}
    {isGroupUser ? <GroupQuickPanel groupName={profile.group_name || "Nhóm"} products={quickProducts} canCreate={canCreate} compact defaultMode={(["exchange","borrow","return"].includes(String(params.action || "")) ? params.action : null) as "exchange"|"borrow"|"return"|null}/> : null}

    <Card className="overflow-hidden p-0"><div className="border-b border-[var(--border)] p-4 md:p-5"><div className="flex items-center justify-between gap-3"><CardTitle>Danh sách phiếu</CardTitle><span className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-[var(--brand)]">{requests.length} phiếu gần nhất</span></div></div><div className="grid gap-3 p-3 md:p-5">
      {requests.map((r:any)=>{const items=Array.isArray(r.items)?r.items:[];const canExecute=canExecuteWarehouse(profile)&&(r.request_type==="borrow"?(r.status==="approved"||(!office&&r.status==="pending")):r.status==="pending");return <article key={r.id} className="rounded-2xl border border-[var(--border)] bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-mono-data text-sm font-extrabold text-[var(--brand)]">{r.request_code}</div><div className="mt-1 text-base font-extrabold">{typeLabel[r.request_type]} · {r.group_name}</div><div className="mt-1 text-xs text-[var(--muted-foreground)]">{r.requested_by_name} · {new Date(r.requested_at).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}</div></div><StatusBadge status={r.status}/></div>
        <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border)]">{items.map((item:any)=><div key={item.id} className="grid gap-2 border-b border-[var(--border)] p-3 last:border-b-0 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div className="font-bold">{item.product_name}</div><div className="text-sm"><span className="text-[var(--muted-foreground)]">Yêu cầu</span> <strong className="font-mono-data">{formatNumber(item.requested_qty)} {item.unit}</strong></div><div className="text-sm"><span className="text-[var(--muted-foreground)]">Thực tế</span> <strong className="font-mono-data">{item.actual_qty==null?"—":formatNumber(item.actual_qty)}</strong>{item.actual_qty!=null&&Number(item.actual_qty)!==Number(item.requested_qty)?<span className="ml-2 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-[var(--warning)]">Chênh lệch</span>:null}</div></div>)}</div>
        {r.note?<div className="mt-2 text-sm text-[var(--muted-foreground)]">Ghi chú: {r.note}</div>:null}{r.feedback?<div className="mt-2 rounded-xl bg-red-50 p-3 text-sm font-semibold text-[var(--danger)]">Phản hồi: {r.feedback}</div>:null}
        <div className="mt-3 flex flex-wrap gap-2">
          {r.request_type==="borrow"&&r.status==="pending"&&office&&canApproveOfficeBorrow(profile)?<form action="/api/internal" method="post"><input type="hidden" name="action" value="approve_borrow"/><input type="hidden" name="request_id" value={r.id}/><Button type="submit">Duyệt mượn</Button></form>:null}
          {canExecute?<form action="/api/internal" method="post" className="w-full rounded-2xl border border-[var(--border)] bg-[var(--paper)] p-3"><input type="hidden" name="action" value="execute"/><input type="hidden" name="request_id" value={r.id}/><input type="hidden" name="item_ids" value={items.map((x:any)=>x.id).join(",")}/><div className="mb-3 text-sm font-extrabold">Nhập số lượng thực tế từng loại</div><div className="grid gap-2">{items.map((item:any)=><div key={item.id} className="grid gap-2 rounded-xl bg-white p-3 md:grid-cols-[1.4fr_.8fr_.8fr] md:items-end"><div><div className="font-bold">{item.product_name}</div><div className="text-xs text-[var(--muted-foreground)]">Yêu cầu {formatNumber(item.requested_qty)} {item.unit}</div></div><label className="grid gap-1 text-xs font-bold">SL thực tế<Input name={`actual_${item.id}`} type="number" min="0" step="1" defaultValue={item.requested_qty}/></label>{r.request_type==="return"?<label className="grid gap-1 text-xs font-bold">Tình trạng<Select name={`bucket_${item.id}`}><option value="empty">Rỗng</option><option value="full">Đầy</option></Select></label>:<div className="rounded-lg bg-blue-50 p-2 text-xs text-[var(--brand)]">Có thể thấp hơn yêu cầu nếu kho không đủ.</div>}</div>)}</div><Button type="submit" className="mt-3">Hoàn tất xử lý</Button></form>:null}
          {r.status==="executed_pending_review"&&canReviewWarehouse(profile)?<><form action="/api/internal" method="post"><input type="hidden" name="action" value="review_approve"/><input type="hidden" name="request_id" value={r.id}/><Button type="submit">Duyệt phiếu</Button></form><form action="/api/internal" method="post" className="flex min-w-[260px] flex-1 gap-2"><input type="hidden" name="action" value="review_feedback"/><input type="hidden" name="request_id" value={r.id}/><Input name="feedback" placeholder="Nội dung phản hồi" required/><Button type="submit" variant="secondary">Phản hồi</Button></form></>:null}
        </div>
      </article>})}
      {!requests.length?<div className="rounded-xl bg-[var(--paper)] p-8 text-center text-sm text-[var(--muted-foreground)]">Chưa có phiếu nội bộ.</div>:null}
    </div></Card>
  </div>;
}

function MiniMetric({icon,label,value}:{icon:React.ReactNode;label:string;value:number}){return <Card className="role-metric"><div className="role-metric-icon">{icon}</div><div><div className="role-metric-label">{label}</div><div className="role-metric-value">{formatNumber(value)}</div></div></Card>}
