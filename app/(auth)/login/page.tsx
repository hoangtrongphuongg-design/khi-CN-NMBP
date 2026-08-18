import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentProfile()) redirect("/dashboard");
  const { error } = await searchParams;
  return (
    <main className="grid min-h-screen grid-cols-1 md:grid-cols-[minmax(360px,0.92fr)_minmax(420px,1.38fr)]">
      <section className="hidden items-center justify-center bg-gradient-to-br from-[var(--brand-deep)] to-[var(--brand)] p-12 text-center text-white md:flex md:flex-col md:gap-5">
        <Image src="/brand/company-symbol.png" width={210} height={270} alt="Biểu tượng Vicem Hà Tiên" className="h-[190px] w-auto brightness-0 invert" priority />
        <div><div className="font-display text-[27px]">Nhà máy Xi măng Bình Phước</div><p className="mt-2 text-sm text-white/80">Hệ thống quản lý khí và vỏ chai</p></div>
        <Image src="/brand/company-slogan.png" width={480} height={85} alt="Thương hiệu xi măng đầu tiên từ 1964" className="w-[300px] brightness-0 invert" />
      </section>
      <section className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-[360px]">
          <div className="mb-6 text-center md:hidden"><Image src="/brand/company-symbol.png" width={90} height={110} alt="Vicem Hà Tiên" className="mx-auto h-[80px] w-auto" /><h1 className="font-display mt-3 text-xl text-[var(--brand)]">Quản lý khí NMBP</h1></div>
          <Card className="p-7">
            <h1 className="m-0 text-xl font-extrabold">Đăng nhập</h1>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">CBCNV dùng mã số danh bộ. NCC dùng username do Admin cấp.</p>
            {error ? <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-[#B91C1C]">{error}</div> : null}
            <form action="/api/auth/login" method="post" className="mt-6 grid gap-4">
              <FormField label="Tên đăng nhập"><Input name="username" autoComplete="username" required /></FormField>
              <FormField label="Mật khẩu"><Input name="password" type="password" autoComplete="current-password" required /></FormField>
              <Button type="submit" className="w-full">Đăng nhập</Button>
            </form>
          </Card>
        </div>
      </section>
    </main>
  );
}
