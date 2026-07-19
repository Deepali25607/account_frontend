import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sparkles, Send, Mic, X, Coins, Trophy, CalendarClock, TrendingUp, TrendingDown, Crown, Zap,
} from "lucide-react";
import api from "../api";
import { ROUTES } from "../routes";
import { useAuth } from "../auth";
import { fmtMoney, fmtNum } from "../ui";

/*
 * LedgerFlow AI — floating assistant, available on every screen.
 *
 * A glowing orb launcher (bottom-right) opens a dark glass "command console":
 * business insights as the welcome briefing, then free-form chat + voice
 * commands over the tenant's books. Actions (record expense, new invoice,
 * open page) are proposed by the AI and confirmed/executed by the user via
 * the normal authenticated APIs — see BusinessAssistant history & routes/ai.js.
 */

// Browser speech-to-text (Chrome/Edge/Android). en-IN handles Hindi-English mix.
const SpeechRec = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

const SUGGESTIONS = [
  "How is my business doing?",
  "Who owes me money?",
  "Today's cash report",
  "Add expense ₹500 for diesel",
  "Create invoice",
];

/** Minimal chat text renderer: paragraphs/line breaks + **bold**. */
function ChatText({ text }) {
  return (
    <div className="space-y-1 whitespace-pre-wrap break-words">
      {String(text).split("\n").map((line, i) => (
        <div key={i}>
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith("**") && part.endsWith("**")
              ? <b key={j} className="font-bold">{part.slice(2, -2)}</b>
              : <span key={j}>{part}</span>
          )}
        </div>
      ))}
    </div>
  );
}

/** One insight row in the welcome briefing. */
function Briefing({ icon: Icon, tone, children }) {
  const tones = {
    amber: "from-amber-400/25 to-amber-400/5 text-amber-300",
    emerald: "from-emerald-400/25 to-emerald-400/5 text-emerald-300",
    rose: "from-rose-400/25 to-rose-400/5 text-rose-300",
    cyan: "from-cyan-400/25 to-cyan-400/5 text-cyan-300",
  };
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/[.06] bg-white/[.04] px-3 py-2">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${tones[tone] || tones.cyan}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <p className="flex-1 text-[13px] leading-snug text-slate-300">{children}</p>
    </div>
  );
}

/** Proposed expense from a voice/typed command — recorded only after Confirm. */
function ExpenseAction({ msg, cur, onResolve }) {
  const p = msg.action.params;
  return (
    <div className="max-w-[85%] rounded-2xl border border-cyan-400/30 bg-cyan-400/[.07] px-3.5 py-2.5 text-sm text-slate-200 shadow-[0_0_24px_-8px_rgba(34,211,238,.45)]">
      <p className="text-[11px] font-bold uppercase tracking-widest text-cyan-300">Confirm expense</p>
      <p className="mt-1">
        <b className="text-base font-extrabold text-white">{fmtMoney(p.amount, cur)}</b> — {p.category}
        {p.note ? <span className="text-slate-400"> ({p.note})</span> : null}
        <span className="text-slate-500"> · {p.account}</span>
      </p>
      {msg.status === "pending" ? (
        <div className="mt-2.5 flex gap-2">
          <button onClick={() => onResolve(true)}
            className="rounded-lg bg-gradient-to-r from-brand-500 to-violet-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-lg transition hover:brightness-110 active:scale-95">
            Confirm
          </button>
          <button onClick={() => onResolve(false)}
            className="rounded-lg border border-white/15 px-3.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/5 active:scale-95">
            Cancel
          </button>
        </div>
      ) : (
        <p className={`mt-2 text-xs font-semibold ${msg.status === "done" ? "text-emerald-400" : "text-slate-500"}`}>
          {msg.status === "done" ? "✓ Expense recorded" : "Cancelled — nothing was saved"}
        </p>
      )}
    </div>
  );
}

export default function AiChatbot() {
  const { me, can } = useAuth();
  const navigate = useNavigate();
  // Paid add-on: true only when the platform super admin has enabled AI for
  // this organization (tenants.ai_enabled → /auth/me features.ai_assistant).
  const aiGranted = can("ai_assistant");

  const [open, setOpen] = useState(false);
  const [insights, setInsights] = useState(null);
  const [status, setStatus] = useState(null);   // {enabled, remaining} once loaded
  const [msgs, setMsgs] = useState([]);         // [{role, content, error?, action?, status?}]
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const scrollRef = useRef(null);
  const recRef = useRef(null);
  const inputRef = useRef(null);

  // Load the briefing + AI availability the first time the console opens.
  useEffect(() => {
    if (!open || insights !== null) return;
    api.get("/reports/assistant").then((r) => setInsights(r.data)).catch(() => setInsights({}));
    if (aiGranted) api.get("/ai/status").then((r) => setStatus(r.data)).catch(() => setStatus({ enabled: false }));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy, open]);

  useEffect(() => () => recRef.current?.abort?.(), []);

  if (!me || me.trial?.expired) return null;

  const cur = me.tenant.currency;
  const chatReady = aiGranted && status?.enabled;

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || busy || !chatReady) return;
    const history = [...msgs.filter((m) => !m.error && !m.action), { role: "user", content: q }];
    setMsgs([...msgs, { role: "user", content: q }]);
    setInput("");
    setBusy(true);
    try {
      const { data } = await api.post("/ai/chat", {
        messages: history.slice(-10).map(({ role, content }) => ({ role, content })),
      });
      setStatus((s) => ({ ...s, remaining: data.remaining }));
      if (data.action) {
        const { type, params } = data.action;
        if (type === "open_page") { setOpen(false); return navigate(ROUTES[params.page] || ROUTES.home); }
        if (type === "open_new_bill") {
          setOpen(false);
          const base = params.kind === "purchase" ? ROUTES.purchases : ROUTES.sales;
          return navigate(`${base}?new=1${params.party ? `&party=${encodeURIComponent(params.party)}` : ""}`);
        }
        if (type === "record_expense")
          return setMsgs((m) => [...m, { role: "assistant", content: "", action: data.action, status: "pending" }]);
      }
      setMsgs((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch (e) {
      const msg = e?.response?.data?.error || "Could not reach the assistant. Please try again.";
      setMsgs((m) => [...m, { role: "assistant", content: msg, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  // Confirm / cancel a proposed expense — saved through the normal API only.
  const resolveExpense = async (idx, ok) => {
    const p = msgs[idx]?.action?.params;
    if (!p || msgs[idx].status !== "pending") return;
    if (!ok) return setMsgs((ms) => ms.map((m, i) => (i === idx ? { ...m, status: "cancelled" } : m)));
    try {
      await api.post("/expenses", { category: p.category, amount: p.amount, account: p.account, note: p.note });
      setMsgs((ms) => ms.map((m, i) => (i === idx ? { ...m, status: "done" } : m)));
    } catch (e) {
      setMsgs((ms) => [
        ...ms.map((m, i) => (i === idx ? { ...m, status: "cancelled" } : m)),
        { role: "assistant", content: e?.response?.data?.error || "Could not record the expense.", error: true },
      ]);
    }
  };

  // Push-to-talk: tap, speak; sends when you stop talking. Tap again to stop.
  const toggleMic = () => {
    if (listening) return recRef.current?.stop();
    const rec = new SpeechRec();
    rec.lang = "en-IN";
    rec.interimResults = true;
    let finalText = "";
    rec.onresult = (e) => {
      let text = "";
      for (const r of e.results) text += r[0].transcript;
      setInput(text);
      if (e.results[e.results.length - 1].isFinal) finalText = text;
    };
    rec.onend = () => { setListening(false); if (finalText.trim()) send(finalText); };
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const briefing = [];
  if (insights) {
    const { receivables, topProduct, gst, profit } = insights;
    if (receivables) briefing.push(
      <Briefing key="r" icon={Coins} tone="amber">
        <b className="font-bold text-white">{fmtMoney(receivables.total, cur)}</b> pending from {fmtNum(receivables.customers)} customer{receivables.customers === 1 ? "" : "s"}.
      </Briefing>
    );
    if (topProduct) briefing.push(
      <Briefing key="t" icon={Trophy} tone="emerald">
        Best-seller this month: <b className="font-bold text-white">{topProduct.name}</b> ({fmtNum(topProduct.qty)} sold).
      </Briefing>
    );
    if (gst) briefing.push(
      <Briefing key="g" icon={CalendarClock} tone={gst.daysLeft <= 5 ? "rose" : "cyan"}>
        {gst.ret} filing {gst.daysLeft <= 0 ? "is due today" : `due in ${gst.daysLeft} day${gst.daysLeft === 1 ? "" : "s"}`}.
      </Briefing>
    );
    if (profit) briefing.push(
      <Briefing key="p" icon={profit.direction === "up" ? TrendingUp : TrendingDown} tone={profit.direction === "up" ? "emerald" : "rose"}>
        {profit.changePct === null
          ? <>Profit this month: <b className="font-bold text-white">{fmtMoney(profit.thisMonth, cur)}</b>.</>
          : <>Profit {profit.direction === "up" ? "up" : "down"} <b className="font-bold text-white">{Math.abs(profit.changePct)}%</b> vs last month.</>}
      </Briefing>
    );
  }

  return (
    <>
      {/* ── Launcher orb ─────────────────────────────────────────────── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="LedgerFlow AI"
          className="group fixed bottom-24 right-4 z-40 md:bottom-6 md:right-6"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <span className="absolute inset-0 rounded-full bg-gradient-to-br from-brand-500 via-violet-500 to-cyan-400 opacity-70 blur-md transition-opacity group-hover:opacity-100" />
          <span className="ai-ring absolute inset-0 rounded-full border-2 border-violet-400/60" />
          <span className="relative grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-brand-600 via-violet-600 to-cyan-500 text-white shadow-2xl transition-transform duration-200 group-hover:scale-110 group-active:scale-95">
            <Sparkles className="h-6 w-6 drop-shadow" />
          </span>
        </button>
      )}

      {/* ── Console panel ────────────────────────────────────────────── */}
      {open && (
        <div
          className="ai-console ai-pop fixed inset-x-3 bottom-24 z-50 flex h-[min(640px,calc(100dvh-8.5rem))] flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-[0_24px_80px_-16px_rgba(59,102,245,.55)] md:inset-x-auto md:bottom-6 md:right-6 md:w-[400px]"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          {/* ambience: aurora blobs + fine grid */}
          <div className="pointer-events-none absolute inset-0">
            <div className="ai-blob absolute -top-24 -left-20 h-72 w-72 rounded-full bg-violet-600/30 blur-3xl" />
            <div className="ai-blob absolute -bottom-28 -right-16 h-80 w-80 rounded-full bg-cyan-500/20 blur-3xl" style={{ animationDelay: "-4s" }} />
            <div className="absolute inset-0 opacity-[.05]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
          </div>

          {/* header */}
          <div className="relative flex items-center gap-3 border-b border-white/[.07] px-4 py-3.5">
            <span className="relative grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 via-violet-600 to-cyan-500 text-white shadow-lg">
              <Sparkles className="h-5 w-5" />
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-950 bg-emerald-400" />
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="bg-gradient-to-r from-white via-brand-200 to-cyan-200 bg-clip-text font-extrabold tracking-tight text-transparent">LedgerFlow AI</h3>
                <Zap className="h-3.5 w-3.5 text-cyan-300" />
              </div>
              <p className="text-[11px] text-slate-500">Your books, on command — type or speak</p>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-xl p-2 text-slate-500 transition hover:bg-white/5 hover:text-slate-300 active:scale-90" title="Close">
              <X className="h-[18px] w-[18px]" />
            </button>
          </div>

          {/* body */}
          <div ref={scrollRef} className="relative flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
            {msgs.length === 0 ? (
              <>
                <p className="text-sm text-slate-300">
                  Namaste <b className="font-bold text-white">{me.user.name.split(" ")[0]}</b> 👋 — here's your briefing:
                </p>
                <div className="space-y-1.5">
                  {insights === null
                    ? <p className="py-2 text-center text-xs text-slate-600">Reading your books…</p>
                    : briefing.length ? briefing : <Briefing icon={Sparkles} tone="cyan">All clear — record some sales and I'll surface what matters.</Briefing>}
                </div>
                {chatReady && (
                  <div className="pt-1.5">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">Try saying</p>
                    <div className="flex flex-wrap gap-1.5">
                      {SUGGESTIONS.map((s) => (
                        <button key={s} onClick={() => send(s)} disabled={busy}
                          className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-cyan-400/40 hover:bg-cyan-400/10 hover:text-white disabled:opacity-50">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              msgs.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  {m.action ? (
                    <ExpenseAction msg={m} cur={cur} onResolve={(ok) => resolveExpense(i, ok)} />
                  ) : (
                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                      m.role === "user"
                        ? "bg-gradient-to-br from-brand-600 to-violet-600 text-white shadow-lg"
                        : m.error
                          ? "border border-rose-400/30 bg-rose-400/10 text-rose-300"
                          : "border border-white/10 bg-white/[.06] text-slate-200"
                    }`}>
                      <ChatText text={m.content} />
                    </div>
                  )}
                </div>
              ))
            )}
            {busy && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[.06] px-4 py-3">
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300" style={{ animationDelay: `${d * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* footer: chat input / upgrade / not-configured */}
          <div className="relative border-t border-white/[.07] px-3 py-3">
            {!aiGranted ? (
              <div className="flex w-full items-center gap-2.5 rounded-2xl bg-gradient-to-r from-brand-600 to-violet-600 px-4 py-3 text-white shadow-lg">
                <Crown className="h-5 w-5 shrink-0 text-amber-300" />
                <span className="flex-1">
                  <span className="block text-sm font-bold">AI chat & voice commands</span>
                  <span className="block text-[11px] text-brand-100">A paid add-on — contact us to enable it for your organization</span>
                </span>
              </div>
            ) : status && !status.enabled ? (
              <p className="px-1 py-1 text-center text-xs text-slate-500">AI chat isn't set up on this server yet{me.user.role === "owner" ? " — add a Groq API key to enable it" : ""}.</p>
            ) : (
              <>
                <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={busy || !chatReady}
                    maxLength={1000}
                    placeholder={listening ? "Listening…" : "Ask, or say: \"Add expense ₹500 for diesel\""}
                    className="h-11 flex-1 rounded-2xl border border-white/10 bg-white/[.05] px-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400/50 focus:bg-white/[.08]"
                  />
                  {SpeechRec && (
                    <button type="button" onClick={toggleMic} disabled={busy || !chatReady} title={listening ? "Stop listening" : "Speak a command"}
                      className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl transition active:scale-90 disabled:opacity-40 ${
                        listening
                          ? "animate-pulse bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-[0_0_20px_-2px_rgba(244,63,94,.7)]"
                          : "border border-white/10 bg-white/[.05] text-slate-400 hover:border-white/20 hover:text-white"
                      }`}>
                      <Mic className="h-[18px] w-[18px]" />
                    </button>
                  )}
                  <button type="submit" disabled={busy || !input.trim() || !chatReady}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 via-violet-500 to-cyan-500 text-white shadow-lg transition hover:brightness-110 active:scale-90 disabled:opacity-40">
                    <Send className="h-[18px] w-[18px]" />
                  </button>
                </form>
                {status?.remaining <= 10 && (
                  <p className="mt-1.5 text-right text-[10px] text-slate-600">{status.remaining} question{status.remaining === 1 ? "" : "s"} left today</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
