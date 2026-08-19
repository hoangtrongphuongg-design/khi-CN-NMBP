import Link from "next/link";
import Image from "next/image";
import { LayoutDashboard, Boxes, Truck, Repeat2, ArrowLeftRight, FileSpreadsheet, Settings, LogOut, ClipboardCheck, Warehouse } from "lucide-react";
import type { Profile } from "@/types/app";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { AppFeedback } from "@/components/app-feedback";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; key: string };
const base: Record<string, NavItem> = {
  dashboard: { href: "/dashboard", label: "Tổng quan", icon: LayoutDashboard, key: "dashboard" },
  inventory: { href: "/inventory", label: "Tồn khí", icon: Boxes, key: "inventory" },
  deliveries: { href: "/deliveries", label: "Giao nhận NCC", icon: Truck, key: "deliveries" },
  internal: { href: "/internal", label: "Mượn · Đổi · Trả", icon: Repeat2, key: "internal" },
  transfers: { href: "/transfers", label: "Điều chuyển", icon: ArrowLeftRight, key: "transfers" },
  reports: { href: "/reports", label: "Báo cáo", icon: FileSpreadsheet, key: "reports" },
  admin: { href: "/admin", label: "Quản trị hệ thống", icon: Settings, key: "admin" },
};

function item(key: string, label?: string, icon?: NavItem["icon"]): NavItem {
  return { ...base[key], label: label || base[key].label, icon: icon || base[key].icon };
}

function navFor(profile: Profile): NavItem[] {
  switch (profile.role) {
    case "admin": return [item("dashboard"), item("inventory","Tồn hệ thống"), item("reports","Báo cáo"), item("admin","Quản trị hệ thống")];
    case "supplier": return [item("dashboard"), item("deliveries","Tạo & theo dõi phiếu"), item("reports","Báo cáo")];
    case "foreman": case "supervisor": return [item("dashboard"), item("inventory","Tồn Kho Hậu cần",Warehouse), item("internal","Đổi · Mượn · Trả")];
    case "worker": return [item("dashboard"), item("inventory","Tồn Kho Hậu cần",Warehouse)];
    case "storekeeper": return [item("dashboard"), item("internal","Phiếu chờ xử lý",ClipboardCheck), item("inventory","Tồn Kho",Warehouse), item("deliveries","Giao nhận NCC",Truck), item("reports","Báo cáo")];
    case "warehouse_manager": return [item("dashboard"), item("internal","Phiếu cần duyệt",ClipboardCheck), item("inventory","Tồn Kho",Warehouse), item("deliveries","Giao nhận NCC"), item("transfers","Điều chuyển"), item("reports","Báo cáo")];
    case "workshop": return [item("dashboard"), item("transfers","Điều phối"), item("inventory","Số chai & tồn kho"), item("deliveries","Giao nhận NCC"), item("internal","Phiếu nội bộ"), item("reports","Báo cáo")];
    case "mine_xsc": return [item("dashboard"), item("inventory","Số chai tại Mỏ"), item("transfers","Điều chuyển"), item("deliveries","Giao nhận NCC"), item("reports","Báo cáo")];
    case "management_board": return [item("dashboard"), item("inventory","Tồn vỏ"), item("deliveries","Giao nhận NCC"), item("internal","Phiếu nội bộ"), item("transfers","Điều chuyển"), item("reports","Chi phí & báo cáo")];
    default: return [base.dashboard,base.inventory,base.deliveries,base.internal,base.transfers,base.reports];
  }
}

function mobileFor(profile: Profile, nav: NavItem[]) {
  if (profile.role === "workshop") return nav.filter((x)=>["dashboard","transfers","inventory","deliveries","reports"].includes(x.key));
  if (profile.role === "warehouse_manager") return nav.filter((x)=>["dashboard","internal","inventory","deliveries","reports"].includes(x.key));
  if (profile.role === "storekeeper") return nav.filter((x)=>["dashboard","internal","inventory","deliveries"].includes(x.key));
  if (profile.role === "management_board") return nav.filter((x)=>["dashboard","inventory","reports","deliveries"].includes(x.key));
  if (profile.role === "mine_xsc") return nav.filter((x)=>["dashboard","inventory","transfers","deliveries"].includes(x.key));
  return nav.slice(0,5);
}

function roleSubtitle(profile: Profile) {
  const map: Record<string,string> = {
    admin: "Thiết lập và quản lý",
    workshop: "Điều phối và theo dõi",
    warehouse_manager: "Duyệt và kiểm soát",
    storekeeper: "Xử lý yêu cầu nhanh",
    mine_xsc: "Theo dõi và phản hồi",
    foreman: "Giao diện thao tác nhanh",
    supervisor: "Giao diện thao tác nhanh",
    worker: "Theo dõi số liệu nhóm",
    management_board: "Tổng quan theo dõi",
    supplier: "Tạo phiếu giao và theo dõi",
  };
  return map[profile.role] || "Quản lý khí NMBP";
}

export function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const nav = navFor(profile);
  const mobileNav = mobileFor(profile, nav);
  return <div className="min-h-screen md:grid md:grid-cols-[260px_1fr]">
    <aside className="app-sidebar hidden min-h-screen text-white md:flex md:flex-col">
      <div className="flex items-center gap-3 border-b border-white/10 p-5">
        <Image src="/brand/company-symbol.png" width={52} height={66} alt="Vicem Hà Tiên" className="h-12 w-auto brightness-0 invert"/>
        <div><div className="font-display text-sm">Khí NMBP</div><div className="text-xs text-white/65">Vicem Hà Tiên</div></div>
      </div>
      <div className="border-b border-white/10 px-4 py-4"><div className="text-sm font-extrabold">{ROLE_LABELS[profile.role]}{profile.group_name ? ` · ${profile.group_name}` : ""}</div><div className="mt-1 text-xs text-white/60">{roleSubtitle(profile)}</div></div>
      <nav className="flex-1 space-y-1 p-3">{nav.map(({href,label,icon:Icon})=><Link key={href} href={href} className="sidebar-link"><Icon size={18}/><span>{label}</span></Link>)}</nav>
      <div className="border-t border-white/10 p-4 text-xs text-white/70"><div className="font-bold text-white">{profile.full_name}</div><div className="mt-1 font-mono-data">{profile.username}</div><form action="/api/auth/logout" method="post" className="mt-3"><button className="flex items-center gap-2 text-white/80 hover:text-white"><LogOut size={16}/>Đăng xuất</button></form></div>
    </aside>

    <div className="min-w-0">
      <header className="app-topbar sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-[var(--border)] bg-white/95 px-4 backdrop-blur md:px-6">
        <div className="flex min-w-0 items-center gap-3 md:hidden"><Image src="/brand/company-symbol.png" width={40} height={50} alt="Vicem Hà Tiên" className="h-9 w-auto"/><div className="min-w-0"><div className="truncate text-sm font-extrabold text-[var(--brand-deep)]">{profile.group_name || ROLE_LABELS[profile.role]}</div><div className="truncate text-[11px] text-[var(--muted-foreground)]">{roleSubtitle(profile)}</div></div></div>
        <div className="hidden md:block"><div className="font-display text-sm text-[var(--brand)]">Quản lý khí NMBP</div><div className="mt-0.5 text-xs text-[var(--muted-foreground)]">{ROLE_LABELS[profile.role]} · {roleSubtitle(profile)}</div></div>
        <div className="flex items-center gap-3"><div className="hidden text-right md:block"><div className="text-sm font-bold">{profile.full_name}</div><div className="text-xs text-[var(--muted-foreground)]">{ROLE_LABELS[profile.role]}</div></div><form action="/api/auth/logout" method="post" className="md:hidden"><button aria-label="Đăng xuất" className="rounded-xl p-2 hover:bg-[var(--muted)]"><LogOut size={18}/></button></form></div>
      </header>
      <main className="mx-auto w-full max-w-[1540px] p-3 pb-24 sm:p-4 md:p-6 md:pb-8">{children}</main>
    </div>
    <AppFeedback/>
    <nav className={`mobile-role-nav fixed inset-x-0 bottom-0 z-30 grid border-t border-[var(--border)] bg-white px-1 pb-[env(safe-area-inset-bottom)] md:hidden ${mobileNav.length===5?"grid-cols-5":mobileNav.length===4?"grid-cols-4":"grid-cols-3"}`}>{mobileNav.map(({href,label,icon:Icon})=><Link key={href} href={href} className="flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-center text-[10px] font-bold text-[var(--neutral)]"><Icon size={19}/><span className="line-clamp-1 max-w-[76px]">{label}</span></Link>)}</nav>
  </div>;
}
