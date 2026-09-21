import type { jsPDF } from "jspdf";
import { FIELDS, OPERATORS, type AdvancedFilter } from "./advancedFilter";
import { fmtDate, fmtDateTime, fmtDays } from "./format";
import {
  ACTIVITY_FILTER_LABEL,
  DATE_MODE_LABEL,
  describeDateRange,
  type ActivityFilter,
  type DateMode,
  type Row,
} from "./scheduleRows";
import { buildTicks, DAY, makeTimeline, paddedRange } from "./timeline";
import { isMilestone, type Activity, type Schedule } from "./xer/model";

/**
 * Prints the schedule as it is on screen (the filtered rows, with groups open or closed as you left them) to a PDF:
 * A3 landscape, an activity table on the left and a Gantt chart scaled to fit the page width on the right, repeated
 * across as many pages as the rows need. Drawn directly with jsPDF (loaded on demand) so the page size is exact in
 * every browser, instead of relying on the print dialog.
 */

// ---- Page geometry (points; 1 pt = 1/72 inch) -------------------------------------------------------------------
export const PAGE_W = 1190.55; // A3 landscape: 420 mm
export const PAGE_H = 841.89; //                297 mm
const MARGIN = 28;
const TREE_W = 262;
const COL_W = { orig: 34, rem: 34, start: 52, finish: 52, tf: 34 } as const;
const TABLE_W = TREE_W + COL_W.orig + COL_W.rem + COL_W.start + COL_W.finish + COL_W.tf;
const ROW_H = 13.5;
const COL_HEAD_H = 30;
const FOOTER_H = 22;
const BASE_HEADER_H = 34;
const FILTER_LINE_H = 9.5;
const MAX_FILTER_LINES = 3;

export const headerHeight = (filterLines: number) => BASE_HEADER_H + filterLines * FILTER_LINE_H;

export function rowsPerPage(filterLines = 1): number {
  const body = PAGE_H - 2 * MARGIN - headerHeight(filterLines) - COL_HEAD_H - FOOTER_H;
  return Math.floor(body / ROW_H);
}

/** Pages needed for this many rows (at least one, so an empty result still prints its header). */
export function estimatePages(rowCount: number, filterLines = 1): number {
  return Math.max(1, Math.ceil(rowCount / rowsPerPage(filterLines)));
}

// ---- Text ---------------------------------------------------------------------------------------------------------
// The built-in PDF fonts cover Windows-1252 (Latin-1 plus a few typographic marks). A character outside it makes
// jsPDF garble the WHOLE string, so anything else is swapped for "?" before drawing.
const WIN_ANSI_EXTRAS = new Set(
  [0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178],
);

export function pdfText(s: string): string {
  let out = "";
  for (const ch of s.normalize("NFC")) {
    const c = ch.codePointAt(0)!;
    if (c === 9 || c === 10 || c === 13) out += " ";
    else if (c < 32 || (c >= 127 && c < 160)) continue;
    else if (c <= 126 || (c >= 160 && c <= 255) || WIN_ANSI_EXTRAS.has(c)) out += ch;
    else out += "?";
  }
  return out;
}

export function safeFileName(name: string, date = new Date()): string {
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const base = name.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "schedule";
  return `${base}_${stamp}.pdf`;
}

// ---- What the filters were, in words --------------------------------------------------------------------------------
export interface FilterState {
  status: ActivityFilter;
  query: string;
  searchGroups: boolean;
  dateFrom: string;
  dateTo: string;
  dateMode: DateMode;
  advanced: AdvancedFilter;
}

/** One short line per active filter, printed under the title so the sheet says what it shows. */
export function describeFilters(f: FilterState): string[] {
  const lines: string[] = [];
  const q = f.query.trim();
  if (q) lines.push(`Search "${q}" in ${f.searchGroups ? "task code, task name and group names" : "task code and task name"}`);
  if (f.status !== "all") lines.push(`Show: ${ACTIVITY_FILTER_LABEL[f.status]}`);
  if (f.dateFrom || f.dateTo) {
    // An inverted range is ignored on screen, so it is left out here too.
    const inverted = f.dateFrom && f.dateTo && f.dateFrom > f.dateTo;
    if (!inverted) lines.push(`Dates: ${DATE_MODE_LABEL[f.dateMode].toLowerCase()} ${describeDateRange(f.dateFrom, f.dateTo)}`);
  }
  const used = f.advanced.conditions.flatMap((c) => {
    const field = FIELDS.find((x) => x.id === c.field);
    const op = OPERATORS.find((o) => o.op === c.op);
    if (!field || !op || (op.needsValue && !c.value.trim())) return [];
    return [`${field.label} ${op.label}${op.needsValue ? ` "${c.value.trim()}"` : ""}`];
  });
  if (used.length) lines.push(`Conditions (${f.advanced.mode === "all" ? "all of" : "any of"}): ${used.join("; ")}`);
  return lines;
}

// ---- Time axis ------------------------------------------------------------------------------------------------------
/** The dates the printed activities span. WBS group bars are excluded: they roll up activities that may be filtered out. */
export function printedSpan(rows: Row[]): { start: number; finish: number } | null {
  let start = Infinity;
  let finish = -Infinity;
  for (const r of rows) {
    if (r.kind !== "task") continue;
    if (r.task.start !== null && r.task.start < start) start = r.task.start;
    if (r.task.finish !== null && r.task.finish > finish) finish = r.task.finish;
  }
  return start <= finish ? { start, finish } : null;
}

// ---- Drawing ----------------------------------------------------------------------------------------------------------
type RGB = readonly [number, number, number];
const C = {
  text: [30, 41, 59],
  muted: [100, 116, 139],
  line: [226, 232, 240],
  grid: [236, 240, 245],
  band: [241, 245, 249],
  head: [226, 232, 240],
  summary: [51, 65, 85],
  complete: [5, 150, 105],
  actual: [29, 78, 216],
  remaining: [96, 165, 250],
  critActual: [185, 28, 28],
  critRemaining: [248, 113, 113],
  loe: [20, 184, 166],
  dataDate: [249, 115, 22],
  red: [185, 28, 28],
} as const satisfies Record<string, RGB>;

const fill = (d: jsPDF, c: RGB) => d.setFillColor(c[0], c[1], c[2]);
const stroke = (d: jsPDF, c: RGB) => d.setDrawColor(c[0], c[1], c[2]);
const ink = (d: jsPDF, c: RGB) => d.setTextColor(c[0], c[1], c[2]);

/** Shortens text with "..." so it fits in `maxW` points at the current font. */
function fit(d: jsPDF, s: string, maxW: number): string {
  if (maxW <= 0) return "";
  if (d.getTextWidth(s) <= maxW) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (d.getTextWidth(`${s.slice(0, mid)}...`) <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? `${s.slice(0, lo)}...` : "";
}

function diamond(d: jsPDF, cx: number, cy: number, h: number) {
  d.lines([[h, h], [-h, h], [-h, -h], [h, -h]], cx, cy - h, [1, 1], "F", true);
}

export interface PrintInput {
  schedule: Schedule;
  /** The rows exactly as shown: filtered, with groups open or closed. */
  rows: Row[];
  filters: FilterState;
  /** Activities matching the filters, and in the whole project. */
  matched: number;
  total: number;
  generatedAt?: Date;
}

export interface PdfOptions {
  /** Compress the page streams (smaller file). Tests turn this off so the text can be read back. */
  compress?: boolean;
  onProgress?: (pagesDone: number, pages: number) => void;
}

export interface PdfResult {
  blob: Blob;
  pages: number;
}

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function buildPdf(input: PrintInput, options: PdfOptions = {}): Promise<PdfResult> {
  const { schedule, rows, filters, matched, total } = input;
  const generatedAt = input.generatedAt ?? new Date();
  const { jsPDF: PDF } = await import("jspdf");
  const doc = new PDF({ orientation: "landscape", unit: "pt", format: "a3", compress: options.compress ?? true });
  const projectName = pdfText(schedule.project.name);
  doc.setProperties({ title: `${projectName} - schedule`, subject: "Schedule printed from XER Viewer", creator: "XER Viewer" });

  // Header text (its height decides how many rows fit on a page)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  const described = describeFilters(filters);
  const filterText = pdfText(described.length ? described.join("   |   ") : "No filters applied");
  const filterLines = (doc.splitTextToSize(filterText, PAGE_W - 2 * MARGIN - 260) as string[]).slice(0, MAX_FILTER_LINES);
  const headH = headerHeight(filterLines.length);
  const perPage = rowsPerPage(filterLines.length);
  const pages = Math.max(1, Math.ceil(rows.length / perPage));

  // Time axis, fitted to the activities actually printed
  const span = printedSpan(rows) ?? schedule.range;
  const extent = paddedRange(span);
  const ganttX = MARGIN + TABLE_W;
  const ganttW = PAGE_W - MARGIN - ganttX;
  const days = (extent.end - extent.start) / DAY;
  const tl = makeTimeline(extent.start, extent.end, ganttW / days);
  const ticks = buildTicks(tl);
  const dataDate = schedule.project.dataDate;
  const dataDateX = dataDate !== null && dataDate >= extent.start && dataDate <= extent.end ? ganttX + tl.x(dataDate) : null;

  const bodyTop = MARGIN + headH + COL_HEAD_H;

  for (let page = 0; page < pages; page++) {
    if (page > 0) doc.addPage("a3", "landscape");
    const slice = rows.slice(page * perPage, (page + 1) * perPage);
    const bodyH = slice.length * ROW_H;

    // -- Header -----------------------------------------------------------------------------------------------------
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    ink(doc, C.text);
    doc.text(fit(doc, projectName, PAGE_W - 2 * MARGIN - 260), MARGIN, MARGIN + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    ink(doc, C.muted);
    const ddText = dataDate !== null ? `   |   Data date ${fmtDate(dataDate)}` : "";
    doc.text(
      pdfText(`${matched === total ? `${total.toLocaleString("en-GB")} activities` : `${matched.toLocaleString("en-GB")} of ${total.toLocaleString("en-GB")} activities`}${ddText}`),
      MARGIN,
      MARGIN + 24,
    );
    doc.setFontSize(7.5);
    filterLines.forEach((line, i) => doc.text(line, MARGIN, MARGIN + 34 + i * FILTER_LINE_H));
    doc.setFontSize(8);
    doc.text(pdfText(`Printed ${fmtDateTime(generatedAt.getTime())}   |   Page ${page + 1} of ${pages}`), PAGE_W - MARGIN, MARGIN + 12, { align: "right" });

    // -- Column headings + time scale --------------------------------------------------------------------------------
    const headTop = MARGIN + headH;
    fill(doc, C.head);
    doc.rect(MARGIN, headTop, PAGE_W - 2 * MARGIN, COL_HEAD_H, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    ink(doc, C.text);
    const headY = headTop + COL_HEAD_H - 7;
    doc.text("Activity", MARGIN + 4, headY, { baseline: "middle" });
    let x = MARGIN + TREE_W;
    for (const [label, w, align] of [
      ["Orig", COL_W.orig, "right"],
      ["Rem", COL_W.rem, "right"],
      ["Start", COL_W.start, "left"],
      ["Finish", COL_W.finish, "left"],
      ["TF", COL_W.tf, "right"],
    ] as const) {
      doc.text(label, align === "right" ? x + w - 4 : x + 4, headY, { align, baseline: "middle" });
      x += w;
    }
    stroke(doc, C.muted);
    doc.setLineWidth(0.4);
    doc.line(ganttX, headTop, ganttX, bodyTop + bodyH);
    doc.line(ganttX, headTop + COL_HEAD_H / 2, PAGE_W - MARGIN, headTop + COL_HEAD_H / 2);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    for (const t of ticks.top) {
      doc.line(ganttX + t.x, headTop, ganttX + t.x, headTop + COL_HEAD_H / 2);
      const label = pdfText(t.label);
      if (doc.getTextWidth(label) + 4 <= t.w) doc.text(label, ganttX + t.x + 3, headTop + COL_HEAD_H / 4, { baseline: "middle" });
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    for (const t of ticks.bottom) {
      doc.line(ganttX + t.x, headTop + COL_HEAD_H / 2, ganttX + t.x, headTop + COL_HEAD_H);
      const label = pdfText(t.label);
      if (doc.getTextWidth(label) + 3 <= t.w) doc.text(label, ganttX + t.x + 2, headTop + (COL_HEAD_H * 3) / 4, { baseline: "middle" });
    }

    // -- Vertical grid lines ------------------------------------------------------------------------------------------
    if (slice.length > 0 && ticks.bottom.length < 600) {
      stroke(doc, C.grid);
      doc.setLineWidth(0.3);
      for (const t of ticks.bottom) doc.line(ganttX + t.x, bodyTop, ganttX + t.x, bodyTop + bodyH);
    }

    // -- Rows ---------------------------------------------------------------------------------------------------------
    slice.forEach((row, i) => {
      const top = bodyTop + i * ROW_H;
      const mid = top + ROW_H / 2;
      if (row.kind === "wbs") {
        fill(doc, C.band);
        doc.rect(MARGIN, top, PAGE_W - 2 * MARGIN, ROW_H, "F");
      }
      stroke(doc, C.line);
      doc.setLineWidth(0.25);
      doc.line(MARGIN, top + ROW_H, PAGE_W - MARGIN, top + ROW_H);

      const indent = MARGIN + 4 + row.depth * 7;
      const cellRight = MARGIN + TREE_W - 4;
      if (row.kind === "wbs") {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        ink(doc, C.text);
        const count = String(row.matches ?? row.node.activityCount);
        const marker = row.expanded ? "-" : "+";
        const name = fit(doc, pdfText(row.node.name), cellRight - indent - 20 - doc.getTextWidth(count));
        const heading = `${marker}  ${name}`;
        const headingW = doc.getTextWidth(heading); // measured in bold, which is how it is drawn
        doc.text(heading, indent, mid, { baseline: "middle" });
        doc.setFont("helvetica", "normal");
        ink(doc, C.muted);
        doc.text(count, indent + headingW + 4, mid, { baseline: "middle" });
        drawDates(doc, row.node.start, row.node.finish, mid);
        drawSummaryBar(doc, row.node.start, row.node.finish, mid, ganttX, ganttW, tl.x);
      } else {
        const a = row.task;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        ink(doc, C.muted);
        const code = fit(doc, pdfText(a.code), 92);
        const codeW = doc.getTextWidth(code); // measured at the code's own size, before the name's size is set
        doc.text(code, indent, mid, { baseline: "middle" });
        doc.setFontSize(7.5);
        ink(doc, C.text);
        const nameX = indent + codeW + 5;
        doc.text(fit(doc, pdfText(a.name), cellRight - nameX), nameX, mid, { baseline: "middle" });

        ink(doc, C.text);
        let cx = MARGIN + TREE_W;
        doc.text(fmtDays(a.origDurHrs, a.dayHrs), cx + COL_W.orig - 4, mid, { align: "right", baseline: "middle" });
        cx += COL_W.orig;
        doc.text(fmtDays(a.remDurHrs, a.dayHrs), cx + COL_W.rem - 4, mid, { align: "right", baseline: "middle" });
        drawDates(doc, a.start, a.finish, mid);
        if (a.status !== "completed") {
          const tf = fmtDays(a.totalFloatHrs, a.dayHrs);
          if (a.critical) ink(doc, C.red);
          doc.text(tf, MARGIN + TABLE_W - 4, mid, { align: "right", baseline: "middle" });
        }
        drawTaskBar(doc, a, mid, ganttX, ganttW, tl.x, dataDate);
      }
    });

    // -- Data date line -------------------------------------------------------------------------------------------------
    if (dataDateX !== null && slice.length > 0) {
      stroke(doc, C.dataDate);
      doc.setLineWidth(0.8);
      doc.line(dataDateX, headTop + COL_HEAD_H, dataDateX, bodyTop + bodyH);
    }

    // -- Footer: legend -------------------------------------------------------------------------------------------------
    drawLegend(doc, MARGIN, PAGE_H - MARGIN - 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    ink(doc, C.muted);
    doc.text("XER Viewer", PAGE_W - MARGIN, PAGE_H - MARGIN - 6, { align: "right", baseline: "middle" });

    options.onProgress?.(page + 1, pages);
    if (page < pages - 1) await yieldToBrowser();
  }

  const bytes = doc.output("arraybuffer");
  return { blob: new Blob([bytes], { type: "application/pdf" }), pages };
}

// The start / finish columns sit between "Rem" and "TF".
function drawDates(doc: jsPDF, start: number | null, finish: number | null, mid: number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  ink(doc, C.text);
  const x0 = MARGIN + TREE_W + COL_W.orig + COL_W.rem;
  doc.text(fmtDate(start), x0 + 4, mid, { baseline: "middle" });
  doc.text(fmtDate(finish), x0 + COL_W.start + 4, mid, { baseline: "middle" });
}

function drawSummaryBar(doc: jsPDF, start: number | null, finish: number | null, mid: number, ganttX: number, ganttW: number, x: (t: number) => number) {
  if (start === null || finish === null) return;
  const x1 = Math.max(0, x(start));
  const x2 = Math.min(ganttW, Math.max(x(finish), x1 + 1.5));
  if (x2 <= 0 || x1 >= ganttW) return;
  fill(doc, C.summary);
  doc.rect(ganttX + x1, mid - 1.8, x2 - x1, 3.6, "F");
  doc.rect(ganttX + x1, mid - 1.8, 1.2, 6, "F");
  doc.rect(ganttX + x2 - 1.2, mid - 1.8, 1.2, 6, "F");
}

function drawTaskBar(doc: jsPDF, a: Activity, mid: number, ganttX: number, ganttW: number, x: (t: number) => number, dataDate: number | null) {
  if (a.start === null || a.finish === null) return;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  ink(doc, C.muted);
  const label = (from: number) => {
    const room = ganttW - from - 2;
    if (room > 24) doc.text(fit(doc, pdfText(a.name), room), ganttX + from + 3, mid, { baseline: "middle" });
  };

  if (isMilestone(a)) {
    const cx = x(a.type === "finish-milestone" ? a.finish : a.start);
    fill(doc, a.critical ? C.red : a.status === "completed" ? C.complete : C.text);
    diamond(doc, ganttX + cx, mid, 3.6);
    label(cx + 5);
    return;
  }
  const x1 = x(a.start);
  const x2 = Math.max(x(a.finish), x1 + 1.5);
  if (a.type === "loe") {
    fill(doc, C.loe);
    doc.rect(ganttX + x1, mid - 1.3, x2 - x1, 2.6, "F");
    label(x2 + 2);
    return;
  }
  const split =
    a.status === "completed"
      ? x2
      : a.status === "in-progress" && dataDate !== null
        ? Math.min(x2, Math.max(x1, x(dataDate)))
        : x1;
  fill(doc, a.status === "completed" ? C.complete : a.critical ? C.critActual : C.actual);
  if (split > x1) doc.rect(ganttX + x1, mid - 3.2, split - x1, 6.4, "F");
  fill(doc, a.critical ? C.critRemaining : C.remaining);
  if (x2 > split) doc.rect(ganttX + split, mid - 3.2, x2 - split, 6.4, "F");
  label(x2 + 2);
}

function drawLegend(doc: jsPDF, x0: number, y: number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  let x = x0;
  const item = (label: string, swatch: (x: number) => void, w: number) => {
    swatch(x);
    ink(doc, C.muted);
    doc.text(label, x + w + 4, y, { baseline: "middle" });
    x += w + 4 + doc.getTextWidth(label) + 14;
  };
  const bar = (c: RGB) => (sx: number) => {
    fill(doc, c);
    doc.rect(sx, y - 3, 14, 6, "F");
  };
  item("Complete", bar(C.complete), 14);
  item("Actual", bar(C.actual), 14);
  item("Remaining", bar(C.remaining), 14);
  item("Critical", bar(C.critActual), 14);
  item("Level of effort", bar(C.loe), 14);
  item("WBS group", bar(C.summary), 14);
  item("Milestone", (sx) => {
    fill(doc, C.text);
    diamond(doc, sx + 4, y, 3.6);
  }, 8);
  item("Data date", (sx) => {
    stroke(doc, C.dataDate);
    doc.setLineWidth(0.8);
    doc.line(sx + 2, y - 4, sx + 2, y + 4);
  }, 4);
}
