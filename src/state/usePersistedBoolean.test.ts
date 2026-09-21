import { describe, expect, test } from "bun:test";
import { readStoredBoolean } from "./usePersistedBoolean";

const store = (value: string | null) => ({ getItem: () => value });

describe("readStoredBoolean", () => {
  test("reads the values the hook writes", () => {
    expect(readStoredBoolean(store("1"), "k", false)).toBe(true);
    expect(readStoredBoolean(store("0"), "k", true)).toBe(false);
  });

  test("also accepts true / false", () => {
    expect(readStoredBoolean(store("true"), "k", false)).toBe(true);
    expect(readStoredBoolean(store("false"), "k", true)).toBe(false);
  });

  test("a missing or garbled value gives the fallback, whichever way the fallback points", () => {
    for (const fallback of [true, false]) {
      expect(readStoredBoolean(store(null), "k", fallback)).toBe(fallback);
      expect(readStoredBoolean(store("maybe"), "k", fallback)).toBe(fallback);
      expect(readStoredBoolean(store(""), "k", fallback)).toBe(fallback);
    }
  });

  test("unavailable or throwing storage gives the fallback instead of an error", () => {
    expect(readStoredBoolean(null, "k", true)).toBe(true);
    const blocked = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    };
    expect(readStoredBoolean(blocked, "k", false)).toBe(false);
  });

  test("asks for the key it was given", () => {
    const asked: string[] = [];
    readStoredBoolean({ getItem: (k) => (asked.push(k), null) }, "xerview-search-groups", true);
    expect(asked).toEqual(["xerview-search-groups"]);
  });
});
