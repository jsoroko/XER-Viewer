import { describe, expect, test } from "bun:test";
import { readStoredStrings } from "./usePersistedStrings";

const store = (value: string | null) => ({ getItem: () => value });

describe("readStoredStrings", () => {
  test("reads the list the hook writes", () => {
    expect(readStoredStrings(store('["percent","calendar"]'), "k", [])).toEqual(["percent", "calendar"]);
    expect(readStoredStrings(store("[]"), "k", ["percent"])).toEqual([]);
  });

  test("a missing value gives the fallback", () => {
    expect(readStoredStrings(store(null), "k", ["activityId"])).toEqual(["activityId"]);
  });

  test("garbled or wrongly-shaped JSON gives the fallback, not a crash", () => {
    for (const bad of ["not json", "{}", "42", '"just a string"', "[1,2,3]", '["ok", 5]']) {
      expect(readStoredStrings(store(bad), "k", ["fallback"])).toEqual(["fallback"]);
    }
  });

  test("unavailable or throwing storage gives the fallback instead of an error", () => {
    expect(readStoredStrings(null, "k", ["fallback"])).toEqual(["fallback"]);
    const blocked = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    };
    expect(readStoredStrings(blocked, "k", ["fallback"])).toEqual(["fallback"]);
  });

  test("asks for the key it was given, and never hands back the same array reference as the fallback", () => {
    const asked: string[] = [];
    readStoredStrings({ getItem: (k) => (asked.push(k), null) }, "xerview-columns", []);
    expect(asked).toEqual(["xerview-columns"]);
    const fallback = ["a"];
    expect(readStoredStrings(store(null), "k", fallback)).not.toBe(fallback);
  });
});
