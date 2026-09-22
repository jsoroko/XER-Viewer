import { useEffect, useState } from "react";

/** Reads a saved number; anything unreadable, or storage that is unavailable, gives the fallback. */
export function readStoredNumber(storage: Pick<Storage, "getItem"> | null, key: string, fallback: number): number {
  try {
    const v = storage?.getItem(key);
    // Number("") is 0, not NaN, so an empty string has to be rejected explicitly rather than relying on that check.
    if (!v) return fallback;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  } catch {
    // storage blocked, or not a number: use the fallback
  }
  return fallback;
}

const browserStorage = (): Storage | null => {
  try {
    return localStorage;
  } catch {
    return null; // some privacy modes throw just from touching localStorage
  }
};

/** Like useState for a number, but remembered in this browser between visits (a panel size, a zoom level, ...). */
export function usePersistedNumber(key: string, fallback: number) {
  const [value, setValue] = useState(() => readStoredNumber(browserStorage(), key, fallback));

  useEffect(() => {
    try {
      browserStorage()?.setItem(key, String(value));
    } catch {
      // storage full or blocked: the setting still works for this visit
    }
  }, [key, value]);

  return [value, setValue] as const;
}
