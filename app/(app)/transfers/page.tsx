import { redirect } from "next/navigation";
import { ArrowLeftRight, CircleAlert, MapPin, PackageCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TransferQuickForm } from "@/components/forms/delivery-create-form";
import { requireProfile } from "@/lib/auth/session";
import { getProducts } from "@/lib/services/catalog";
import { listTransfers } from "@/lib/services/transfers";
import { formatNumber, toDateInput } from "@/lib/utils";

export default async function TransfersPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; status?: string; focus?: string }> }) {
  const profile = await requireProfile();
  if (["supplier","foreman","supervisor","worker"].includes(profile.role)) redirect("/dashboard");
  const params = await searchParams;
  const [products, transfersRaw] = await Promise.all([getProducts(), listTransfers()]);
  const statusFilter = String(params.status || "");
  const focusId = String(params.focus || "");
  const transfers = (transfersRaw as any[]).filter((t:any) => (!focusId || t.id === focusId) && (!statusFilter || t.status === statusFilter));
  const eligible = products.filter((p:any)=>p.returnable_container && p.warehouse_split_full_empty);
  const canPlantToMine = ["workshop","warehouse_manager"].includes(profile.role);
  const canMineToPlant = profile.role === "mine_xsc";
  const canFeedback = (direction: string) => direction === "plant_to_mine" ? profile.role === "mine_xsc" : ["warehouse_manager","workshop"].includes(profile.role);

  return <div className="grid gap-5">
    <div className="role-page-heading"><div><div className="role-kicker">Điều phối nội bộ</div><h1>Điều chuyển Nhà máy ↔ Mỏ</h1><p>Một lần xác nhận là cập nhật tồn ngay. Bên nhận chỉ phản hồi nếu có sai số.</p></div><div className="role-title-icon"><ArrowLeftRight size={24}/></div></div>
    {params.error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-[var(--danger)]">{params.error}</div> : null}
    {(statusFilter || focusId) ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm"><span><strong>Đang mở đúng tác vụ từ Tổng quan.</strong> {transfers.length} lệnh phù hợp.</span><a href="/transfers" className="font-bold text-[var(--brand)]">Xem tất cả →</a></div> : null}

    {(canPlantToMine || canMineToPlant) ? <section className="role-grid-2"><Card className="role-card"><div className="flex items-start justify-between gap-3"><div><CardTitle>{canPlantToMine ? "Nhà máy → Mỏ Tà Thiết" : "Mỏ Tà Thiết → Nhà máy"}</CardTitle><p className="mt-1 text-sm text-[var(--muted-foreground)]">Có thể thêm nhiều loại khí trong cùng một lệnh.</p></div><Badge tone="success">Cập nhật tồn ngay</Badge></div><div className="mt-4"><TransferQuickForm products={eligible as any} direction={canPlantToMine ? "plant_to_mine" : "mine_to_plant"} today={toDateInput()}/></div></Card>
    <Card className="role-card"><CardTitle>Nguyên tắc xử lý</CardTitle><div className="mt-4 grid gap-3 text-sm"><div className="role-note"><PackageCheck size={18}/><span><strong>Không xác nhận lần hai.</strong> Người tạo lệnh chịu trách nhiệm số lượng.</span></div><div className="role-note"><MapPin size={18}/><span>{canPlantToMine ? "Kho Hậu cần giảm; Nhóm Cối/Mỏ tăng ngay." : "Mỏ giảm; Kho Hậu cần cộng vào vỏ rỗng ngay."}</span></div><div className="role-note"><CircleAlert size={18}/><span>Nếu bên nhận phát hiện sai, dùng <strong>Phản hồi</strong>; không sửa/xóa lịch sử gốc.</span></div></div></Card></section> : null}

    <Card className="overflow-hidden p-0"><div className="border-b border-[var(--border)] p-4 md:p-5"><div className="flex items-center justify-between gap-3"><div><CardTitle>Lệnh điều chuyển gần đây</CardTitle><p className="mt-1 text-xs text-[var(--muted-foreground)]">Một phiếu có thể gồm nhiều loại khí.</p></div><Badge tone="info">{transfers.length} phiếu</Badge></div></div><div className="grid gap-3 p-3 md:p-5">{transfers.map((t:any)=>{const items=Array.isArray(t.items)?t.items:[];return <article key={t.id} className={`rounded-2xl border p-4 ${t.status==="feedback"?"border-red-200 bg-red-50/30":"border-[var(--border)] bg-white"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-mono-data font-extrabold text-[var(--brand)]">{t.transfer_code}</div><div className="mt-1 font-extrabold">{t.direction==="plant_to_mine"?"Nhà máy → Mỏ Tà Thiết":"Mỏ Tà Thiết → Nhà máy"}</div><div className="mt-1 text-xs text-[var(--muted-foreground)]">{String(t.transfer_date).slice(0,10)} · {t.created_by_name}</div></div><Badge tone={t.status==="feedback"?"danger":"success"}>{t.status==="feedback"?"Có phản hồi":"Đã cập nhật tồn"}</Badge></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{items.map((item:any)=><div key={item.id} className="rounded-xl bg-[var(--paper)] p-3"><div className="font-bold">{item.product_name}</div><div className="mt-1 font-mono-data text-lg font-extrabold text-[var(--brand-deep)]">{formatNumber(item.quantity)} {item.unit}</div><div className="text-xs text-[var(--muted-foreground)]">{item.source_bucket==="full"?"Chai đầy":item.source_bucket==="empty"?"Chai rỗng":"Đang quản lý"}</div></div>)}</div>{t.feedback?<div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-[var(--danger)]">Phản hồi: {t.feedback}</div>:null}{canFeedback(t.direction)?<form action="/api/transfers" method="post" className="mt-3 flex flex-col gap-2 sm:flex-row"><input type="hidden" name="action" value="feedback"/><input type="hidden" name="transfer_id" value={t.id}/><Input name="feedback" placeholder="Nhập phản hồi nếu số liệu sai" required/><Button type="submit" variant="secondary">Gửi phản hồi</Button></form>:null}</article>})}{!transfers.length?<div className="rounded-xl bg-[var(--paper)] p-8 text-center text-sm text-[var(--muted-foreground)]">Chưa có lệnh điều chuyển.</div>:null}</div></Card>
  </div>;
}
