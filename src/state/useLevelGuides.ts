import { useSyncExternalStore } from "react";
import { DEFAULT_GUIDES, parseGuides, type LevelGuides } from "../lib/levelGuides";

const KEY = "xerview-level-guides";

/** Reads the saved settings; anything unreadable, or storage that is unavailable, gives the defaults. */
export function readStoredGuides(storage: Pick<Storage, "getItem"> | null): LevelGuides {
  try {
    const v = storage?.getItem(KEY);
    if (v !== null && v !== undefined) return parseGuides(JSON.parse(v));
  } catch {
    // storage blocked, or not valid JSON: use the defaults
  }
  return parseGuides(null);
}

const browserStorage = (): Storage | null => {
  try {
    return localStorage;
  } catch {
    return null; // some privacy modes throw just from touching localStorage
  }
};

// One copy shared by the Settings panel and the table, which are far apart in the page: both read it, and a change in
// the panel redraws the table.
let current: LevelGuides = readStoredGuides(browserStorage());
const listeners = new Set<() => void>();

export function setLevelGuides(next: LevelGuides) {
  current = next;
  try {
    browserStorage()?.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage full or blocked: the setting still works for this visit
  }
  listeners.forEach((l) => l());
}

export const resetLevelGuides = () => setLevelGuides(parseGuides(DEFAULT_GUIDES));

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** The level guide settings, remembered in this browser between visits, and a way to change them. */
export function useLevelGuides() {
  const guides = useSyncExternalStore(subscribe, () => current);
  return [guides, setLevelGuides] as const;
}
