import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

/* ── ItemPicker ──
   Searchable item combobox for invoice line items. The full item list is already
   loaded client-side (see TxnModule), so this filters it by name or SKU as the
   user types — far more usable than a native <select> once there are dozens or
   hundreds of items. Falls back to showing the selected item's label when idle.

   Props:
     items   — array of item masters ({ id, name, sku, stock_qty, … })
     value   — currently selected item_id (string|number)
     onPick  — (itemId) => void; called with the chosen id, or "" when cleared
     className — extra classes for the input */
export default function ItemPicker({ items, value, onPick, className = "" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const listRef = useRef(null);

  const selected = items.find((it) => String(it.id) === String(value)) || null;

  // Close the dropdown when clicking outside the component.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Match by name or SKU; cap the list so a huge catalogue stays snappy.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = !q
      ? items
      : items.filter((it) => it.name.toLowerCase().includes(q) || String(it.sku || "").toLowerCase().includes(q));
    return list.slice(0, 50);
  }, [items, query]);

  // Keep the highlighted row scrolled into view as the user arrows through.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[active];
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const choose = (it) => { onPick(String(it.id)); setQuery(""); setOpen(false); };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { if (open && matches[active]) { e.preventDefault(); choose(matches[active]); } }
    else if (e.key === "Escape") { setOpen(false); }
  };

  // Idle: show the selected item's label. Open: show the live query so the user
  // can type to filter without the old label getting in the way.
  const displayValue = open ? query : (selected ? `${selected.name}${selected.sku ? ` · ${selected.sku}` : ""}` : "");

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className={`input w-full pl-8 ${selected && !open ? "pr-8" : ""} ${className}`}
          placeholder="Search item by name or SKU…"
          value={displayValue}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => { setQuery(""); setOpen(true); setActive(0); }}
          onKeyDown={onKeyDown}
          autoComplete="off"
        />
        {selected && !open && (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onPick(""); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            title="Clear item"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && (
        <div ref={listRef} className="absolute z-30 mt-1 max-h-64 w-full min-w-[240px] overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {matches.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">No items match “{query.trim()}”</div>
          ) : (
            matches.map((it, idx) => (
              <button
                type="button"
                key={it.id}
                onMouseEnter={() => setActive(idx)}
                onMouseDown={(e) => { e.preventDefault(); choose(it); }}
                className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm ${idx === active ? "bg-brand-50" : ""} ${String(it.id) === String(value) ? "font-semibold text-brand-700" : "text-slate-700"}`}
              >
                <span className="truncate">{it.name}{it.sku ? <span className="text-slate-400"> · {it.sku}</span> : null}</span>
                <span className="shrink-0 text-xs text-slate-400">stock {it.stock_qty}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
