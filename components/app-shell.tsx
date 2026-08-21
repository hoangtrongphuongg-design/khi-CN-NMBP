import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard, Boxes, Truck, Repeat2, ArrowLeftRight, FileSpreadsheet,
  Settings, LogOut, ClipboardCheck, Warehouse, Bell, UserCircle, Menu, MoreHorizontal
} from "lucide-react";
import type { Profile } from "@/types/app";
import { ROLE_LABELS, canViewCostReports } from "@/lib/auth/permissions";
import { AppFeedback } from "@/components/app-feedback";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; key: string };
const base: Record<string, NavItem> = {
  dashboard: { href: "/dashboard", label: "Tổng quan", icon: LayoutDashboard, key: "dashboard" },
  inventory: { href: "/inventory", label: "Số chai & tồn kho", icon: Boxes, key: "inventory" },
  deliveries: { href: "/deliveries", label: "Giao nhận NCC", icon: Truck, key: "deliveries" },
  internal: { href: "/internal", label: "Phiếu / Hoạt động", icon: Repeat2, key: "internal" },
  transfers: { href: "/transfers", label: "Điều phối", icon: ArrowLeftRight, key: "transfers" },
  reports: { href: "/reports", label: "Báo cáo chi phí", icon: FileSpreadsheet, key: "reports" },
  admin: { href: "/admin", label: "Quản trị hệ thống", icon: Settings, key: "admin" },
};

function item(key: string, label?: string, icon?: NavItem["icon"]): NavItem {
  return { ...base[key], label: label || base[key].label, icon: icon || base[key].icon };
}

function navFor(profile: Profile): NavItem[] {
  let nav: NavItem[];
  switch (profile.role) {
    case "admin": nav = [item("dashboard"), item("deliveries","Giao nhận NCC"), item("internal","Phiếu nội bộ",ClipboardCheck), item("transfers","Điều phối"), item("inventory"), item("admin","Trung tâm quản trị")]; break;
    case "supplier": nav = [item("dashboard"), item("deliveries","Phiếu giao NCC")]; break;
    case "foreman": case "supervisor": nav = [item("dashboard"), item("internal","Đổi · Mượn · Trả"), item("inventory")]; break;
    case "worker": nav = [item("dashboard"), item("inventory")]; break;
    case "storekeeper": nav = [item("dashboard"), item("internal","Công việc",ClipboardCheck), item("inventory"), item("deliveries")]; break;
    case "warehouse_manager": nav = [item("dashboard"), item("internal","Phiếu cần duyệt",ClipboardCheck), item("inventory"), item("deliveries"), item("transfers")]; break;
    case "workshop": nav = [item("dashboard"), item("deliveries"), item("inventory"), item("internal"), item("transfers")]; break;
    case "mine_xsc": nav = [item("dashboard"), item("deliveries"), item("inventory","Số chai tại Mỏ"), item("transfers")]; break;
    case "management_board": nav = [item("dashboard"), item("inventory"), item("internal","Phiếu / Hoạt động")]; break;
    default: nav = [item("dashboard"), item("inventory")];
  }
  if (canViewCostReports(profile)) nav.push(item("reports"));
  return nav;
}

function mobilePrimary(profile: Profile, nav: NavItem[]) {
  const get = (key: string) => nav.find((x) => x.key === key);
  const keys = profile.role === "supplier" ? ["dashboard","deliveries","reports"]
    : profile.role === "storekeeper" ? ["dashboard","internal","inventory"]
    : profile.role === "warehouse_manager" ? ["dashboard","internal","inventory"]
    : profile.role === "workshop" ? ["dashboard","deliveries","inventory"]
    : profile.role === "mine_xsc" ? ["dashboard","deliveries","inventory"]
    : profile.role === "management_board" ? ["dashboard","inventory","reports"]
    : profile.role === "admin" ? ["dashboard","admin","inventory"]
    : ["dashboard","internal","inventory"];
  return keys.map(get).filter(Boolean) as NavItem[];
}

function accountTitle(profile: Profile) {
  if (profile.role === "supplier") return profile.organization_name || profile.full_name || "Nhà cung cấp";
  return profile.full_name || profile.username;
}

function accountSubtitle(profile: Profile) {
  if (profile.role === "supplier") return "Nhà cung cấp";
  if (["foreman","supervisor","worker"].includes(profile.role)) return `${ROLE_LABELS[profile.role]}${profile.group_name ? ` · ${profile.group_name}` : ""}`;
  if (profile.role === "storekeeper") return "Thủ kho · Phòng Hậu cần";
  if (profile.role === "warehouse_manager") return "Trưởng kho Hậu cần";
  if (profile.role === "workshop") return "Quản lý XSC · Workshop";
  if (profile.role === "mine_xsc") return "XSC Mỏ · Mỏ Tà Thiết";
  if (profile.role === "management_board") return "Ban quản đốc";
  if (profile.role === "admin") return "Quản trị hệ thống";
  return ROLE_LABELS[profile.role];
}

export function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const nav = navFor(profile);
  // Đốc công/Giám sát đã có tồn Kho + số chai nhóm ngay trên Tổng quan mobile.
  // Chỉ ẩn trang Tồn kho ở điều hướng điện thoại; desktop vẫn giữ đầy đủ menu.
  const mobileNav = ["foreman","supervisor"].includes(profile.role) ? nav.filter((x) => x.key !== "inventory") : nav;
  const primary = mobilePrimary(profile, mobileNav);
  const primaryKeys = new Set(primary.map((x) => x.key));
  const more = mobileNav.filter((x) => !primaryKeys.has(x.key));
  const mobileCount = primary.length + (more.length ? 1 : 0);

  return <div className={`role-shell role-${profile.role} min-h-screen md:grid md:grid-cols-[220px_1fr]`}>
    <aside className="app-sidebar hidden min-h-screen text-white md:flex md:flex-col">
      <div className="sidebar-brand"><Image src="/brand/company-symbol.png" width={52} height={66} alt="Vicem Hà Tiên" className="sidebar-symbol"/><div className="sidebar-brand-text"><strong>VICEM HÀ TIÊN</strong><span>KHÍ NMBP</span></div></div>
      <nav className="flex-1 space-y-1 p-3 pt-5">{nav.map(({href,label,icon:Icon},index)=><Link key={`${href}-${label}`} href={href} className={`sidebar-link ${index===0?"sidebar-link-active":""}`}><Icon size={18}/><span>{label}</span></Link>)}</nav>
      <div className="sidebar-footer"><div className="sidebar-avatar"><UserCircle size={28}/></div><div className="min-w-0 flex-1"><div className="truncate font-semibold text-white">{accountTitle(profile)}</div><div className="truncate text-[11px] text-white/70">{accountSubtitle(profile)}</div></div><form action="/api/auth/logout" method="post"><button aria-label="Đăng xuất" className="sidebar-logout"><LogOut size={16}/></button></form></div>
    </aside>

    <div className="min-w-0">
      <header className="app-topbar sticky top-0 z-20 flex min-h-[72px] items-center justify-between border-b border-[var(--border)] px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3"><button className="desktop-menu-button hidden md:grid" aria-label="Thu gọn menu"><Menu size={18}/></button><div className="md:hidden"><Image src="/brand/company-symbol.png" width={44} height={54} alt="Vicem Hà Tiên" className="h-10 w-auto brightness-0 invert"/></div><div className="min-w-0"><div className="hidden md:block"><div className="app-role-title truncate">Quản lý khí NMBP</div><div className="app-role-subtitle truncate">Hệ thống quản lý khí công nghiệp</div></div><div className="md:hidden"><div className="app-role-title truncate">Quản lý khí NMBP</div><div className="app-role-subtitle truncate">{accountTitle(profile)} · {accountSubtitle(profile)}</div></div></div></div>
        <div className="flex items-center gap-3"><button aria-label="Thông báo" className="notification-button"><Bell size={21}/><span className="notification-dot"/></button><div className="hidden h-8 w-px bg-current/15 md:block"/><div className="account-identity hidden items-center gap-2 md:flex"><UserCircle size={32}/><div className="text-right"><div className="account-name">{accountTitle(profile)}</div><div className="account-role">{accountSubtitle(profile)}</div></div></div><form action="/api/auth/logout" method="post" className="md:hidden"><button aria-label="Đăng xuất" className="mobile-logout-button"><LogOut size={18}/></button></form></div>
      </header>
      <main className="role-main mx-auto w-full max-w-[1500px] p-3 pb-24 sm:p-4 md:p-5 md:pb-8">{children}</main>
    </div>

    <AppFeedback/>
    <nav className={`mobile-role-nav mobile-cols-${mobileCount} fixed inset-x-0 bottom-0 z-30 grid border-t border-[var(--border)] bg-white px-1 pb-[env(safe-area-inset-bottom)] md:hidden`}>
      {primary.map(({href,label,icon:Icon},index)=><Link key={`${href}-${label}`} href={href} className={`mobile-nav-link ${index===0?"is-active":""}`}><Icon size={19}/><span>{label}</span></Link>)}
      {more.length ? <details className="mobile-more"><summary className="mobile-nav-link"><MoreHorizontal size={19}/><span>Thêm</span></summary><div className="mobile-more-menu">{more.map(({href,label,icon:Icon})=><Link key={`${href}-${label}`} href={href}><Icon size={18}/><span>{label}</span></Link>)}</div></details> : null}
    </nav>
  </div>;
}
