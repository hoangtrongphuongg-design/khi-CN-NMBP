import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3, MessageCircleWarning, Search, Truck, MapPin, CalendarDays, ChevronDown } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DeliveryCreateForm } from "@/components/forms/delivery-create-form";
import { SupplierReturnForm } from "@/components/forms/supplier-return-form";
import { requireProfile } from "@/lib/auth/session";
import { canConfirmMineDelivery, canConfirmPlantDelivery, canFeedbackDelivery, canFinalizePhcDelivery } from "@/lib/auth/permissions";
import { getLocations, getProducts } from "@/lib/services/catalog";
import { listDeliveries } from "@/lib/services/deliveries";
import { listSupplierReturns } from "@/lib/services/supplier-returns";
import { formatCurrency, formatNumber, toDateInput, toDateKey } from "@/lib/utils";

const deliveryStatus: Record<string, { label: string; className: string }> = {
  pending: { label: "Chờ XSC xác nhận", className: "status-info" },
  phc_pending: { label: "Chờ PHC xác nhận", className: "status-warning" },
  feedback: { label: "Có phản hồi", className: "status-danger" },
  completed: { label: "Hoàn tất", className: "status-success" },
  cancelled: { label: "Đã hủy", className: "status-neutral" },
};

function DeliveryBadge({ status }: { status: string }) {
  const item = deliveryStatus[status] || { label: status, className: "status-neutral" };
  return <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-bold ${item.className}`}>{item.label}</span>;
}

function dateVN(value: unknown) {
  const key = toDateKey(value);
  const [y, m, d] = key.split("-");
  return y && m && d ? `${d}/${m}/${y}` : key;
}

function deliveryNeedsAction(profile: any, delivery: any) {
  if (profile.role === "supplier") return delivery.items?.some((i: any) => i.status === "feedback");
  if (profile.role === "workshop") return delivery.items?.some((i: any) => i.location_code === "PLANT" && i.status === "pending");
  if (profile.role === "mine_xsc") return delivery.items?.some((i: any) => i.location_code === "MINE" && i.status === "pending");
  if (["warehouse_manager", "storekeeper"].includes(profile.role)) return delivery.status === "phc_pending";
  return false;
}

function SummaryCard({ icon, value, label, tone }: { icon: ReactNode; value: number; label: string; tone: "blue" | "amber" | "red" | "green" }) {
  const tones = {
    blue: "bg-blue-50 text-[#004A8F] border-blue-100",
    amber: "bg-amber-50 text-[#92400E] border-amber-100",
    red: "bg-red-50 text-[#B91C1C] border-red-100",
    green: "bg-green-50 text-[#15803D] border-green-100",
  };
  return <div className="rounded-xl border border-[var(--border)] bg-white p-4">
    <div className="flex items-center gap-3">
      <div className={`grid size-10 place-items-center rounded-xl border ${tones[tone]}`}>{icon}</div>
      <div><div className="font-mono-data text-2xl font-extrabold leading-none">{value}</div><div className="mt-1 text-xs font-bold text-[var(--muted-foreground)]">{label}</div></div>
    </div>
  </div>;
}

export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; tab?: string; q?: string; status?: string; location?: string; focus?: string }> }) {
  const profile = await requireProfile();
  if (["foreman", "supervisor", "worker"].includes(profile.role)) redirect("/dashboard");
  const params = await searchParams;
  const tab = params.tab === "returns" ? "returns" : "deliveries";

  const [products, locations, deliveriesRaw, returns] = await Promise.all([
    getProducts(),
    getLocations(),
    listDeliveries(profile),
    listSupplierReturns(profile),
  ]);

  const deliveries = deliveriesRaw as any[];
  const q = String(params.q || "").trim().toLowerCase();
  const statusFilter = String(params.status || "all");
  const locationFilter = String(params.location || "all");
  const focusId = String(params.focus || "");
  const filteredDeliveries = deliveries
    .filter((d: any) => !focusId || d.id === focusId)
    .filter((d: any) => statusFilter === "all" || d.status === statusFilter)
    .filter((d: any) => locationFilter === "all" || d.items?.some((i: any) => i.location_code === locationFilter))
    .filter((d: any) => !q || [d.delivery_code, d.supplier_name, d.trip_code].some((v) => String(v || "").toLowerCase().includes(q)))
    .sort((a: any, b: any) => Number(deliveryNeedsAction(profile, b)) - Number(deliveryNeedsAction(profile, a)));

  const firstActionId = filteredDeliveries.find((d: any) => deliveryNeedsAction(profile, d))?.id;
  const counts = {
    pending: deliveries.filter((d: any) => d.status === "pending").length,
    phc: deliveries.filter((d: any) => d.status === "phc_pending").length,
    feedback: deliveries.filter((d: any) => d.status === "feedback").length,
    completed: deliveries.filter((d: any) => d.status === "completed").length,
  };

  const canCreateReturn = ["storekeeper", "mine_xsc"].includes(profile.role);

  return <div className="grid gap-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display m-0 text-2xl text-[var(--brand-deep)]">Giao nhận NCC</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">1 Phiếu giao = 1 chuyến = 1 cước. Một chuyến có thể giao Nhà máy, Mỏ hoặc cả hai; có giao Mỏ thì áp dụng cước Mỏ. Trả vỏ cùng chuyến không tính thêm cước.</p>
      </div>
      <div className="flex rounded-xl border border-[var(--border)] bg-white p-1">
        <Link href="/deliveries?tab=deliveries" className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === "deliveries" ? "bg-[var(--brand)] text-white" : "text-[var(--muted-foreground)]"}`}>Phiếu giao</Link>
        <Link href="/deliveries?tab=returns" className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === "returns" ? "bg-[var(--brand)] text-white" : "text-[var(--muted-foreground)]"}`}>Phiếu trả vỏ</Link>
      </div>
    </div>

    {params.error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-[#B91C1C]">{params.error}</div> : null}
    {params.ok ? <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-bold text-[#15803D]">Đã cập nhật thành công.</div> : null}

    {tab === "deliveries" ? <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={<Truck size={20}/>} value={counts.pending} label="Chờ XSC" tone="blue" />
        <SummaryCard icon={<Clock3 size={20}/>} value={counts.phc} label="Chờ PHC" tone="amber" />
        <SummaryCard icon={<MessageCircleWarning size={20}/>} value={counts.feedback} label="Có phản hồi" tone="red" />
        <SummaryCard icon={<CheckCircle2 size={20}/>} value={counts.completed} label="Hoàn tất" tone="green" />
      </div>

      {profile.role === "supplier" ? <Card>
        <div className="flex items-center justify-between gap-3"><CardTitle>Tạo phiếu giao NCC</CardTitle><span className="text-xs text-[var(--muted-foreground)]">NCC tạo phiếu · XSC/PHC xác nhận sau</span></div>
        <div className="mt-4"><DeliveryCreateForm products={products as any} locations={locations as any} today={toDateInput()} /></div>
      </Card> : null}

      <Card className="p-3 md:p-4">
        <form method="get" className="grid gap-2 md:grid-cols-[1fr_180px_190px_auto] md:items-end">
          <input type="hidden" name="tab" value="deliveries" />
          <label className="grid gap-1 text-xs font-bold text-[var(--muted-foreground)]">Tìm phiếu
            <div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-3 text-[var(--muted-foreground)]"/><Input name="q" defaultValue={params.q || ""} placeholder="Mã phiếu, NCC..." className="pl-9" /></div>
          </label>
          <label className="grid gap-1 text-xs font-bold text-[var(--muted-foreground)]">Trạng thái
            <Select name="status" defaultValue={statusFilter}>
              <option value="all">Tất cả</option><option value="pending">Chờ XSC</option><option value="phc_pending">Chờ PHC</option><option value="feedback">Có phản hồi</option><option value="completed">Hoàn tất</option>
            </Select>
          </label>
          <label className="grid gap-1 text-xs font-bold text-[var(--muted-foreground)]">Điểm giao
            <Select name="location" defaultValue={locationFilter}><option value="all">Tất cả địa điểm</option><option value="PLANT">Nhà máy</option><option value="MINE">Mỏ Tà Thiết</option></Select>
          </label>
          <div className="flex gap-2"><Button type="submit">Lọc</Button><Link href="/deliveries?tab=deliveries" className="inline-flex min-h-10 items-center rounded-lg border border-[var(--border)] bg-white px-4 text-sm font-bold">Làm mới</Link></div>
        </form>
      </Card>

      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-3"><h2 className="m-0 text-base font-extrabold">Danh sách phiếu giao</h2><span className="text-xs text-[var(--muted-foreground)]">{filteredDeliveries.length} phiếu</span></div>
        {filteredDeliveries.map((d: any) => {
          const itemCount = d.items?.length || 0;
          const xscDone = d.items?.filter((i: any) => ["xsc_confirmed", "confirmed"].includes(i.status)).length || 0;
          const locationsLabel = Array.from(new Set((d.items || []).map((i: any) => i.location_code === "MINE" ? "Mỏ Tà Thiết" : "Nhà máy"))).join(" + ");
          const phcReady = d.status === "phc_pending" || (itemCount > 0 && xscDone === itemCount);
          const isAction = deliveryNeedsAction(profile, d);
          const deliveryHasPlant = (d.items || []).some((i: any) => i.location_code === "PLANT");
          const deliveryHasMine = (d.items || []).some((i: any) => i.location_code === "MINE");
          const tripReturns = (returns as any[]).filter((r: any) => r.trip_id === d.trip_id && r.status !== "cancelled");
          const ownReturnLocationCode = profile.role === "storekeeper" ? "PLANT" : profile.role === "mine_xsc" ? "MINE" : null;
          const ownReturnLocationName = ownReturnLocationCode === "PLANT" ? "Nhà máy Xi măng Bình Phước" : ownReturnLocationCode === "MINE" ? "Mỏ Tà Thiết" : "";
          const ownLinkedReturn = ownReturnLocationCode ? tripReturns.find((r: any) => r.source_location_code === ownReturnLocationCode) : null;
          const canReturnThisDelivery = canCreateReturn && d.status !== "cancelled" && (
            (ownReturnLocationCode === "PLANT" && deliveryHasPlant) ||
            (ownReturnLocationCode === "MINE" && deliveryHasMine)
          );

          return <details key={d.id} open={focusId ? d.id === focusId : d.id === firstActionId} className={`group overflow-hidden rounded-xl border bg-white ${isAction ? "border-[#8CB9E5] shadow-sm" : "border-[var(--border)]"}`}>
            <summary className="grid cursor-pointer list-none gap-3 p-4 md:grid-cols-[1.4fr_160px_1fr_auto_30px] md:items-center">
              <div><div className="font-mono-data text-sm font-extrabold text-[var(--brand)]">{d.delivery_code}</div><div className="mt-1 text-sm font-bold">{d.supplier_name}</div></div>
              <div className="flex items-center gap-2 text-sm"><CalendarDays size={16} className="text-[var(--muted-foreground)]"/><span>{dateVN(d.delivery_date)}</span></div>
              <div className="flex items-center gap-2 text-sm"><MapPin size={16} className="text-[var(--muted-foreground)]"/><span>{locationsLabel || "—"}</span></div>
              <DeliveryBadge status={d.status} />
              <ChevronDown size={18} className="text-[var(--muted-foreground)] transition group-open:rotate-180" />
            </summary>

            <div className="border-t border-[var(--border)] bg-[var(--paper)] p-3 md:p-4">
              <div className="grid gap-3 lg:grid-cols-[1.4fr_0.9fr]">
                <section className="rounded-xl border border-blue-100 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-3"><div className="font-extrabold text-[#004A8F]">Bước 1 · XSC xác nhận thực nhận</div><span className="text-xs font-bold text-[var(--muted-foreground)]">{xscDone}/{itemCount} dòng đã xác nhận</span></div>
                  <div className="grid gap-2">
                    {(d.items || []).map((item: any) => {
                      const canConfirm = item.location_code === "PLANT" ? canConfirmPlantDelivery(profile) : canConfirmMineDelivery(profile);
                      const canConfirmNow = canConfirm && item.status === "pending";
                      const supplierResubmit = profile.role === "supplier" && item.status === "feedback";
                      const phcCanFeedback = canFeedbackDelivery(profile) && ["warehouse_manager", "storekeeper"].includes(profile.role) && item.status === "xsc_confirmed";
                      return <div key={item.id} className="rounded-lg border border-[var(--border)] bg-[var(--paper)] p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div><div className="font-bold">{item.product_name}</div><div className="mt-1 text-xs text-[var(--muted-foreground)]">{item.location_name} · NCC khai <span className="font-mono-data font-bold text-[var(--ink)]">{formatNumber(item.declared_qty)} {item.unit}</span>{item.confirmed_qty != null ? <> · Thực nhận <span className="font-mono-data font-bold text-[var(--ink)]">{formatNumber(item.confirmed_qty)}</span></> : null}</div></div>
                          <span className={`rounded-md border px-2 py-1 text-[11px] font-bold ${item.status === "feedback" ? "status-danger" : item.status === "pending" ? "status-warning" : "status-info"}`}>{item.status === "feedback" ? "Có phản hồi" : item.status === "pending" ? "Chờ XSC" : item.status === "confirmed" ? "Hoàn tất" : "XSC đã xác nhận"}</span>
                        </div>

                        {canConfirmNow ? <form action="/api/deliveries" method="post" className="mt-3 grid gap-2 sm:grid-cols-[150px_1fr_auto_auto] sm:items-end">
                          <input type="hidden" name="item_id" value={item.id} />
                          <label className="grid gap-1 text-xs font-bold">SL thực nhận<Input name="actual_qty" type="number" min="0" step="0.001" defaultValue={item.confirmed_qty ?? item.declared_qty} required /></label>
                          <label className="grid gap-1 text-xs font-bold">Ghi chú / phản hồi<Input name="feedback" placeholder="Không bắt buộc" /></label>
                          <Button name="action" value="feedback_delivery_item" variant="secondary">Phản hồi</Button>
                          <Button name="action" value="confirm_delivery_item">XSC xác nhận</Button>
                        </form> : null}

                        {supplierResubmit ? <form action="/api/deliveries" method="post" className="mt-3 flex flex-wrap items-end gap-2"><input type="hidden" name="item_id" value={item.id}/><label className="grid gap-1 text-xs font-bold">SL NCC cập nhật<Input name="declared_qty" type="number" min="0.001" step="0.001" defaultValue={item.declared_qty} required/></label><Button name="action" value="supplier_resubmit_delivery_item">Gửi lại XSC</Button></form> : null}

                        {phcCanFeedback ? <details className="mt-2"><summary className="cursor-pointer text-xs font-bold text-[#92400E]">Số liệu chưa đúng? Phản hồi lại XSC/NCC</summary><form action="/api/deliveries" method="post" className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"><input type="hidden" name="item_id" value={item.id}/><input type="hidden" name="actual_qty" value={item.confirmed_qty ?? item.declared_qty}/><label className="grid gap-1 text-xs font-bold">Nội dung phản hồi<Input name="feedback" required placeholder="Nhập nội dung cần kiểm tra lại"/></label><Button name="action" value="feedback_delivery_item" variant="secondary">Gửi phản hồi</Button></form></details> : null}

                        {item.feedback ? <div className="mt-2 text-xs font-bold text-[#B91C1C]">{item.feedback}</div> : null}
                        {item.confirmed_by_name ? <div className="mt-2 text-[11px] text-[var(--muted-foreground)]">Xác nhận: {item.confirmed_by_name}{item.confirmed_at ? ` · ${new Date(item.confirmed_at).toLocaleString("vi-VN")}` : ""}</div> : null}
                      </div>;
                    })}
                  </div>
                </section>

                <section className={`rounded-xl border bg-white p-4 ${phcReady ? "border-amber-200" : "border-[var(--border)]"}`}>
                  <div className="font-extrabold text-[#92400E]">Bước 2 · PHC xác nhận hoàn tất</div>
                  <div className="mt-4 grid gap-3 text-sm">
                    <div className="flex justify-between gap-3"><span className="text-[var(--muted-foreground)]">Dòng đã XSC xác nhận</span><strong>{xscDone}/{itemCount}</strong></div>
                    <div className="flex justify-between gap-3"><span className="text-[var(--muted-foreground)]">Phiếu giao / chuyến</span><strong className="font-mono-data text-right">{d.delivery_code}</strong></div>
                    <div className="flex justify-between gap-3"><span className="text-[var(--muted-foreground)]">Cước vận chuyển</span><strong>{formatCurrency(d.transport_amount)}</strong></div>
                    {d.note ? <div className="rounded-lg bg-[var(--paper)] p-2 text-xs"><strong>Ghi chú:</strong> {d.note}</div> : null}
                  </div>

                  {d.status === "completed" ? <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-bold text-[#15803D]">Đã hoàn tất{d.phc_confirmed_by_name ? ` bởi ${d.phc_confirmed_by_name}` : ""}{d.phc_confirmed_at ? ` · ${new Date(d.phc_confirmed_at).toLocaleString("vi-VN")}` : ""}</div> : phcReady ? (
                    canFinalizePhcDelivery(profile) ? <form action="/api/deliveries" method="post" className="mt-4"><input type="hidden" name="delivery_id" value={d.id}/><Button name="action" value="finalize_delivery_phc" className="w-full">PHC xác nhận hoàn tất</Button><p className="mb-0 mt-2 text-center text-[11px] text-[var(--muted-foreground)]">Xác nhận sẽ cập nhật tồn thực tế. Nếu thiếu đơn giá, phiếu vẫn hoàn tất và chờ Admin bổ sung giá sau.</p></form> : <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-[#92400E]">Đã đủ XSC xác nhận · Chờ PHC hoàn tất</div>
                  ) : <div className="mt-4 rounded-lg bg-[var(--paper)] p-3 text-sm text-[var(--muted-foreground)]">PHC sẽ được xác nhận sau khi tất cả dòng giao đã được XSC xác nhận.</div>}

                  <div className="mt-4 border-t border-[var(--border)] pt-4">
                    <div className="flex items-center justify-between gap-2"><strong className="text-sm text-[var(--brand-deep)]">Trả vỏ cùng chuyến</strong><span className="rounded-full bg-green-50 px-2 py-1 text-[11px] font-bold text-[var(--success)]">+0 đ cước</span></div>
                    {tripReturns.length ? <div className="mt-2 grid gap-2">
                      {tripReturns.map((ret: any) => <div key={ret.id} className="rounded-xl border border-green-100 bg-green-50 p-3 text-sm">
                        <div className="flex flex-wrap justify-between gap-2"><div><strong>{ret.return_code}</strong><div className="mt-1 text-xs text-[var(--muted-foreground)]">{ret.source_location}</div></div><DeliveryBadge status={ret.status}/></div>
                        <div className="mt-2 grid gap-1">{(ret.items || []).map((i: any) => <div key={i.id} className="flex justify-between gap-3"><span>{i.product_name}</span><strong className="font-mono-data">{formatNumber(i.declared_qty)} {i.unit}</strong></div>)}</div>
                      </div>)}
                    </div> : null}
                    {canReturnThisDelivery && !ownLinkedReturn ? <details className="mt-2"><summary className="cursor-pointer rounded-xl bg-[var(--brand)] px-4 py-3 text-center text-sm font-bold text-white">Trả vỏ tại {ownReturnLocationCode === "PLANT" ? "Nhà máy" : "Mỏ Tà Thiết"}</summary><div className="mt-3"><SupplierReturnForm products={products as any} deliveryId={d.id} deliveryCode={d.delivery_code} locationName={ownReturnLocationName}/></div></details> : null}
                    {!canReturnThisDelivery && !tripReturns.length ? <p className="mb-0 mt-2 text-xs text-[var(--muted-foreground)]">Thủ kho chỉ được trả vỏ tại Nhà máy; XSC Mỏ chỉ được trả vỏ tại Mỏ. Nút chỉ xuất hiện khi chuyến có giao tại đúng địa điểm của user.</p> : null}
                  </div>
                </section>
              </div>
            </div>
          </details>;
        })}
        {!filteredDeliveries.length ? <Card><p className="m-0 text-sm text-[var(--muted-foreground)]">Không có phiếu phù hợp bộ lọc.</p></Card> : null}
      </div>
    </> : <>
      <Card className="border-blue-100 bg-blue-50">
        <CardTitle>Phiếu trả vỏ chỉ tạo từ Phiếu giao</CardTitle>
        <p className="mb-0 mt-2 text-sm text-[var(--muted-foreground)]">Không có chuyến riêng đi lấy vỏ. Một chuyến có thể giao cả Nhà máy và Mỏ. Thủ kho chỉ tạo trả vỏ tại Nhà máy; XSC Mỏ chỉ tạo trả vỏ tại Mỏ. Mỗi bên chỉ nhập loại vỏ + số lượng và đều dùng chung cước của Phiếu giao.</p>
      </Card>
      <Card className="overflow-hidden p-0"><div className="border-b border-[var(--border)] p-4 md:p-5"><CardTitle>Lịch sử trả vỏ NCC</CardTitle></div><div className="grid gap-3 p-3 md:p-5">
        {returns.map((r: any) => <article key={r.id} className="rounded-xl border border-[var(--border)] bg-white p-4"><div className="flex flex-wrap justify-between gap-3"><div><div className="font-mono-data font-bold text-[var(--brand)]">{r.return_code}</div><div className="mt-1 text-sm font-bold">{r.source_location} · {dateVN(r.return_date)}</div><div className="mt-1 text-xs text-[var(--muted-foreground)]">Cùng Phiếu giao {r.delivery_code || "—"} · Không phát sinh thêm cước</div></div><DeliveryBadge status={r.status} /></div>
          <div className="mt-3 grid gap-2 text-sm">{(r.items || []).map((i: any) => <div key={i.id} className="rounded-lg bg-[var(--paper)] p-3"><div className="flex justify-between gap-3"><span>{i.product_name}</span><strong className="font-mono-data">{formatNumber(i.declared_qty)} {i.unit}</strong></div>{i.feedback ? <div className="mt-2 text-xs font-bold text-[var(--danger)]">Phản hồi NCC: {i.feedback}</div> : null}{profile.role === "supplier" && i.status !== "feedback" ? <form action="/api/deliveries" method="post" className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"><input type="hidden" name="item_id" value={i.id}/><label className="grid gap-1 text-xs font-bold">Phản hồi nếu số liệu chưa đúng<Input name="feedback" required placeholder="Nhập nội dung sai lệch"/></label><Button name="action" value="feedback_supplier_return_item" variant="secondary">Phản hồi</Button></form> : null}</div>)}</div>
        </article>)}
        {!returns.length ? <p className="p-4 text-sm text-[var(--muted-foreground)]">Chưa có Phiếu trả vỏ.</p> : null}
      </div></Card>
    </>}
  </div>;
}
