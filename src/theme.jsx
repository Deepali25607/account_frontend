import { createContext, useContext, useEffect, useState, useCallback } from "react";

/* Accent palettes as "R G B" triplets (Tailwind scales), keyed 50→950. */
const SCALE = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
export const ACCENTS = [
  { id: "indigo", label: "Indigo", rgb: ["238 242 255", "224 231 255", "199 210 254", "165 180 252", "129 140 248", "99 102 241", "79 70 229", "67 56 202", "55 48 163", "49 46 129", "30 27 75"] },
  { id: "blue", label: "Blue", rgb: ["239 246 255", "219 234 254", "191 219 254", "147 197 253", "96 165 250", "59 130 246", "37 99 235", "29 78 216", "30 64 175", "30 58 138", "23 37 84"] },
  { id: "emerald", label: "Emerald", rgb: ["236 253 245", "209 250 229", "167 243 208", "110 231 183", "52 211 153", "16 185 129", "5 150 105", "4 120 87", "6 95 70", "6 78 59", "2 44 34"] },
  { id: "violet", label: "Violet", rgb: ["245 243 255", "237 233 254", "221 214 254", "196 181 253", "167 139 250", "139 92 246", "124 58 237", "109 40 217", "91 33 182", "76 29 149", "46 16 101"] },
  { id: "rose", label: "Rose", rgb: ["255 241 242", "255 228 230", "254 205 211", "253 164 175", "251 113 133", "244 63 94", "225 29 72", "190 18 60", "159 18 57", "136 19 55", "76 5 25"] },
  { id: "amber", label: "Amber", rgb: ["255 251 235", "254 243 199", "253 230 138", "252 211 77", "251 191 36", "245 158 11", "217 119 6", "180 83 9", "146 64 14", "120 53 15", "69 26 3"] },
];

const STORE_KEY = "ledgerflow-theme";
const load = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; } };

const ThemeCtx = createContext(null);
export const useTheme = () => useContext(ThemeCtx);

export function ThemeProvider({ children }) {
  const saved = load();
  const [mode, setModeState] = useState(saved.mode || "system");   // light | dark | system
  const [accent, setAccentState] = useState(saved.accent || "indigo");
  const [dark, setDark] = useState(false);

  const apply = useCallback((m, a) => {
    const accentDef = ACCENTS.find((x) => x.id === a) || ACCENTS[0];
    const root = document.documentElement;
    SCALE.forEach((shade, i) => root.style.setProperty(`--brand-${shade}`, accentDef.rgb[i]));
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDarkNow = m === "dark" || (m === "system" && prefersDark);
    root.classList.toggle("dark", isDarkNow);
    setDark(isDarkNow);
  }, []);

  useEffect(() => { apply(mode, accent); }, [mode, accent, apply]);

  // react to OS theme changes while in "system" mode
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = () => { if (mode === "system") apply(mode, accent); };
    mq.addEventListener?.("change", fn);
    return () => mq.removeEventListener?.("change", fn);
  }, [mode, accent, apply]);

  const persist = (m, a) => localStorage.setItem(STORE_KEY, JSON.stringify({ mode: m, accent: a }));
  const setMode = (m) => { setModeState(m); persist(m, accent); };
  const setAccent = (a) => { setAccentState(a); persist(mode, a); };
  const toggleMode = () => setMode(dark ? "light" : "dark");

  return (
    <ThemeCtx.Provider value={{ mode, accent, dark, setMode, setAccent, toggleMode, accents: ACCENTS }}>
      {children}
    </ThemeCtx.Provider>
  );
}
