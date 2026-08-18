import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { requireProfile } from "@/lib/auth/session";

export default async function ChangePasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const profile = await requireProfile();
  if (!profile.must_change_password) redirect("/dashboard");
  const p = await searchParams;
  return <main className="flex min-h-screen items-center justify-center bg-[var(--paper)] p-5"><Card className="w-full max-w-[420px] p-7"><h1 className="m-0 text-xl font-extrabold">Đổi mật khẩu lần đầu</h1><p className="mt-2 text-sm text-[var(--muted-foreground)]">Tài khoản: <strong>{profile.username}</strong></p>{p.error ? <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-[var(--danger)]">{p.error}</div> : null}<form action="/api/auth/change-password" method="post" className="mt-5 grid gap-4"><FormField label="Mật khẩu mới"><Input name="password" type="password" minLength={6} required/></FormField><FormField label="Nhập lại mật khẩu"><Input name="confirm_password" type="password" minLength={6} required/></FormField><Button type="submit">Lưu mật khẩu</Button></form></Card></main>;
}
