import { describe, expect, test } from "bun:test";
import { DETAIL_TABS, parseDetailTab } from "./useDetailsPanel";

describe("parseDetailTab", () => {
  test("accepts every tab the panel has", () => {
    for (const t of DETAIL_TABS) expect(parseDetailTab(t)).toBe(t);
  });

  test("gives General for anything else", () => {
    expect(parseDetailTab(null)).toBe("general");
    expect(parseDetailTab("")).toBe("general");
    expect(parseDetailTab("Relationships")).toBe("general"); // the saved ids are lower-case
    expect(parseDetailTab(3)).toBe("general");
  });
});
