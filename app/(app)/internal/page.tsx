import { redirect } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/status-badge";
import { requireProfile } from "@/lib/auth/session";
import { canApproveOfficeBorrow, canCreateGroupRequest, canExecuteWarehouse, canReviewWarehouse } from "@/lib/auth/permissions";
import { listInternalRequests } from "@/lib/services/internal";
import { getProducts } from "@/lib/services/catalog";
import { isOfficeHours } from "@/lib/working-hours";
import { formatNumber } from "@/lib/utils";

const typeLabel: Record<string,string> = { exchange: "Đổi chai", borrow: "Mượn thêm", return: "Trả chai" };

export default async function InternalPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const profile = await requireProfile();
  if (profile.role === "supplier") redirect("/dashboard");
  const params = await searchParams;
  const [requests, products, office] = await Promise.all([listInternalRequests(profile), getProducts(), isOfficeHours()]);
  const canCreate = canCreateGroupRequest(profile) && profile.location_code !== "MINE";
  return <div className="grid gap-5">
    <div><h1 className="font-display m-0 text-2xl text-[var(--brand-deep)]">Mượn · Đổi · Trả nội bộ</h1><p className="mt-1 text-sm text-[var(--muted-foreground)]">Nhóm chỉ quản lý tổng số chai. Kho Hậu cần quản lý tách chai đầy/rỗng. Nhóm Cối/Mỏ không tạo phiếu đổi trên web.</p></div>
    <div className="rounded-lg border border-[var(--border)] bg-white p-3 text-sm"><strong>Chế độ hiện tại:</strong> {office ? "Trong giờ hành chính (T2–T6, 07:30–16:30)" : "Ngoài giờ hành chính / ngày nghỉ"}</div>
    {params.error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-[#B91C1C]">{params.error}</div> : null}

    {canCreate ? <Card><CardTitle>Tạo phiếu cho {profile.group_name}</CardTitle><form action="/api/internal" method="post" className="mt-4 grid gap-3 md:grid-cols-4 md:items-end"><input type="hidden" name="action" value="create" />
      <FormField label="Nghiệp vụ"><Select name="request_type"><option value="exchange">Đổi chai</option><option value="borrow">Mượn thêm</option><option value="return">Trả chai</option></Select></FormField>
      <FormField label="Loại khí"><Select name="product_id">{products.filter((p:any)=>p.internal_group_tracking).map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</Select></FormField>
      <FormField label="Số lượng"><Input name="quantity" type="number" min="1" step="1" required /></FormField>
      <Button type="submit">Tạo phiếu</Button>
      <div className="md:col-span-4"><FormField label="Ghi chú" hint="Không bắt buộc"><Input name="note" /></FormField></div>
    </form></Card> : null}

    <Card className="overflow-hidden p-0"><div className="border-b border-[var(--border)] p-4 md:p-5"><CardTitle>Danh sách phiếu</CardTitle></div><div className="grid gap-3 p-3 md:p-5">
      {requests.map((r:any)=><article key={r.id} className="rounded-xl border border-[var(--border)] bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-mono-data text-sm font-bold text-[var(--brand)]">{r.request_code}</div><div className="mt-1 font-bold">{typeLabel[r.request_type]} · {r.group_name}</div><div className="mt-1 text-sm">{r.product_name}: <span className="font-mono-data font-bold">{formatNumber(r.requested_qty)} {r.unit}</span>{r.actual_qty != null ? <> · Thực tế <span className="font-mono-data font-bold">{formatNumber(r.actual_qty)}</span></> : null}</div><div className="mt-1 text-xs text-[var(--muted-foreground)]">Tạo bởi {r.requested_by_name} · {new Date(r.requested_at).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}</div></div><StatusBadge status={r.status} /></div>
        {r.note ? <div className="mt-2 text-sm text-[var(--muted-foreground)]">Ghi chú: {r.note}</div> : null}
        {r.feedback ? <div className="mt-2 text-sm font-semibold text-[#B91C1C]">Phản hồi: {r.feedback}</div> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {r.request_type === "borrow" && r.status === "pending" && office && canApproveOfficeBorrow(profile) ? <form action="/api/internal" method="post"><input type="hidden" name="action" value="approve_borrow"/><input type="hidden" name="request_id" value={r.id}/><Button type="submit">Duyệt mượn</Button></form> : null}
          {canExecuteWarehouse(profile) && (r.request_type === "borrow" ? (r.status === "approved" || (!office && r.status === "pending")) : r.status === "pending") ? <form action="/api/internal" method="post" className="flex flex-wrap items-end gap-2"><input type="hidden" name="action" value="execute"/><input type="hidden" name="request_id" value={r.id}/><label className="grid gap-1 text-xs font-bold">SL thực tế<Input name="actual_qty" type="number" min="1" step="1" defaultValue={r.requested_qty}/></label>{r.request_type === "return" ? <label className="grid gap-1 text-xs font-bold">Tình trạng<Select name="return_bucket"><option value="empty">Rỗng</option><option value="full">Đầy</option></Select></label> : null}<Button type="submit" variant="secondary">Thủ kho thực hiện</Button></form> : null}
          {r.status === "executed_pending_review" && canReviewWarehouse(profile) ? <><form action="/api/internal" method="post"><input type="hidden" name="action" value="review_approve"/><input type="hidden" name="request_id" value={r.id}/><Button type="submit">Hậu kiểm · Duyệt</Button></form><form action="/api/internal" method="post" className="flex gap-2"><input type="hidden" name="action" value="review_feedback"/><input type="hidden" name="request_id" value={r.id}/><Input name="feedback" placeholder="Nội dung phản hồi"/><Button type="submit" variant="secondary">Phản hồi</Button></form></> : null}
        </div>
      </article>)}
      {!requests.length ? <p className="p-4 text-sm text-[var(--muted-foreground)]">Chưa có phiếu nội bộ.</p> : null}
    </div></Card>
  </div>;
}
