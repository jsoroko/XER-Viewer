import { hasContent, type Row } from "./scheduleRows";

export type NavKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End";
export const NAV_KEYS: readonly string[] = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"];

/** What a key does to the rows: move the selection to a row, or open or close the selected group. Null: nothing. */
export type NavAction = { select: number } | { open: string } | { close: string } | null;

/**
 * Keyboard movement through the flattened rows, the way a tree view behaves: Up and Down step through every row (groups
 * and activities), Home and End go to the first and last, Left closes an open group or else goes to the group above, and
 * Right opens a closed group or else goes to its first row. `current` is the index of the selected row, or -1 for none.
 */
export function navigateRows(rows: readonly Row[], current: number, key: NavKey): NavAction {
  const last = rows.length - 1;
  if (last < 0) return null;
  const to = (i: number): NavAction => (i === current || i < 0 || i > last ? null : { select: i });
  switch (key) {
    case "Home":
      return to(0);
    case "End":
      return to(last);
    case "ArrowDown":
      return to(current < 0 ? 0 : current + 1);
    case "ArrowUp":
      return to(current < 0 ? last : current - 1);
    case "ArrowLeft": {
      const row = rows[current];
      if (!row) return null;
      if (row.kind === "wbs" && row.expanded && hasContent(row.node)) return { close: row.node.id };
      for (let i = current - 1; i >= 0; i--) if (rows[i]!.depth < row.depth) return to(i);
      return null;
    }
    case "ArrowRight": {
      const row = rows[current];
      if (row?.kind !== "wbs" || !hasContent(row.node)) return null;
      if (!row.expanded) return { open: row.node.id };
      const next = rows[current + 1];
      return next && next.depth > row.depth ? to(current + 1) : null;
    }
  }
}
