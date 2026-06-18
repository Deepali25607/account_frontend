import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import api from "../api";
import { useAuth } from "../auth";
import { fmtMoney, Spinner, Empty } from "../ui";
import PageHead from "../components/PageHead";

const TABS = [
  { id: "trial-balance", label: "Trial Balance" },
  { id: "pnl", label: "Profit & Loss" },
  { id: "balance-sheet", label: "Balance Sheet" },
  { id: "gst-summary", label: "GST Summary" },
  { id: "hsn-summary", label: "HSN Summary" },
  { id: "journal", label: "Journal" },
];
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthsAgo = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 10); };

export default function Accounting() {
  const { me } = useAuth();
  const cur = me.tenant.currency;
  const [active, setActive] = useState("trial-balance");
  const [from, setFrom] = useState(monthsAgo(12));
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState(null);

  const dated = active === "pnl" || active === "gst-summary" || active === "hsn-summary" || active === "journal";

  useEffect(() => {
    setData(null);
    api.get(`/accounting/${active}`, { params: { from, to } }).then((r) => setData(r.data));
  }, [active, from, to]);

  return (
    <>
      <PageHead title="Accounting & GST" subtitle="Books auto-posted from your sales & purchases — no manual double-entry." />

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => { setData(null); setActive(t.id); }}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${active === t.id ? "bg-brand-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {dated && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="text-sm"><span className="label">From</span><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-sm"><span className="label">To</span><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
      )}

      {data === null ? <div className="grid h-40 place-items-center"><Spinner className="h-6 w-6 text-brand-500" /></div> : (
        <>
          {active === "trial-balance" && <TrialBalance d={data} cur={cur} />}
          {active === "pnl" && <Pnl d={data} cur={cur} />}
          {active === "balance-sheet" && <BalanceSheet d={data} cur={cur} />}
          {active === "gst-summary" && <Gst d={data} cur={cur} />}
          {active === "hsn-summary" && <HsnSummary d={data} cur={cur} />}
          {active === "journal" && <Journal d={data} cur={cur} />}
        </>
      )}
    </>
  );
}

function HsnSummary({ d, cur }) {
  if (!d.rows?.length) return <div className="card"><Empty title="No outward supplies in this period" hint="HSN codes are pulled from each item's master automatically when you raise sales." /></div>;
  return (
    <div className="card overflow-hidden">
      <h3 className="border-b border-slate-100 px-4 py-3 font-bold text-slate-700">HSN / SAC summary of outward supplies</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead><tr className="bg-slate-50">
            <th className="th">HSN/SAC</th><th className="th text-right">Rate</th><th className="th text-right">Qty</th>
            <th className="th text-right">Taxable value</th><th className="th text-right">Tax</th><th className="th text-right">Total</th>
          </tr></thead>
          <tbody>
            {d.rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="td font-medium">{r.hsn}</td>
                <td className="td text-right">{r.rate}%</td>
                <td className="td text-right">{r.qty}</td>
                <td className="td text-right">{fmtMoney(r.taxable, cur)}</td>
                <td className="td text-right">{fmtMoney(r.tax, cur)}</td>
                <td className="td text-right font-medium">{fmtMoney(r.total, cur)}</td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-bold">
              <td className="td" colSpan={3}>Total</td>
              <td className="td text-right">{fmtMoney(d.totals.taxable, cur)}</td>
              <td className="td text-right">{fmtMoney(d.totals.tax, cur)}</td>
              <td className="td text-right">{fmtMoney(d.totals.total, cur)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="px-4 py-3 text-xs text-slate-400">Items without an HSN/SAC on their master appear under “—”. Set it in Inventory → edit item.</p>
    </div>
  );
}

const BalancedBadge = ({ ok }) => (
  <span className={`badge ${ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
    {ok ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <AlertTriangle className="mr-1 h-3 w-3" />}
    {ok ? "Balanced" : "Out of balance"}
  </span>
);

function TrialBalance({ d, cur }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h3 className="font-bold text-slate-700">Trial Balance</h3><BalancedBadge ok={d.balanced} />
      </div>
      <table className="w-full">
        <thead><tr className="bg-slate-50"><th className="th">Code</th><th className="th">Account</th><th className="th text-right">Debit</th><th className="th text-right">Credit</th></tr></thead>
        <tbody>
          {d.rows.filter((r) => r.debit_balance || r.credit_balance).map((r) => (
            <tr key={r.code}><td className="td text-slate-400">{r.code}</td><td className="td font-medium">{r.name}</td>
              <td className="td text-right">{r.debit_balance ? fmtMoney(r.debit_balance, cur) : "—"}</td>
              <td className="td text-right">{r.credit_balance ? fmtMoney(r.credit_balance, cur) : "—"}</td></tr>
          ))}
          <tr className="bg-slate-50 font-bold"><td className="td" colSpan={2}>Total</td>
            <td className="td text-right">{fmtMoney(d.totals.debit, cur)}</td><td className="td text-right">{fmtMoney(d.totals.credit, cur)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function Pnl({ d, cur }) {
  const Section = ({ title, rows, total }) => (
    <div className="card overflow-hidden">
      <h3 className="border-b border-slate-100 px-4 py-3 font-bold text-slate-700">{title}</h3>
      <table className="w-full"><tbody>
        {rows.length ? rows.map((r, i) => (
          <tr key={i} className="border-t border-slate-100 first:border-0"><td className="td">{r.name}</td><td className="td text-right">{fmtMoney(r.amount, cur)}</td></tr>
        )) : <tr><td className="td text-slate-400">None</td><td /></tr>}
        <tr className="bg-slate-50 font-bold"><td className="td">Total {title}</td><td className="td text-right">{fmtMoney(total, cur)}</td></tr>
      </tbody></table>
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="Income" rows={d.income} total={d.totalIncome} />
        <Section title="Expenses" rows={d.expense} total={d.totalExpense} />
      </div>
      <div className={`card p-5 text-center ${d.netProfit >= 0 ? "bg-emerald-50" : "bg-rose-50"}`}>
        <div className="text-sm text-slate-500">Net {d.netProfit >= 0 ? "Profit" : "Loss"}</div>
        <div className={`text-3xl font-extrabold ${d.netProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmtMoney(Math.abs(d.netProfit), cur)}</div>
      </div>
    </div>
  );
}

function BalanceSheet({ d, cur }) {
  const Block = ({ title, rows, total, extra }) => (
    <div className="card overflow-hidden">
      <h3 className="border-b border-slate-100 px-4 py-3 font-bold text-slate-700">{title}</h3>
      <table className="w-full"><tbody>
        {rows.map((r, i) => (<tr key={i} className="border-t border-slate-100 first:border-0"><td className="td">{r.name}</td><td className="td text-right">{fmtMoney(r.amount, cur)}</td></tr>))}
        {extra && <tr className="border-t border-slate-100"><td className="td">{extra.name}</td><td className="td text-right">{fmtMoney(extra.amount, cur)}</td></tr>}
        <tr className="bg-slate-50 font-bold"><td className="td">Total {title}</td><td className="td text-right">{fmtMoney(total, cur)}</td></tr>
      </tbody></table>
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><BalancedBadge ok={d.balanced} /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Block title="Assets" rows={d.assets} total={d.totalAssets} />
        <div className="space-y-4">
          <Block title="Liabilities" rows={d.liabilities} total={d.totalLiabilities} />
          <Block title="Equity" rows={d.equity} total={d.totalEquity} extra={{ name: "Retained Earnings", amount: d.retainedEarnings }} />
        </div>
      </div>
    </div>
  );
}

function Gst({ d, cur }) {
  const cards = [
    ["Output tax (on sales)", d.outputTax, "text-slate-900"],
    ["Input credit (on purchases)", d.inputCredit, "text-slate-900"],
    [d.netPayable >= 0 ? "Net GST payable" : "Net GST credit", Math.abs(d.netPayable), d.netPayable >= 0 ? "text-rose-600" : "text-emerald-600"],
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map(([l, v, c]) => (
        <div key={l} className="card p-5"><div className="text-sm text-slate-500">{l}</div><div className={`mt-1 text-2xl font-extrabold ${c}`}>{fmtMoney(v, cur)}</div></div>
      ))}
      <p className="sm:col-span-3 text-xs text-slate-400">Indicative summary for GST return filing (AC-05). Final statutory formats are validated by the tax SME (BRD §11).</p>
    </div>
  );
}

function Journal({ d, cur }) {
  if (!d.length) return <div className="card"><Empty title="No journal entries yet" hint="Record a sale or purchase to see auto-posted entries." /></div>;
  return (
    <div className="space-y-3">
      {d.map((e) => (
        <div key={e.id} className="card overflow-hidden">
          <div className="flex items-center justify-between bg-slate-50 px-4 py-2 text-sm">
            <span className="font-semibold text-slate-700">{e.memo}</span><span className="text-slate-400">{e.entry_date}</span>
          </div>
          <table className="w-full"><tbody>
            {e.lines.map((l, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="td"><span className="text-slate-400">{l.code}</span> {l.name}</td>
                <td className="td text-right text-slate-600">{l.debit ? `Dr ${fmtMoney(l.debit, cur)}` : ""}</td>
                <td className="td text-right text-slate-600">{l.credit ? `Cr ${fmtMoney(l.credit, cur)}` : ""}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      ))}
    </div>
  );
}
