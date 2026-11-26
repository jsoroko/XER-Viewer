import { describe, expect, test } from "bun:test";
import { DEFAULT_LAYOUT } from "../lib/printLayout";
import { readStoredLayout } from "./usePrintLayout";

const storage = (v: string | null) => ({ getItem: () => v });

describe("readStoredLayout", () => {
  test("gives the defaults when nothing is saved, or storage is unavailable", () => {
    expect(readStoredLayout(storage(null))).toEqual(DEFAULT_LAYOUT);
    expect(readStoredLayout(null)).toEqual(DEFAULT_LAYOUT);
  });
  test("gives the defaults for something that is not JSON, or throws", () => {
    expect(readStoredLayout(storage("{oops"))).toEqual(DEFAULT_LAYOUT);
    expect(readStoredLayout({ getItem: () => { throw new Error("blocked"); } })).toEqual(DEFAULT_LAYOUT);
  });
  test("reads what was saved, filling in what is missing", () => {
    expect(readStoredLayout(storage(JSON.stringify({ paper: "a2", labels: "id" })))).toEqual({ paper: "a2", text: "wrap", labels: "id" });
  });
});
