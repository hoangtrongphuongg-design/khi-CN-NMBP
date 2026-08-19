import { redirect } from "next/navigation";
import { ArrowLeftRight, CheckCircle2, CircleAlert, Factory, MapPin, PackageCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { requireProfile } from "@/lib/auth/session";
import { getProducts } from "@/lib/services/catalog";
import { listTransfers } from "@/lib/services/transfers";
import { formatNumber, toDateInput } from "@/lib/utils";

export default async function TransfersPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const profile = await requireProfile();
  if (["supplier","foreman","supervisor","worker"].includes(profile.role)) redirect("/dashboard");

  const params = await searchParams;
  const [products, transfers] = await Promise.all([getProducts(), listTransfers()]);
  const canPlantToMine = ["workshop","warehouse_manager"].includes(profile.role);
  const canMineToPlant = profile.role === "mine_xsc";
  const canCreate = canPlantToMine || canMineToPlant;

  const canFeedback = (direction: string) => (
    direction === "plant_to_mine"
      ? profile.role === "mine_xsc"
      : ["warehouse_manager","workshop"].includes(profile.role)
  );

  return <div className="grid gap-5">
    <div>
      <h1 className="font-display m-0 text-2xl text-[var(--brand-deep)] md:text-3xl">Điều chuyển Nhà máy ↔ Mỏ</h1>
      <p className="mt-1 max-w-4xl text-sm text-[var(--muted-foreground)]">
        Một bước xác nhận: người có quyền tạo lệnh đồng thời chịu trách nhiệm số lượng. Khi bấm xác nhận, tồn nơi gửi giảm và nơi nhận tăng ngay. Bên nhận chỉ phản hồi nếu phát hiện sai.
      </p>
    </div>

    {params.error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-[#B91C1C]">{params.error}</div> : null}
    {params.ok ? <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-[#15803D]">Đã ghi nhận điều chuyển.</div> : null}

    {canCreate ? <Card>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[var(--brand)]"><ArrowLeftRight size={22}/></div>
        <div>
          <CardTitle>{canPlantToMine ? "Điều chuyển Nhà máy → Mỏ Tà Thiết" : "Điều chuyển Mỏ Tà Thiết → Nhà máy"}</CardTitle>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            {canPlantToMine
              ? "Workshop/Trưởng kho xác nhận là số chai được trừ tại Kho và cộng ngay cho Nhóm Cối/Mỏ."
              : "XSC Mỏ xác nhận là số vỏ được trừ tại Mỏ và cộng ngay vào vỏ rỗng của Kho Hậu cần."}
          </p>
        </div>
      </div>

      <form action="/api/transfers" method="post" className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5 xl:items-end">
        <input type="hidden" name="action" value="create"/>
        <input type="hidden" name="direction" value={canPlantToMine ? "plant_to_mine" : "mine_to_plant"}/>

        <FormField label="Ngày điều chuyển">
          <Input name="transfer_date" type="date" defaultValue={toDateInput()} required/>
        </FormField>

        <FormField label="Loại khí">
          <Select name="product_id">
            {products.filter((p:any)=>p.returnable_container && p.warehouse_split_full_empty).map((p:any)=>
              <option key={p.id} value={p.id}>{p.name}</option>
            )}
          </Select>
        </FormField>

        <FormField label="Số lượng">
          <Input name="quantity" type="number" min="1" step="1" placeholder="Nhập số chai" required/>
        </FormField>

        {canPlantToMine ? <FormField label="Loại chai xuất">
          <Select name="source_bucket">
            <option value="full">Chai đầy</option>
            <option value="empty">Chai rỗng</option>
          </Select>
        </FormField> : <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] px-3 py-3 text-sm">
          <div className="text-xs font-bold text-[var(--muted-foreground)]">Nơi nhận</div>
          <div className="mt-1 font-bold">Kho Hậu cần · Vỏ rỗng</div>
        </div>}

        <Button type="submit" className="min-h-11">
          <CheckCircle2 size={18}/> Xác nhận điều chuyển
        </Button>

        <div className="md:col-span-2 xl:col-span-5">
          <FormField label="Ghi chú" hint="Không bắt buộc">
            <Input name="note" placeholder="Chỉ ghi khi cần"/>
          </FormField>
        </div>
      </form>
    </Card> : null}

    <Card className="overflow-hidden p-0">
      <div className="border-b border-[var(--border)] p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Lịch sử điều chuyển</CardTitle>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">Không cần xác nhận lần hai. Nếu sai, bên nhận phản hồi trên chính phiếu.</p>
          </div>
          <Badge tone="info">{transfers.length} phiếu gần nhất</Badge>
        </div>
      </div>

      <div className="grid gap-3 p-3 md:p-5">
        {transfers.map((t:any) => {
          const isFeedback = t.status === "feedback";
          const directionLabel = t.direction === "plant_to_mine" ? "Nhà máy → Mỏ Tà Thiết" : "Mỏ Tà Thiết → Nhà máy";
          const receiver = t.direction === "plant_to_mine" ? "Nhóm Cối / Mỏ Tà Thiết" : "Kho Hậu cần";
          return <article key={t.id} className={`rounded-xl border p-4 ${isFeedback ? "border-red-200 bg-red-50/40" : "border-[var(--border)] bg-white"}`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-mono-data font-extrabold text-[var(--brand)]">{t.transfer_code}</div>
                  {isFeedback ? <Badge tone="danger">Có phản hồi</Badge> : <Badge tone="success">Đã điều chuyển</Badge>}
                </div>
                <div className="mt-2 flex items-center gap-2 font-extrabold text-[var(--brand-deep)]"><ArrowLeftRight size={17}/>{directionLabel}</div>
                <div className="mt-2 text-sm"><strong>{t.product_name}</strong> · <span className="font-mono-data font-extrabold">{formatNumber(t.quantity)} {t.unit}</span></div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--muted-foreground)]">
                  <span className="flex items-center gap-1.5"><Factory size={14}/>Người tạo: {t.created_by_name}</span>
                  <span>{String(t.transfer_date).slice(0,10)}</span>
                  <span className="flex items-center gap-1.5"><MapPin size={14}/>Tự động cộng tại: {receiver}</span>
                </div>
                {t.note ? <div className="mt-2 text-sm text-[var(--muted-foreground)]">Ghi chú: {t.note}</div> : null}
              </div>

              <div className="flex shrink-0 items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-[#15803D]">
                <PackageCheck size={18}/> Tồn đã cập nhật
              </div>
            </div>

            {t.feedback ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
              <div className="flex gap-2 text-sm font-bold text-[#B91C1C]"><CircleAlert size={18}/><span>Phản hồi: {t.feedback}</span></div>
              {t.feedback_by_name ? <div className="mt-1 text-xs text-[var(--muted-foreground)]">{t.feedback_by_name}{t.feedback_at ? ` · ${String(t.feedback_at).slice(0,16).replace("T"," ")}` : ""}</div> : null}
            </div> : null}

            {canFeedback(t.direction) ? <form action="/api/transfers" method="post" className="mt-4 flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3 sm:flex-row sm:items-end">
              <input type="hidden" name="action" value="feedback"/>
              <input type="hidden" name="transfer_id" value={t.id}/>
              <label className="grid flex-1 gap-1 text-xs font-bold">
                Phản hồi nếu số liệu sai
                <Input name="feedback" placeholder="Ví dụ: thực tế nhận 9 chai, phiếu ghi 10" required/>
              </label>
              <Button variant="secondary" type="submit">Gửi phản hồi</Button>
            </form> : null}
          </article>;
        })}

        {transfers.length === 0 ? <div className="rounded-lg bg-[var(--muted)] p-8 text-center text-sm text-[var(--muted-foreground)]">Chưa có phiếu điều chuyển.</div> : null}
      </div>
    </Card>
  </div>;
}
