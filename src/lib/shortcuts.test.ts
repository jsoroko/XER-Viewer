import { describe, expect, test } from "bun:test";
import { SHORTCUTS, formatShortcut, isTypingTarget, matches, withShortcut } from "./shortcuts";

const press = (o: Partial<Record<"key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey", string | boolean>>) =>
  ({ key: "", code: "", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...o }) as Parameters<typeof matches>[0];

describe("matches", () => {
  test("uses ⌘ on a Mac and Ctrl elsewhere, never the other", () => {
    expect(matches(press({ key: "f", metaKey: true }), SHORTCUTS.find, true)).toBe(true);
    expect(matches(press({ key: "f", ctrlKey: true }), SHORTCUTS.find, true)).toBe(false); // Ctrl+F moves the cursor in a Mac text box
    expect(matches(press({ key: "f", ctrlKey: true }), SHORTCUTS.find, false)).toBe(true);
    expect(matches(press({ key: "f", metaKey: true }), SHORTCUTS.find, false)).toBe(false);
  });

  test("needs the modifier: a bare letter is typing", () => {
    expect(matches(press({ key: "f" }), SHORTCUTS.find, true)).toBe(false);
    expect(matches(press({ key: "D", shiftKey: true }), SHORTCUTS.dataDate, true)).toBe(false);
  });

  test("Shift must agree with the shortcut, and Alt is never allowed", () => {
    expect(matches(press({ key: "D", metaKey: true, shiftKey: true }), SHORTCUTS.dataDate, true)).toBe(true);
    expect(matches(press({ key: "d", metaKey: true }), SHORTCUTS.dataDate, true)).toBe(false); // ⌘D is the browser's bookmark
    expect(matches(press({ key: "f", metaKey: true, shiftKey: true }), SHORTCUTS.find, true)).toBe(false);
    expect(matches(press({ key: "f", ctrlKey: true, altKey: true }), SHORTCUTS.find, false)).toBe(false); // AltGr types letters
  });

  test("digits are matched by key position, since Shift changes what they type", () => {
    expect(matches(press({ key: ")", code: "Digit0", metaKey: true, shiftKey: true }), SHORTCUTS.fit, true)).toBe(true);
    expect(matches(press({ key: "0", code: "Digit0", metaKey: true }), SHORTCUTS.fit, true)).toBe(false); // ⌘0 is the browser's zoom reset
  });

  test("zoom is ⇧⌘+ and ⇧⌘-, so ⌘= and ⌘- are left to the browser", () => {
    expect(matches(press({ key: "+", code: "Equal", metaKey: true, shiftKey: true }), SHORTCUTS.zoomIn, true)).toBe(true);
    expect(matches(press({ key: "_", code: "Minus", metaKey: true, shiftKey: true }), SHORTCUTS.zoomOut, true)).toBe(true);
    expect(matches(press({ key: "+", code: "Equal", ctrlKey: true, shiftKey: true }), SHORTCUTS.zoomIn, false)).toBe(true);
    expect(matches(press({ key: "=", code: "Equal", metaKey: true }), SHORTCUTS.zoomIn, true)).toBe(false); // the browser's zoom in
    expect(matches(press({ key: "-", code: "Minus", metaKey: true }), SHORTCUTS.zoomOut, true)).toBe(false); // the browser's zoom out
    expect(matches(press({ key: "_", code: "Minus", shiftKey: true }), SHORTCUTS.zoomOut, true)).toBe(false); // typing an underscore
    expect(matches(press({ key: "+", code: "Equal", metaKey: true, shiftKey: true, altKey: true }), SHORTCUTS.zoomIn, true)).toBe(false);
  });

  test("print is ⌘P, not ⇧⌘P", () => {
    expect(matches(press({ key: "p", metaKey: true }), SHORTCUTS.print, true)).toBe(true);
    expect(matches(press({ key: "P", metaKey: true, shiftKey: true }), SHORTCUTS.print, true)).toBe(false);
  });
});

describe("formatShortcut", () => {
  test("shows ⇧⌘D on a Mac and Ctrl+Shift+D elsewhere", () => {
    expect(formatShortcut(SHORTCUTS.dataDate, true)).toBe("⇧⌘D");
    expect(formatShortcut(SHORTCUTS.dataDate, false)).toBe("Ctrl+Shift+D");
    expect(formatShortcut(SHORTCUTS.find, true)).toBe("⌘F");
    expect(formatShortcut(SHORTCUTS.help, false)).toBe("Ctrl+/");
  });

  test("puts the shortcut at the end of a tooltip", () => {
    expect(withShortcut("Zoom out", SHORTCUTS.zoomOut, true)).toBe("Zoom out (⇧⌘−)");
    expect(formatShortcut(SHORTCUTS.print, false)).toBe("Ctrl+P");
  });
});

describe("isTypingTarget", () => {
  test("is false for anything that is not an element", () => {
    expect(isTypingTarget(null)).toBe(false);
  });
});
