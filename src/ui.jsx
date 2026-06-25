import { createContext, useContext, useState, useCallback } from "react";
import { X, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

/* ── currency / number formatting ── */
export const fmtMoney = (n, cur = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(Number(n || 0));
export const fmtNum = (n) => new Intl.NumberFormat("en-IN").format(Number(n || 0));

/* ── Spinner / Empty ── */
export const Spinner = ({ className = "" }) => (
  <Loader2 className={`animate-spin ${className}`} />
);
export const Empty = ({ icon: Icon, title, hint }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-up">
    {Icon && (
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-400 shadow-glow-sm">
        <Icon className="h-7 w-7" />
      </div>
    )}
    <p className="mt-4 font-semibold text-slate-600">{title}</p>
    {hint && <p className="mt-1 text-sm text-slate-400">{hint}</p>}
  </div>
);

/* ── Skeleton loaders ── */
export const Skeleton = ({ className = "" }) => <div className={`skeleton ${className}`} />;
export const SkeletonCard = () => (
  <div className="glass p-5">
    <Skeleton className="h-10 w-10 rounded-xl" />
    <Skeleton className="mt-3 h-7 w-24" />
    <Skeleton className="mt-2 h-4 w-20" />
  </div>
);
export const SkeletonRows = ({ rows = 5 }) => (
  <div className="space-y-2.5">
    {Array.from({ length: rows }).map((_, i) => (
      <Skeleton key={i} className="h-12 w-full rounded-xl" />
    ))}
  </div>
);

/* ── Modal (frosted, mobile bottom-sheet) ── */
export function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className={`glass-strong w-full ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"} max-h-[92vh] overflow-auto rounded-b-none rounded-t-3xl sm:rounded-3xl animate-sheet-up sm:animate-scale-in`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* mobile drag affordance */}
        <div className="sticky top-0 z-10 sm:hidden flex justify-center pt-3 pb-1">
          <span className="h-1.5 w-10 rounded-full bg-slate-300/80" />
        </div>
        <div className="flex items-center justify-between border-b border-slate-100/80 px-5 py-4">
          <h3 className="font-bold text-slate-800">{title}</h3>
          <button onClick={onClose} className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 active:scale-90"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ── Field ── */
export const Field = ({ label, children }) => (
  <label className="block">
    <span className="label">{label}</span>
    {children}
  </label>
);

/* ── LineCol ──
   A column inside a multi-field line-item row. Shows the field name above the
   control on mobile (where the desktop column-header row is hidden); the label
   collapses on ≥sm so the header row labels the columns instead. */
export const LineCol = ({ label, className = "", children }) => (
  <label className={`flex flex-col gap-0.5 ${className}`}>
    <span className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:hidden">{label}</span>
    {children}
  </label>
);

/* ── Toasts ── */
const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, type = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  const toast = {
    success: (m) => push(m, "success"),
    error: (m) => push(m, "error"),
  };
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-sm font-semibold text-white shadow-lift backdrop-blur-md animate-fade-up ${
              t.type === "error"
                ? "border-rose-400/40 bg-gradient-to-br from-rose-500 to-rose-600"
                : "border-emerald-400/40 bg-gradient-to-br from-emerald-500 to-emerald-600"
            }`}
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/20">
              {t.type === "error" ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            </span>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const apiError = (e) => e?.response?.data?.message || e?.response?.data?.error || e.message || "Something went wrong";

/* ── Detail view ── */
export function DetailModal({ open, onClose, title, subtitle, fields = [], children }) {
  if (!open) return null;
  return (
    <Modal open wide title={title} onClose={onClose}>
      {subtitle && <p className="-mt-1 mb-3 text-sm text-slate-400">{subtitle}</p>}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {fields.filter(Boolean).map((f) => (
          <div key={f.label}>
            <dt className="label">{f.label}</dt>
            <dd className="text-sm font-medium text-slate-800">{f.value === 0 ? "0" : (f.value || "—")}</dd>
          </div>
        ))}
      </dl>
      {children}
    </Modal>
  );
}

/* ── Pager ── */
export function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
      <span className="text-slate-500">{from}–{to} of {total}</span>
      <div className="flex items-center gap-2">
        <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</button>
        <span className="text-slate-500">Page {page} / {pages}</span>
        <button className="btn-ghost btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}
