import { describe, expect, test } from "bun:test";
import { readStoredNumber } from "./usePersistedNumber";

const store = (value: string | null) => ({ getItem: () => value });

describe("readStoredNumber", () => {
  test("reads the value the hook writes", () => {
    expect(readStoredNumber(store("288"), "k", 0)).toBe(288);
    expect(readStoredNumber(store("0"), "k", 288)).toBe(0);
  });

  test("accepts a decimal or a negative number", () => {
    expect(readStoredNumber(store("12.5"), "k", 0)).toBe(12.5);
    expect(readStoredNumber(store("-4"), "k", 0)).toBe(-4);
  });

  test("a missing or garbled value gives the fallback, whichever way it points", () => {
    for (const fallback of [0, 288, -10]) {
      expect(readStoredNumber(store(null), "k", fallback)).toBe(fallback);
      expect(readStoredNumber(store("not a number"), "k", fallback)).toBe(fallback);
      expect(readStoredNumber(store(""), "k", fallback)).toBe(fallback);
    }
  });

  test("Infinity and NaN are rejected like any other garbled value", () => {
    expect(readStoredNumber(store("Infinity"), "k", 42)).toBe(42);
    expect(readStoredNumber(store("NaN"), "k", 42)).toBe(42);
  });

  test("unavailable or throwing storage gives the fallback instead of an error", () => {
    expect(readStoredNumber(null, "k", 288)).toBe(288);
    const blocked = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    };
    expect(readStoredNumber(blocked, "k", 288)).toBe(288);
  });

  test("asks for the key it was given", () => {
    const asked: string[] = [];
    readStoredNumber({ getItem: (k) => (asked.push(k), null) }, "xerview-detail-height", 288);
    expect(asked).toEqual(["xerview-detail-height"]);
  });
});
