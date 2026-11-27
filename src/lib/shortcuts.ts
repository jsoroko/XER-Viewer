/**
 * Every keyboard shortcut the app adds, in one place so the code, the tooltips and the help dialog cannot disagree.
 *
 * The rules they follow:
 *  - Letters, digits and punctuation always need the platform's command key (⌘ on a Mac, Ctrl elsewhere), so typing in a
 *    box is never touched. Print (⌘P) deliberately replaces the browser's own while the Schedule is showing, since the
 *    page's own PDF export is what it should do there. The rest add Shift to stay clear of the browser's shortcuts: Zoom
 *    (⇧⌘+ and ⇧⌘-), Fit (⇧⌘0) and Data date (⇧⌘D). ⌘+, ⌘= , ⌘- and ⌘0 are left to the browser's page zoom. (On a Mac, + is
 *    typed with Shift, so ⇧⌘+ is the very key press the browser reads as "zoom in"; only the Shift-less ⌘= stays the browser's.)
 *  - Arrow keys, Home, End, Enter and Escape are never combined with ⌘ (they are what ⌘ already does in the browser), and
 *    the page only acts on them when the focus is not in something you type into.
 */

/** Whether this is a Mac (or an iPad/iPhone), where the command key is ⌘ and Ctrl is a different key. */
export const isMac = (): boolean => {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /Mac|iPhone|iPad|iPod/i.test(nav.userAgentData?.platform ?? nav.platform ?? "");
};

type KeyEventLike = Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

export interface Shortcut {
  /** What it is for, as the help dialog and the tooltips say it. */
  label: string;
  /** The letter or symbol to show, after the modifiers. */
  display: string;
  /** Matched by `KeyboardEvent.key`, lower-cased: for letters, which follow the layout. Any of these. */
  key?: string | readonly string[];
  /** Matched by `KeyboardEvent.code`: for digits and punctuation, whose `key` changes with Shift. Any of these. */
  code?: string | readonly string[];
  /** Whether Shift must be held, must not be, or does not matter. */
  shift: boolean | "any";
}

export const SHORTCUTS = {
  find: { label: "Search", display: "F", key: "f", shift: false },
  zoomOut: { label: "Zoom out", display: "−", key: ["_", "-"], code: "Minus", shift: true },
  zoomIn: { label: "Zoom in", display: "+", key: "+", code: "Equal", shift: true },
  fit: { label: "Fit the whole project in the window", display: "0", code: "Digit0", shift: true },
  dataDate: { label: "Go to the data date", display: "D", key: "d", shift: true },
  print: { label: "Print to PDF", display: "P", key: "p", shift: false },
  help: { label: "Show keyboard shortcuts", display: "/", code: "Slash", shift: false },
} as const satisfies Record<string, Shortcut>;

/**
 * Whether the key press is this shortcut: the command key of this platform (not the other one, since Ctrl+F on a Mac moves
 * the cursor in a text box), Shift as the shortcut says, and no Alt (which on Windows is half of AltGr, used for typing).
 */
export function matches(e: KeyEventLike, s: Shortcut, mac = isMac()): boolean {
  if (e.altKey || (s.shift !== "any" && e.shiftKey !== s.shift)) return false;
  if (mac ? !e.metaKey || e.ctrlKey : !e.ctrlKey || e.metaKey) return false;
  const any = (want: string | readonly string[] | undefined, got: string) => want !== undefined && ([] as string[]).concat(want).includes(got);
  return any(s.key, e.key.toLowerCase()) || any(s.code, e.code);
}

/** The shortcut as it is shown: ⇧⌘D on a Mac, Ctrl+Shift+D elsewhere. */
export function formatShortcut(s: Shortcut, mac = isMac()): string {
  const shift = s.shift === true; // "any" is not shown: the shortcut works either way
  return mac ? `${shift ? "⇧" : ""}⌘${s.display}` : `Ctrl+${shift ? "Shift+" : ""}${s.display}`;
}

/** A tooltip with its shortcut at the end: "Zoom out (⇧⌘,)". */
export const withShortcut = (text: string, s: Shortcut, mac = isMac()) => `${text} (${formatShortcut(s, mac)})`;

/** Whether the focus is somewhere keys mean something else: a text box, a menu, a list, a slider ... */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  return target.closest("input, textarea, select, [contenteditable]:not([contenteditable=false]), [role=menu], [role=menubar], [role=listbox], [role=combobox], [role=tablist], [role=radiogroup], [role=slider], [role=spinbutton], [role=dialog], [aria-modal=true]") !== null;
}

/** Whether a modal dialog (the print dialog, the shortcut list) is open: nothing behind it should react to keys. */
export const modalOpen = (): boolean => typeof document !== "undefined" && document.querySelector("[aria-modal=true]") !== null;
