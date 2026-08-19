import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard, Boxes, Truck, Repeat2, ArrowLeftRight, FileSpreadsheet,
  Settings, LogOut, ClipboardCheck, Warehouse, Bell, UserCircle, Menu
} from "lucide-react";
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
    case "admin": return [item("dashboard"), item("inventory","Bình khí"), item("internal","Yêu cầu đổi khí"), item("reports","Báo cáo"), item("admin","Quản trị hệ thống")];
    case "supplier": return [item("dashboard"), item("deliveries","Tạo phiếu giao"), item("deliveries","Phiếu giao của tôi"), item("deliveries","Lịch sử giao dịch"), item("reports","Báo cáo")];
    case "foreman": case "supervisor": return [item("dashboard"), item("inventory","Tồn Kho Hậu cần",Warehouse), item("internal","Đổi · Mượn · Trả")];
    case "worker": return [item("dashboard"), item("inventory","Tồn Kho Hậu cần",Warehouse)];
    case "storekeeper": return [item("dashboard"), item("internal","Yêu cầu nội bộ",ClipboardCheck), item("inventory","Tồn kho",Warehouse), item("deliveries","Giao nhận NCC",Truck), item("reports","Báo cáo")];
    case "warehouse_manager": return [item("dashboard"), item("internal","Phiếu cần duyệt",ClipboardCheck), item("inventory","Tồn kho",Warehouse), item("deliveries","Giao nhận NCC"), item("transfers","Điều chuyển"), item("reports","Báo cáo")];
    case "workshop": return [item("dashboard"), item("transfers","Điều phối"), item("inventory","Số chai & tồn kho"), item("deliveries","Giao nhận NCC"), item("internal","Phiếu / Hoạt động"), item("reports","Báo cáo")];
    case "mine_xsc": return [item("dashboard"), item("inventory","Số chai tại Mỏ"), item("transfers","Điều chuyển"), item("deliveries","Giao nhận NCC"), item("reports","Báo cáo")];
    case "management_board": return [item("dashboard"), item("inventory","Tồn vỏ"), item("internal","Phiếu và yêu cầu"), item("reports","Chi phí"), item("reports","Báo cáo")];
    default: return [base.dashboard,base.inventory,base.deliveries,base.internal,base.transfers,base.reports];
  }
}

function mobileFor(profile: Profile, nav: NavItem[]) {
  if (profile.role === "workshop") return nav.filter((x)=>["dashboard","transfers","inventory","deliveries","reports"].includes(x.key));
  if (profile.role === "warehouse_manager") return nav.filter((x)=>["dashboard","internal","inventory","deliveries","reports"].includes(x.key));
  if (profile.role === "storekeeper") return nav.filter((x)=>["dashboard","internal","inventory","deliveries"].includes(x.key));
  if (profile.role === "management_board") return nav.filter((x)=>["dashboard","inventory","reports","internal"].includes(x.key));
  if (profile.role === "mine_xsc") return nav.filter((x)=>["dashboard","inventory","transfers","deliveries"].includes(x.key));
  return nav.slice(0,5);
}

function roleSubtitle(profile: Profile) {
  const map: Record<string,string> = {
    admin: "Thiết lập và quản lý",
    workshop: "Điều phối và theo dõi toàn hệ thống",
    warehouse_manager: "Duyệt và kiểm soát",
    storekeeper: "Xử lý yêu cầu nội bộ",
    mine_xsc: "Theo dõi và phản hồi",
    foreman: "Giao diện thao tác nhanh",
    supervisor: "Giao diện thao tác nhanh",
    worker: "Theo dõi số liệu nhóm",
    management_board: "Tổng quan theo dõi",
    supplier: "Tạo phiếu giao và theo dõi",
  };
  return map[profile.role] || "Quản lý khí NMBP";
}

function roleTitle(profile: Profile) {
  if (profile.role === "supplier") return profile.organization_name || profile.full_name || "NCC Anh Tân";
  if (profile.role === "foreman" || profile.role === "supervisor" || profile.role === "worker") return profile.group_name || ROLE_LABELS[profile.role];
  if (profile.role === "workshop") return "WORKSHOP";
  if (profile.role === "storekeeper") return "THỦ KHO HẬU CẦN";
  if (profile.role === "warehouse_manager") return "TRƯỞNG KHO HẬU CẦN";
  if (profile.role === "mine_xsc") return "XSC MỎ TÀ THIẾT";
  if (profile.role === "management_board") return "BAN QUẢN ĐỐC";
  if (profile.role === "admin") return "QUẢN TRỊ HỆ THỐNG";
  return ROLE_LABELS[profile.role];
}

export function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const nav = navFor(profile);
  const mobileNav = mobileFor(profile, nav);
  const shellClass = `role-shell role-${profile.role}`;
  return <div className={`${shellClass} min-h-screen md:grid md:grid-cols-[220px_1fr]`}>
    <aside className="app-sidebar hidden min-h-screen text-white md:flex md:flex-col">
      <div className="sidebar-brand">
        <Image src="/brand/company-symbol.png" width={52} height={66} alt="Vicem Hà Tiên" className="sidebar-symbol"/>
        <div className="sidebar-brand-text"><strong>VICEM HÀ TIÊN</strong><span>KHÍ NMBP</span></div>
      </div>
      <nav className="flex-1 space-y-1 p-3 pt-5">{nav.map(({href,label,icon:Icon},index)=><Link key={`${href}-${label}`} href={href} className={`sidebar-link ${index===0?"sidebar-link-active":""}`}><Icon size={18}/><span>{label}</span></Link>)}</nav>
      <div className="sidebar-footer">
        <div className="sidebar-avatar"><UserCircle size={28}/></div>
        <div className="min-w-0 flex-1"><div className="truncate font-semibold text-white">{profile.full_name}</div><div className="truncate text-[11px] text-white/65">{ROLE_LABELS[profile.role]}</div></div>
        <form action="/api/auth/logout" method="post"><button aria-label="Đăng xuất" className="sidebar-logout"><LogOut size={16}/></button></form>
      </div>
    </aside>

    <div className="min-w-0">
      <header className="app-topbar sticky top-0 z-20 flex min-h-[72px] items-center justify-between border-b border-[var(--border)] px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button className="desktop-menu-button hidden md:grid" aria-label="Thu gọn menu"><Menu size={18}/></button>
          <div className="md:hidden"><Image src="/brand/company-symbol.png" width={44} height={54} alt="Vicem Hà Tiên" className="h-10 w-auto brightness-0 invert"/></div>
          <div className="min-w-0"><div className="app-role-title truncate">{roleTitle(profile)}</div><div className="app-role-subtitle truncate">{roleSubtitle(profile)}</div></div>
        </div>
        <div className="flex items-center gap-3"><button aria-label="Thông báo" className="notification-button"><Bell size={21}/><span className="notification-dot"/></button><div className="hidden h-8 w-px bg-current/15 md:block"/><div className="hidden items-center gap-2 md:flex"><UserCircle size={31}/><div className="text-right"><div className="text-sm font-semibold">{profile.full_name}</div><div className="text-[11px] opacity-70">{ROLE_LABELS[profile.role]}</div></div></div><form action="/api/auth/logout" method="post" className="md:hidden"><button aria-label="Đăng xuất" className="rounded-xl p-2"><LogOut size={18}/></button></form></div>
      </header>
      <main className="role-main mx-auto w-full max-w-[1500px] p-3 pb-24 sm:p-4 md:p-5 md:pb-8">{children}</main>
    </div>
    <AppFeedback/>
    <nav className={`mobile-role-nav fixed inset-x-0 bottom-0 z-30 grid border-t border-[var(--border)] bg-white px-1 pb-[env(safe-area-inset-bottom)] md:hidden ${mobileNav.length===5?"grid-cols-5":mobileNav.length===4?"grid-cols-4":"grid-cols-3"}`}>{mobileNav.map(({href,label,icon:Icon},index)=><Link key={`${href}-${label}`} href={href} className={`mobile-nav-link ${index===0?"is-active":""}`}><Icon size={19}/><span>{label}</span></Link>)}</nav>
  </div>;
}
