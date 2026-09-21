import { isMilestone, type Activity, type Relationship, type RelationshipType } from "./xer/model";

export type Side = "start" | "finish";
export interface Point {
  x: number;
  y: number;
}

/** Length of the straight run leaving/entering a bar before the line turns. */
export const STUB = 8;
const ARROW_LEN = 5;
const ARROW_HALF = 3;
/** Half the drawn width of a milestone diamond (10px square rotated 45°). */
const DIAMOND_HALF = 7;

/** [side of the predecessor the link leaves from, side of the successor it enters]. */
const SIDES: Record<RelationshipType, [Side, Side]> = {
  FS: ["finish", "start"],
  SS: ["start", "start"],
  FF: ["finish", "finish"],
  SF: ["start", "finish"],
};

/**
 * Orthogonal route from one bar edge to another. Leaves horizontally, turns at a shared
 * vertical when the geometry allows it (the classic P6 look), and otherwise detours through
 * the gap between the two rows.
 */
export function routeLink(from: Point, fromSide: Side, to: Point, toSide: Side, rowH: number) {
  const exit = fromSide === "finish" ? 1 : -1;
  const enterFromLeft = toSide === "start";
  const a = from.x + exit * STUB;
  const b = to.x + (enterFromLeft ? -STUB : STUB);

  // x of a single shared vertical, or null when the two stubs would cross the bars.
  let shared: number | null;
  if (exit > 0 && enterFromLeft) shared = a <= b ? a : null; // FS
  else if (exit < 0 && enterFromLeft) shared = Math.min(a, b); // SS
  else if (exit > 0) shared = Math.max(a, b); // FF
  else shared = b <= a ? a : null; // SF

  const points: Point[] =
    shared !== null
      ? [from, { x: shared, y: from.y }, { x: shared, y: to.y }, to]
      : (() => {
          const ym = from.y + (to.y > from.y ? 1 : -1) * (rowH / 2);
          return [from, { x: a, y: from.y }, { x: a, y: ym }, { x: b, y: ym }, { x: b, y: to.y }, to];
        })();

  return { points, arrowDir: (enterFromLeft ? 1 : -1) as 1 | -1 };
}

export interface LinkPath {
  key: string;
  kind: "pred" | "succ";
  d: string;
  arrow: string;
}

export interface LinkLayer {
  paths: LinkPath[];
  /** Relationships that can't be drawn: the other activity is filtered out, collapsed away, undated, or in another project. */
  hidden: number;
  /** Vertical extent of the drawing in body coordinates, for sizing the SVG. */
  top: number;
  height: number;
}

interface Options {
  /** Relationships into the selected activity. */
  predecessors: Relationship[];
  /** Relationships out of the selected activity. */
  successors: Relationship[];
  activityById: Map<string, Activity>;
  /** Activity id → index of its row. Activities that aren't in the map aren't currently visible. */
  rowIndex: Map<string, number>;
  /** Time → x in the Gantt area. */
  x: (t: number) => number;
  rowH: number;
}

/** Where a link attaches to an activity's bar or diamond, mirroring how the Gantt draws them. */
function anchor(a: Activity, side: Side, x: Options["x"]): number | null {
  if (a.start === null || a.finish === null) return null;
  if (isMilestone(a)) {
    const cx = x(a.type === "finish-milestone" ? a.finish : a.start);
    return side === "finish" ? cx + DIAMOND_HALF : cx - DIAMOND_HALF;
  }
  return side === "start" ? x(a.start) : Math.max(x(a.finish), x(a.start) + 3);
}

const fmt = (n: number) => Math.round(n * 10) / 10;

export function buildLinks({ predecessors, successors, activityById, rowIndex, x, rowH }: Options): LinkLayer {
  const paths: LinkPath[] = [];
  let hidden = 0;
  let minY = Infinity;
  let maxY = -Infinity;

  const add = (rel: Relationship, kind: "pred" | "succ") => {
    const pred = activityById.get(rel.predTaskId);
    const succ = activityById.get(rel.taskId);
    const predRow = pred ? rowIndex.get(pred.id) : undefined;
    const succRow = succ ? rowIndex.get(succ.id) : undefined;
    const [fromSide, toSide] = SIDES[rel.type];
    const fx = pred ? anchor(pred, fromSide, x) : null;
    const tx = succ ? anchor(succ, toSide, x) : null;
    if (predRow === undefined || succRow === undefined || fx === null || tx === null) {
      hidden++;
      return;
    }

    const { points, arrowDir } = routeLink(
      { x: fx, y: predRow * rowH + rowH / 2 },
      fromSide,
      { x: tx, y: succRow * rowH + rowH / 2 },
      toSide,
      rowH,
    );
    for (const p of points) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const tip = points[points.length - 1]!;
    const baseX = tip.x - arrowDir * ARROW_LEN;
    paths.push({
      key: `${kind}-${rel.id}`,
      kind,
      d: points.map((p, i) => `${i === 0 ? "M" : "L"}${fmt(p.x)} ${fmt(p.y)}`).join(" "),
      arrow: `${fmt(tip.x)},${fmt(tip.y)} ${fmt(baseX)},${fmt(tip.y - ARROW_HALF)} ${fmt(baseX)},${fmt(tip.y + ARROW_HALF)}`,
    });
  };

  for (const rel of predecessors) add(rel, "pred");
  for (const rel of successors) add(rel, "succ");

  return paths.length
    ? { paths, hidden, top: Math.floor(minY) - 4, height: Math.ceil(maxY - minY) + 8 }
    : { paths, hidden, top: 0, height: 0 };
}
