// "Reduce flashes": impact frames (an inverted screen for two ticks) and white screen flashes become a soft ring.
// A player's choice is kept in localStorage; with no choice yet it follows prefers-reduced-motion.

const KEY = "inkfight.reduceFlashes";
let cached: boolean | null = null;
const listeners = new Set<() => void>();

export function subscribeReduceFlashes(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function getReduceFlashes(): boolean {
  if (cached !== null) return cached;
  try {
    const v = localStorage.getItem(KEY);
    if (v === "1" || v === "0") return (cached = v === "1");
  } catch {}
  try {
    return (cached = window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch {
    return (cached = false);
  }
}

export function setReduceFlashes(on: boolean) {
  cached = on;
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {}
  listeners.forEach((fn) => fn());
}
