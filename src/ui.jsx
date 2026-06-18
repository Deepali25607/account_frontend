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
  <div className="flex flex-col items-center justify-center py-16 text-center">
    {Icon && <Icon className="h-10 w-10 text-slate-300" />}
    <p className="mt-3 font-semibold text-slate-600">{title}</p>
    {hint && <p className="mt-1 text-sm text-slate-400">{hint}</p>}
  </div>
);

/* ── Modal ── */
export function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4" onClick={onClose}>
      <div
        className={`card w-full ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"} max-h-[92vh] overflow-auto rounded-b-none sm:rounded-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="font-bold text-slate-800">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
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
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${t.type === "error" ? "bg-rose-600" : "bg-emerald-600"}`}>
            {t.type === "error" ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
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
