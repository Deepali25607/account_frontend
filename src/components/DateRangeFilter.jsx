import { CalendarDays } from "lucide-react";

// Shared preset date-range control, used by the Sales / Purchases lists and
// Reports. Dates are computed in local time — toISOString would roll the date
// back a day for IST users before 5:30 am.
const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const RANGE_PRESETS = [
  { id: "last365", label: "Last 365 Days" },
  { id: "today", label: "Today" },
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
  { id: "lastMonth", label: "Last Month" },
  { id: "quarter", label: "This Quarter" },
  { id: "fy", label: "This Financial Year" },
  { id: "all", label: "All Time" },
  { id: "custom", label: "Custom Range" },
];

export function presetRange(id) {
  const now = new Date();
  const today = localISO(now);
  switch (id) {
    case "today": return { from: today, to: today };
    case "week": { const d = new Date(now); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return { from: localISO(d), to: today }; } // Monday-based
    case "month": return { from: localISO(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    case "lastMonth": return { from: localISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: localISO(new Date(now.getFullYear(), now.getMonth(), 0)) };
    case "quarter": return { from: localISO(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)), to: today };
    case "fy": { const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; return { from: `${y}-04-01`, to: today }; } // Indian FY: Apr–Mar
    case "last365": { const d = new Date(now); d.setDate(d.getDate() - 365); return { from: localISO(d), to: today }; }
    default: return { from: "", to: "" }; // "all", and the seed for "custom"
  }
}

/** Preset dropdown + From/To inputs (shown only for "custom"). Controlled:
 *  `preset` is the selected id, `range` is {from, to} as YYYY-MM-DD strings. */
export default function DateRangeFilter({ preset, range, onPreset, onCustom }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <select className="input w-auto pl-9" value={preset} onChange={(e) => onPreset(e.target.value)}>
          {RANGE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>
      {preset === "custom" && (
        <>
          <input type="date" className="input w-auto" value={range.from} onChange={(e) => onCustom({ from: e.target.value })} />
          <span className="text-sm text-slate-400">to</span>
          <input type="date" className="input w-auto" value={range.to} onChange={(e) => onCustom({ to: e.target.value })} />
        </>
      )}
    </div>
  );
}
