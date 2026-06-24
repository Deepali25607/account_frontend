import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, Coins, Trophy, CalendarClock, TrendingUp, TrendingDown, CheckCircle2 } from "lucide-react";
import api from "../api";
import { fmtMoney, fmtNum, Spinner } from "../ui";

/** One assistant line: a coloured icon, a sentence (with <b> highlights), and an
 *  optional deep-link to the page where the owner can act on it. */
function Insight({ icon: Icon, tone, to, children }) {
  const tones = {
    amber: "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
    brand: "bg-brand-50 text-brand-600",
  };
  const body = (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/70">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tones[tone] || tones.brand}`}><Icon className="h-[18px] w-[18px]" /></span>
      <p className="flex-1 text-sm text-slate-700">{children}</p>
      {to && <span className="text-slate-300">→</span>}
    </div>
  );
  return to ? <Link to={to} className="block">{body}</Link> : body;
}

/**
 * Business Assistant — a friendly dashboard card that turns the tenant's data
 * into a few plain-language nudges (receivables, best-seller, GST deadline,
 * profit trend). Powered by GET /reports/assistant.
 */
export default function BusinessAssistant({ cur }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.get("/reports/assistant").then((r) => setData(r.data)).catch(() => setFailed(true));
  }, []);

  if (failed) return null; // never let the assistant break the dashboard

  const insights = [];
  if (data) {
    const { receivables, topProduct, gst, profit } = data;

    if (receivables) {
      insights.push(
        <Insight key="recv" icon={Coins} tone="amber" to="/reports">
          You have <b className="font-bold text-slate-900">{fmtMoney(receivables.total, cur)}</b> pending from{" "}
          <b className="font-bold text-slate-900">{fmtNum(receivables.customers)}</b> customer{receivables.customers === 1 ? "" : "s"}.
        </Insight>
      );
    }

    if (topProduct) {
      insights.push(
        <Insight key="top" icon={Trophy} tone="emerald" to="/inventory">
          Your best-selling product this month is <b className="font-bold text-slate-900">{topProduct.name}</b>{" "}
          <span className="text-slate-400">({fmtNum(topProduct.qty)} sold)</span>.
        </Insight>
      );
    }

    if (gst) {
      const when = gst.daysLeft <= 0 ? "due today" : gst.daysLeft === 1 ? "due tomorrow" : `due in ${gst.daysLeft} days`;
      insights.push(
        <Insight key="gst" icon={CalendarClock} tone={gst.daysLeft <= 5 ? "rose" : "brand"} to="/accounting">
          {gst.ret} filing is <b className="font-bold text-slate-900">{when}</b> <span className="text-slate-400">(by {gst.dueDate})</span>.
        </Insight>
      );
    }

    if (profit) {
      const up = profit.direction === "up";
      insights.push(
        <Insight key="profit" icon={up ? TrendingUp : TrendingDown} tone={up ? "emerald" : "rose"} to="/reports">
          {profit.changePct === null ? (
            <>Your profit this month is <b className="font-bold text-slate-900">{fmtMoney(profit.thisMonth, cur)}</b>.</>
          ) : (
            <>Your profit {up ? "increased" : "decreased"} by <b className="font-bold text-slate-900">{Math.abs(profit.changePct)}%</b> compared to last month.</>
          )}
        </Insight>
      );
    }
  }

  return (
    <div className="card overflow-hidden bg-gradient-to-br from-brand-50/60 to-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white shadow-sm"><Sparkles className="h-[18px] w-[18px]" /></span>
        <div>
          <h3 className="font-bold text-slate-800">Business Assistant</h3>
          <p className="text-xs text-slate-400">A quick read on what needs your attention</p>
        </div>
      </div>

      {data === null ? (
        <div className="grid h-24 place-items-center"><Spinner className="h-6 w-6 text-brand-500" /></div>
      ) : insights.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl px-3 py-4 text-sm text-slate-500">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" /> All clear — no urgent insights right now. Record some sales to see tips here.
        </div>
      ) : (
        <div className="space-y-1">{insights}</div>
      )}
    </div>
  );
}
