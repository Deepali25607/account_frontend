import { useState } from "react";
import { Building2, Save, ShieldAlert, Image as ImageIcon, Upload, Download, DatabaseBackup, AlertTriangle } from "lucide-react";
import api from "../api";
import { useAuth } from "../auth";
import { Field, Spinner, Modal, useToast, apiError } from "../ui";
import PageHead from "../components/PageHead";

// Fields the owner can maintain. `name` is required; the rest are optional and
// print on invoices / receipts (see pdf.js header) and GST documents.
const blankFrom = (t) => ({
  name: t?.name || "", gstin: t?.gstin || "", pan: t?.pan || "",
  phone: t?.phone || "", email: t?.email || "", website: t?.website || "",
  address: t?.address || "", city: t?.city || "", state: t?.state || "", pincode: t?.pincode || "",
  logo: t?.logo || "",
});

export default function CompanyProfile() {
  const { me, refresh, can } = useAuth();
  const toast = useToast();
  const isOwner = me.user.role === "owner";
  const gst = can("gst");
  const [f, setF] = useState(() => blankFrom(me.tenant));
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  // Logo upload — read as a base64 data-URL (stored inline, like the platform QR).
  const onLogo = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file after a remove
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Please choose an image file");
    if (file.size > 1024 * 1024) return toast.error("Logo too large (max ~1 MB)");
    const reader = new FileReader();
    reader.onload = () => setF((x) => ({ ...x, logo: reader.result }));
    reader.onerror = () => toast.error("Could not read that image");
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!f.name.trim()) return toast.error("Company name is required");
    setBusy(true);
    try {
      await api.put("/auth/me/company", f);
      await refresh();           // pull the updated tenant into the app shell
      toast.success("Company profile saved");
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusy(false); }
  };

  if (!isOwner) {
    return (
      <>
        <PageHead title="Company profile" subtitle="Your business's legal & contact details." />
        <div className="card flex items-start gap-3 p-5">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-500" />
          <p className="text-sm text-slate-600">
            Only the account <b>owner</b> can edit the company profile. Ask your owner to update these details.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead
        title="Company profile"
        subtitle="Your business's legal & contact details — these appear on invoices, receipts and GST documents."
      />

      <div className="space-y-6">
        <section className="card p-5">
          <h3 className="mb-1 flex items-center gap-2 font-bold text-slate-800"><ImageIcon className="h-4 w-4 text-brand-600" /> Company logo</h3>
          <p className="mb-4 text-sm text-slate-500">Shown on invoices and PDF documents. PNG or JPG, up to ~1 MB.</p>
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {f.logo ? <img src={f.logo} alt="Company logo" className="max-h-full max-w-full object-contain" /> : <ImageIcon className="h-8 w-8 text-slate-300" />}
            </div>
            <div className="flex flex-wrap gap-2">
              <input id="logofile" type="file" accept="image/*" className="hidden" onChange={onLogo} />
              <label htmlFor="logofile" className="btn-ghost cursor-pointer"><Upload className="h-4 w-4" /> {f.logo ? "Replace logo" : "Upload logo"}</label>
              {f.logo && <button type="button" className="btn-ghost text-rose-600 hover:bg-rose-50" onClick={() => setF((x) => ({ ...x, logo: "" }))}>Remove</button>}
            </div>
          </div>
        </section>

        <section className="card p-5">
          <h3 className="mb-1 flex items-center gap-2 font-bold text-slate-800"><Building2 className="h-4 w-4 text-brand-600" /> Business details</h3>
          <p className="mb-4 text-sm text-slate-500">Your registered company name and tax identifiers.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Company name"><input className="input" value={f.name} onChange={set("name")} placeholder="Acme Trading Pvt Ltd" /></Field></div>
            {gst && <Field label="GSTIN"><input className="input uppercase" value={f.gstin} onChange={set("gstin")} placeholder="22AAAAA0000A1Z5" autoComplete="off" /></Field>}
            {gst && <Field label="PAN"><input className="input uppercase" value={f.pan} onChange={set("pan")} placeholder="AAAAA0000A" autoComplete="off" /></Field>}
          </div>
        </section>

        <section className="card p-5">
          <h3 className="mb-1 font-bold text-slate-800">Address</h3>
          <p className="mb-4 text-sm text-slate-500">Registered / billing address shown on documents.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Address"><textarea className="input min-h-[72px]" value={f.address} onChange={set("address")} placeholder="Building, street, area" /></Field></div>
            <Field label="City"><input className="input" value={f.city} onChange={set("city")} /></Field>
            <Field label="State"><input className="input" value={f.state} onChange={set("state")} /></Field>
            <Field label="Pincode"><input className="input" value={f.pincode} onChange={set("pincode")} inputMode="numeric" /></Field>
          </div>
        </section>

        <section className="card p-5">
          <h3 className="mb-1 font-bold text-slate-800">Contact</h3>
          <p className="mb-4 text-sm text-slate-500">How customers and suppliers can reach you.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone"><input className="input" value={f.phone} onChange={set("phone")} inputMode="tel" /></Field>
            <Field label="Email"><input type="email" className="input" value={f.email} onChange={set("email")} placeholder="billing@company.com" /></Field>
            <div className="sm:col-span-2"><Field label="Website"><input className="input" value={f.website} onChange={set("website")} placeholder="https://company.com" /></Field></div>
          </div>
        </section>

        <div className="flex justify-end">
          <button className="btn-primary" disabled={busy || !f.name.trim()} onClick={save}>
            {busy ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Save profile
          </button>
        </div>

        <BackupRestore />
      </div>
    </>
  );
}

/**
 * Full company backup: download everything to a local JSON file, and restore it
 * later. Restore REPLACES all current company data, so it's gated behind an
 * explicit confirmation. Owner-only (the whole page already is).
 */
function BackupRestore() {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pending, setPending] = useState(null); // parsed backup awaiting confirmation

  const exportBackup = async () => {
    setExporting(true);
    try {
      const { data } = await api.get("/backup/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      const safe = (me.tenant.name || "company").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "company";
      a.href = url; a.download = `${safe}-backup-${stamp}.json`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`Backup downloaded — ${data.records} records`);
    } catch (e) { toast.error(apiError(e)); }
    finally { setExporting(false); }
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (parsed?.format !== "ledgerflow-company-backup") return toast.error("This isn't a LedgerFlow company backup file.");
        setPending({ ...parsed, _fileName: file.name });
      } catch { toast.error("Couldn't read this file — is it a valid backup?"); }
    };
    reader.onerror = () => toast.error("Couldn't read that file");
    reader.readAsText(file);
  };

  const doImport = async () => {
    setImporting(true);
    try {
      const { data } = await api.post("/backup/import", pending);
      toast.success(`Company restored — ${data.restored} records imported`);
      setPending(null);
      await refresh(); // pull restored company name/profile into the app shell
    } catch (e) { toast.error(apiError(e)); }
    finally { setImporting(false); }
  };

  return (
    <section className="card p-5">
      <h3 className="mb-1 flex items-center gap-2 font-bold text-slate-800"><DatabaseBackup className="h-4 w-4 text-brand-600" /> Backup &amp; restore</h3>
      <p className="mb-4 text-sm text-slate-500">Download a complete backup of your company data, or restore one onto this account.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-4">
          <div className="mb-1 font-semibold text-slate-800">Export</div>
          <p className="mb-3 text-sm text-slate-500">Saves items, parties, purchases, sales, payments, accounting & more to a single JSON file on your device.</p>
          <button className="btn-ghost" disabled={exporting} onClick={exportBackup}>
            {exporting ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />} Download backup
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 p-4">
          <div className="mb-1 font-semibold text-slate-800">Import</div>
          <p className="mb-3 text-sm text-slate-500">Restore from a backup file. This <b className="text-rose-600">replaces all current company data</b>.</p>
          <input id="backupfile" type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
          <label htmlFor="backupfile" className="btn-ghost cursor-pointer"><Upload className="h-4 w-4" /> Choose backup file…</label>
        </div>
      </div>

      {pending && (
        <Modal open title="Restore this backup?" onClose={() => setPending(null)}>
          <div className="flex items-start gap-3 rounded-xl border border-rose-100 bg-rose-50/60 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-rose-500" />
            <div className="text-sm text-slate-700">
              <p>This will <b>permanently replace</b> all current data for <b>{me.tenant.name}</b> — items, parties, purchases, sales, payments and accounting — with the contents of this file. This can't be undone.</p>
              <p className="mt-2 text-slate-500">
                File: <b className="text-slate-700">{pending._fileName}</b>
                {pending.exportedAt && <> · backed up {String(pending.exportedAt).slice(0, 10)}</>}
                {typeof pending.records === "number" && <> · {pending.records} records</>}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">Tip: export a fresh backup first if you might want to come back to the current data.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setPending(null)}>Cancel</button>
            <button className="btn-primary !bg-rose-600 hover:!bg-rose-700" disabled={importing} onClick={doImport}>
              {importing ? <Spinner className="h-4 w-4" /> : <DatabaseBackup className="h-4 w-4" />} Replace &amp; restore
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
