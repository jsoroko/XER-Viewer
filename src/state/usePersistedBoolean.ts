import { useEffect, useState } from "react";

/** Reads a saved on/off setting; anything unrecognised, or storage that is unavailable, gives the fallback. */
export function readStoredBoolean(storage: Pick<Storage, "getItem"> | null, key: string, fallback: boolean): boolean {
  try {
    const v = storage?.getItem(key);
    if (v === "1" || v === "true") return true;
    if (v === "0" || v === "false") return false;
  } catch {
    // storage blocked: use the fallback
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

/** Like useState for a boolean, but remembered in this browser between visits. */
export function usePersistedBoolean(key: string, fallback: boolean) {
  const [value, setValue] = useState(() => readStoredBoolean(browserStorage(), key, fallback));

  useEffect(() => {
    try {
      browserStorage()?.setItem(key, value ? "1" : "0");
    } catch {
      // storage full or blocked: the setting still works for this visit
    }
  }, [key, value]);

  return [value, setValue] as const;
}
