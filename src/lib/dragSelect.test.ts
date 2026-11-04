import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { lockTextSelection } from "./dragSelect";

/** Just enough of a page: a body with inline style properties, and a selection that can be cleared. */
function fakePage() {
  const props = new Map<string, string>();
  let cleared = 0;
  const g = globalThis as unknown as Record<string, unknown>;
  g.document = {
    body: {
      style: {
        getPropertyValue: (k: string) => props.get(k) ?? "",
        setProperty: (k: string, v: string) => void props.set(k, v),
        removeProperty: (k: string) => void props.delete(k),
      },
    },
  };
  g.window = { getSelection: () => ({ removeAllRanges: () => void cleared++ }) };
  return { props, cleared: () => cleared };
}

let page: ReturnType<typeof fakePage>;
beforeEach(() => {
  page = fakePage();
});
afterEach(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.document;
  delete g.window;
});

describe("lockTextSelection", () => {
  test("turns text selection off, for Safari too, and clears a selection the press had started", () => {
    lockTextSelection();
    expect(page.props.get("user-select")).toBe("none");
    expect(page.props.get("-webkit-user-select")).toBe("none");
    expect(page.cleared()).toBe(1);
  });

  test("putting it back removes what it added", () => {
    const unlock = lockTextSelection();
    unlock();
    expect(page.props.size).toBe(0);
  });

  test("puts back what was there before, not just 'on'", () => {
    page.props.set("user-select", "text");
    const unlock = lockTextSelection();
    unlock();
    expect(page.props.get("user-select")).toBe("text");
  });

  test("calling it twice is harmless", () => {
    const unlock = lockTextSelection();
    unlock();
    page.props.set("user-select", "all"); // something else changed it since
    unlock();
    expect(page.props.get("user-select")).toBe("all");
  });
});
