import { redirect } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/status-badge";
import { requireProfile } from "@/lib/auth/session";
import { getProducts } from "@/lib/services/catalog";
import { listTransfers } from "@/lib/services/transfers";
import { formatNumber, toDateInput } from "@/lib/utils";

export default async function TransfersPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const profile = await requireProfile();
  if (["supplier","foreman","supervisor","worker"].includes(profile.role)) redirect("/dashboard");
  const params = await searchParams;
  const [products, transfers] = await Promise.all([getProducts(), listTransfers()]);
  const canPlantToMine = ["workshop","warehouse_manager"].includes(profile.role);
  const canMineToPlant = ["mine_xsc"].includes(profile.role);
  const canReceivePlant = profile.role === "storekeeper";
  const canReview = ["warehouse_manager","workshop"].includes(profile.role);
  return <div className="grid gap-5">
    <div><h1 className="font-display m-0 text-2xl text-[var(--brand-deep)]">Điều chuyển Nhà máy ↔ Mỏ</h1><p className="mt-1 text-sm text-[var(--muted-foreground)]">Khi xuất đi, số lượng chuyển sang “Đang vận chuyển”. Chỉ cộng nơi nhận sau khi xác nhận thực nhận.</p></div>
    {params.error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-[#B91C1C]">{params.error}</div> : null}
    {(canPlantToMine || canMineToPlant) ? <Card><CardTitle>Tạo điều chuyển</CardTitle><form action="/api/transfers" method="post" className="mt-4 grid gap-3 md:grid-cols-5 md:items-end"><input type="hidden" name="action" value="create"/>
      <FormField label="Chiều điều chuyển"><Select name="direction">{canPlantToMine ? <option value="plant_to_mine">Nhà máy → Mỏ</option> : null}{canMineToPlant ? <option value="mine_to_plant">Mỏ → Nhà máy</option> : null}</Select></FormField>
      <FormField label="Ngày"><Input name="transfer_date" type="date" defaultValue={toDateInput()} required/></FormField>
      <FormField label="Loại khí"><Select name="product_id">{products.filter((p:any)=>p.returnable_container && p.warehouse_split_full_empty).map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</Select></FormField>
      <FormField label="Số lượng"><Input name="quantity" type="number" min="1" step="1" required/></FormField>
      <Button type="submit">Xuất điều chuyển</Button>
      {canPlantToMine ? <div className="md:col-span-2"><FormField label="Tình trạng chai xuất"><Select name="source_bucket"><option value="full">Chai đầy</option><option value="empty">Chai rỗng</option></Select></FormField></div> : null}
      <div className="md:col-span-3"><FormField label="Ghi chú" hint="Không bắt buộc"><Input name="note" /></FormField></div>
    </form></Card> : null}

    <Card className="overflow-hidden p-0"><div className="border-b border-[var(--border)] p-4 md:p-5"><CardTitle>Phiếu điều chuyển</CardTitle></div><div className="grid gap-3 p-3 md:p-5">
      {transfers.map((t:any)=><article key={t.id} className="rounded-xl border border-[var(--border)] p-4"><div className="flex flex-wrap justify-between gap-3"><div><div className="font-mono-data font-bold text-[var(--brand)]">{t.transfer_code}</div><div className="mt-1 font-bold">{t.direction === "plant_to_mine" ? "Nhà máy → Mỏ Tà Thiết" : "Mỏ Tà Thiết → Nhà máy"}</div><div className="mt-1 text-sm">{t.product_name}: <span className="font-mono-data font-bold">{formatNumber(t.quantity)} {t.unit}</span>{t.received_qty != null ? <> · Đã nhận {formatNumber(t.received_qty)}</> : null}</div><div className="mt-1 text-xs text-[var(--muted-foreground)]">{String(t.transfer_date).slice(0,10)} · {t.created_by_name}</div></div><StatusBadge status={t.status}/></div>
        {t.feedback ? <div className="mt-2 text-sm font-semibold text-[#B91C1C]">{t.feedback}</div> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {t.status === "in_transit" && t.direction === "plant_to_mine" && ["mine_xsc"].includes(profile.role) ? <form action="/api/transfers" method="post" className="flex items-end gap-2"><input type="hidden" name="action" value="receive"/><input type="hidden" name="transfer_id" value={t.id}/><label className="grid gap-1 text-xs font-bold">SL thực nhận<Input name="received_qty" type="number" min="1" defaultValue={t.quantity}/></label><Button type="submit">XSC Mỏ xác nhận</Button></form> : null}
          {t.status === "in_transit" && t.direction === "mine_to_plant" && canReceivePlant ? <form action="/api/transfers" method="post" className="flex flex-wrap items-end gap-2"><input type="hidden" name="action" value="receive"/><input type="hidden" name="transfer_id" value={t.id}/><label className="grid gap-1 text-xs font-bold">SL thực nhận<Input name="received_qty" type="number" min="1" defaultValue={t.quantity}/></label><label className="grid gap-1 text-xs font-bold">Tình trạng<Select name="destination_bucket"><option value="empty">Rỗng</option><option value="full">Đầy</option></Select></label><Button type="submit">Thủ kho nhận</Button></form> : null}
          {t.status === "received_pending_review" && canReview ? <><form action="/api/transfers" method="post"><input type="hidden" name="action" value="review_approve"/><input type="hidden" name="transfer_id" value={t.id}/><Button type="submit">Hậu kiểm · Duyệt</Button></form><form action="/api/transfers" method="post" className="flex gap-2"><input type="hidden" name="action" value="review_feedback"/><input type="hidden" name="transfer_id" value={t.id}/><Input name="feedback" placeholder="Nội dung phản hồi"/><Button variant="secondary" type="submit">Phản hồi</Button></form></> : null}
        </div>
      </article>)}
    </div></Card>
  </div>;
}
