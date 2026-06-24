import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Package, ShoppingCart, Receipt, Users, BarChart3,
  BookOpenCheck, Factory, Crown, LogOut, Menu, Lock, UsersRound, Warehouse,
  Palette, Sun, Moon, Wallet, Building2,
} from "lucide-react";
import { useAuth } from "../auth";
import { useTheme } from "../theme";

const TIER_STYLES = {
  basic: "bg-emerald-100 text-emerald-700",
  standard: "bg-brand-100 text-brand-700",
  premium: "bg-amber-100 text-amber-700",
};

// Primary actions shown in the mobile bottom tab bar (all basic-tier → always available).
const BOTTOM_NAV = [
  { to: "/", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/sales", label: "Sales", icon: Receipt },
  { to: "/purchases", label: "Purchases", icon: ShoppingCart },
  { to: "/inventory", label: "Stock", icon: Package },
];

// nav item → required feature (null = always visible)
const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, feature: null, end: true },
  { to: "/inventory", label: "Inventory", icon: Package, feature: "inventory" },
  { to: "/warehouses", label: "Warehouses", icon: Warehouse, feature: "multi_location" },
  { to: "/purchases", label: "Purchases", icon: ShoppingCart, feature: "purchases" },
  { to: "/sales", label: "Sales", icon: Receipt, feature: "sales" },
  { to: "/parties", label: "Suppliers & Customers", icon: Users, feature: "purchases" },
  { to: "/payments", label: "Payments", icon: Wallet, feature: null },
  { to: "/reports", label: "Reports", icon: BarChart3, feature: "reports" },
  { to: "/accounting", label: "Accounting & GST", icon: BookOpenCheck, feature: "accounting" },
  { to: "/manufacturing", label: "Manufacturing", icon: Factory, feature: "manufacturing" },
  { to: "/team", label: "Team & Access", icon: UsersRound, feature: "multi_user" },
  { to: "/company", label: "Company profile", icon: Building2, feature: null, ownerOnly: true },
  { to: "/appearance", label: "Appearance", icon: Palette, feature: null },
];

export default function Layout() {
  const { me, logout, can } = useAuth();
  const { toggleMode, dark } = useTheme();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  if (!me) return null;

  const SidebarBody = () => (
    <>
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white font-extrabold shadow-glow-sm">L</div>
        <div>
          <div className="font-extrabold tracking-tight text-slate-800">LedgerFlow</div>
          <div className="text-[11px] text-slate-400 -mt-0.5">Accounting & Inventory</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 overflow-y-auto">
        {NAV.filter((n) => !n.ownerOnly || me.user.role === "owner").map((n) => {
          const locked = n.feature && !can(n.feature);
          const Icon = n.icon;
          return (
            <NavLink
              key={n.to}
              to={locked ? "/billing" : n.to}
              end={n.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 active:scale-[.98] ${
                  isActive && !locked
                    ? "bg-gradient-to-r from-brand-50 to-transparent text-brand-700 shadow-sm"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && !locked && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-600" />}
                  <Icon className={`h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-110 ${isActive && !locked ? "text-brand-600" : ""}`} />
                  <span className="flex-1">{n.label}</span>
                  {locked && <Lock className="h-3.5 w-3.5 text-slate-300" />}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3">
        <button onClick={() => { nav("/billing"); setOpen(false); }} className="group flex w-full items-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 px-4 py-3 text-left text-white shadow-glow-sm transition-all duration-200 hover:shadow-glow active:scale-[.98]">
          <Crown className="h-5 w-5 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
          <div className="flex-1">
            <div className="text-sm font-bold">Manage plan</div>
            <div className="text-[11px] text-brand-100">View & upgrade tiers</div>
          </div>
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-full">
      {/* desktop sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-slate-200/70 bg-white/60 backdrop-blur-xl">
        <SidebarBody />
      </aside>

      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col bg-white/85 shadow-2xl backdrop-blur-2xl animate-slide-in-left md:hidden">
            <SidebarBody />
          </aside>
        </div>
      )}

      {/* main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/40 bg-white/65 px-4 py-3 backdrop-blur-xl" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
          <div className="md:hidden grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 font-extrabold text-white shadow-glow-sm">L</div>
          <div className="min-w-0">
            <div className="truncate font-semibold text-slate-800">{me.tenant.name}</div>
            <div className="text-xs text-slate-400">{me.user.name} · {me.user.role}</div>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <span className={`badge capitalize ${TIER_STYLES[me.tenant.tier]}`}>{me.tenant.tier} plan</span>
            <button onClick={toggleMode} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 active:scale-90" title="Toggle light/dark">
              {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
            <button onClick={logout} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 active:scale-90" title="Log out">
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto px-4 pt-4 pb-28 sm:px-6 sm:pt-6 md:pb-6">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>

      {/* mobile bottom tab bar — floating frosted-glass pill (native-app style) */}
      <nav
        className="fixed inset-x-3 bottom-3 z-30 flex items-stretch gap-1 rounded-3xl border border-white/60 bg-white/75 p-1.5 shadow-lift backdrop-blur-2xl md:hidden"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        {BOTTOM_NAV.map((n) => {
          const Icon = n.icon;
          return (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `group relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-[10px] font-semibold transition-all duration-300 ${
                  isActive ? "text-brand-700" : "text-slate-400 hover:text-slate-600"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute inset-0 rounded-2xl bg-gradient-to-br from-brand-100 to-brand-50 shadow-glow-sm animate-scale-in" />}
                  <Icon className={`relative h-5 w-5 transition-transform duration-300 ${isActive ? "-translate-y-0.5 scale-110" : "group-active:scale-90"}`} />
                  <span className="relative">{n.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
        <button
          onClick={() => setOpen(true)}
          className={`group relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-[10px] font-semibold transition-all duration-300 ${open ? "text-brand-700" : "text-slate-400 hover:text-slate-600"}`}
        >
          {open && <span className="absolute inset-0 rounded-2xl bg-gradient-to-br from-brand-100 to-brand-50 animate-scale-in" />}
          <Menu className="relative h-5 w-5 transition-transform duration-300 group-active:scale-90" />
          <span className="relative">More</span>
        </button>
      </nav>
    </div>
  );
}
