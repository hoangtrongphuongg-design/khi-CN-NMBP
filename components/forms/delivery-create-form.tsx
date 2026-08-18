"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";

type Product = { id: string; code: string; name: string; unit: string };
type Location = { id: string; code: string; name: string };
type Line = { key: string; productId: string; destinationLocationId: string; quantity: number };

export function DeliveryCreateForm({ products, locations, today }: { products: Product[]; locations: Location[]; today: string }) {
  const [lines, setLines] = useState<Line[]>([{ key: crypto.randomUUID(), productId: products[0]?.id || "", destinationLocationId: locations[0]?.id || "", quantity: 1 }]);
  const payload = useMemo(() => lines.map(({ productId, destinationLocationId, quantity }) => ({ productId, destinationLocationId, quantity })), [lines]);
  return (
    <form action="/api/deliveries" method="post" className="grid gap-4">
      <input type="hidden" name="action" value="create_delivery" />
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Ngày giao"><Input name="delivery_date" type="date" defaultValue={today} required /></FormField>
        <FormField label="Ghi chú" hint="Không bắt buộc"><Input name="note" placeholder="Có thể để trống" /></FormField>
      </div>
      <div className="grid gap-3">
        {lines.map((line, index) => (
          <div key={line.key} className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--paper)] p-3 md:grid-cols-[1.4fr_1fr_140px_42px] md:items-end">
            <FormField label={`Loại khí ${index + 1}`}>
              <Select value={line.productId} onChange={(e) => setLines((old) => old.map((x) => x.key === line.key ? { ...x, productId: e.target.value } : x))}>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </FormField>
            <FormField label="Nơi giao">
              <Select value={line.destinationLocationId} onChange={(e) => setLines((old) => old.map((x) => x.key === line.key ? { ...x, destinationLocationId: e.target.value } : x))}>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </FormField>
            <FormField label="Số lượng"><Input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(e) => setLines((old) => old.map((x) => x.key === line.key ? { ...x, quantity: Number(e.target.value) } : x))} /></FormField>
            <Button type="button" variant="ghost" aria-label="Xóa dòng" onClick={() => setLines((old) => old.length === 1 ? old : old.filter((x) => x.key !== line.key))}><Trash2 size={17} /></Button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={() => setLines((old) => [...old, { key: crypto.randomUUID(), productId: products[0]?.id || "", destinationLocationId: locations[0]?.id || "", quantity: 1 }])}><Plus size={17} />Thêm dòng</Button>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="visits_mine" /> Chuyến có vào Mỏ Tà Thiết</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="co2_special" /> Xe chuyên dụng CO₂ lỏng</label>
        <Button type="submit" className="sm:ml-auto">Tạo phiếu giao</Button>
      </div>
      <p className="m-0 text-xs text-[var(--muted-foreground)]">Nếu có dòng giao tại Mỏ, hệ thống tự tính chuyến Mỏ. Nếu cùng chuyến chỉ ghé Mỏ để gom vỏ, đánh dấu “Chuyến có vào Mỏ”; khi tạo Phiếu trả vỏ liên kết cùng mã chuyến hệ thống cũng tự nâng loại cước lên chuyến Mỏ.</p>
    </form>
  );
}
