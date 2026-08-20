"use client";

import { useMemo, useState } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";

type Product = { id: string; name: string; unit: string; returnable_container: boolean };
type Line = { key: string; productId: string; quantity: number };

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
    { key: crypto.randomUUID(), productId: available[0]?.id || "", quantity: 1 },
  ]);
  const payload = useMemo(() => lines.map(({ productId, quantity }) => ({ productId, quantity })), [lines]);

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
              type="number"
              min="1"
              step="1"
              value={line.quantity}
              onChange={(e) => setLines((old) => old.map((x) => x.key === line.key ? { ...x, quantity: Number(e.target.value) } : x))}
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
            setLines((old) => [...old, { key: crypto.randomUUID(), productId: next.id, quantity: 1 }]);
          }}
        >
          <Plus size={17} /> Thêm loại vỏ
        </Button>
        <Button type="submit" className="ml-auto"><RotateCcw size={17}/> Xác nhận trả vỏ</Button>
      </div>
    </form>
  );
}
