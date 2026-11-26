import { useSyncExternalStore } from "react";
import { DEFAULT_LAYOUT, parseLayout, type PrintLayout } from "../lib/printLayout";

const KEY = "xerview-print-layout";

/** Reads the saved choices; anything unreadable, or storage that is unavailable, gives the defaults. */
export function readStoredLayout(storage: Pick<Storage, "getItem"> | null): PrintLayout {
  try {
    const v = storage?.getItem(KEY);
    if (v !== null && v !== undefined) return parseLayout(JSON.parse(v));
  } catch {
    // storage blocked, or not valid JSON: use the defaults
  }
  return parseLayout(null);
}

const browserStorage = (): Storage | null => {
  try {
    return localStorage;
  } catch {
    return null; // some privacy modes throw just from touching localStorage
  }
};

let current: PrintLayout = readStoredLayout(browserStorage());
const listeners = new Set<() => void>();

export function setPrintLayout(next: PrintLayout) {
  current = next;
  try {
    browserStorage()?.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage full or blocked: the choice still works for this visit
  }
  listeners.forEach((l) => l());
}

export const resetPrintLayout = () => setPrintLayout({ ...DEFAULT_LAYOUT });

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** The print choices (paper, activity text, bar labels), remembered in this browser between visits, and a way to change them. */
export function usePrintLayout() {
  const layout = useSyncExternalStore(subscribe, () => current);
  return [layout, setPrintLayout] as const;
}
