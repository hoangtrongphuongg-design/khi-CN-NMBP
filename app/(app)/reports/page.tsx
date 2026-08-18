import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { requireProfile } from "@/lib/auth/session";
import { getGroups, getLocations, getProducts } from "@/lib/services/catalog";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ month?: string; location?: string; product?: string; group?: string; status?: string }> }) {
  const profile = await requireProfile();
  if (["foreman","supervisor","worker"].includes(profile.role)) redirect("/dashboard");
  const p = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(p.month || "") ? p.month! : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).slice(0,7);
  const [locations, products, groups] = await Promise.all([getLocations(), getProducts(), getGroups()]);
  const query = new URLSearchParams({ month });
  if (p.location) query.set("location", p.location);
  if (p.product) query.set("product", p.product);
  if (p.group) query.set("group", p.group);
  if (p.status) query.set("status", p.status);

  return <div className="grid gap-5">
    <div><h1 className="font-display m-0 text-2xl text-[var(--brand-deep)]">Báo cáo & Excel</h1><p className="mt-1 text-sm text-[var(--muted-foreground)]">Lọc dữ liệu trước khi xuất để phục vụ đối soát.</p></div>
    <Card><CardTitle>Xuất báo cáo tháng</CardTitle>
      <form method="get" className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6 md:items-end">
        <label className="grid gap-1 text-sm font-bold">Tháng<input className="min-h-10 rounded-lg border border-[var(--border)] bg-white px-3" type="month" name="month" defaultValue={month}/></label>
        <label className="grid gap-1 text-sm font-bold">Địa điểm<Select name="location" defaultValue={p.location || ""}><option value="">Tất cả</option>{locations.map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}</Select></label>
        <label className="grid gap-1 text-sm font-bold">Loại khí / hàng<Select name="product" defaultValue={p.product || ""}><option value="">Tất cả</option>{products.map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}</Select></label>
        {profile.role !== "supplier" ? <label className="grid gap-1 text-sm font-bold">Nhóm<Select name="group" defaultValue={p.group || ""}><option value="">Tất cả</option>{groups.map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}</Select></label> : null}
        <label className="grid gap-1 text-sm font-bold">Trạng thái<Select name="status" defaultValue={p.status || ""}><option value="">Tất cả</option><option value="pending">Chờ xử lý</option><option value="feedback">Có phản hồi</option><option value="completed">Hoàn tất</option></Select></label>
        <button className="min-h-10 rounded-lg border border-[var(--border)] bg-white px-4 font-bold" type="submit">Áp dụng lọc</button>
      </form>
      <div className="mt-4"><Link href={`/api/reports/monthly?${query.toString()}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--brand)] px-4 py-2 font-bold text-white"><Download size={17}/>Xuất Excel {month}</Link></div>
      <p className="mt-4 text-xs text-[var(--muted-foreground)]">File gồm: Tổng hợp chi phí, Giao NCC, Trả vỏ NCC, Chuyến & cước, Tồn hiện tại, Nội bộ, Điều chuyển và XL-45. Tài khoản NCC chỉ nhận dữ liệu của chính NCC.</p>
    </Card>
  </div>;
}
