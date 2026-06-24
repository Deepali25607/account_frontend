import { useState } from "react";
import { Building2, Save, ShieldAlert, Image as ImageIcon, Upload } from "lucide-react";
import api from "../api";
import { useAuth } from "../auth";
import { Field, Spinner, useToast, apiError } from "../ui";
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
      </div>
    </>
  );
}
