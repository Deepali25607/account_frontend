import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

/*
 * Swipe-down-to-refresh for the Android app. The app's WebView — unlike mobile
 * Chrome — has no built-in pull-to-refresh, so stale screens had no way out.
 * Attaches to the main scroll container; releasing past the threshold does a
 * full reload, which re-fetches index.html (served no-cache) and therefore
 * always picks up the latest deployed bundle.
 * Renders nothing in normal browsers, which already have their own gesture.
 */
const THRESHOLD = 72; // damped px of pull that arms the refresh
const MAX_PULL = 110;

/**
 * True when a touch may drive pull-to-refresh: nothing between the touched
 * element and the main scroll container floats above the page or scrolls on
 * its own. Modals, sheets, popovers and the AI console all render in-tree as
 * fixed overlays (often with their own overflow-auto body), so without this
 * check a swipe inside them would hijack their scroll and reload the app.
 */
const ownsTouch = (target, el) => {
  for (let n = target; n && n !== el; n = n.parentElement) {
    if (!(n instanceof Element)) break;
    const s = getComputedStyle(n);
    if (s.position === "fixed") return false;
    if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight) return false;
  }
  return true;
};

export default function PullToRefresh({ containerRef }) {
  const isNativeApp = typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const pullRef = useRef(0);

  useEffect(() => {
    if (!isNativeApp) return;
    const el = containerRef.current;
    if (!el) return;

    const update = (v) => { pullRef.current = v; setPull(v); };

    const onStart = (e) => {
      startY.current = el.scrollTop <= 0 && ownsTouch(e.target, el) ? e.touches[0].clientY : null;
    };
    const onMove = (e) => {
      if (startY.current === null || refreshing) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || el.scrollTop > 0) { update(0); return; }
      e.preventDefault(); // content stays put while the gesture is live
      update(Math.min(dy * 0.45, MAX_PULL));
    };
    const onEnd = () => {
      startY.current = null;
      if (pullRef.current >= THRESHOLD) { setRefreshing(true); window.location.reload(); }
      else update(0);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [isNativeApp, containerRef, refreshing]);

  if (!isNativeApp || (pull === 0 && !refreshing)) return null;

  const armed = refreshing || pull >= THRESHOLD;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center"
      style={{ top: `calc(env(safe-area-inset-top) + ${pull - 48}px)` }}
    >
      <span
        className={`grid h-10 w-10 place-items-center rounded-full border shadow-lg transition-colors ${
          armed ? "border-brand-200 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-400"
        }`}
        style={{ opacity: Math.min(pull / THRESHOLD, 1) }}
      >
        <RefreshCw
          className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`}
          style={refreshing ? undefined : { transform: `rotate(${pull * 2.5}deg)` }}
        />
      </span>
    </div>
  );
}
