"use client";

import { useMemo, useState } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";

type Product = { id: string; name: string; unit: string; returnable_container: boolean };
type Line = { key: string; productId: string; quantity: string };

export function SupplierReturnForm({
  products,
  deliveryId,
  deliveryCode,
  locationName,
}: {
  products: Product[];
  deliveryId: string;
  deliveryCode: string;
  locationName: string;
}) {
  const available = products.filter((p) => p.returnable_container);
  const [lines, setLines] = useState<Line[]>([
    { key: crypto.randomUUID(), productId: available[0]?.id || "", quantity: "" },
  ]);
  const payload = useMemo(() => lines.map(({ productId, quantity }) => ({ productId, quantity: Number(quantity || 0) })), [lines]);
  const canSubmit = lines.length > 0 && lines.every((line) => line.productId && Number(line.quantity) > 0);

  return (
    <form action="/api/deliveries" method="post" className="grid gap-3">
      <input type="hidden" name="action" value="create_supplier_return" />
      <input type="hidden" name="delivery_id" value={deliveryId} />
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-[var(--brand-deep)]">
        <div className="font-extrabold">Cùng chuyến {deliveryCode}</div>
        <div className="mt-1"><strong>{locationName}</strong> · Địa điểm được hệ thống khóa theo vai trò, không thể chọn nhầm · Không phát sinh thêm cước vận chuyển.</div>
      </div>

      {lines.map((line, index) => (
        <div key={line.key} className="grid gap-2 rounded-xl border border-[var(--border)] bg-white p-3 sm:grid-cols-[1fr_140px_42px] sm:items-end">
          <FormField label={index === 0 ? "Loại vỏ" : `Loại vỏ ${index + 1}`}>
            <Select
              value={line.productId}
              onChange={(e) => setLines((old) => old.map((x) => x.key === line.key ? { ...x, productId: e.target.value } : x))}
            >
              {available.filter((p) => p.id === line.productId || !lines.some((x) => x.productId === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Số lượng trả">
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              placeholder="Nhập SL"
              value={line.quantity}
              onChange={(e) => setLines((old) => old.map((x) => x.key === line.key ? { ...x, quantity: e.target.value.replace(/\D/g, "") } : x))}
            />
          </FormField>
          <Button type="button" variant="ghost" aria-label="Xóa dòng" onClick={() => setLines((old) => old.length === 1 ? old : old.filter((x) => x.key !== line.key))}>
            <Trash2 size={17} />
          </Button>
        </div>
      ))}

      <FormField label="Ghi chú" hint="Không bắt buộc"><Input name="note" placeholder="Có thể để trống" /></FormField>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={lines.length >= available.length}
          onClick={() => {
            const next = available.find((p) => !lines.some((x) => x.productId === p.id));
            if (!next) return;
            setLines((old) => [...old, { key: crypto.randomUUID(), productId: next.id, quantity: "" }]);
          }}
        >
          <Plus size={17} /> Thêm loại vỏ
        </Button>
        <Button type="submit" disabled={!canSubmit} className="ml-auto"><RotateCcw size={17}/> Xác nhận trả vỏ</Button>
      </div>
    </form>
  );
}

export function SupplierReturnRevisionForm({
  products,
  returnId,
  initialItems,
  returnTab,
}: {
  products: Product[];
  returnId: string;
  initialItems: Array<{ product_id: string; confirmed_qty?: number | null; declared_qty?: number | null }>;
  returnTab: "deliveries" | "returns";
}) {
  const available = products.filter((p) => p.returnable_container);
  const [lines, setLines] = useState<Line[]>(() => initialItems.map((item) => ({
    key: crypto.randomUUID(),
    productId: String(item.product_id),
    quantity: String(Number(item.confirmed_qty ?? item.declared_qty ?? 0)),
  })));
  const payload = useMemo(() => lines.map(({ productId, quantity }) => ({ productId, quantity: Number(quantity || 0) })), [lines]);
  const canSubmit = lines.length > 0 && lines.every((line) => line.productId && Number(line.quantity) > 0);

  return <form action="/api/deliveries" method="post" className="mt-3 rounded-2xl border border-red-200 bg-red-50/40 p-3">
    <input type="hidden" name="action" value="revise_supplier_return"/>
    <input type="hidden" name="return_id" value={returnId}/>
    <input type="hidden" name="return_tab" value={returnTab}/>
    <input type="hidden" name="lines" value={JSON.stringify(payload)}/>
    <div className="text-sm font-extrabold text-[var(--danger)]">Chỉnh Phiếu trả theo phản hồi</div>
    <p className="mb-3 mt-1 text-xs text-[var(--muted-foreground)]">Tồn đã cập nhật ở lần xác nhận trước. Khi gửi lại, hệ thống chỉ điều chỉnh phần chênh lệch và giữ lịch sử audit.</p>
    <div className="grid gap-2">
      {lines.map((line, index) => <div key={line.key} className="grid gap-2 rounded-xl bg-white p-3 sm:grid-cols-[1fr_140px_42px] sm:items-end">
        <FormField label={index === 0 ? "Loại vỏ" : `Loại vỏ ${index + 1}`}>
          <Select value={line.productId} onChange={(e) => setLines((old) => old.map((x) => x.key === line.key ? { ...x, productId: e.target.value } : x))}>
            {available.filter((p) => p.id === line.productId || !lines.some((x) => x.productId === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Số lượng đúng">
          <Input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" placeholder="Nhập SL" value={line.quantity} onChange={(e) => setLines((old) => old.map((x) => x.key === line.key ? { ...x, quantity: e.target.value.replace(/\D/g, "") } : x))}/>
        </FormField>
        <Button type="button" variant="ghost" aria-label="Xóa dòng" disabled={lines.length <= 1} onClick={() => setLines((old) => old.filter((x) => x.key !== line.key))}><Trash2 size={17}/></Button>
      </div>)}
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <Button type="button" variant="secondary" disabled={lines.length >= available.length} onClick={() => {
        const next = available.find((p) => !lines.some((x) => x.productId === p.id));
        if (!next) return;
        setLines((old) => [...old, { key: crypto.randomUUID(), productId: next.id, quantity: "" }]);
      }}><Plus size={17}/>Thêm loại vỏ</Button>
      <Button type="submit" disabled={!canSubmit} className="ml-auto"><RotateCcw size={17}/>Cập nhật & gửi lại duyệt</Button>
    </div>
  </form>;
}
