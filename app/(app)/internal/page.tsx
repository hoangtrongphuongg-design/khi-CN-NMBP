import { redirect } from "next/navigation";
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

export default async function InternalPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const profile = await requireProfile();
  if (profile.role === "supplier") redirect("/dashboard");
  const params = await searchParams;
  const isGroupUser = ["foreman","supervisor","worker"].includes(profile.role);
  const [requests, office, quickProducts] = await Promise.all([
    listInternalRequests(profile),
    isOfficeHours(),
    isGroupUser ? getGroupQuickData(profile) : Promise.resolve([]),
  ]);
  const canCreate = canCreateGroupRequest(profile) && profile.location_code !== "MINE";

  return <div className="grid gap-5">
    {!isGroupUser ? <div><h1 className="font-display m-0 text-2xl text-[var(--brand-deep)]">Mượn · Đổi · Trả nội bộ</h1><p className="mt-1 text-sm text-[var(--muted-foreground)]">Một phiếu có thể gồm nhiều loại khí. Kho nhập số lượng thực tế riêng từng dòng; số liệu thực tế có thể thấp hơn yêu cầu khi kho không đủ.</p></div> : null}
    <div className="rounded-lg border border-[var(--border)] bg-white p-3 text-sm"><strong>Chế độ hiện tại:</strong> {office ? "Trong giờ hành chính (T2–T6, 07:30–16:30)" : "Ngoài giờ hành chính / ngày nghỉ"}</div>
    {params.error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-[#B91C1C]">{params.error}</div> : null}

    {isGroupUser ? <GroupQuickPanel groupName={profile.group_name || "Nhóm"} products={quickProducts} canCreate={canCreate} compact /> : null}

    <Card className="overflow-hidden p-0"><div className="border-b border-[var(--border)] p-4 md:p-5"><CardTitle>Danh sách phiếu</CardTitle></div><div className="grid gap-3 p-3 md:p-5">
      {requests.map((r:any)=>{
        const items = Array.isArray(r.items) ? r.items : [];
        const canExecute = canExecuteWarehouse(profile) && (r.request_type === "borrow" ? (r.status === "approved" || (!office && r.status === "pending")) : r.status === "pending");
        return <article key={r.id} className="rounded-xl border border-[var(--border)] bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-mono-data text-sm font-bold text-[var(--brand)]">{r.request_code}</div><div className="mt-1 font-bold">{typeLabel[r.request_type]} · {r.group_name}</div><div className="mt-1 text-xs text-[var(--muted-foreground)]">Tạo bởi {r.requested_by_name} · {new Date(r.requested_at).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}</div></div><StatusBadge status={r.status} /></div>

          <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border)]">
            {items.map((item:any)=><div key={item.id} className="grid gap-1 border-b border-[var(--border)] px-3 py-2.5 last:border-b-0 md:grid-cols-[1fr_auto_auto] md:items-center md:gap-4"><div className="font-bold">{item.product_name}</div><div className="text-sm"><span className="text-[var(--muted-foreground)]">Yêu cầu</span> <strong className="font-mono-data">{formatNumber(item.requested_qty)} {item.unit}</strong></div><div className="text-sm"><span className="text-[var(--muted-foreground)]">Thực tế</span> <strong className="font-mono-data">{item.actual_qty == null ? "—" : formatNumber(item.actual_qty)}</strong>{item.actual_qty != null && Number(item.actual_qty) !== Number(item.requested_qty) ? <span className="ml-2 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-[var(--warning)]">Có chênh lệch</span> : null}</div></div>)}
          </div>

          {r.note ? <div className="mt-2 text-sm text-[var(--muted-foreground)]">Ghi chú: {r.note}</div> : null}
          {r.feedback ? <div className="mt-2 text-sm font-semibold text-[#B91C1C]">Phản hồi: {r.feedback}</div> : null}

          <div className="mt-3 flex flex-wrap gap-2">
            {r.request_type === "borrow" && r.status === "pending" && office && canApproveOfficeBorrow(profile) ? <form action="/api/internal" method="post"><input type="hidden" name="action" value="approve_borrow"/><input type="hidden" name="request_id" value={r.id}/><Button type="submit">Duyệt mượn</Button></form> : null}

            {canExecute ? <form action="/api/internal" method="post" className="w-full rounded-xl border border-[var(--border)] bg-[var(--paper)] p-3"><input type="hidden" name="action" value="execute"/><input type="hidden" name="request_id" value={r.id}/><input type="hidden" name="item_ids" value={items.map((x:any)=>x.id).join(",")}/><div className="mb-3 text-sm font-extrabold">Thủ kho nhập số thực tế từng loại</div><div className="grid gap-2">{items.map((item:any)=><div key={item.id} className="grid gap-2 rounded-lg bg-white p-2.5 md:grid-cols-[1.4fr_.8fr_.8fr] md:items-end"><div><div className="font-bold">{item.product_name}</div><div className="text-xs text-[var(--muted-foreground)]">Yêu cầu {formatNumber(item.requested_qty)} {item.unit}</div></div><label className="grid gap-1 text-xs font-bold">SL thực tế<Input name={`actual_${item.id}`} type="number" min="0" step="1" defaultValue={item.requested_qty}/></label>{r.request_type === "return" ? <label className="grid gap-1 text-xs font-bold">Tình trạng<Select name={`bucket_${item.id}`}><option value="empty">Rỗng</option><option value="full">Đầy</option></Select></label> : <div className="text-xs text-[var(--muted-foreground)]">Có thể nhập thấp hơn yêu cầu nếu kho không đủ.</div>}</div>)}</div><Button type="submit" variant="secondary" className="mt-3">Thủ kho thực hiện</Button></form> : null}

            {r.status === "executed_pending_review" && canReviewWarehouse(profile) ? <><form action="/api/internal" method="post"><input type="hidden" name="action" value="review_approve"/><input type="hidden" name="request_id" value={r.id}/><Button type="submit">Hậu kiểm · Duyệt</Button></form><form action="/api/internal" method="post" className="flex flex-1 gap-2"><input type="hidden" name="action" value="review_feedback"/><input type="hidden" name="request_id" value={r.id}/><Input name="feedback" placeholder="Nội dung phản hồi" required/><Button type="submit" variant="secondary">Phản hồi</Button></form></> : null}
          </div>
        </article>;
      })}
      {!requests.length ? <p className="p-4 text-sm text-[var(--muted-foreground)]">Chưa có phiếu nội bộ.</p> : null}
    </div></Card>
  </div>;
}
