import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp, TrendingDown, Boxes, AlertTriangle, Package, Users, Truck, Factory } from "lucide-react";
import api from "../api";
import { useAuth } from "../auth";
import { fmtMoney, fmtNum, SkeletonCard, Skeleton } from "../ui";
import PageHead from "../components/PageHead";
import BusinessAssistant from "../components/BusinessAssistant";

function Kpi({ icon: Icon, label, value, tone = "brand" }) {
  const tones = {
    brand: "from-brand-500 to-brand-700 shadow-glow-sm",
    emerald: "from-emerald-400 to-emerald-600 shadow-[0_4px_14px_-4px_rgba(16,185,129,.5)]",
    amber: "from-amber-400 to-amber-600 shadow-[0_4px_14px_-4px_rgba(245,158,11,.5)]",
    rose: "from-rose-400 to-rose-600 shadow-[0_4px_14px_-4px_rgba(244,63,94,.5)]",
    violet: "from-violet-400 to-violet-600 shadow-[0_4px_14px_-4px_rgba(139,92,246,.5)]",
  };
  return (
    <div className="glass card-interactive p-5">
      <div className={`mb-3 inline-grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br text-white ${tones[tone]}`}><Icon className="h-5 w-5" /></div>
      <div className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-[1.65rem]">{value}</div>
      <div className="mt-0.5 text-sm text-slate-500">{label}</div>
    </div>
  );
}

export default function Dashboard() {
  const { me, can } = useAuth();
  const cur = me.tenant.currency;
  const [d, setD] = useState(null);
  // Production orders are a Premium (manufacturing) feature — only fetch & show
  // them when the tenant's plan includes manufacturing, so Basic/Standard
  // subscribers never see production data on their dashboard.
  const showProduction = can("manufacturing");
  const [orders, setOrders] = useState(null);

  useEffect(() => { api.get("/reports/dashboard").then((r) => setD(r.data)); }, []);
  useEffect(() => {
    if (!showProduction) return;
    api.get("/manufacturing/production-orders").then((r) => setOrders(r.data));
  }, [showProduction]);

  if (!d) return (
    <>
      <PageHead title={`Welcome back 👋`} subtitle={`Loading your overview…`} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <div className="mt-4"><Skeleton className="h-40 w-full rounded-2xl" /></div>
    </>
  );

  const chart = d.trend.map((t) => ({ month: t.month.slice(2), sales: t.sales }));

  return (
    <>
      <PageHead title={`Welcome back 👋`} subtitle={`Here's how ${me.tenant.name} is doing.`} />

      <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={TrendingUp} tone="emerald" label="Sales (30 days)" value={fmtMoney(d.sales30, cur)} />
        <Kpi icon={TrendingDown} tone="brand" label="Purchases (30 days)" value={fmtMoney(d.purch30, cur)} />
        <Kpi icon={Truck} tone="violet" label="Supplier outstanding" value={fmtMoney(d.payables, cur)} />
        <Kpi icon={Boxes} tone="amber" label="Stock value" value={fmtMoney(d.stockValue, cur)} />
        <Kpi icon={AlertTriangle} tone="rose" label="Low-stock items" value={fmtNum(d.lowStock)} />
      </div>

      <div className="mt-4 animate-fade-up">
        <BusinessAssistant cur={cur} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="glass p-5 lg:col-span-2 animate-fade-up">
          <h3 className="mb-4 font-bold text-slate-800">Sales trend</h3>
          {chart.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chart} margin={{ left: -16, right: 8, top: 4 }}>
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b66f5" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#3b66f5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={56} />
                <Tooltip formatter={(v) => fmtMoney(v, cur)} />
                <Area type="monotone" dataKey="sales" stroke="#3b66f5" strokeWidth={2.5} fill="url(#g)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="grid h-[260px] place-items-center text-sm text-slate-400">No sales recorded yet</div>
          )}
        </div>

        <div className="glass p-5 animate-fade-up">
          <h3 className="mb-4 font-bold text-slate-800">Your records</h3>
          <div className="space-y-2">
            <CountRow icon={Package} label="Items" value={d.counts.items} to="/inventory" />
            <CountRow icon={Users} label="Customers" value={d.counts.customers} to="/parties" />
            <CountRow icon={Truck} label="Suppliers" value={d.counts.vendors} to="/parties" />
          </div>
          <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            Plan: <span className="font-semibold capitalize text-slate-800">{me.tenant.tier}</span>.{" "}
            <Link to="/billing" className="font-semibold text-brand-600">Manage →</Link>
          </div>
        </div>
      </div>

      {showProduction && <ProductionOrders orders={orders} />}
    </>
  );
}

const PO_STATUS_STYLE = {
  planned: "bg-slate-100 text-slate-600",
  in_progress: "bg-brand-100 text-brand-700",
  completed: "bg-emerald-100 text-emerald-700",
  closed: "bg-slate-200 text-slate-500",
};

function ProductionOrders({ orders }) {
  if (orders === null) return null;
  const active = orders.filter((o) => o.status === "planned" || o.status === "in_progress");
  const recent = orders.slice(0, 5);
  return (
    <div className="glass mt-4 p-5 animate-fade-up">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-bold text-slate-800">
          <Factory className="h-[18px] w-[18px] text-slate-400" /> Production orders
        </h3>
        <Link to="/manufacturing" className="text-sm font-semibold text-brand-600">Open Manufacturing →</Link>
      </div>
      {orders.length === 0 ? (
        <div className="grid h-24 place-items-center text-sm text-slate-400">No production orders yet</div>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-500">
            <span className="font-semibold text-slate-800">{fmtNum(active.length)}</span> active of {fmtNum(orders.length)} total
          </p>
          <div className="overflow-hidden rounded-xl border border-slate-100">
            <table className="w-full min-w-[480px]">
              <thead><tr className="bg-slate-50"><th className="th">Order</th><th className="th">Item</th><th className="th">Progress</th><th className="th">Status</th></tr></thead>
              <tbody>
                {recent.map((po) => (
                  <tr key={po.id} className="border-t border-slate-100">
                    <td className="td font-semibold text-slate-800">PRD-{String(po.id).padStart(4, "0")}</td>
                    <td className="td">{po.item_name}</td>
                    <td className="td">{fmtNum(po.completed_qty)} / {fmtNum(po.qty)}</td>
                    <td className="td"><span className={`badge capitalize ${PO_STATUS_STYLE[po.status]}`}>{po.status.replace("_", " ")}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const CountRow = ({ icon: Icon, label, value, to }) => (
  <Link to={to} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 hover:bg-slate-50 active:scale-[.98]">
    <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-500 transition-colors group-hover:bg-brand-50 group-hover:text-brand-600">
      <Icon className="h-[18px] w-[18px]" />
    </span>
    <span className="flex-1 text-sm text-slate-600">{label}</span>
    <span className="font-bold text-slate-800">{value}</span>
  </Link>
);
