"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Boxes, CheckCircle2, Handshake, Minus, Plus, Repeat2, RotateCcw, Send, Trash2, Warehouse, X } from "lucide-react";
import { formatNumber } from "@/lib/utils";

type RequestType = "exchange" | "borrow" | "return";

type ProductQuick = {
  id: string;
  code: string;
  name: string;
  unit: string;
  groupQty: number;
  warehouseFull: number;
  warehouseEmpty: number;
  normQty: number;
};

type DraftItem = { productId: string; quantity: number };

type Props = {
  groupName: string;
  products: ProductQuick[];
  canCreate: boolean;
  pendingCount?: number;
  compact?: boolean;
};

const MODE_LABEL: Record<RequestType, string> = { exchange: "đổi", borrow: "mượn", return: "trả" };

function tone(code: string) {
  if (code === "O2") return { icon: "text-emerald-700 bg-emerald-50", number: "text-emerald-700" };
  if (code === "CO2") return { icon: "text-slate-600 bg-slate-100", number: "text-[var(--brand)]" };
  if (code === "ARCO2") return { icon: "text-orange-600 bg-orange-50", number: "text-orange-600" };
  if (code === "N2") return { icon: "text-cyan-700 bg-cyan-50", number: "text-cyan-700" };
  if (code.startsWith("LPG")) return { icon: "text-red-600 bg-red-50", number: "text-red-600" };
  return { icon: "text-[var(--brand)] bg-blue-50", number: "text-[var(--brand)]" };
}

export function GroupQuickPanel({ groupName, products, canCreate, pendingCount = 0, compact = false }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<RequestType | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [removeIndex, setRemoveIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "danger"; message: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const visibleGroup = useMemo(() => products.filter((p) => Number(p.groupQty) > 0), [products]);
  const visibleWarehouse = useMemo(() => products.filter((p) => Number(p.warehouseFull) > 0 || Number(p.warehouseEmpty) > 0), [products]);

  function preferredProduct(nextMode: RequestType) {
    const list = nextMode === "borrow" ? products.filter((p) => p.warehouseFull > 0) : products.filter((p) => p.groupQty > 0);
    return list[0] || products[0];
  }

  function openMode(nextMode: RequestType) {
    if (!canCreate) return;
    const first = preferredProduct(nextMode);
    setMode(nextMode);
    setItems(first ? [{ productId: first.id, quantity: 1 }] : []);
    setNote("");
    setConfirmOpen(false);
  }

  function resetSheet() {
    setMode(null);
    setItems([]);
    setNote("");
    setConfirmOpen(false);
    setDiscardOpen(false);
    setRemoveIndex(null);
  }

  function closeSheet() {
    if (submitting) return;
    if (items.length || note.trim()) setDiscardOpen(true);
    else resetSheet();
  }

  function productFor(id: string) {
    return products.find((p) => p.id === id);
  }

  function maxFor(item: DraftItem) {
    const product = productFor(item.productId);
    if (!product || !mode) return undefined;
    if (mode === "return" || mode === "exchange") return Math.max(0, Math.floor(product.groupQty));
    return undefined;
  }

  function updateQty(index: number, value: number) {
    setItems((prev) => prev.map((item, i) => {
      if (i !== index) return item;
      const max = maxFor(item);
      const next = Math.max(1, Math.floor(value || 1));
      return { ...item, quantity: max != null && max > 0 ? Math.min(next, max) : next };
    }));
  }

  function updateProduct(index: number, productId: string) {
    setItems((prev) => prev.map((item, i) => i === index ? { productId, quantity: 1 } : item));
  }

  function addItem() {
    const used = new Set(items.map((x) => x.productId));
    const candidates = mode === "borrow" ? products : products.filter((p) => p.groupQty > 0);
    const next = candidates.find((p) => !used.has(p.id)) || products.find((p) => !used.has(p.id));
    if (next) setItems((prev) => [...prev, { productId: next.id, quantity: 1 }]);
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    setRemoveIndex(index);
  }

  function confirmRemoveItem() {
    if (removeIndex == null) return;
    setItems((prev) => prev.filter((_, i) => i !== removeIndex));
    setRemoveIndex(null);
  }

  function validate() {
    if (!mode) return "Chưa chọn nghiệp vụ.";
    if (!items.length) return "Phiếu phải có ít nhất một loại khí.";
    if (new Set(items.map((x) => x.productId)).size !== items.length) return "Một loại khí chỉ được xuất hiện một lần trong phiếu.";
    for (const item of items) {
      const product = productFor(item.productId);
      if (!product || item.quantity <= 0) return "Số lượng phải lớn hơn 0.";
      if ((mode === "return" || mode === "exchange") && item.quantity > product.groupQty) return `${product.name}: số lượng không được lớn hơn số chai tại nhóm (${formatNumber(product.groupQty)}).`;
    }
    return null;
  }

  function askSubmit() {
    const error = validate();
    if (error) {
      setToast({ tone: "danger", message: error });
      return;
    }
    setConfirmOpen(true);
  }

  async function submit() {
    if (!mode) return;
    const error = validate();
    if (error) { setConfirmOpen(false); setToast({ tone: "danger", message: error }); return; }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.set("action", "create");
      form.set("request_type", mode);
      form.set("items_json", JSON.stringify(items));
      form.set("note", note);
      const response = await fetch("/api/internal", { method: "POST", body: form, headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Không thể tạo phiếu.");
      setConfirmOpen(false);
      resetSheet();
      setToast({ tone: "success", message: `Đã gửi yêu cầu ${MODE_LABEL[mode]} thành công.` });
      router.refresh();
    } catch (errorValue) {
      setConfirmOpen(false);
      setToast({ tone: "danger", message: errorValue instanceof Error ? errorValue.message : String(errorValue) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={compact ? "grid gap-4" : "grid gap-4 md:gap-5"}>
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
        <div className="group-hero flex items-center justify-between gap-3 px-5 py-5 text-white md:px-6">
          <div>
            <div className="text-xs font-extrabold uppercase tracking-[.16em] text-white/70">Quản lý khí NMBP</div>
            <h1 className="m-0 mt-1 text-2xl font-extrabold md:text-3xl">{groupName}</h1>
            <div className="mt-1 text-sm text-white/75">Giao diện thao tác nhanh</div>
          </div>
          {pendingCount > 0 ? <div className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold">{pendingCount} phiếu chờ</div> : null}
        </div>

        <div className="grid gap-5 p-4 md:p-6">
          <section>
            <div className="mb-3 flex items-center gap-2"><Boxes size={19} className="text-[var(--brand)]"/><h2 className="m-0 text-lg font-extrabold">Số chai tại nhóm</h2></div>
            {visibleGroup.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {visibleGroup.map((p) => { const t = tone(p.code); return <div key={p.id} className="rounded-2xl border border-[var(--border)] bg-white p-3.5 shadow-sm md:p-4">
                  <div className="flex items-center gap-3"><div className={`grid h-10 w-10 place-items-center rounded-xl ${t.icon}`}><Boxes size={22}/></div><div className="min-w-0"><div className="truncate text-sm font-extrabold">{p.name}</div><div className={`font-mono-data mt-1 text-2xl font-extrabold ${t.number}`}>{formatNumber(p.groupQty)} <span className="font-sans text-xs font-semibold text-[var(--muted-foreground)]">{p.unit}</span></div></div></div>
                </div>; })}
              </div>
            ) : <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--paper)] p-4 text-sm text-[var(--muted-foreground)]">Nhóm hiện chưa có chai khí đang quản lý.</div>}
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2"><Warehouse size={19} className="text-[var(--brand)]"/><h2 className="m-0 text-lg font-extrabold">Tồn Kho Hậu cần</h2></div>
            {visibleWarehouse.length ? <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              {visibleWarehouse.map((p) => { const t = tone(p.code); return <div key={p.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 shadow-sm">
                <div className="flex min-w-0 items-center gap-3"><div className={`grid h-9 w-9 place-items-center rounded-xl ${t.icon}`}><Boxes size={20}/></div><strong className="truncate">{p.name}</strong></div>
                <div className="min-w-16 text-center"><div className="text-[11px] font-bold uppercase tracking-wide text-[var(--success)]">Đầy</div><div className={`font-mono-data text-xl font-extrabold ${p.warehouseFull > 0 ? "text-[var(--success)]" : "text-[var(--muted-foreground)]"}`}>{formatNumber(p.warehouseFull)}</div></div>
                <div className="min-w-16 border-l border-[var(--border)] pl-3 text-center"><div className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted-foreground)]">Rỗng</div><div className="font-mono-data text-xl font-extrabold text-[var(--neutral)]">{formatNumber(p.warehouseEmpty)}</div></div>
              </div>; })}
            </div> : <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--paper)] p-4 text-sm text-[var(--muted-foreground)]">Kho chưa có số liệu chai đầy/rỗng cho các loại khí theo dõi.</div>}
          </section>

          {canCreate ? <div className="grid grid-cols-3 gap-2.5 md:max-w-2xl">
            <button type="button" onClick={() => openMode("exchange")} className="group-action exchange"><Repeat2 size={22}/><span>Đổi</span></button>
            <button type="button" onClick={() => openMode("borrow")} className="group-action borrow"><Handshake size={22}/><span>Mượn</span></button>
            <button type="button" onClick={() => openMode("return")} className="group-action return"><RotateCcw size={22}/><span>Trả</span></button>
          </div> : <div className="rounded-xl border border-[var(--border)] bg-[var(--paper)] p-3 text-sm text-[var(--muted-foreground)]">Tài khoản này chỉ được xem số liệu của nhóm.</div>}
        </div>
      </div>

      {mode ? <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/35 p-0 md:items-center md:p-5" role="presentation">
        <div role="dialog" aria-modal="true" aria-labelledby="quick-sheet-title" className="max-h-[88vh] w-full overflow-y-auto rounded-t-[28px] border border-[var(--border)] bg-white p-4 shadow-2xl md:max-w-3xl md:rounded-2xl md:p-5">
          <div className="mx-auto mb-3 h-1.5 w-20 rounded-full bg-slate-200 md:hidden"/>
          <div className="flex items-start justify-between gap-3">
            <div><h2 id="quick-sheet-title" className="m-0 text-xl font-extrabold">Tạo phiếu {MODE_LABEL[mode]}</h2><p className="mb-0 mt-1 text-sm text-[var(--muted-foreground)]">Có thể yêu cầu nhiều loại khí trong một phiếu.</p></div>
            <button type="button" onClick={closeSheet} className="rounded-full bg-[var(--muted)] p-2.5 text-[var(--neutral)] hover:bg-slate-200" aria-label="Đóng"><X size={20}/></button>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)]">
            {items.map((item, index) => {
              const product = productFor(item.productId);
              if (!product) return null;
              const t = tone(product.code);
              const max = maxFor(item);
              const borrowAfter = product.groupQty + item.quantity;
              const overNorm = mode === "borrow" && product.normQty > 0 && borrowAfter > product.normQty;
              return <div key={`${item.productId}-${index}`} className="grid gap-3 border-b border-[var(--border)] p-3 last:border-b-0 md:grid-cols-[1.3fr_1fr_.8fr_auto] md:items-center">
                <label className="grid gap-1"><span className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted-foreground)]">Loại khí</span><div className="flex items-center gap-2"><div className={`grid h-9 w-9 place-items-center rounded-xl ${t.icon}`}><Boxes size={19}/></div><select value={item.productId} onChange={(e) => updateProduct(index, e.target.value)} className="min-h-10 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-white px-2.5 font-bold">{products.filter((p) => p.id === item.productId || !items.some((x, i) => i !== index && x.productId === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div></label>
                <div><div className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted-foreground)]">SL yêu cầu</div><div className="mt-1 grid grid-cols-[40px_1fr_40px] overflow-hidden rounded-xl border border-[var(--border)]"><button type="button" onClick={() => updateQty(index, item.quantity - 1)} className="grid min-h-11 place-items-center hover:bg-[var(--muted)]"><Minus size={17}/></button><input className="min-w-0 border-x border-[var(--border)] text-center font-mono-data text-lg font-extrabold outline-none" inputMode="numeric" type="number" min="1" max={max && max > 0 ? max : undefined} value={item.quantity} onChange={(e) => updateQty(index, Number(e.target.value))}/><button type="button" onClick={() => updateQty(index, item.quantity + 1)} className="grid min-h-11 place-items-center hover:bg-[var(--muted)]"><Plus size={17}/></button></div></div>
                <div className="rounded-xl bg-[var(--paper)] px-3 py-2 text-center"><div className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted-foreground)]">{mode === "return" ? "Nhóm đang có" : "Kho còn đầy"}</div><div className={`font-mono-data mt-0.5 text-xl font-extrabold ${mode === "return" ? t.number : "text-[var(--success)]"}`}>{formatNumber(mode === "return" ? product.groupQty : product.warehouseFull)}</div>{overNorm ? <div className="mt-1 text-[10px] font-bold text-[var(--warning)]">Vượt định mức +{formatNumber(borrowAfter - product.normQty)}</div> : null}</div>
                <button type="button" onClick={() => removeItem(index)} disabled={items.length <= 1} className="justify-self-end rounded-xl p-2.5 text-[var(--danger)] hover:bg-red-50 disabled:opacity-30" aria-label="Xóa dòng"><Trash2 size={19}/></button>
              </div>;
            })}
          </div>

          <button type="button" onClick={addItem} disabled={items.length >= products.length} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--brand)]/40 bg-blue-50/40 font-bold text-[var(--brand)] disabled:opacity-40"><Plus size={18}/>Thêm loại khí</button>

          <label className="mt-4 grid gap-1.5 text-sm font-bold">Ghi chú <span className="font-normal text-[var(--muted-foreground)]">(không bắt buộc)</span><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Nhập ghi chú nếu có..." className="rounded-xl border border-[var(--border)] px-3 py-2.5 font-normal outline-none focus:border-[var(--brand)]"/></label>

          <button type="button" onClick={askSubmit} disabled={submitting || !items.length} className="mt-4 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--brand)] px-4 text-base font-extrabold text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"><Send size={20}/>{submitting ? "Đang gửi..." : `Gửi yêu cầu ${MODE_LABEL[mode]}`}</button>
        </div>
      </div> : null}

      {confirmOpen && mode ? <div className="fixed inset-0 z-[95] grid place-items-center bg-slate-950/45 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-white p-5 shadow-2xl">
          <div className="flex gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-50 text-[var(--brand)]"><AlertTriangle size={20}/></div><div><h3 className="m-0 text-base font-extrabold">Xác nhận gửi yêu cầu {MODE_LABEL[mode]}?</h3><p className="mb-0 mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Phiếu gồm {items.length} loại khí. Hệ thống sẽ lưu đúng số lượng anh/chị đang nhập.</p></div></div>
          <div className="mt-4 rounded-xl bg-[var(--paper)] p-3 text-sm">{items.map((item) => { const p = productFor(item.productId); return p ? <div key={item.productId} className="flex justify-between gap-3 py-1"><span>{p.name}</span><strong className="font-mono-data">{formatNumber(item.quantity)} {p.unit}</strong></div> : null; })}</div>
          <div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => setConfirmOpen(false)} className="min-h-11 rounded-xl border border-[var(--border)] font-bold">Quay lại</button><button type="button" onClick={submit} disabled={submitting} className="min-h-11 rounded-xl bg-[var(--brand)] font-bold text-white disabled:opacity-50">{submitting ? "Đang gửi..." : "Xác nhận"}</button></div>
        </div>
      </div> : null}

      {discardOpen ? <div className="fixed inset-0 z-[96] grid place-items-center bg-slate-950/45 p-4"><div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-white p-5 shadow-2xl"><div className="flex gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-50 text-[var(--warning)]"><AlertTriangle size={20}/></div><div><h3 className="m-0 text-base font-extrabold">Bỏ nội dung đang nhập?</h3><p className="mb-0 mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Các dòng khí và ghi chú chưa gửi sẽ bị bỏ.</p></div></div><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => setDiscardOpen(false)} className="min-h-11 rounded-xl border border-[var(--border)] font-bold">Tiếp tục nhập</button><button type="button" onClick={resetSheet} className="min-h-11 rounded-xl bg-[var(--danger)] font-bold text-white">Bỏ nội dung</button></div></div></div> : null}

      {removeIndex != null ? <div className="fixed inset-0 z-[97] grid place-items-center bg-slate-950/45 p-4"><div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-white p-5 shadow-2xl"><div className="flex gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-50 text-[var(--danger)]"><Trash2 size={20}/></div><div><h3 className="m-0 text-base font-extrabold">Xóa loại khí khỏi phiếu?</h3><p className="mb-0 mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Dòng này sẽ được bỏ khỏi yêu cầu đang nhập.</p></div></div><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => setRemoveIndex(null)} className="min-h-11 rounded-xl border border-[var(--border)] font-bold">Hủy</button><button type="button" onClick={confirmRemoveItem} className="min-h-11 rounded-xl bg-[var(--danger)] font-bold text-white">Xóa dòng</button></div></div></div> : null}

      {toast ? <div className="fixed inset-x-4 top-4 z-[110] mx-auto flex max-w-md items-center gap-3 rounded-xl border border-[var(--border)] bg-white p-3 shadow-lg md:left-auto md:right-5 md:mx-0"><div className={`grid h-9 w-9 place-items-center rounded-full ${toast.tone === "success" ? "bg-green-50 text-[var(--success)]" : "bg-red-50 text-[var(--danger)]"}`}>{toast.tone === "success" ? <CheckCircle2 size={20}/> : <AlertTriangle size={20}/>}</div><div className="min-w-0 flex-1"><div className="text-xs font-extrabold uppercase tracking-wide text-[var(--muted-foreground)]">{toast.tone === "success" ? "Thành công" : "Không thành công"}</div><div className="mt-0.5 text-sm font-semibold">{toast.message}</div></div><button type="button" onClick={() => setToast(null)} className="rounded-lg p-1.5 hover:bg-[var(--muted)]"><X size={16}/></button></div> : null}
    </section>
  );
}
