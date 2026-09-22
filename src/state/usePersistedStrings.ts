import { useEffect, useState } from "react";

/** Reads a saved list of strings; anything unreadable, or storage that is unavailable, gives the fallback. */
export function readStoredStrings(storage: Pick<Storage, "getItem"> | null, key: string, fallback: readonly string[]): string[] {
  try {
    const v = storage?.getItem(key);
    if (v === null || v === undefined) return [...fallback];
    const parsed: unknown = JSON.parse(v);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) return parsed;
  } catch {
    // storage blocked, or not valid JSON: use the fallback
  }
  return [...fallback];
}

const browserStorage = (): Storage | null => {
  try {
    return localStorage;
  } catch {
    return null; // some privacy modes throw just from touching localStorage
  }
};

/** Like useState for a list of strings, but remembered in this browser between visits. */
export function usePersistedStrings(key: string, fallback: readonly string[]) {
  const [value, setValue] = useState<string[]>(() => readStoredStrings(browserStorage(), key, fallback));

  useEffect(() => {
    try {
      browserStorage()?.setItem(key, JSON.stringify(value));
    } catch {
      // storage full or blocked: the setting still works for this visit
    }
  }, [key, value]);

  return [value, setValue] as const;
}
