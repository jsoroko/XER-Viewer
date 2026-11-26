import { describe, expect, test } from "bun:test";
import { compileFilter, EMPTY_FILTER, newCondition } from "./advancedFilter";
import {
  bodyRoom,
  buildPdf,
  describeArrangement,
  describeFilters,
  estimatePages,
  LINE_H,
  paginate,
  pdfText,
  printedSpan,
  rowHeight,
  rowsPerPage,
  safeFileName,
  treeWidth,
  type FilterState,
  type PrintInput,
} from "./printPdf";
import { classify, DEFAULT_FIELDS, matchSchedules } from "./compare";
import { traceDriving } from "./drivingPath";
import { DEFAULT_GUIDES, pdfGuides } from "./levelGuides";
import { PAPERS, type PrintLayout } from "./printLayout";
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

/** Same as `render`, for the options added since: columns, shading and a traced path. */
async function renderWith(extra: Partial<PrintInput>, rows = allRows, filters = noFilters) {
  const { blob, pages } = await buildPdf(
    { schedule, rows, filters, matched: schedule.activities.length, total: schedule.activities.length, generatedAt: new Date(2026, 8, 21, 14, 5), ...extra },
    { compress: false },
  );
  return { text: pdfString(await blob.arrayBuffer()), pages };
}

describe("optional columns", () => {
  const headers = (text: string) => {
    const lines = shown(text);
    return lines.slice(lines.indexOf("TF") + 1);
  };

  test("print after TF in the table's own order, however they were switched on", async () => {
    const { text } = await renderWith({ columns: ["freeFloat", "percent", "actualFinish"] });
    expect(headers(text).slice(0, 3)).toEqual(["%", "Act Finish", "Free Flt"]);
  });

  test("none are printed unless asked for, and unknown names are ignored", async () => {
    for (const columns of [undefined, [], ["nonsense"]]) {
      const { text } = await renderWith({ columns });
      const lines = shown(text);
      expect(lines).not.toContain("%");
      expect(lines).not.toContain("Free Flt");
      expect(lines.some((l) => /^\d+%$/.test(l))).toBe(false);
    }
  });

  test("each activity gets its value, and group rows stay blank", async () => {
    const { text } = await renderWith({ columns: ["percent"] });
    const taskCount = allRows.filter((r) => r.kind === "task").length;
    expect(shown(text).filter((l) => /^\d+%$/.test(l))).toHaveLength(taskCount);
    const done = schedule.activities.find((a) => a.status === "completed")!;
    expect(shown(text)).toContain(`${Math.round(done.percent)}%`);
  });

  test("percent and float line up on their right edge, dates on their left", async () => {
    const { text } = await renderWith({ columns: ["percent"] });
    const start = (value: string) => Number(text.match(new RegExp(`\\n([\\d.]+) [\\d.]+ Td\\n\\(${value}\\) Tj`))?.[1]);
    expect(start("0%")).toBeGreaterThan(start("100%")); // same right edge, so the shorter one starts further right
    expect(start("0%") - start("100%")).toBeGreaterThan(5);
  });

  test("the chart starts further right to make room, by exactly the columns' width", async () => {
    const edge = (text: string) => Number(text.match(/\n([\d.]+) [\d.]+ m\n\1 [\d.]+ l\nS/)?.[1]);
    const base = edge((await renderWith({})).text);
    expect(base).toBeCloseTo(28 + 262 + 34 + 34 + 52 + 52 + 34, 1);
    expect(edge((await renderWith({ columns: ["percent"] })).text)).toBeCloseTo(base + 30, 1);
    expect(edge((await renderWith({ columns: ["percent", "actualStart", "actualFinish", "freeFloat"] })).text)).toBeCloseTo(base + 30 + 52 + 52 + 40, 1);
  });
});

describe("non-working shading", () => {
  const SHADE = "0.91 0.92 0.95 rg";

  test("is drawn, with a legend entry, when switched on", async () => {
    const { text } = await renderWith({ shadeNonWorking: true });
    expect(text).toContain(SHADE);
    expect(shown(text)).toContain("Non-working");
  });

  test("is left out, with no legend entry, when off", async () => {
    for (const shadeNonWorking of [undefined, false]) {
      const { text } = await renderWith({ shadeNonWorking });
      expect(text).not.toContain(SHADE);
      expect(shown(text)).not.toContain("Non-working");
    }
  });

  test("is left out when the printed span is so long that a weekend would be a hairline, so the legend never lists it", async () => {
    const first = allRows.find((r) => r.kind === "task")!;
    const stretched = allRows.map((r) => (r === first && r.kind === "task" ? { ...r, task: { ...r.task, finish: new Date(2040, 0, 1).getTime() } } : r));
    const { text } = await renderWith({ shadeNonWorking: true }, stretched);
    expect(text).not.toContain(SHADE);
    expect(shown(text)).not.toContain("Non-working");
  });

  test("never spills left of the chart into the table, wherever the printed span happens to begin", async () => {
    const first = allRows.find((r) => r.kind === "task")!;
    for (let day = 0; day < 7; day++) {
      const moved = allRows.map((r) =>
        r === first && r.kind === "task" ? { ...r, task: { ...r.task, start: new Date(2026, 0, 1 + day, 12).getTime() } } : r,
      );
      const { text } = await renderWith({ shadeNonWorking: true }, moved);
      const stripes = text.split(SHADE + "\n")[1]!.split(/\n[\d. ]+ (?:rg|RG)\n/)[0]!;
      const xs = [...stripes.matchAll(/^([\d.]+) [\d.]+ [\d.]+ -?[\d.]+ re$/gm)].map((m) => Number(m[1]));
      expect(xs.length).toBeGreaterThan(10);
      for (const x of xs) expect(x).toBeGreaterThanOrEqual(496 - 0.001);
    }
  });

  test("does not draw over an empty result", async () => {
    const { text } = await renderWith({ shadeNonWorking: true }, []);
    expect(text.split(SHADE).length - 1).toBe(1); // only the legend's swatch, no stripes
  });
});

describe("a traced path", () => {
  const origin = schedule.activities.find((a) => a.code === "FD1050")!;
  const result = traceDriving(schedule, origin.id, "backward");
  const trace = { label: "Backward trace from FD1050", ids: result.ids, links: result.links.map((l) => l.rel) };
  const OUTLINE = "0.03 0.57 0.7 RG";
  const ROW_TINT = "0.88 0.97 0.98 rg";
  const FADED_ACTUAL = "0.69 0.76 0.95 rg"; // the "Actual" blue pushed towards white

  test("is outlined and tinted, the rest faded, with a legend entry and a line in the header", async () => {
    const { text } = await renderWith({ trace });
    expect(result.ids.size).toBeGreaterThan(5);
    expect(text).toContain(OUTLINE);
    expect(text).toContain(ROW_TINT);
    expect(text).toContain(FADED_ACTUAL);
    expect(shown(text)).toContain("Traced path");
    expect(shown(text).some((l) => l.includes("Traced path: Backward trace from FD1050"))).toBe(true);
  });

  test("draws nothing of the kind when there is no trace, or an empty one", async () => {
    for (const t of [undefined, null, { label: "x", ids: new Set<string>(), links: [] }]) {
      const { text } = await renderWith({ trace: t });
      for (const mark of [OUTLINE, ROW_TINT, FADED_ACTUAL]) expect(text).not.toContain(mark);
      expect(shown(text)).not.toContain("Traced path");
    }
  });

  test("its links are drawn between the bars", async () => {
    const withLinks = await renderWith({ trace });
    const without = await renderWith({ trace: { ...trace, links: [] } });
    expect(withLinks.text.length).toBeGreaterThan(without.text.length);
  });

  const tasks = allRows.flatMap((r) => (r.kind === "task" ? [r.task] : []));
  const link = (from: string, to: string) => ({ id: "x", predTaskId: from, taskId: to, type: "FS" as const, lagHrs: 0 });
  const arrowheads = (text: string) => text.split("\nh\nf\n").length - 1;

  test("each link on the page gets a line and one arrowhead", async () => {
    const [a, b] = [tasks[0]!, tasks[1]!];
    const ids = new Set([a.id, b.id]);
    const one = await renderWith({ trace: { label: "x", ids, links: [link(a.id, b.id)] } });
    const none = await renderWith({ trace: { label: "x", ids, links: [] } });
    expect(arrowheads(one.text) - arrowheads(none.text)).toBe(1);
  });

  test("a link that runs across a page break is left out instead of failing", async () => {
    const [a, z] = [tasks[0]!, tasks[tasks.length - 1]!];
    const ids = new Set([a.id, z.id]);
    const crossing = await renderWith({ trace: { label: "x", ids, links: [link(a.id, z.id)] } });
    const none = await renderWith({ trace: { label: "x", ids, links: [] } });
    expect(crossing.pages).toBeGreaterThan(1);
    expect(arrowheads(crossing.text)).toBe(arrowheads(none.text));
  });

  test("with Path only on, the header names the path once, as a filter", async () => {
    const rows = buildRows(schedule.roots, new Set(), (a) => result.ids.has(a.id));
    const { text } = await renderWith({ trace }, rows, { ...noFilters, path: "Backward trace from FD1050" });
    const header = shown(text).filter((l) => l.includes("Backward trace from FD1050"));
    expect(header).toHaveLength(1); // a single page, so a single header line
    expect(header[0]).toContain("Path only: Backward trace from FD1050");
    expect(header[0]).not.toContain("Traced path:");
  });
});

describe("the ends of the chart", () => {
  const dated = schedule.activities.filter((a) => a.finish !== null);
  const last = dated.reduce((m, a) => (a.finish! > m.finish! ? a : m));

  test("a label that wouldn't fit right of the last bar is printed whole, to its left", async () => {
    // Long enough to overrun the chart's right edge, short enough for the activity column.
    const task = { ...last, name: "Handover of the completed works to the client" };
    const rows = allRows.filter((r) => r.kind === "task").map((r) => (r.kind === "task" && r.task.id === last.id ? { ...r, task } : r));
    const { text } = await render(rows);
    // Once in the activity column, once as the label by its bar.
    expect(shown(text).filter((t) => t === pdfText(task.name))).toHaveLength(2);
  });

  test("a flat list with no group rows prints like any other", async () => {
    const flat = buildRows(schedule.roots, new Set(), null, 0);
    const { text, pages } = await render(flat);
    expect(pages).toBeGreaterThan(0);
    expect(shown(text)).toContain(pdfText(last.name));
    expect(flat.every((r) => r.kind === "task")).toBe(true);
  });
});

describe("comparing two programmes", () => {
  const DAY = 86_400_000;
  const baseline = buildSchedule(xer, listProjects(xer)[0]!.id);
  const current = buildSchedule(xer, listProjects(xer)[0]!.id);
  const moved = current.activities.find((a) => a.code === "PR1030")!;
  moved.start! += 14 * DAY;
  moved.finish! += 14 * DAY;
  const matched = matchSchedules(baseline, current);
  const { changes } = classify(matched, DEFAULT_FIELDS);
  const compareRows = buildRows(matched.schedule.roots, new Set(), null);
  const compare = { label: "Comparing Rev A with Rev B", changes, showBaseline: true };
  const renderCompared = async (c: typeof compare | null) => {
    const { blob } = await buildPdf(
      { schedule: matched.schedule, rows: compareRows, filters: noFilters, matched: 56, total: 56, generatedAt: new Date(2026, 8, 21, 14, 5), compare: c },
      { compress: false },
    );
    return shown(pdfString(await blob.arrayBuffer()));
  };

  test("says which two files are compared in the header", async () => {
    expect((await renderCompared(compare)).some((l) => l.startsWith("Comparing Rev A with Rev B"))).toBe(true);
  });

  test("marks a modified activity, and says how far it moved in front of its name", async () => {
    const lines = await renderCompared(compare);
    expect(lines).toContain("~");
    expect(lines.some((l) => l.startsWith("+14d Procure MEP Equipment"))).toBe(true);
  });

  test("the legend names the kinds of change instead of the progress colours, with the baseline when it is drawn", async () => {
    const lines = await renderCompared(compare);
    for (const word of ["New", "Modified", "Removed", "Unchanged", "Baseline"]) expect(lines).toContain(word);
    expect(lines).not.toContain("Remaining");
    expect(await renderCompared({ ...compare, showBaseline: false })).not.toContain("Baseline");
  });

  test("the legend is grouped like the one on screen, and explains the row markers", async () => {
    const lines = await renderCompared(compare);
    for (const title of ["Compared with the baseline", "Row markers", "Other bars", "Lines and shading"]) expect(lines).toContain(title);
    for (const word of ["New activity", "Removed activity", "Modified activity"]) expect(lines).toContain(word);
    expect(lines).not.toContain("Progress");
  });

  test("a plain print is unchanged by all this", async () => {
    const lines = await renderCompared(null);
    expect(lines).toContain("Remaining");
    expect(lines).not.toContain("Modified");
    expect(lines).not.toContain("~");
  });

  test("a trace compared with the baseline names what dropped off its path in the legend", async () => {
    const [on, off] = compareRows.filter((r) => r.kind === "task").map((r) => (r as Extract<Row, { kind: "task" }>).task.id);
    const render = async (dropped: boolean) => {
      const { blob } = await buildPdf(
        {
          schedule: matched.schedule,
          rows: compareRows,
          filters: noFilters,
          matched: 56,
          total: 56,
          generatedAt: new Date(2026, 8, 21, 14, 5),
          compare,
          trace: { label: "Backward trace from X, compared with the baseline", ids: new Set([on!]), links: [], dropped: dropped ? { ids: new Set([off!]), links: [] } : null },
        },
        { compress: false },
      );
      return shown(pdfString(await blob.arrayBuffer()));
    };
    expect(await render(true)).toContain("Dropped off the path");
    expect(await render(false)).not.toContain("Dropped off the path");
    expect((await render(true)).some((l) => l.includes("compared with the baseline"))).toBe(true);
  });

  test("prints the baseline and change columns that are switched on, after the others", async () => {
    const { blob } = await buildPdf(
      {
        schedule: matched.schedule,
        rows: compareRows,
        filters: noFilters,
        matched: 56,
        total: 56,
        generatedAt: new Date(2026, 8, 21, 14, 5),
        compare,
        compareColumns: ["baseFinish", "dFinish"],
      },
      { compress: false },
    );
    const lines = shown(pdfString(await blob.arrayBuffer()));
    expect(lines).toContain("Base Finish");
    expect(lines).toContain("Chg Finish");
    expect(lines).not.toContain("Base Start");
    expect(lines).toContain("+14d"); // PR1030's finish moved two weeks
    expect(lines).toContain("21-Apr-26"); // and where it finished before
  });

  test("leaves those columns out of a plain print even if they were left switched on", async () => {
    const { blob } = await buildPdf(
      { schedule, rows: allRows, filters: noFilters, matched: 56, total: 56, generatedAt: new Date(2026, 8, 21, 14, 5), compareColumns: ["baseStart"] },
      { compress: false },
    );
    expect(shown(pdfString(await blob.arrayBuffer()))).not.toContain("Base Start");
  });

  test("leaves out the fixed columns that are switched off, and prints the rest", async () => {
    const { blob } = await buildPdf(
      { schedule, rows: allRows, filters: noFilters, matched: 56, total: 56, generatedAt: new Date(2026, 8, 21, 14, 5), hiddenColumns: ["orig", "rem", "tf"] },
      { compress: false },
    );
    const lines = shown(pdfString(await blob.arrayBuffer()));
    for (const gone of ["Orig", "Rem", "TF"]) expect(lines).not.toContain(gone);
    for (const kept of ["Activity", "Start", "Finish"]) expect(lines).toContain(kept);
    expect(lines).toContain("05-Jan-26");
    expect(lines).not.toContain("15d"); // Concept Design's duration, no longer in any column
  });
});

describe("the legend of a plain print", () => {
  test("is grouped, and has no row markers", async () => {
    const { text } = await render(allRows);
    const lines = shown(text);
    for (const title of ["Progress", "Other bars", "Lines and shading"]) expect(lines).toContain(title);
    expect(lines).not.toContain("Row markers");
    expect(lines).not.toContain("Predecessor");
  });

  test("a legend that does not fit on one line takes more, and the rows per page allow for them", () => {
    expect(rowsPerPage(1, 2)).toBeLessThan(rowsPerPage(1, 1));
    expect(rowsPerPage(1, 1)).toBe(rowsPerPage(1));
  });
});

describe("how the rows were arranged", () => {
  test("says nothing for the defaults", () => {
    expect(describeArrangement(undefined)).toEqual([]);
    expect(describeArrangement({ wbsLevel: null, levels: 4, wbsSort: "sequence", activitySort: null })).toEqual([]);
    expect(describeArrangement({ wbsLevel: 4, levels: 4, wbsSort: "sequence", activitySort: null })).toEqual([]); // the deepest level is the whole tree
  });

  test("names a shallower WBS level, no groups, and how the groups and the activities are sorted", () => {
    expect(describeArrangement({ wbsLevel: 2, levels: 4, wbsSort: "sequence", activitySort: null })).toEqual(["WBS level 2 of 4"]);
    expect(describeArrangement({ wbsLevel: 0, levels: 4, wbsSort: "sequence", activitySort: null })).toEqual(["No WBS groups"]);
    expect(describeArrangement({ wbsLevel: 2, levels: 4, wbsSort: "date", activitySort: null })).toEqual(["WBS level 2 of 4", "WBS sorted by date"]);
    expect(describeArrangement({ wbsLevel: null, levels: 4, wbsSort: "sequence", activitySort: { field: "start", dir: "asc" } })).toEqual([
      "Activities sorted by Start, earliest first",
    ]);
    expect(describeArrangement({ wbsLevel: null, levels: 4, wbsSort: "date", activitySort: { field: "finish", dir: "desc" } })).toEqual([
      "WBS sorted by date",
      "Activities sorted by Finish, latest first",
    ]);
  });

  test("is in the header of the page", async () => {
    const { blob } = await buildPdf(
      { schedule, rows: allRows, filters: noFilters, matched: 56, total: 56, generatedAt: new Date(2026, 8, 21, 14, 5), view: { wbsLevel: 1, levels: 3, wbsSort: "date", activitySort: { field: "start", dir: "asc" } } },
      { compress: false },
    );
    expect(shown(pdfString(await blob.arrayBuffer())).some((l) => l.includes("WBS level 1 of 3") && l.includes("WBS sorted by date") && l.includes("Activities sorted by Start, earliest first"))).toBe(true);
  });
});

describe("level guides on the sheet", () => {
  const render = async (guides: ReturnType<typeof pdfGuides>) => {
    const { blob } = await buildPdf({ schedule, rows: allRows, filters: noFilters, matched: 56, total: 56, generatedAt: new Date(2026, 8, 21, 14, 5), guides }, { compress: false });
    return pdfString(await blob.arrayBuffer());
  };
  // The first three default colours (#3B82F6, #D946EF, #06B6D4) as jsPDF writes a stroke colour.
  const LEVEL_STROKES = ["0.23 0.51 0.96 RG", "0.85 0.27 0.94 RG", "0.02 0.71 0.83 RG"];

  test("without guides none of the level colours is drawn", async () => {
    const text = await render(null);
    for (const c of LEVEL_STROKES) expect(text).not.toContain(c);
  });

  test("with guides each level has its own colour, one line down every row below it", async () => {
    const text = await render(pdfGuides(DEFAULT_GUIDES));
    for (const c of LEVEL_STROKES) expect(text).toContain(c);
  });

  test("tinting the group rows changes the sheet, and printing can be switched off", async () => {
    const plain = await render(pdfGuides(DEFAULT_GUIDES));
    expect(await render(pdfGuides({ ...DEFAULT_GUIDES, tint: true }))).not.toBe(plain);
    expect(pdfGuides({ ...DEFAULT_GUIDES, print: false })).toBeNull();
  });

  test("the guides' indent moves the names: tight sits to the left of normal", async () => {
    const xOf = (text: string) => {
      const m = text.match(/([\d.]+) [\d.]+ Td\n\(\+?-?\s*Foundations\)/) ?? text.match(/([\d.]+) [\d.]+ Td\s*\(-  Foundations\) Tj/);
      return m ? Number(m[1]) : null;
    };
    const tight = xOf(await render(pdfGuides(DEFAULT_GUIDES)));
    const normal = xOf(await render(pdfGuides({ ...DEFAULT_GUIDES, indent: "normal" })));
    expect(tight).not.toBeNull();
    expect(normal).not.toBeNull();
    expect(tight!).toBeLessThan(normal!);
  });
});

describe("paper sizes", () => {
  const sizeOf = (text: string) => {
    const m = text.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/)!;
    return [Number(m[1]), Number(m[2])] as const;
  };
  const renderWith = async (layout: Partial<PrintLayout>, rows: Row[] = allRows) => {
    const { blob, pages } = await buildPdf(
      { schedule, rows, filters: noFilters, matched: schedule.activities.length, total: schedule.activities.length, generatedAt: new Date(2026, 8, 21), layout },
      { compress: false },
    );
    return { text: pdfString(await blob.arrayBuffer()), pages };
  };

  test("each paper makes a page of its own size, landscape", async () => {
    for (const p of ["a4", "a3", "a2"] as const) {
      const [w, h] = sizeOf((await renderWith({ paper: p })).text);
      expect(w).toBeCloseTo(PAPERS[p].w, 1);
      expect(h).toBeCloseTo(PAPERS[p].h, 1);
    }
  });

  test("a bigger sheet takes more rows, so the same rows need fewer pages", async () => {
    const tasks = schedule.activities;
    const rows: Row[] = Array.from({ length: 600 }, (_, i) => ({ kind: "task", key: `t${i}`, task: tasks[i % tasks.length]!, depth: 1 }));
    const a4 = (await renderWith({ paper: "a4", text: "one-line" }, rows)).pages;
    const a3 = (await renderWith({ paper: "a3", text: "one-line" }, rows)).pages;
    const a2 = (await renderWith({ paper: "a2", text: "one-line" }, rows)).pages;
    expect(a4).toBeGreaterThan(a3);
    expect(a3).toBeGreaterThan(a2);
    expect(a3).toBe(Math.ceil(600 / rowsPerPage(1, 1, "a3")));
    expect(estimatePages(600, 1, "a4")).toBe(a4);
  });

  test("only the page asked for is drawn, but the page count and numbering are the whole print's", async () => {
    const tasks = schedule.activities;
    const rows: Row[] = Array.from({ length: 300 }, (_, i) => ({ kind: "task", key: `t${i}`, task: tasks[i % tasks.length]!, depth: 1 }));
    const input = { schedule, rows, filters: noFilters, matched: 300, total: 300, generatedAt: new Date(2026, 8, 21) };
    const all = await buildPdf(input, { compress: false });
    const one = await buildPdf(input, { compress: false, onlyPage: 1 });
    expect(one.pages).toBe(all.pages);
    const text = pdfString(await one.blob.arrayBuffer());
    expect([...text.matchAll(/\/Type \/Page\b/g)]).toHaveLength(1);
    expect(shown(text).some((l) => l.includes(`Page 2 of ${all.pages}`))).toBe(true);
  });
});

describe("rows that need more than one line", () => {
  test("a row is one line tall, and each further line adds the same amount", () => {
    expect(rowHeight(1)).toBe(rowHeight(0));
    expect(rowHeight(2) - rowHeight(1)).toBe(LINE_H);
    expect(rowHeight(3) - rowHeight(2)).toBe(LINE_H);
  });

  test("pages start where the next row would not fit, and a page is never empty", () => {
    expect(paginate([], 100)).toEqual([0]);
    expect(paginate([10, 10, 10, 10, 10], 30)).toEqual([0, 3]);
    expect(paginate([10, 10, 10, 10, 10, 10], 30)).toEqual([0, 3]);
    expect(paginate([10, 25, 10, 25], 30)).toEqual([0, 1, 2, 3]); // tall rows push to a new page
    expect(paginate([50, 10], 30)).toEqual([0, 1]); // a row taller than the page still gets one
  });

  test("a page full of one-line rows holds as many as it always did", () => {
    const room = bodyRoom("a3", 1, 1);
    const per = rowsPerPage(1, 1, "a3");
    const starts = paginate(Array(per * 3).fill(rowHeight(1)), room);
    expect(starts).toEqual([0, per, 2 * per]);
  });

  test("the column is as wide as the longest row needs, between its fixed width and a share of the page", () => {
    expect(treeWidth(100, PAPERS.a3.w, "wrap")).toBe(262);
    expect(treeWidth(300, PAPERS.a3.w, "wrap")).toBe(300);
    expect(treeWidth(5000, PAPERS.a3.w, "wrap")).toBeCloseTo(PAPERS.a3.w * 0.35, 0);
    expect(treeWidth(5000, PAPERS.a2.w, "wrap")).toBeGreaterThan(treeWidth(5000, PAPERS.a3.w, "wrap"));
    expect(treeWidth(5000, PAPERS.a3.w, "one-line")).toBe(262);
  });

  const long = "Procure chilled water pumps, valves and the associated controls package for the second floor plant room";
  const withLong = () => {
    const first = allRows.find((r) => r.kind === "task")!;
    return allRows.map((r) => (r === first && r.kind === "task" ? { ...r, task: { ...r.task, name: long } } : r));
  };
  const print = async (layout: Partial<PrintLayout>, rows: Row[]) => {
    const { blob, pages } = await buildPdf(
      { schedule, rows, filters: noFilters, matched: schedule.activities.length, total: schedule.activities.length, generatedAt: new Date(2026, 8, 21), layout },
      { compress: false },
    );
    return { lines: shown(pdfString(await blob.arrayBuffer())), pages };
  };

  test("one line mode cuts a long name with '...', as it always did", async () => {
    // (with no bar labels, since the name beside the bar may well fit whole)
    const { lines } = await print({ text: "one-line", labels: "none" }, withLong());
    expect(lines.some((l) => l === pdfText(long))).toBe(false);
    expect(lines.some((l) => l.startsWith("Procure chilled water") && l.endsWith("..."))).toBe(true);
  });

  test("wrap mode prints the whole name, on more than one line if it must", async () => {
    const { lines } = await print({ text: "wrap", labels: "none" }, withLong());
    const pieces = lines.filter((l) => long.includes(l) && l.length > 10);
    expect(pieces.length).toBeGreaterThanOrEqual(1);
    expect(pieces.join(" ").replace(/\s+/g, " ")).toContain(long);
    expect(lines.some((l) => l.endsWith("..."))).toBe(false); // nothing was cut
  });

  test("wrapping can make a print need more pages than the one-line rows would", async () => {
    const tasks = schedule.activities;
    const rows: Row[] = Array.from({ length: 150 }, (_, i) => ({ kind: "task", key: `t${i}`, task: { ...tasks[i % tasks.length]!, name: `${long} ${long}` }, depth: 1 }));
    const wrap = (await print({ text: "wrap" }, rows)).pages;
    const one = (await print({ text: "one-line" }, rows)).pages;
    expect(wrap).toBeGreaterThan(one);
  });
});

describe("bar labels", () => {
  const dated = schedule.activities.filter((a) => a.start !== null && a.finish !== null);
  const early = dated.reduce((m, a) => (a.start! < m.start! ? a : m));
  const make = (name: string) => {
    const task = { ...early, name };
    return allRows.filter((r) => r.kind === "task").map((r) => (r.kind === "task" && r.task.id === early.id ? { ...r, task } : r));
  };
  const labelsOf = async (labels: PrintLayout["labels"], name: string) => {
    const { blob } = await buildPdf(
      { schedule, rows: make(name), filters: noFilters, matched: 1, total: 1, generatedAt: new Date(2026, 8, 21), layout: { labels, text: "one-line" } },
      { compress: false },
    );
    return shown(pdfString(await blob.arrayBuffer()));
  };
  const code = pdfText(early.code);

  test("'none' prints nothing beside the bar, but the code and name stay in the table", async () => {
    const lines = await labelsOf("none", "Zebra Crossing Works");
    expect(lines.filter((l) => l === "Zebra Crossing Works")).toHaveLength(1); // the table only
    expect(lines.filter((l) => l === code)).toHaveLength(1);
  });

  test("'name' puts the name by the bar, as the table has it", async () => {
    const lines = await labelsOf("name", "Zebra Crossing Works");
    expect(lines.filter((l) => l === "Zebra Crossing Works")).toHaveLength(2);
  });

  test("'id' puts the code by the bar instead of the name", async () => {
    const lines = await labelsOf("id", "Zebra Crossing Works");
    expect(lines.filter((l) => l === "Zebra Crossing Works")).toHaveLength(1);
    expect(lines.filter((l) => l === code)).toHaveLength(2);
  });

  test("'smart' keeps a name that fits, and uses the ID when the name is too long for either side", async () => {
    const short = await labelsOf("smart", "Zebra Crossing Works");
    expect(short.filter((l) => l === "Zebra Crossing Works")).toHaveLength(2);
    const huge = "x".repeat(400);
    const lines = await labelsOf("smart", huge);
    expect(lines.filter((l) => l.startsWith("xxxx") && !l.endsWith("..."))).toHaveLength(0); // never a half name
    expect(lines.filter((l) => l === code)).toHaveLength(2); // the table's code and the label
  });
});
