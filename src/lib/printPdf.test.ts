import { describe, expect, test } from "bun:test";
import { compileFilter, EMPTY_FILTER, newCondition } from "./advancedFilter";
import {
  buildPdf,
  describeFilters,
  estimatePages,
  pdfText,
  printedSpan,
  rowsPerPage,
  safeFileName,
  type FilterState,
} from "./printPdf";
import { buildRows, makePredicate, type Row } from "./scheduleRows";
import { buildSchedule, listProjects } from "./xer/model";
import { parseXer } from "./xer/parse";

const sampleText = await Bun.file(new URL("../sample/sample.xer", import.meta.url)).text();
const xer = parseXer(sampleText);
const schedule = buildSchedule(xer, listProjects(xer)[0]!.id);
const noFilters: FilterState = { status: "all", query: "", searchGroups: true, dateFrom: "", dateTo: "", dateMode: "active", advanced: EMPTY_FILTER };
const allRows = buildRows(schedule.roots, new Set(), null);

/** The pdf's text as one string (only readable because these tests turn compression off). */
const pdfString = (bytes: ArrayBuffer) => new TextDecoder("latin1").decode(bytes);
async function render(rows: Row[], filters = noFilters, matched = schedule.activities.length, today?: number | null) {
  const { blob, pages } = await buildPdf(
    { schedule, rows, filters, matched, total: schedule.activities.length, generatedAt: new Date(2026, 8, 21, 14, 5), today },
    { compress: false },
  );
  return { text: pdfString(await blob.arrayBuffer()), pages, blob };
}
/** Every string drawn on the pages, in order. */
const shown = (text: string) => [...text.matchAll(/\((.*)\) Tj/g)].map((m) => m[1]!);

describe("the page", () => {
  test("is A3 landscape: 420 x 297 mm", async () => {
    const { text } = await render(allRows);
    const box = text.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/)!;
    expect(Number(box[1])).toBeCloseTo((420 * 72) / 25.4, 1); // 1190.55 pt
    expect(Number(box[2])).toBeCloseTo((297 * 72) / 25.4, 1); // 841.89 pt
    expect(Number(box[1])).toBeGreaterThan(Number(box[2])); // landscape
  });

  test("every page has the same size, however many there are", async () => {
    const { text, pages } = await render(allRows);
    expect(pages).toBeGreaterThan(1);
    const boxes = [...text.matchAll(/\/MediaBox \[([^\]]+)\]/g)].map((m) => Number(m[1]!.split(" ")[2]).toFixed(1));
    expect(boxes.length).toBeGreaterThanOrEqual(pages);
    expect(new Set(boxes).size).toBe(1);
  });

  test("is a real PDF", async () => {
    const { blob } = await render(allRows);
    expect(blob.type).toBe("application/pdf");
    expect(pdfString(await blob.arrayBuffer()).startsWith("%PDF-")).toBe(true);
  });
});

describe("what is printed", () => {
  test("has the project, counts, data date, print time and page numbers", async () => {
    const { text, pages } = await render(allRows);
    const lines = shown(text);
    expect(lines.some((l) => l.includes("Riverside Office Building"))).toBe(true);
    expect(lines.some((l) => l.includes("56 activities") && l.includes("Data date 06-Apr-26"))).toBe(true);
    expect(lines.some((l) => l.includes("Page 1 of " + pages))).toBe(true);
    expect(lines.some((l) => l.includes("Page " + pages + " of " + pages))).toBe(true);
    expect(lines).toContain("No filters applied");
    expect(lines.some((l) => l.includes("Printed 21 Sep 2026"))).toBe(true);
  });

  test("prints every row it is given, across pages: all codes and some group names appear", async () => {
    const { text } = await render(allRows);
    for (const a of schedule.activities) expect(text).toContain(`(${a.code}) Tj`);
    for (const g of ["Building Envelope", "Commissioning & Handover", "Site Works"]) expect(text).toContain(g);
  });

  test("only prints the rows that survive the filters, and says which filters were applied", async () => {
    const conditions = [newCondition("actvCode", "equals", "STRU")];
    const { predicate: extra } = compileFilter(schedule, { mode: "all", conditions });
    const predicate = makePredicate("all", "slab", null, extra, schedule)!;
    const rows = buildRows(schedule.roots, new Set(), predicate);
    const matched = schedule.activities.filter(predicate).length;
    const { text, pages } = await render(rows, { ...noFilters, query: "slab", advanced: { mode: "all", conditions } }, matched);
    expect(pages).toBe(1);
    for (const code of ["SS1000", "SS1010", "SS1040"]) expect(text).toContain(`(${code}) Tj`);
    for (const code of ["DE1000", "FD1010", "ME1000", "EN1000"]) expect(text).not.toContain(`(${code}) Tj`);
    const lines = shown(text);
    expect(lines.some((l) => l.includes(`${matched} of 56 activities`))).toBe(true);
    expect(lines.some((l) => l.includes('Search "slab"') && l.includes('Activity Code equals "STRU"'))).toBe(true);
  });

  test("a collapsed group prints as one row, without the activities inside it", async () => {
    const envelope = [...schedule.wbs.values()].find((n) => n.name === "Building Envelope")!;
    const rows = buildRows(schedule.roots, new Set([envelope.id]), null);
    const { text } = await render(rows);
    expect(text).toContain("Building Envelope");
    expect(text).not.toContain("(EN1010) Tj");
    expect(text).toContain("(DE1000) Tj");
  });

  test("an empty result still prints a valid one-page sheet", async () => {
    const { text, pages } = await render([], noFilters, 0);
    expect(pages).toBe(1);
    expect(text).toContain("/MediaBox");
    expect(shown(text).some((l) => l.includes("0 of 56 activities"))).toBe(true);
  });
});

describe("the Today line", () => {
  const dashed = (text: string) => text.match(/\[3\. 2\.\] 0\. d/g)?.length ?? 0;
  const PINK = "0.85 0.27 0.94 RG"; // the Today colour, so it can't be mistaken for the orange data date

  test("is a dashed pink line on every page, with a legend entry, when today is inside the printed time axis", async () => {
    const { text, pages } = await render(allRows, noFilters, schedule.activities.length, new Date(2026, 5, 15).getTime());
    expect(pages).toBeGreaterThan(1);
    expect(dashed(text)).toBe(pages);
    expect(text).toContain(PINK);
    expect(shown(text)).toContain("Today");
  });

  test("is left out, with no legend entry, when the switch is off", async () => {
    for (const today of [undefined, null]) {
      const { text } = await render(allRows, noFilters, schedule.activities.length, today);
      expect(dashed(text)).toBe(0);
      expect(text).not.toContain(PINK);
      expect(shown(text)).not.toContain("Today");
    }
  });

  test("is left out when today falls outside the printed time axis, so the legend never lists a line that isn't there", async () => {
    for (const today of [new Date(2019, 0, 1).getTime(), new Date(2031, 0, 1).getTime()]) {
      const { text } = await render(allRows, noFilters, schedule.activities.length, today);
      expect(dashed(text)).toBe(0);
      expect(shown(text)).not.toContain("Today");
    }
  });

  test("does not draw over an empty result", async () => {
    const { text } = await render([], noFilters, 0, new Date(2026, 5, 15).getTime());
    expect(dashed(text)).toBe(0);
  });
});

describe("text that the PDF fonts can't draw", () => {
  test("pdfText keeps Latin-1 and Windows punctuation, and swaps everything else for ?", () => {
    expect(pdfText("Café Müller – “quoted” … €5 • 20°C")).toBe("Café Müller – “quoted” … €5 • 20°C");
    expect(pdfText("中文 Проект ✅")).toBe("?? ?????? ?");
    expect(pdfText("a\tb\ncd")).toBe("a b cd");
  });

  test("an activity name in another script no longer garbles the whole page", async () => {
    const odd = parseXer(
      [
        "ERMHDR\t8.4\t2024-01-15\tProject\tadmin\tdb\tPM\tUSD",
        "%T\tPROJECT",
        "%F\tproj_id\tproj_short_name",
        "%R\t1\tODD",
        "%T\tPROJWBS",
        "%F\twbs_id\tproj_id\tproj_node_flag\twbs_name\tparent_wbs_id\tseq_num",
        "%R\t10\t1\tY\t中文 Project\t\t0",
        "%T\tTASK",
        "%F\ttask_id\tproj_id\twbs_id\ttask_code\ttask_name\tstatus_code\tearly_start_date\tearly_end_date",
        "%R\t100\t1\t10\tA1\tПроект café\tTK_NotStart\t2026-01-05 08:00\t2026-01-09 17:00",
        "%E",
      ].join("\r\n"),
    );
    const s = buildSchedule(odd, "1");
    const { blob } = await buildPdf(
      { schedule: s, rows: buildRows(s.roots, new Set(), null), filters: noFilters, matched: 1, total: 1 },
      { compress: false },
    );
    const lines = shown(pdfString(await blob.arrayBuffer()));
    expect(lines.some((l) => l.includes("?????? café"))).toBe(true);
    for (const l of lines) expect(l.includes(" ")).toBe(false); // the garbling shows up as NUL bytes
  });
});

describe("pagination", () => {
  test("rows per page is what fits between the header and footer", () => {
    expect(rowsPerPage(1)).toBeGreaterThan(40);
    expect(rowsPerPage(3)).toBeLessThan(rowsPerPage(1)); // more filter lines leave less room
    expect(estimatePages(0)).toBe(1);
    expect(estimatePages(rowsPerPage(1))).toBe(1);
    expect(estimatePages(rowsPerPage(1) + 1)).toBe(2);
    expect(estimatePages(10 * rowsPerPage(1))).toBe(10);
  });

  test("thousands of rows make the right number of pages, each numbered, and report progress", async () => {
    const tasks = schedule.activities;
    const rows: Row[] = Array.from({ length: 5000 }, (_, i) => ({ kind: "task", key: `t${i}`, task: tasks[i % tasks.length]!, depth: 1 }));
    const progress: Array<[number, number]> = [];
    const t0 = performance.now();
    const { blob, pages } = await buildPdf(
      { schedule, rows, filters: noFilters, matched: 5000, total: 5000 },
      { compress: false, onProgress: (done, total) => progress.push([done, total]) },
    );
    const seconds = (performance.now() - t0) / 1000;
    expect(pages).toBe(Math.ceil(5000 / rowsPerPage(1)));
    expect(progress).toHaveLength(pages);
    expect(progress[progress.length - 1]).toEqual([pages, pages]);
    const lines = shown(pdfString(await blob.arrayBuffer()));
    for (const n of [1, Math.ceil(pages / 2), pages]) expect(lines.some((l) => l.includes(`Page ${n} of ${pages}`))).toBe(true);
    expect(seconds).toBeLessThan(20);
  });
});

describe("helpers", () => {
  test("the time axis fits the printed activities, not the whole project", () => {
    const slabs = buildRows(schedule.roots, new Set(), makePredicate("all", "slab", null, null, schedule));
    const span = printedSpan(slabs)!;
    const whole = printedSpan(allRows)!;
    expect(span.start).toBeGreaterThan(whole.start);
    expect(span.finish).toBeLessThan(whole.finish);
    expect(printedSpan([])).toBeNull();
  });

  test("filter lines say what is applied, and stay quiet about what isn't", () => {
    expect(describeFilters(noFilters)).toEqual([]);
    expect(describeFilters({ ...noFilters, query: " WP23 ", searchGroups: false })).toEqual(['Search "WP23" in task code and task name']);
    expect(describeFilters({ ...noFilters, status: "critical" })).toEqual(["Show: Critical"]);
    expect(describeFilters({ ...noFilters, dateFrom: "2026-10-01", dateTo: "2026-10-31", dateMode: "starts" })).toEqual([
      "Dates: starting in range 01-Oct-26 – 31-Oct-26",
    ]);
    // a traced path the schedule is narrowed to is named, and an absent or empty one is not
    expect(describeFilters({ ...noFilters, path: "Backward trace from FD1050" })).toEqual(["Path only: Backward trace from FD1050"]);
    expect(describeFilters({ ...noFilters, path: null })).toEqual([]);
    expect(describeFilters({ ...noFilters, path: "" })).toEqual([]);
    // an inverted date range is ignored on screen, so it is not claimed on paper
    expect(describeFilters({ ...noFilters, dateFrom: "2026-12-01", dateTo: "2026-10-01" })).toEqual([]);
    const advanced = {
      mode: "any" as const,
      conditions: [newCondition("wbsName", "contains", "WP23"), newCondition("actvCode", "isEmpty"), newCondition("taskName", "contains", "  ")],
    };
    expect(describeFilters({ ...noFilters, advanced })).toEqual(['Conditions (any of): WBS Name contains "WP23"; Activity Code is empty']);
  });

  test("file names are safe and dated", () => {
    expect(safeFileName("HS2 - Old Oak Common / WP23: “Anthro”", new Date(2026, 8, 5))).toBe("HS2_-_Old_Oak_Common_WP23_Anthro_2026-09-05.pdf");
    expect(safeFileName("???", new Date(2026, 0, 1))).toBe("schedule_2026-01-01.pdf");
  });
});
