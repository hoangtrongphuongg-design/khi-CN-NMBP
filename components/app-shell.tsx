import Link from "next/link";
import Image from "next/image";
import { LayoutDashboard, Boxes, Truck, Repeat2, ArrowLeftRight, FileSpreadsheet, Settings, LogOut } from "lucide-react";
import type { Profile } from "@/types/app";
import { ROLE_LABELS } from "@/lib/auth/permissions";

const allNav = [
  { href: "/dashboard", label: "Tổng quan", icon: LayoutDashboard, key: "dashboard" },
  { href: "/inventory", label: "Tồn khí", icon: Boxes, key: "inventory" },
  { href: "/deliveries", label: "Giao nhận NCC", icon: Truck, key: "deliveries" },
  { href: "/internal", label: "Mượn · Đổi · Trả", icon: Repeat2, key: "internal" },
  { href: "/transfers", label: "Điều chuyển", icon: ArrowLeftRight, key: "transfers" },
  { href: "/reports", label: "Báo cáo", icon: FileSpreadsheet, key: "reports" },
];

function navFor(profile: Profile) {
  if (profile.role === "admin") return allNav.filter((x) => ["dashboard","inventory","reports"].includes(x.key));
  if (profile.role === "supplier") return allNav.filter((x) => ["dashboard","deliveries","reports"].includes(x.key));
  if (["foreman","supervisor"].includes(profile.role)) return allNav.filter((x) => ["dashboard","inventory","internal"].includes(x.key));
  if (profile.role === "worker") return allNav.filter((x) => ["dashboard","inventory"].includes(x.key));
  if (profile.role === "mine_xsc") return allNav.filter((x) => ["dashboard","inventory","deliveries","internal","transfers","reports"].includes(x.key));
  return allNav;
}

export function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const nav = navFor(profile);
  const showAdmin = profile.role === "admin";
  const mobileNav = showAdmin ? [...nav, { href: "/admin", label: "Quản trị", icon: Settings, key: "admin" }] : nav;
  return (
    <div className="min-h-screen md:grid md:grid-cols-[250px_1fr]">
      <aside className="hidden min-h-screen border-r border-white/10 bg-[var(--brand-deep)] text-white md:flex md:flex-col">
        <div className="flex items-center gap-3 border-b border-white/10 p-5">
          <Image src="/brand/company-symbol.png" width={52} height={66} alt="Vicem Hà Tiên" className="h-12 w-auto brightness-0 invert" />
          <div><div className="font-display text-sm">Khí NMBP</div><div className="text-xs text-white/65">Vicem Hà Tiên</div></div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold text-white/85 hover:bg-white/10 hover:text-white"><Icon size={18} aria-hidden="true" />{label}</Link>)}
          {showAdmin ? <Link href="/admin" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold text-white/85 hover:bg-white/10 hover:text-white"><Settings size={18} />Quản trị</Link> : null}
        </nav>
        <div className="border-t border-white/10 p-4 text-xs text-white/70">
          <div className="font-bold text-white">{profile.full_name}</div>
          <div className="mt-1">{ROLE_LABELS[profile.role]}{profile.group_name ? ` · ${profile.group_name}` : ""}</div>
          <div className="mt-1 font-mono-data">{profile.username}</div>
          <form action="/api/auth/logout" method="post" className="mt-3"><button className="flex items-center gap-2 text-white/80 hover:text-white"><LogOut size={16} />Đăng xuất</button></form>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-[var(--border)] bg-white/95 px-4 backdrop-blur md:px-6">
          <div><div className="font-display text-sm text-[var(--brand)]">Quản lý khí NMBP</div><div className="text-xs text-[var(--muted-foreground)] md:hidden">{profile.full_name} · {ROLE_LABELS[profile.role]}</div></div>
          <form action="/api/auth/logout" method="post" className="md:hidden"><button aria-label="Đăng xuất" className="rounded-lg p-2 hover:bg-[var(--muted)]"><LogOut size={18} /></button></form>
        </header>
        <main className="mx-auto w-full max-w-[1500px] p-4 pb-24 md:p-6 md:pb-8">{children}</main>
      </div>
      <nav className={`fixed inset-x-0 bottom-0 z-30 grid border-t border-[var(--border)] bg-white px-1 pb-[env(safe-area-inset-bottom)] md:hidden ${mobileNav.length >= 6 ? "grid-cols-6" : mobileNav.length === 5 ? "grid-cols-5" : mobileNav.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
        {mobileNav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[10px] font-bold text-[var(--neutral)]"><Icon size={19} aria-hidden="true" /><span className="max-w-[64px] truncate">{label}</span></Link>)}
      </nav>
    </div>
  );
}
