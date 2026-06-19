import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Package, ShoppingCart, Receipt, Users, BarChart3,
  BookOpenCheck, Factory, Crown, LogOut, Menu, Lock, UsersRound, Warehouse,
  Palette, Sun, Moon, Wallet,
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
  { to: "/parties", label: "Vendors & Customers", icon: Users, feature: "purchases" },
  { to: "/payments", label: "Payments", icon: Wallet, feature: null },
  { to: "/reports", label: "Reports", icon: BarChart3, feature: "reports" },
  { to: "/accounting", label: "Accounting & GST", icon: BookOpenCheck, feature: "accounting" },
  { to: "/manufacturing", label: "Manufacturing", icon: Factory, feature: "manufacturing" },
  { to: "/team", label: "Team & Access", icon: UsersRound, feature: "multi_user" },
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
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white font-extrabold">L</div>
        <div>
          <div className="font-extrabold tracking-tight text-slate-800">LedgerFlow</div>
          <div className="text-[11px] text-slate-400 -mt-0.5">Accounting & Inventory</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV.map((n) => {
          const locked = n.feature && !can(n.feature);
          const Icon = n.icon;
          return (
            <NavLink
              key={n.to}
              to={locked ? "/billing" : n.to}
              end={n.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive && !locked ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"
                }`
              }
            >
              <Icon className="h-[18px] w-[18px]" />
              <span className="flex-1">{n.label}</span>
              {locked && <Lock className="h-3.5 w-3.5 text-slate-300" />}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3">
        <button onClick={() => { nav("/billing"); setOpen(false); }} className="flex w-full items-center gap-2 rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 px-4 py-3 text-left text-white shadow-sm">
          <Crown className="h-5 w-5" />
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
      <aside className="hidden md:flex w-64 flex-col border-r border-slate-200 bg-white">
        <SidebarBody />
      </aside>

      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-white shadow-xl">
            <SidebarBody />
          </aside>
        </div>
      )}

      {/* main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur">
          <div className="md:hidden grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-600 font-extrabold text-white">L</div>
          <div className="min-w-0">
            <div className="truncate font-semibold text-slate-800">{me.tenant.name}</div>
            <div className="text-xs text-slate-400">{me.user.name} · {me.user.role}</div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className={`badge capitalize ${TIER_STYLES[me.tenant.tier]}`}>{me.tenant.tier} plan</span>
            <button onClick={toggleMode} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Toggle light/dark">
              {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
            <button onClick={logout} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Log out">
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-slate-50 px-4 pt-4 pb-24 sm:px-6 sm:pt-6 md:pb-6">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>

      {/* mobile bottom tab bar (native-app style) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {BOTTOM_NAV.map((n) => {
          const Icon = n.icon;
          return (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition ${isActive ? "text-brand-600" : "text-slate-400"}`
              }
            >
              <Icon className="h-5 w-5" />
              {n.label}
            </NavLink>
          );
        })}
        <button
          onClick={() => setOpen(true)}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition ${open ? "text-brand-600" : "text-slate-400"}`}
        >
          <Menu className="h-5 w-5" />
          More
        </button>
      </nav>
    </div>
  );
}
