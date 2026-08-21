import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SERVICE_PRICE_ITEMS, type PriceType } from "@/lib/pricing";
import { formatCurrency, toDateKey } from "@/lib/utils";

function maxDate(a: string, b: string) { return a > b ? a : b; }
function minDate(a: string, b: string) { return a < b ? a : b; }

function keyOf(priceType: PriceType, productId?: string | null) {
  return `${priceType}:${priceType === "product" ? productId || "" : ""}`;
}

export function PriceManagement({ data, organizations }: { data: any; organizations: any[] }) {
  const contract = data.selectedContract as any | null;
  const month = String(data.month);
  const baseMap = new Map<string, any>((data.baseRules as any[]).map((r:any)=>[keyOf(r.price_type,r.product_id),r]));
  const adjustmentMap = new Map<string, any[]>();
  for (const row of data.adjustments as any[]) {
    const key=keyOf(row.price_type,row.product_id);
    const current=adjustmentMap.get(key) || [];
    current.push(row); adjustmentMap.set(key,current);
  }
  const rows: Array<{ key:string; priceType:PriceType; productId:string|null; label:string; unit:string; base:any; adjustments:any[] }> = [
    ...(data.products as any[]).map((p:any)=>({
      key:keyOf("product",String(p.id)),priceType:"product" as PriceType,productId:String(p.id),label:String(p.name),unit:String(p.unit),
      base:baseMap.get(keyOf("product",String(p.id))) || null,adjustments:adjustmentMap.get(keyOf("product",String(p.id))) || [],
    })),
    ...SERVICE_PRICE_ITEMS.map((item)=>({
      key:keyOf(item.priceType,null),priceType:item.priceType as PriceType,productId:null,label:item.label,unit:item.unit,
      base:baseMap.get(keyOf(item.priceType,null)) || null,adjustments:adjustmentMap.get(keyOf(item.priceType,null)) || [],
    })),
  ];

  const locked = data.monthLock?.status === "locked";
  const contractFrom = contract ? toDateKey(contract.valid_from) : data.start;
  const contractTo = contract?.valid_to ? toDateKey(contract.valid_to) : data.end;
  const monthInContract = Boolean(contract && data.end >= contractFrom && data.start <= contractTo);
  const adjustmentMin = contract ? maxDate(data.start,contractFrom) : data.start;
  const adjustmentMax = contract ? minDate(data.end,contractTo) : data.end;

  return <div className="grid gap-4">
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Bảng đơn giá theo tháng</CardTitle>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">Mỗi tháng mặc định dùng giá gốc hợp đồng. Chỉ nhập các khoảng biến động; hết “Đến ngày” hệ thống tự quay về giá hợp đồng. Tất cả giá là giá chưa VAT.</p>
        </div>
        <Badge tone={locked ? "warning" : "success"}>{locked ? "ĐÃ KHÓA" : "ĐANG MỞ"}</Badge>
      </div>
      <form action="/admin" method="get" className="mt-4 grid gap-3 md:grid-cols-[180px_minmax(260px,1fr)_auto] md:items-end">
        <input type="hidden" name="tab" value="prices"/>
        <FormField label="Tháng áp dụng"><Input name="price_month" type="month" defaultValue={month} required/></FormField>
        <FormField label="Hợp đồng">
          <Select name="price_contract" defaultValue={contract?.id || ""}>
            {data.contracts.map((c:any)=><option key={c.id} value={c.id}>{c.contract_no} · {c.supplier_name} · {toDateKey(c.valid_from)} → {c.valid_to?toDateKey(c.valid_to):"không giới hạn"}</option>)}
          </Select>
        </FormField>
        <Button type="submit" variant="secondary">Xem bảng giá</Button>
      </form>
      {contract ? <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--paper)] p-3 text-sm">
        <strong>{contract.contract_no}</strong>{contract.contract_name?` · ${contract.contract_name}`:""}<br/>
        <span className="text-[var(--muted-foreground)]">{contract.supplier_name} · Hiệu lực {contractFrom} → {contract.valid_to?contractTo:"không giới hạn"}</span>
      </div> : <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-[#92400E]">Chưa có hợp đồng. Tạo hợp đồng ở phần dưới trước khi nhập đơn giá.</div>}
      {contract && !monthInContract ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-[#92400E]">Tháng {month} nằm ngoài thời hạn của hợp đồng đang chọn. Chỉ xem được dữ liệu; không thêm điều chỉnh tháng.</div> : null}
    </Card>

    {contract ? <Card className="overflow-hidden p-0">
      <div className="border-b border-[var(--border)] p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><CardTitle>Đơn giá tháng {month}</CardTitle><p className="mt-1 text-xs text-[var(--muted-foreground)]">Giá giao dịch = Giá điều chỉnh nếu ngày phát sinh nằm trong khoảng điều chỉnh; ngoài khoảng đó = Giá HĐ.</p></div>
          {!locked && monthInContract ? <form action="/api/admin/prices" method="post">
            <input type="hidden" name="action" value="lock_month"/><input type="hidden" name="contract_id" value={contract.id}/><input type="hidden" name="month" value={month}/>
            <Button type="submit" variant="secondary">Chốt & khóa tháng</Button>
          </form> : null}
        </div>
        {locked ? <form action="/api/admin/prices" method="post" className="mt-3 grid gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 md:grid-cols-[1fr_auto] md:items-end">
          <input type="hidden" name="action" value="unlock_month"/><input type="hidden" name="contract_id" value={contract.id}/><input type="hidden" name="month" value={month}/>
          <FormField label="Lý do mở khóa" hint="Bắt buộc; lưu Audit"><Input name="reason" required placeholder="Ví dụ: NCC gửi lại bảng giá tháng"/></FormField>
          <Button type="submit" variant="danger">Mở khóa để điều chỉnh</Button>
        </form> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="mobile-card-table w-full text-sm">
          <thead className="bg-[var(--muted)]"><tr><th className="p-3 text-left">Loại hàng / chi phí</th><th className="p-3 text-left">ĐVT</th><th className="p-3 text-right">Giá HĐ</th><th className="p-3 text-left">Điều chỉnh trong tháng</th><th className="p-3 text-left">Trạng thái</th></tr></thead>
          <tbody>{rows.map((row)=>{
            const hasAdjustments=row.adjustments.length>0;
            return <tr key={row.key} className="border-t border-[var(--border)] align-top">
              <td data-label="Loại" className="p-3"><strong>{row.label}</strong></td>
              <td data-label="ĐVT" className="p-3">{row.unit}</td>
              <td data-label="Giá HĐ" className="p-3 text-right font-mono-data font-bold">{row.base?formatCurrency(row.base.unit_price):<span className="text-red-600">Chưa nhập</span>}</td>
              <td data-label="Điều chỉnh" className="p-3 min-w-[480px]">
                <div className="grid gap-2">
                  {row.adjustments.map((adj:any)=><div key={adj.id} className="rounded-lg border border-[var(--border)] bg-[var(--paper)] p-2">
                    {locked ? <div className="flex flex-wrap items-center justify-between gap-2"><span><strong>{formatCurrency(adj.unit_price)}</strong> · {toDateKey(adj.effective_from)} → {toDateKey(adj.effective_to)}</span><span className="text-xs text-[var(--muted-foreground)]">{adj.note || ""}</span></div> : <div className="grid gap-2">
                      <form action="/api/admin/prices" method="post" className="grid gap-2 md:grid-cols-[130px_145px_145px_minmax(150px,1fr)_auto] md:items-end">
                        <input type="hidden" name="action" value="save_adjustment"/><input type="hidden" name="rule_id" value={adj.id}/><input type="hidden" name="contract_id" value={contract.id}/><input type="hidden" name="price_type" value={row.priceType}/><input type="hidden" name="product_id" value={row.productId || ""}/><input type="hidden" name="month" value={month}/>
                        <FormField label="Giá mới"><Input name="unit_price" type="number" min="0" step="1" defaultValue={Number(adj.unit_price)} required/></FormField>
                        <FormField label="Từ ngày"><Input name="effective_from" type="date" min={adjustmentMin} max={adjustmentMax} defaultValue={toDateKey(adj.effective_from)} required/></FormField>
                        <FormField label="Đến ngày"><Input name="effective_to" type="date" min={adjustmentMin} max={adjustmentMax} defaultValue={toDateKey(adj.effective_to)} required/></FormField>
                        <FormField label="Ghi chú"><Input name="note" defaultValue={adj.note || ""}/></FormField>
                        <Button type="submit" variant="secondary">Lưu</Button>
                      </form>
                      <form action="/api/admin/prices" method="post" className="flex justify-end"><input type="hidden" name="action" value="delete_adjustment"/><input type="hidden" name="rule_id" value={adj.id}/><input type="hidden" name="contract_id" value={contract.id}/><input type="hidden" name="month" value={month}/><Button type="submit" variant="ghost">Xóa điều chỉnh</Button></form>
                    </div>}
                  </div>)}
                  {!locked && monthInContract && row.base ? <form action="/api/admin/prices" method="post" className="grid gap-2 rounded-lg border border-dashed border-[var(--border)] p-2 md:grid-cols-[130px_145px_145px_minmax(150px,1fr)_auto] md:items-end">
                    <input type="hidden" name="action" value="save_adjustment"/><input type="hidden" name="contract_id" value={contract.id}/><input type="hidden" name="price_type" value={row.priceType}/><input type="hidden" name="product_id" value={row.productId || ""}/><input type="hidden" name="month" value={month}/>
                    <FormField label="Giá mới"><Input name="unit_price" type="number" min="0" step="1" placeholder={String(Math.round(Number(row.base.unit_price)))} required/></FormField>
                    <FormField label="Từ ngày"><Input name="effective_from" type="date" min={adjustmentMin} max={adjustmentMax} defaultValue={adjustmentMin} required/></FormField>
                    <FormField label="Đến ngày"><Input name="effective_to" type="date" min={adjustmentMin} max={adjustmentMax} defaultValue={adjustmentMax} required/></FormField>
                    <FormField label="Ghi chú"><Input name="note" placeholder="Lý do/nguồn điều chỉnh"/></FormField>
                    <Button type="submit">Thêm giá</Button>
                  </form> : null}
                  {!row.base ? <span className="text-xs font-bold text-red-600">Cần nhập giá gốc HĐ trước khi tạo điều chỉnh.</span> : null}
                </div>
              </td>
              <td data-label="Trạng thái" className="p-3"><Badge tone={hasAdjustments?"warning":"success"}>{hasAdjustments?"Đã điều chỉnh":"Theo HĐ"}</Badge></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </Card> : null}

    {contract ? <details className="rounded-xl border border-[var(--border)] bg-white shadow-sm">
      <summary className="cursor-pointer p-4 font-bold text-[var(--brand-deep)]">Bảng giá gốc hợp đồng · {contract.contract_no}</summary>
      <form action="/api/admin/prices" method="post" className="border-t border-[var(--border)] p-4">
        <input type="hidden" name="action" value="save_base_prices"/><input type="hidden" name="contract_id" value={contract.id}/><input type="hidden" name="month" value={month}/>
        <p className="mb-3 text-sm text-[var(--muted-foreground)]">Dùng khi nhập hợp đồng mới hoặc sửa sai giá gốc. Nếu hợp đồng đã có tháng khóa, hệ thống không cho sửa giá gốc cho đến khi mở khóa các tháng liên quan.</p>
        <div className="overflow-x-auto"><table className="mobile-card-table w-full text-sm"><thead className="bg-[var(--muted)]"><tr><th className="p-3 text-left">Hạng mục</th><th className="p-3 text-left">ĐVT</th><th className="p-3 text-left">Đơn giá chưa VAT</th></tr></thead><tbody>{rows.map((row)=><tr key={row.key} className="border-t border-[var(--border)]"><td data-label="Hạng mục" className="p-3"><strong>{row.label}</strong></td><td data-label="ĐVT" className="p-3">{row.unit}</td><td data-label="Đơn giá" className="p-3 md:w-64"><Input name={row.priceType==="product"?`base_product__${row.productId}`:`base_service__${row.priceType}`} type="number" min="0" step="1" defaultValue={row.base?Number(row.base.unit_price):undefined} placeholder="Nhập đơn giá"/></td></tr>)}</tbody></table></div>
        <div className="mt-3"><Button type="submit">Lưu bảng giá gốc HĐ</Button></div>
      </form>
    </details> : null}

    <details className="rounded-xl border border-[var(--border)] bg-white shadow-sm">
      <summary className="cursor-pointer p-4 font-bold text-[var(--brand-deep)]">Danh mục hợp đồng · Thêm hợp đồng mới</summary>
      <div className="grid gap-4 border-t border-[var(--border)] p-4">
        <form action="/api/admin/contracts" method="post" className="grid gap-3 md:grid-cols-3">
          <input type="hidden" name="return_month" value={month}/>
          <FormField label="Nhà cung cấp"><Select name="supplier_org_id" required><option value="">Chọn NCC</option>{organizations.filter((o:any)=>o.kind==="supplier").map((o:any)=><option key={o.id} value={o.id}>{o.name}</option>)}</Select></FormField>
          <FormField label="Số hợp đồng"><Input name="contract_no" required placeholder="Ví dụ: 121/CCKCN-2027"/></FormField>
          <FormField label="Tên hợp đồng"><Input name="contract_name" required placeholder="Tên/nội dung hợp đồng"/></FormField>
          <FormField label="Ngày ký"><Input name="signed_date" type="date"/></FormField>
          <FormField label="Hiệu lực từ"><Input name="valid_from" type="date" required/></FormField>
          <FormField label="Hiệu lực đến"><Input name="valid_to" type="date"/></FormField>
          <div className="md:col-span-3"><Button type="submit">Tạo hợp đồng</Button></div>
        </form>
        <div className="overflow-x-auto"><table className="mobile-card-table w-full text-sm"><thead className="bg-[var(--muted)]"><tr><th className="p-3 text-left">Hợp đồng</th><th className="p-3 text-left">NCC</th><th className="p-3 text-left">Hiệu lực</th><th className="p-3 text-left">Trạng thái</th></tr></thead><tbody>{data.contracts.map((c:any)=><tr key={c.id} className="border-t border-[var(--border)]"><td data-label="Hợp đồng" className="p-3"><strong>{c.contract_no}</strong><div className="text-xs text-[var(--muted-foreground)]">{c.contract_name || ""}</div></td><td data-label="NCC" className="p-3">{c.supplier_name}</td><td data-label="Hiệu lực" className="p-3">{toDateKey(c.valid_from)} → {c.valid_to?toDateKey(c.valid_to):"không giới hạn"}</td><td data-label="Trạng thái" className="p-3"><Badge tone={c.active?"success":"neutral"}>{c.active?"Hoạt động":"Ngừng"}</Badge></td></tr>)}</tbody></table></div>
      </div>
    </details>
  </div>;
}
