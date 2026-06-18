import { useEffect, useState } from "react";
import { Plus, Users, ShieldCheck, History, UserCog } from "lucide-react";
import api from "../api";
import { useAuth } from "../auth";
import { Modal, Field, useToast, apiError, Empty, Spinner, Pager } from "../ui";
import PageHead from "../components/PageHead";

const ROLE_LABEL = { owner: "Owner / Admin", accountant: "Accountant", sales: "Sales Staff", purchase: "Purchase Staff", production: "Production Staff" };
const ROLE_STYLE = { owner: "bg-amber-100 text-amber-700", accountant: "bg-brand-100 text-brand-700", sales: "bg-emerald-100 text-emerald-700", purchase: "bg-violet-100 text-violet-700", production: "bg-rose-100 text-rose-700" };

const TABS = [
  { id: "users", label: "Users", icon: Users },
  { id: "permissions", label: "Roles & Permissions", icon: ShieldCheck },
  { id: "audit", label: "Audit Trail", icon: History },
];

export default function Team() {
  const { me } = useAuth();
  const [tab, setTab] = useState("users");
  const isOwner = me.user.role === "owner";
  return (
    <>
      <PageHead title="Team & Access" subtitle="Manage users, role permissions and the audit trail (Standard & Premium)." />
      {!isOwner && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">Only the owner can manage the team. You're viewing in read-only mode.</p>}
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === t.id ? "bg-brand-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>
      {tab === "users" && <UsersTab isOwner={isOwner} tier={me.tenant.tier} />}
      {tab === "permissions" && <PermissionsTab isOwner={isOwner} />}
      {tab === "audit" && <AuditTab isOwner={isOwner} />}
    </>
  );
}

/* ── Users ── */
function UsersTab({ isOwner, tier }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [adding, setAdding] = useState(false);
  const load = () => { setData(null); api.get("/users").then((r) => setData(r.data)); };
  useEffect(load, []);

  const toggle = async (u) => {
    try { await api.put(`/users/${u.id}`, { active: !u.active }); toast.success(u.active ? "User deactivated" : "User reactivated"); load(); }
    catch (e) { toast.error(apiError(e)); }
  };
  const changeRole = async (u, role) => {
    try { await api.put(`/users/${u.id}`, { role }); toast.success("Role updated"); load(); }
    catch (e) { toast.error(apiError(e)); }
  };

  if (!data) return <Loading />;
  const full = data.activeCount >= data.limit;

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-500"><b className="text-slate-800">{data.activeCount}</b> of <b className="text-slate-800">{data.limit}</b> seats used</p>
        {isOwner && <button className="btn-primary" disabled={full} onClick={() => setAdding(true)} title={full ? "Seat limit reached — upgrade for more" : ""}><Plus className="h-4 w-4" /> Invite user</button>}
      </div>
      <div className="card overflow-hidden">
        <table className="w-full min-w-[620px]">
          <thead><tr className="bg-slate-50"><th className="th">Name</th><th className="th">Email</th><th className="th">Role</th><th className="th">Status</th>{isOwner && <th className="th"></th>}</tr></thead>
          <tbody>
            {data.users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50/60">
                <td className="td font-semibold text-slate-800">{u.name}</td>
                <td className="td">{u.email}</td>
                <td className="td">
                  {isOwner && u.role !== "owner" ? (
                    <select className="input w-auto py-1 text-xs" value={u.role} onChange={(e) => changeRole(u, e.target.value)}>
                      {["accountant", "sales", "purchase", "production"].map((r) => (
                        <option key={r} value={r} disabled={r === "production" && tier !== "premium"}>{ROLE_LABEL[r]}</option>
                      ))}
                    </select>
                  ) : <span className={`badge ${ROLE_STYLE[u.role]}`}>{ROLE_LABEL[u.role]}</span>}
                </td>
                <td className="td"><span className={`badge ${u.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>{u.active ? "Active" : "Inactive"}</span></td>
                {isOwner && <td className="td text-right">{u.role !== "owner" && <button className="btn-ghost btn-sm" onClick={() => toggle(u)}>{u.active ? "Deactivate" : "Reactivate"}</button>}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adding && <InviteModal tier={tier} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} toast={toast} />}
    </>
  );
}

function InviteModal({ tier, onClose, onSaved, toast }) {
  const [f, setF] = useState({ name: "", email: "", password: "", role: "sales" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try { await api.post("/users", f); toast.success("User invited"); onSaved(); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open title="Invite a user" onClose={onClose}>
      <div className="grid gap-3">
        <Field label="Full name"><input className="input" value={f.name} onChange={set("name")} /></Field>
        <Field label="Email"><input type="email" className="input" value={f.email} onChange={set("email")} /></Field>
        <Field label="Temporary password (share with the user)"><input className="input" value={f.password} onChange={set("password")} placeholder="min 6 characters" /></Field>
        <Field label="Role">
          <select className="input" value={f.role} onChange={set("role")}>
            {["accountant", "sales", "purchase", "production"].map((r) => (
              <option key={r} value={r} disabled={r === "production" && tier !== "premium"}>{ROLE_LABEL[r]}{r === "production" && tier !== "premium" ? " (Premium)" : ""}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || !f.name || !f.email || f.password.length < 6} onClick={save}>{busy && <Spinner className="h-4 w-4" />} Invite</button>
      </div>
    </Modal>
  );
}

/* ── Permissions matrix (UM-03) ── */
const ACTION_LABEL = { can_view: "View", can_create: "Create", can_edit: "Edit", can_approve: "Approve", can_delete: "Delete" };

function PermissionsTab({ isOwner }) {
  const toast = useToast();
  const [d, setD] = useState(null);
  const [matrix, setMatrix] = useState({}); // key role|module → row
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState("accountant");

  useEffect(() => {
    api.get("/users/permissions").then((r) => {
      setD(r.data);
      const m = {}; r.data.matrix.forEach((row) => { m[`${row.role}|${row.module}`] = { ...row }; });
      setMatrix(m);
    });
  }, []);

  if (!d) return <Loading />;
  const toggle = (module, action) => {
    const key = `${role}|${module}`;
    setMatrix((m) => ({ ...m, [key]: { ...m[key], [action]: m[key][action] ? 0 : 1 } }));
  };
  const save = async () => {
    setBusy(true);
    try {
      const changes = Object.values(matrix);
      await api.put("/users/permissions", { changes });
      toast.success("Permissions saved");
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <div className="card p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2">
          <UserCog className="h-4 w-4 text-slate-400" />
          <select className="input w-auto" value={role} onChange={(e) => setRole(e.target.value)}>
            {d.roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
        {isOwner && <button className="btn-primary btn-sm" disabled={busy} onClick={save}>{busy && <Spinner className="h-4 w-4" />} Save changes</button>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead><tr className="bg-slate-50"><th className="th">Module</th>{d.actions.map((a) => <th key={a} className="th text-center">{ACTION_LABEL[a]}</th>)}</tr></thead>
          <tbody>
            {d.modules.map((mod) => {
              const row = matrix[`${role}|${mod}`] || {};
              return (
                <tr key={mod}>
                  <td className="td font-medium capitalize">{mod}</td>
                  {d.actions.map((a) => (
                    <td key={a} className="td text-center">
                      <input type="checkbox" disabled={!isOwner} checked={!!row[a]} onChange={() => toggle(mod, a)} className="h-4 w-4 accent-brand-600" />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-400">The Owner/Admin always has full access. Changes apply immediately to that role's API calls (enforced server-side).</p>
    </div>
  );
}

/* ── Audit trail (UM-04) ── */
const AUDIT_PAGE_SIZE = 20;
function AuditTab({ isOwner }) {
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  useEffect(() => {
    if (isOwner) api.get("/users/audit", { params: { page, pageSize: AUDIT_PAGE_SIZE } }).then((r) => { setRows(r.data.rows); setTotal(r.data.total); });
  }, [isOwner, page]);
  if (!isOwner) return <div className="card"><Empty icon={History} title="Owner only" hint="Only the owner can view the audit trail." /></div>;
  if (!rows) return <Loading />;
  if (!rows.length) return <div className="card"><Empty icon={History} title="No activity yet" /></div>;
  return (
    <div className="card overflow-hidden">
      <table className="w-full min-w-[560px]">
        <thead><tr className="bg-slate-50"><th className="th">When</th><th className="th">User</th><th className="th">Action</th><th className="th">Entity</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50/60">
              <td className="td text-slate-500">{r.created_at}</td>
              <td className="td">{r.user_name || "—"} <span className="text-xs text-slate-400">{r.role}</span></td>
              <td className="td capitalize font-medium">{r.action}</td>
              <td className="td">{r.entity ? `${r.entity}${r.entity_id ? ` #${r.entity_id}` : ""}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager page={page} pageSize={AUDIT_PAGE_SIZE} total={total} onPage={setPage} />
    </div>
  );
}

const Loading = () => <div className="grid h-32 place-items-center"><Spinner className="h-6 w-6 text-brand-500" /></div>;
