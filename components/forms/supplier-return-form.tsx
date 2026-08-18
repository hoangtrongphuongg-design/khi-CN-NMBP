"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";

type Product = { id: string; name: string; unit: string; returnable_container: boolean };
type Location = { id: string; code: string; name: string };
type Trip = { id: string; trip_code: string; trip_date: string };
type Line = { key: string; productId: string; quantity: number };

export function SupplierReturnForm({ products, locations, trips, today }: { products: Product[]; locations: Location[]; trips: Trip[]; today: string }) {
  const available = products.filter((p) => p.returnable_container);
  const [returnDate, setReturnDate] = useState(today);
  const [lines, setLines] = useState<Line[]>([{ key: crypto.randomUUID(), productId: available[0]?.id || "", quantity: 1 }]);
  const sameDayTrips = trips.filter((t) => String(t.trip_date).slice(0, 10) === returnDate);
  const payload = useMemo(() => lines.map(({ productId, quantity }) => ({ productId, quantity })), [lines]);
  return (
    <form action="/api/deliveries" method="post" className="grid gap-4">
      <input type="hidden" name="action" value="create_supplier_return" />
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />
      <div className="grid gap-3 md:grid-cols-3">
        <FormField label="Ngày trả"><Input name="return_date" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} required /></FormField>
        <FormField label="Nơi gom/trả vỏ"><Select name="source_location_id" required>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></FormField>
        <FormField label="Cùng chuyến giao" hint="Chọn nếu xe vừa giao vừa gom vỏ"><Select name="trip_id"><option value="">Tạo chuyến mới</option>{sameDayTrips.map((t) => <option key={t.id} value={t.id}>{t.trip_code} · {String(t.trip_date).slice(0,10)}</option>)}</Select></FormField>
      </div>
      {lines.map((line, index) => <div key={line.key} className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--paper)] p-3 md:grid-cols-[1fr_180px_42px] md:items-end">
        <FormField label={`Loại vỏ ${index + 1}`}><Select value={line.productId} onChange={(e) => setLines((old) => old.map((x) => x.key === line.key ? { ...x, productId: e.target.value } : x))}>{available.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></FormField>
        <FormField label="Số lượng"><Input type="number" min="1" step="1" value={line.quantity} onChange={(e) => setLines((old) => old.map((x) => x.key === line.key ? { ...x, quantity: Number(e.target.value) } : x))} /></FormField>
        <Button type="button" variant="ghost" onClick={() => setLines((old) => old.length === 1 ? old : old.filter((x) => x.key !== line.key))}><Trash2 size={17} /></Button>
      </div>)}
      <FormField label="Ghi chú" hint="Không bắt buộc"><Input name="note" /></FormField>
      <div className="flex gap-3"><Button type="button" variant="secondary" onClick={() => setLines((old) => [...old, { key: crypto.randomUUID(), productId: available[0]?.id || "", quantity: 1 }])}><Plus size={17} />Thêm dòng</Button><Button type="submit" className="ml-auto">Tạo phiếu trả vỏ</Button></div>
    </form>
  );
}
