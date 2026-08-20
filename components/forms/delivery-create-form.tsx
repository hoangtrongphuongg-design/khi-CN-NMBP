"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeftRight, ChevronDown, MapPin, Minus, Plus, Send, Trash2, Warehouse, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";

type Product = { id: string; code: string; name: string; unit: string };
type Location = { id: string; code: string; name: string };
type Line = { key: string; productId: string; quantity: string };

type Zone = "PLANT" | "MINE";

function normalizeDecimalInput(value: string) {
  const cleaned = value.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot < 0) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
}

function qtyNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function DeliveryCreateForm({ products, locations, today }: { products: Product[]; locations: Location[]; today: string }) {
  const plant = locations.find((l) => l.code === "PLANT");
  const mine = locations.find((l) => l.code === "MINE");
  const [plantLines, setPlantLines] = useState<Line[]>([]);
  const [mineLines, setMineLines] = useState<Line[]>([]);

  const payload = useMemo(() => [
    ...plantLines.map(({ productId, quantity }) => ({ productId, destinationLocationId: plant?.id || "", quantity: qtyNumber(quantity) })),
    ...mineLines.map(({ productId, quantity }) => ({ productId, destinationLocationId: mine?.id || "", quantity: qtyNumber(quantity) })),
  ], [plantLines, mineLines, plant?.id, mine?.id]);

  const hasPlant = plantLines.some((x) => x.productId && qtyNumber(x.quantity) > 0);
  const hasMine = mineLines.some((x) => x.productId && qtyNumber(x.quantity) > 0);
  const tripLabel = hasMine ? (hasPlant ? "Nhà máy + Mỏ Tà Thiết" : "Mỏ Tà Thiết") : hasPlant ? "Nhà máy" : "Chưa có dữ liệu giao";
  const feeLabel = hasMine ? "Chuyến này tính 1 cước Mỏ Tà Thiết" : hasPlant ? "Chuyến này tính 1 cước Nhà máy" : "Thêm ít nhất một loại khí ở Nhà máy hoặc Mỏ";

  function linesFor(zone: Zone) { return zone === "PLANT" ? plantLines : mineLines; }
  function setterFor(zone: Zone) { return zone === "PLANT" ? setPlantLines : setMineLines; }
  function addLine(zone: Zone) {
    const current = linesFor(zone);
    const next = products.find((p) => !current.some((x) => x.productId === p.id));
    if (!next) return;
    setterFor(zone)((old) => [...old, { key: crypto.randomUUID(), productId: next.id, quantity: "" }]);
  }
  function updateLine(zone: Zone, key: string, patch: Partial<Line>) {
    setterFor(zone)((old) => old.map((x) => x.key === key ? { ...x, ...patch } : x));
  }
  function removeLine(zone: Zone, key: string) {
    setterFor(zone)((old) => old.filter((x) => x.key !== key));
  }

  function renderZoneCard(zone: Zone, title: string, hint: string) {
    const current = linesFor(zone);
    const icon = zone === "PLANT" ? <Warehouse size={19}/> : <MapPin size={19}/>;
    return <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--paper)] px-4 py-3">
        <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-blue-50 text-[var(--brand)]">{icon}</span><div><div className="font-extrabold text-[var(--brand-deep)]">{title}</div><div className="text-xs text-[var(--muted-foreground)]">{hint}</div></div></div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[var(--muted-foreground)]">{current.length} loại</span>
      </div>

      <div className="grid gap-2 p-3">
        {current.map((line, index) => <div key={line.key} className="grid gap-2 rounded-xl border border-[var(--border)] p-3 md:grid-cols-[1fr_150px_42px] md:items-end">
          <FormField label={index === 0 ? "Loại khí / sản phẩm" : `Loại khí ${index + 1}`}>
            <Select value={line.productId} onChange={(e) => updateLine(zone, line.key, { productId: e.target.value })}>
              {products.filter((product) => product.id === line.productId || !current.some((x) => x.productId === product.id)).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Số lượng">
            <Input type="text" inputMode="decimal" autoComplete="off" placeholder="Nhập SL" value={line.quantity} onChange={(e) => updateLine(zone, line.key, { quantity: normalizeDecimalInput(e.target.value) })}/>
          </FormField>
          <Button type="button" variant="ghost" aria-label="Xóa dòng" title="Xóa dòng" onClick={() => removeLine(zone, line.key)}><Trash2 size={17}/></Button>
        </div>)}

        {!current.length ? <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-center text-sm text-[var(--muted-foreground)]">Không giao tại khu vực này thì để trống.</div> : null}
        <Button type="button" variant="secondary" disabled={current.length >= products.length} onClick={() => addLine(zone)} className="justify-center"><Plus size={17}/> Thêm loại khí</Button>
      </div>
    </section>;
  }

  return <form action="/api/deliveries" method="post" className="grid gap-4">
    <input type="hidden" name="action" value="create_delivery" />
    <input type="hidden" name="lines" value={JSON.stringify(payload)} />

    <div className="grid gap-3 md:grid-cols-[220px_1fr]">
      <FormField label="Ngày giao"><Input name="delivery_date" type="date" defaultValue={today} required /></FormField>
      <FormField label="Ghi chú" hint="Không bắt buộc"><Input name="note" placeholder="Có thể để trống" /></FormField>
    </div>

    <div className="grid gap-3 xl:grid-cols-2">
      {renderZoneCard("PLANT", "Giao Nhà máy", "Nhập các loại khí giao tại Nhà máy Xi măng Bình Phước")}
      {renderZoneCard("MINE", "Giao Mỏ Tà Thiết", "Nhập các loại khí giao tại Mỏ; nếu có số liệu Mỏ thì cả chuyến áp dụng cước Mỏ")}
    </div>

    <div className={`rounded-xl border px-4 py-3 text-sm ${hasMine ? "border-orange-200 bg-orange-50" : "border-blue-100 bg-blue-50"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold text-[var(--muted-foreground)]">Tuyến chuyến</span><strong className="text-[var(--brand-deep)]">{tripLabel}</strong></div>
      <div className="mt-1 text-xs font-semibold text-[var(--muted-foreground)]">{feeLabel}. 1 Phiếu giao = 1 chuyến = 1 cước; trả vỏ cùng chuyến không phát sinh thêm cước.</div>
    </div>

    <div className="flex justify-end"><Button type="submit" disabled={!hasPlant && !hasMine} className="min-w-[180px]"><Send size={17}/> Tạo phiếu giao</Button></div>
  </form>;
}

type TransferProduct = { id: string; code: string; name: string; unit: string };
type TransferDirection = "plant_to_mine" | "mine_to_plant";
type TransferItem = { key: string; productId: string; quantity: string; sourceBucket: "full" | "empty" | "managed" };

export function TransferQuickForm({ products, direction, today }: { products: TransferProduct[]; direction: TransferDirection; today: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [items, setItems] = useState<TransferItem[]>([{ key: crypto.randomUUID(), productId: products[0]?.id || "", quantity: "", sourceBucket: direction === "plant_to_mine" ? "full" : "managed" }]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removeIndex, setRemoveIndex] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const payload = useMemo(() => items.map(({ productId, quantity, sourceBucket }) => ({ productId, quantity: qtyNumber(quantity), sourceBucket })), [items]);

  function updateProduct(index: number, productId: string) {
    setItems((old) => old.map((x, i) => i === index ? { ...x, productId } : x));
  }
  function updateQty(index: number, quantity: string) {
    const digits = quantity.replace(/\D/g, "");
    setItems((old) => old.map((x, i) => i === index ? { ...x, quantity: digits } : x));
  }
  function stepQty(index: number, delta: number) {
    setItems((old) => old.map((x, i) => {
      if (i !== index) return x;
      const current = Math.floor(qtyNumber(x.quantity));
      return { ...x, quantity: String(Math.max(1, current + delta || 1)) };
    }));
  }
  function updateBucket(index: number, sourceBucket: "full" | "empty") {
    setItems((old) => old.map((x, i) => i === index ? { ...x, sourceBucket } : x));
  }
  function addItem() {
    const available = products.find((p) => !items.some((x) => x.productId === p.id));
    if (!available) return;
    setItems((old) => [...old, { key: crypto.randomUUID(), productId: available.id, quantity: "", sourceBucket: direction === "plant_to_mine" ? "full" : "managed" }]);
  }
  function confirmRemove() {
    if (removeIndex == null) return;
    setItems((old) => old.filter((_, i) => i !== removeIndex));
    setRemoveIndex(null);
  }
  function askSubmit() {
    if (!items.length || items.some((x) => !x.productId || qtyNumber(x.quantity) <= 0)) return;
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
          <div><div className="text-xs font-bold text-[var(--muted-foreground)]">Số lượng</div><div className="mt-1 grid grid-cols-[38px_1fr_38px] overflow-hidden rounded-xl border border-[var(--border)]"><button type="button" onClick={() => stepQty(index, -1)} className="grid min-h-11 place-items-center hover:bg-[var(--muted)]"><Minus size={16}/></button><input value={item.quantity} onChange={(e) => updateQty(index, e.target.value)} inputMode="numeric" pattern="[0-9]*" type="text" autoComplete="off" placeholder="SL" className="min-w-0 border-x border-[var(--border)] text-center font-mono-data font-extrabold outline-none"/><button type="button" onClick={() => stepQty(index, 1)} className="grid min-h-11 place-items-center hover:bg-[var(--muted)]"><Plus size={16}/></button></div></div>
          {direction === "plant_to_mine" ? <label className="grid gap-1 text-xs font-bold text-[var(--muted-foreground)]">Loại chai<select value={item.sourceBucket} onChange={(e) => updateBucket(index, e.target.value as "full"|"empty")} className="min-h-11 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-bold text-[var(--ink)]"><option value="full">Chai đầy</option><option value="empty">Chai rỗng</option></select></label> : <div className="rounded-xl bg-[var(--paper)] px-3 py-2 text-sm"><div className="text-[11px] font-bold text-[var(--muted-foreground)]">Nơi nhận</div><div className="font-bold">Kho · Vỏ rỗng</div></div>}
          <button type="button" onClick={() => setRemoveIndex(index)} disabled={items.length <= 1} className="rounded-xl p-2.5 text-[var(--danger)] hover:bg-red-50 disabled:opacity-30" aria-label="Xóa dòng"><Trash2 size={18}/></button>
        </div>)}
      </div>

      <button type="button" onClick={addItem} disabled={items.length >= products.length} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--brand)]/35 bg-blue-50/30 font-bold text-[var(--brand)] disabled:opacity-40"><Plus size={17}/>Thêm loại khí</button>
      <label className="mt-4 grid gap-1 text-sm font-bold">Ghi chú <span className="font-normal text-[var(--muted-foreground)]">(không bắt buộc)</span><textarea name="note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Nhập ghi chú nếu có..." className="rounded-xl border border-[var(--border)] px-3 py-2.5 font-normal outline-none focus:border-[var(--brand)]"/></label>
      <button type="button" onClick={askSubmit} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 font-extrabold text-white hover:bg-[var(--brand-hover)]"><Send size={18}/>{direction === "plant_to_mine" ? "Tạo điều chuyển" : "Gửi điều chuyển về Nhà máy"}</button>
    </form>

    {confirmOpen ? <div className="fixed inset-0 z-[95] grid place-items-center bg-slate-950/40 p-4"><div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-white p-5 shadow-2xl"><div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-blue-50 text-[var(--brand)]"><AlertTriangle size={21}/></div><h3 className="mt-3 text-center text-lg font-extrabold">Xác nhận điều chuyển?</h3><p className="mt-1 text-center text-sm text-[var(--muted-foreground)]">Tồn nơi gửi sẽ giảm và nơi nhận sẽ tăng ngay sau khi xác nhận.</p><div className="mt-4 rounded-xl bg-[var(--paper)] p-3 text-sm">{items.map((item) => { const p = products.find((x) => x.id === item.productId); return p ? <div key={item.key} className="flex justify-between gap-3 py-1"><span>{p.name}</span><strong className="font-mono-data">{qtyNumber(item.quantity)} {p.unit}</strong></div> : null; })}</div><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => setConfirmOpen(false)} className="min-h-11 rounded-xl border border-[var(--border)] font-bold">Hủy</button><button type="button" onClick={submit} className="min-h-11 rounded-xl bg-[var(--brand)] font-bold text-white">Xác nhận</button></div></div></div> : null}
    {removeIndex != null ? <div className="fixed inset-0 z-[96] grid place-items-center bg-slate-950/40 p-4"><div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-white p-5 shadow-2xl"><div className="flex gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-red-50 text-[var(--danger)]"><Trash2 size={19}/></div><div><h3 className="m-0 text-base font-extrabold">Xóa loại khí khỏi lệnh?</h3><p className="mt-1 text-sm text-[var(--muted-foreground)]">Dòng đang chọn sẽ được bỏ khỏi điều chuyển.</p></div></div><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => setRemoveIndex(null)} className="min-h-11 rounded-xl border border-[var(--border)] font-bold">Hủy</button><button type="button" onClick={confirmRemove} className="min-h-11 rounded-xl bg-[var(--danger)] font-bold text-white">Xóa dòng</button></div></div></div> : null}
  </>;
}
