import { redirect } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { DeliveryCreateForm } from "@/components/forms/delivery-create-form";
import { SupplierReturnForm } from "@/components/forms/supplier-return-form";
import { SupplierReturnConfirmForm } from "@/components/forms/supplier-return-confirm-form";
import { requireProfile } from "@/lib/auth/session";
import { canConfirmMineDelivery, canConfirmPlantDelivery, canFeedbackDelivery } from "@/lib/auth/permissions";
import { getLocations, getProducts } from "@/lib/services/catalog";
import { listDeliveries } from "@/lib/services/deliveries";
import { listSupplierReturns } from "@/lib/services/supplier-returns";
import { sql } from "@/lib/db";
import { formatCurrency, formatNumber, toDateInput } from "@/lib/utils";

export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const profile = await requireProfile();
  if (["foreman","supervisor","worker"].includes(profile.role)) redirect("/dashboard");
  const params = await searchParams;
  const [products, locations, deliveries, returns, trips] = await Promise.all([
    getProducts(), getLocations(), listDeliveries(profile), listSupplierReturns(profile),
    sql`SELECT id,trip_code,trip_date,status FROM transport_trips WHERE status<>'cancelled' AND trip_date>=CURRENT_DATE-interval '14 days' ORDER BY trip_date DESC,created_at DESC`,
  ]);
  const canCreateReturn = ["workshop","warehouse_manager","storekeeper","mine_xsc"].includes(profile.role);
  const returnLocations = profile.role === "mine_xsc"
    ? (locations as any[]).filter((l) => l.code === "MINE")
    : (locations as any[]).filter((l) => l.code === "PLANT");
  return <div className="grid gap-5">
    <div><h1 className="font-display m-0 text-2xl text-[var(--brand-deep)]">Giao nhận NCC</h1><p className="mt-1 text-sm text-[var(--muted-foreground)]">NCC tạo Phiếu giao. Nhà máy/Mỏ xác nhận theo địa điểm. Phiếu trả vỏ có thể liên kết cùng mã chuyến để chỉ tính 1 cước.</p></div>
    {params.error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-[#B91C1C]">{params.error}</div> : null}
    {profile.role === "supplier" ? <Card><CardTitle>Tạo Phiếu giao hàng</CardTitle><div className="mt-4"><DeliveryCreateForm products={products as any} locations={locations as any} today={toDateInput()} /></div></Card> : null}
    {canCreateReturn ? <Card><CardTitle>Tạo Phiếu trả vỏ cho NCC</CardTitle><div className="mt-4"><SupplierReturnForm products={products as any} locations={returnLocations as any} trips={trips as any} today={toDateInput()} /></div></Card> : null}

    <Card className="overflow-hidden p-0"><div className="border-b border-[var(--border)] p-4 md:p-5"><CardTitle>Phiếu giao gần nhất</CardTitle></div><div className="grid gap-3 p-3 md:p-5">
      {deliveries.map((d: any) => <article key={d.id} className="rounded-xl border border-[var(--border)] bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-mono-data text-sm font-bold text-[var(--brand)]">{d.delivery_code}</div><div className="mt-1 font-bold">{d.supplier_name} · {String(d.delivery_date).slice(0,10)}</div><div className="mt-1 text-xs text-[var(--muted-foreground)]">{d.trip_code} · Cước {formatCurrency(d.transport_amount)}</div></div><StatusBadge status={d.status} /></div>
        <div className="mt-4 grid gap-2">{(d.items || []).map((item: any) => {
          const canConfirm = item.location_code === "PLANT" ? canConfirmPlantDelivery(profile) : canConfirmMineDelivery(profile);
          const canFeedback = canFeedbackDelivery(profile);
          return <div key={item.id} className="rounded-lg bg-[var(--paper)] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><strong>{item.product_name}</strong> · {item.location_name}<div className="mt-1 text-xs text-[var(--muted-foreground)]">NCC khai: <span className="font-mono-data font-bold">{formatNumber(item.declared_qty)} {item.unit}</span>{item.confirmed_qty != null ? <> · Thực nhận: <span className="font-mono-data font-bold">{formatNumber(item.confirmed_qty)}</span></> : null}</div></div><StatusBadge status={item.status} /></div>
          {profile.role === "supplier" && item.status === "feedback" ? <form action="/api/deliveries" method="post" className="mt-3 flex flex-wrap items-end gap-2"><input type="hidden" name="item_id" value={item.id}/><label className="grid gap-1 text-xs font-bold">SL NCC cập nhật<Input name="declared_qty" type="number" min="0.001" step="0.001" defaultValue={item.declared_qty} required/></label><Button name="action" value="supplier_resubmit_delivery_item">Gửi lại</Button></form> : null}
          {(canConfirm || canFeedback) && item.status !== "confirmed" ? <form action="/api/deliveries" method="post" className="mt-3 grid gap-2 sm:grid-cols-[140px_1fr_auto_auto] sm:items-end"><input type="hidden" name="item_id" value={item.id} /><label className="grid gap-1 text-xs font-bold">SL thực nhận<Input name="actual_qty" type="number" min="0" step="0.001" defaultValue={item.confirmed_qty ?? item.declared_qty} /></label><label className="grid gap-1 text-xs font-bold">Phản hồi<Input name="feedback" placeholder="Không bắt buộc" /></label>{canFeedback ? <Button name="action" value="feedback_delivery_item" variant="secondary">Phản hồi</Button> : <span/>}{canConfirm ? <Button name="action" value="confirm_delivery_item">Xác nhận</Button> : null}</form> : null}
          {item.feedback ? <div className="mt-2 text-xs font-semibold text-[#B91C1C]">{item.feedback}</div> : null}</div>;
        })}</div>
      </article>)}
      {!deliveries.length ? <p className="p-4 text-sm text-[var(--muted-foreground)]">Chưa có Phiếu giao.</p> : null}
    </div></Card>

    <Card className="overflow-hidden p-0"><div className="border-b border-[var(--border)] p-4 md:p-5"><CardTitle>Phiếu trả vỏ NCC</CardTitle></div><div className="grid gap-3 p-3 md:p-5">
      {returns.map((r: any) => <article key={r.id} className="rounded-xl border border-[var(--border)] p-4"><div className="flex flex-wrap justify-between gap-3"><div><div className="font-mono-data font-bold text-[var(--brand)]">{r.return_code}</div><div className="mt-1 text-sm font-bold">{r.source_location} · {String(r.return_date).slice(0,10)}</div><div className="mt-1 text-xs text-[var(--muted-foreground)]">{r.trip_code || "Chưa gắn chuyến"}</div></div><StatusBadge status={r.status} /></div>
        <div className="mt-3 grid gap-1 text-sm">{(r.items || []).map((i: any) => <div key={i.id} className="flex justify-between gap-3"><span>{i.product_name}</span><span className="font-mono-data">{formatNumber(i.declared_qty)} {i.unit}{i.confirmed_qty != null ? ` → ${formatNumber(i.confirmed_qty)}` : ""}</span></div>)}</div>
        {profile.role === "supplier" && r.status === "pending" ? <div className="mt-4 border-t border-[var(--border)] pt-4"><SupplierReturnConfirmForm returnId={r.id} items={r.items as any} /></div> : null}
      </article>)}
    </div></Card>
  </div>;
}
