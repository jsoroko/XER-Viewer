import { useSyncExternalStore } from "react";
import { DEFAULT_PANEL_H } from "../lib/panelHeight";
import { readStoredNumber } from "./usePersistedNumber";

/**
 * What the panel along the bottom of the Schedule remembers, kept here and not in the panel itself: the panel is rebuilt
 * for each activity that is selected, so anything held inside it would start over every time. Both are also saved in this
 * browser, so they survive a reload.
 */

const HEIGHT_KEY = "xerview-detail-height";
const TAB_KEY = "xerview-detail-tab";

export const DETAIL_TABS = ["general", "relationships", "resources", "codes"] as const;
export type DetailTab = (typeof DETAIL_TABS)[number];

/** Reads a saved tab; anything unrecognised gives the first one. */
export const parseDetailTab = (raw: unknown): DetailTab => DETAIL_TABS.find((t) => t === raw) ?? "general";

const browserStorage = (): Storage | null => {
  try {
    return localStorage;
  } catch {
    return null; // some privacy modes throw just from touching localStorage
  }
};

/** A value shared by every component that asks for it, saved under `key`, and told to all of them when it changes. */
function createStore<T>(key: string, read: (stored: string | null) => T, show: (v: T) => string) {
  const readSaved = (): T => {
    try {
      return read(browserStorage()?.getItem(key) ?? null);
    } catch {
      return read(null);
    }
  };
  let current = readSaved();
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(next: T) {
      if (Object.is(next, current)) return;
      current = next;
      try {
        browserStorage()?.setItem(key, show(next));
      } catch {
        // storage full or blocked: the choice still works for this visit
      }
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
}

const heightStore = createStore<number>(HEIGHT_KEY, (s) => readStoredNumber({ getItem: () => s }, HEIGHT_KEY, DEFAULT_PANEL_H), String);
const tabStore = createStore<DetailTab>(TAB_KEY, parseDetailTab, (t) => t);

/** The bottom panel's height in pixels, the same for every activity and tab, and a way to change it. */
export function useDetailsHeight() {
  return [useSyncExternalStore(heightStore.subscribe, heightStore.get), heightStore.set] as const;
}

/** Which of the details tabs (General, Relationships, ...) is open, kept as the selection moves from activity to activity. */
export function useDetailTab() {
  return [useSyncExternalStore(tabStore.subscribe, tabStore.get), tabStore.set] as const;
}
