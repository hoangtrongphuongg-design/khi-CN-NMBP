"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeftRight, ChevronDown, Minus, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";

type Product = { id: string; code: string; name: string; unit: string };
type Location = { id: string; code: string; name: string };
type Line = { key: string; productId: string; destinationLocationId: string; quantity: number };

export function DeliveryCreateForm({ products, locations, today }: { products: Product[]; locations: Location[]; today: string }) {
  const [lines, setLines] = useState<Line[]>([
    { key: crypto.randomUUID(), productId: products[0]?.id || "", destinationLocationId: locations[0]?.id || "", quantity: 1 },
  ]);
  const payload = useMemo(
    () => lines.map(({ productId, destinationLocationId, quantity }) => ({ productId, destinationLocationId, quantity })),
    [lines],
  );

  return (
    <form action="/api/deliveries" method="post" className="grid gap-4">
      <input type="hidden" name="action" value="create_delivery" />
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />

      <div className="grid gap-3 md:grid-cols-[180px_1fr]">
        <FormField label="Ngày giao">
          <Input name="delivery_date" type="date" defaultValue={today} required />
        </FormField>
        <FormField label="Ghi chú" hint="Không bắt buộc">
          <Input name="note" placeholder="Có thể để trống" />
        </FormField>
      </div>

      <div className="grid gap-2">
        {lines.map((line, index) => (
          <div key={line.key} className="grid gap-2 rounded-xl border border-[var(--border)] bg-white p-3 md:grid-cols-[1.35fr_1fr_130px_42px] md:items-end">
            <FormField label={index === 0 ? "Loại khí / sản phẩm" : `Loại khí ${index + 1}`}>
              <Select
                value={line.productId}
                onChange={(e) => setLines((old) => old.map((x) => (x.key === line.key ? { ...x, productId: e.target.value } : x)))}
              >
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </FormField>
            <FormField label="Điểm giao">
              <Select
                value={line.destinationLocationId}
                onChange={(e) => setLines((old) => old.map((x) => (x.key === line.key ? { ...x, destinationLocationId: e.target.value } : x)))}
              >
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </FormField>
            <FormField label="Số lượng">
              <Input
                type="number"
                min="0.001"
                step="0.001"
                value={line.quantity}
                onChange={(e) => setLines((old) => old.map((x) => (x.key === line.key ? { ...x, quantity: Number(e.target.value) } : x)))}
              />
            </FormField>
            <Button
              type="button"
              variant="ghost"
              aria-label="Xóa dòng"
              title="Xóa dòng"
              onClick={() => setLines((old) => (old.length === 1 ? old : old.filter((x) => x.key !== line.key)))}
            >
              <Trash2 size={17} />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setLines((old) => [...old, {
            key: crypto.randomUUID(),
            productId: products[0]?.id || "",
            destinationLocationId: locations[0]?.id || "",
            quantity: 1,
          }])}
        >
          <Plus size={17} /> Thêm dòng
        </Button>
        <Button type="submit" className="ml-auto min-w-[150px]">Tạo phiếu</Button>
      </div>

      <details className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--paper)] px-3 py-2">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-bold text-[var(--muted-foreground)]">
          <ChevronDown size={15} /> Tùy chọn chuyến xe
        </summary>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="visits_mine" /> Xe có vào Mỏ Tà Thiết để giao hoặc gom vỏ</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="co2_special" /> Xe chuyên dụng CO₂ lỏng</label>
        </div>
      </details>
    </form>
  );
}

type TransferProduct = { id: string; code: string; name: string; unit: string };
type TransferDirection = "plant_to_mine" | "mine_to_plant";
type TransferItem = { key: string; productId: string; quantity: number; sourceBucket: "full" | "empty" | "managed" };

export function TransferQuickForm({ products, direction, today }: { products: TransferProduct[]; direction: TransferDirection; today: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [items, setItems] = useState<TransferItem[]>([{ key: crypto.randomUUID(), productId: products[0]?.id || "", quantity: 1, sourceBucket: direction === "plant_to_mine" ? "full" : "managed" }]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removeIndex, setRemoveIndex] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const payload = useMemo(() => items.map(({ productId, quantity, sourceBucket }) => ({ productId, quantity, sourceBucket })), [items]);

  function updateProduct(index: number, productId: string) {
    setItems((old) => old.map((x, i) => i === index ? { ...x, productId } : x));
  }
  function updateQty(index: number, quantity: number) {
    setItems((old) => old.map((x, i) => i === index ? { ...x, quantity: Math.max(1, Number.isFinite(quantity) ? Math.floor(quantity) : 1) } : x));
  }
  function updateBucket(index: number, sourceBucket: "full" | "empty") {
    setItems((old) => old.map((x, i) => i === index ? { ...x, sourceBucket } : x));
  }
  function addItem() {
    const available = products.find((p) => !items.some((x) => x.productId === p.id));
    if (!available) return;
    setItems((old) => [...old, { key: crypto.randomUUID(), productId: available.id, quantity: 1, sourceBucket: direction === "plant_to_mine" ? "full" : "managed" }]);
  }
  function confirmRemove() {
    if (removeIndex == null) return;
    setItems((old) => old.filter((_, i) => i !== removeIndex));
    setRemoveIndex(null);
  }
  function askSubmit() {
    if (!items.length || items.some((x) => !x.productId || x.quantity <= 0)) return;
    setConfirmOpen(true);
  }
  function submit() {
    setConfirmOpen(false);
    formRef.current?.requestSubmit();
  }

  return <>
    <form ref={formRef} action="/api/transfers" method="post" data-no-confirm="true" className="role-form-card">
      <input type="hidden" name="action" value="create"/>
      <input type="hidden" name="direction" value={direction}/>
      <input type="hidden" name="items" value={JSON.stringify(payload)}/>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-bold">Ngày điều chuyển<input name="transfer_date" type="date" defaultValue={today} required className="min-h-11 rounded-xl border border-[var(--border)] bg-white px-3"/></label>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--paper)] p-3 text-sm"><div className="text-xs font-bold text-[var(--muted-foreground)]">Tuyến điều chuyển</div><div className="mt-1 flex items-center gap-2 font-extrabold text-[var(--brand-deep)]">{direction === "plant_to_mine" ? "Nhà máy" : "Mỏ Tà Thiết"}<ArrowLeftRight size={17}/>{direction === "plant_to_mine" ? "Mỏ Tà Thiết" : "Kho Hậu cần"}</div></div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
        {items.map((item, index) => <div key={item.key} className="grid gap-3 border-b border-[var(--border)] p-3 last:border-b-0 md:grid-cols-[1.4fr_.8fr_.8fr_auto] md:items-end">
          <label className="grid gap-1 text-xs font-bold text-[var(--muted-foreground)]">Loại khí<select value={item.productId} onChange={(e) => updateProduct(index, e.target.value)} className="min-h-11 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-bold text-[var(--ink)]">{products.filter((p) => p.id === item.productId || !items.some((x, i) => i !== index && x.productId === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <div><div className="text-xs font-bold text-[var(--muted-foreground)]">Số lượng</div><div className="mt-1 grid grid-cols-[38px_1fr_38px] overflow-hidden rounded-xl border border-[var(--border)]"><button type="button" onClick={() => updateQty(index, item.quantity - 1)} className="grid min-h-11 place-items-center hover:bg-[var(--muted)]"><Minus size={16}/></button><input value={item.quantity} onChange={(e) => updateQty(index, Number(e.target.value))} inputMode="numeric" type="number" min="1" className="min-w-0 border-x border-[var(--border)] text-center font-mono-data font-extrabold outline-none"/><button type="button" onClick={() => updateQty(index, item.quantity + 1)} className="grid min-h-11 place-items-center hover:bg-[var(--muted)]"><Plus size={16}/></button></div></div>
          {direction === "plant_to_mine" ? <label className="grid gap-1 text-xs font-bold text-[var(--muted-foreground)]">Loại chai<select value={item.sourceBucket} onChange={(e) => updateBucket(index, e.target.value as "full"|"empty")} className="min-h-11 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-bold text-[var(--ink)]"><option value="full">Chai đầy</option><option value="empty">Chai rỗng</option></select></label> : <div className="rounded-xl bg-[var(--paper)] px-3 py-2 text-sm"><div className="text-[11px] font-bold text-[var(--muted-foreground)]">Nơi nhận</div><div className="font-bold">Kho · Vỏ rỗng</div></div>}
          <button type="button" onClick={() => setRemoveIndex(index)} disabled={items.length <= 1} className="rounded-xl p-2.5 text-[var(--danger)] hover:bg-red-50 disabled:opacity-30" aria-label="Xóa dòng"><Trash2 size={18}/></button>
        </div>)}
      </div>

      <button type="button" onClick={addItem} disabled={items.length >= products.length} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--brand)]/35 bg-blue-50/30 font-bold text-[var(--brand)] disabled:opacity-40"><Plus size={17}/>Thêm loại khí</button>
      <label className="mt-4 grid gap-1 text-sm font-bold">Ghi chú <span className="font-normal text-[var(--muted-foreground)]">(không bắt buộc)</span><textarea name="note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Nhập ghi chú nếu có..." className="rounded-xl border border-[var(--border)] px-3 py-2.5 font-normal outline-none focus:border-[var(--brand)]"/></label>
      <button type="button" onClick={askSubmit} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 font-extrabold text-white hover:bg-[var(--brand-hover)]"><Send size={18}/>{direction === "plant_to_mine" ? "Tạo điều chuyển" : "Gửi điều chuyển về Nhà máy"}</button>
    </form>

    {confirmOpen ? <div className="fixed inset-0 z-[95] grid place-items-center bg-slate-950/40 p-4"><div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-white p-5 shadow-2xl"><div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-blue-50 text-[var(--brand)]"><AlertTriangle size={21}/></div><h3 className="mt-3 text-center text-lg font-extrabold">Xác nhận điều chuyển?</h3><p className="mt-1 text-center text-sm text-[var(--muted-foreground)]">Tồn nơi gửi sẽ giảm và nơi nhận sẽ tăng ngay sau khi xác nhận.</p><div className="mt-4 rounded-xl bg-[var(--paper)] p-3 text-sm">{items.map((item) => { const p = products.find((x) => x.id === item.productId); return p ? <div key={item.key} className="flex justify-between gap-3 py-1"><span>{p.name}</span><strong className="font-mono-data">{item.quantity} {p.unit}</strong></div> : null; })}</div><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => setConfirmOpen(false)} className="min-h-11 rounded-xl border border-[var(--border)] font-bold">Hủy</button><button type="button" onClick={submit} className="min-h-11 rounded-xl bg-[var(--brand)] font-bold text-white">Xác nhận</button></div></div></div> : null}
    {removeIndex != null ? <div className="fixed inset-0 z-[96] grid place-items-center bg-slate-950/40 p-4"><div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-white p-5 shadow-2xl"><div className="flex gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-red-50 text-[var(--danger)]"><Trash2 size={19}/></div><div><h3 className="m-0 text-base font-extrabold">Xóa loại khí khỏi lệnh?</h3><p className="mt-1 text-sm text-[var(--muted-foreground)]">Dòng đang chọn sẽ được bỏ khỏi điều chuyển.</p></div></div><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => setRemoveIndex(null)} className="min-h-11 rounded-xl border border-[var(--border)] font-bold">Hủy</button><button type="button" onClick={confirmRemove} className="min-h-11 rounded-xl bg-[var(--danger)] font-bold text-white">Xóa dòng</button></div></div></div> : null}
  </>;
}
