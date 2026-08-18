"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";

type Item = { id: string; product_name: string; unit: string; declared_qty: number };

export function SupplierReturnConfirmForm({ returnId, items }: { returnId: string; items: Item[] }) {
  const [actuals, setActuals] = useState(() => Object.fromEntries(items.map((x) => [x.id, Number(x.declared_qty)])));
  const payload = useMemo(() => items.map((x) => ({ itemId: x.id, quantity: Number(actuals[x.id] ?? 0) })), [items, actuals]);
  return (
    <form action="/api/deliveries" method="post" className="grid gap-3">
      <input type="hidden" name="action" value="confirm_supplier_return" />
      <input type="hidden" name="return_id" value={returnId} />
      <input type="hidden" name="item_actuals" value={JSON.stringify(payload)} />
      {items.map((item) => <div key={item.id} className="grid grid-cols-[1fr_120px] items-end gap-2"><div className="text-sm"><strong>{item.product_name}</strong><div className="text-xs text-[var(--muted-foreground)]">Nhà máy khai: {item.declared_qty} {item.unit}</div></div><Input type="number" min="0" step="0.001" value={actuals[item.id]} onChange={(e) => setActuals((old) => ({ ...old, [item.id]: Number(e.target.value) }))} /></div>)}
      <FormField label="Phản hồi" hint="Không bắt buộc"><Input name="feedback" placeholder="Chỉ ghi khi số thực nhận khác" /></FormField>
      <Button type="submit">NCC xác nhận nhận vỏ</Button>
    </form>
  );
}
