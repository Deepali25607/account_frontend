import { Link } from "react-router-dom";
import { Lock, ArrowRight } from "lucide-react";

const INFO = {
  multi_user: {
    title: "Team & Access",
    tier: "Standard",
    blurb: "Add multiple named users, assign roles, and control exactly which modules and actions each role can access.",
    points: ["Multiple user accounts", "Roles: Accountant, Sales, Purchase, Production", "Editable per-module permissions", "Full audit trail"],
  },
  accounting: {
    title: "Accounting & GST",
    tier: "Standard",
    blurb: "Full double-entry ledger, trial balance, P&L and balance sheet, plus GST computation and tax-return-ready reports.",
    points: ["Auto-posted journal entries", "Chart of accounts", "Trial balance & financial statements", "GST-compliant invoicing"],
  },
  multi_location: {
    title: "Warehouses",
    tier: "Premium",
    blurb: "Track stock across multiple warehouses, transfer between them, and receive/issue goods per location.",
    points: ["Multiple warehouses", "Per-location stock balances", "Stock transfers", "Receive & sell from a chosen location"],
  },
  manufacturing: {
    title: "Manufacturing",
    tier: "Premium",
    blurb: "Plan and produce, not just trade. Define BOMs, run production orders, and let MRP calculate material shortages automatically.",
    points: ["Multi-level Bill of Materials", "Production orders & WIP tracking", "MRP shortage calculation", "Manufacturing cost reports"],
  },
};

export default function Locked({ feature, title }) {
  const info = INFO[feature] || { title: title || "This feature", tier: "a higher", blurb: "This module isn't included in your current plan.", points: [] };
  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-brand-600">
        <Lock className="h-8 w-8" />
      </div>
      <h1 className="text-2xl font-extrabold text-slate-900">{info.title} is a {info.tier}-tier feature</h1>
      <p className="mx-auto mt-2 max-w-md text-slate-500">{info.blurb}</p>

      {info.points.length > 0 && (
        <ul className="mx-auto mt-6 grid max-w-sm gap-2 text-left">
          {info.points.map((p) => (
            <li key={p} className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm text-slate-600 shadow-card">
              <ArrowRight className="h-4 w-4 text-brand-500" /> {p}
            </li>
          ))}
        </ul>
      )}

      <Link to="/billing" className="btn-primary mt-7 inline-flex">Upgrade your plan <ArrowRight className="h-4 w-4" /></Link>
    </div>
  );
}
