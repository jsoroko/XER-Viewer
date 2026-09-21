import { describe, expect, test } from "bun:test";
import {
  averageWorkdayHours,
  holidayCount,
  nonWorkingRuns,
  parseCalendarData,
  periodsOn,
  summarizeWeek,
  workingDaysBetween,
} from "./calendar";
import { buildSchedule, listProjects } from "./model";
import { parseXer } from "./parse";

const sampleText = await Bun.file(new URL("../../sample/sample.xer", import.meta.url)).text();

const shifts = "(0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())";
const monFri = [1, 2, 3, 4, 5, 6, 7].map((n) => (n >= 2 && n <= 6 ? `(0||${n}()(${shifts}))` : `(0||${n}()())`)).join("");
// Excel serials: 46023 = 2026-01-01 (Thu), 46030 = 2026-01-08 (Thu), 46031 = 2026-01-09 (Fri)
const build = (exceptions = "") => `(0||CalendarData()((0||DaysOfWeek()(${monFri}))(0||Exceptions()(${exceptions}))))`;
const weekOnly = (days: string) => `(0||CalendarData()((0||DaysOfWeek()(${days}))))`;
const day = (n: number, ...periods: Array<[string, string]>) =>
  `(0||${n}()(${periods.map(([s, f], i) => `(0||${i}(s|${s}|f|${f})())`).join("")}))`;

describe("parseCalendarData", () => {
  const data = build("(0||0(d|46023)())(0||1(d|46031)((0||0(s|08:00|f|12:00)())))");
  const p = parseCalendarData(data)!;

  test("reads the weekly pattern", () => {
    expect(p).not.toBeNull();
    expect(p.weekly[0]).toEqual([]); // Sunday
    expect(p.weekly[1]).toEqual([
      { start: 480, end: 720 },
      { start: 780, end: 1020 },
    ]);
    expect(p.weekly[6]).toEqual([]); // Saturday
    expect(averageWorkdayHours(p)).toBe(8);
  });

  test("reads non-working and shortened-day exceptions by date", () => {
    expect(periodsOn(p, new Date(2026, 0, 1))).toEqual([]); // holiday on a Thursday
    expect(periodsOn(p, new Date(2026, 0, 9))).toEqual([{ start: 480, end: 720 }]); // half day
    expect(periodsOn(p, new Date(2026, 0, 8))).toHaveLength(2); // ordinary Thursday
    expect(holidayCount(p)).toBe(1);
  });

  test("ignores whitespace, line breaks and control characters between tokens", () => {
    const messy = data.replace(/\)\(/g, ")\r\n  (").replace(/\(0\|\|Exceptions/, "\x7f\x7f(0||Exceptions");
    expect(parseCalendarData(messy)).toEqual(p);
    expect(parseCalendarData(data.replace(/\)\(/g, ")\x7f\x7f("))).toEqual(p);
  });

  test("treats a finish at or before the start as an overnight shift", () => {
    const night = weekOnly(day(2, ["22:00", "06:00"]));
    expect(parseCalendarData(night)!.weekly[1]).toEqual([{ start: 1320, end: 1800 }]);
  });

  test("returns null for empty, malformed or unrelated data", () => {
    expect(parseCalendarData("")).toBeNull();
    expect(parseCalendarData("not a calendar")).toBeNull();
    expect(parseCalendarData("(0||CalendarData()((0||DaysOfWeek()(")).toBeNull();
    expect(parseCalendarData("(0||Something()())")).toBeNull();
    expect(parseCalendarData("(0||CalendarData()())")).toBeNull(); // no DaysOfWeek
  });
});

describe("working-time helpers", () => {
  const p = parseCalendarData(build("(0||0(d|46023)())(0||1(d|46030)())"))!; // Thu 1 Jan and Thu 8 Jan off

  test("counts working days inclusively, skipping weekends and holidays", () => {
    // Mon 5 Jan → Fri 16 Jan = 10 weekdays, minus Thu 8 Jan
    expect(workingDaysBetween(p, new Date(2026, 0, 5).getTime(), new Date(2026, 0, 16).getTime())).toBe(9);
    expect(workingDaysBetween(p, new Date(2026, 0, 10).getTime(), new Date(2026, 0, 11).getTime())).toBe(0); // weekend
    expect(workingDaysBetween(p, new Date(2026, 0, 5, 8).getTime(), new Date(2026, 0, 5, 17).getTime())).toBe(1);
  });

  test("merges adjacent non-working days into runs", () => {
    const runs = nonWorkingRuns(p, new Date(2026, 0, 1).getTime(), new Date(2026, 0, 12).getTime());
    const d = (day: number) => new Date(2026, 0, day).getTime();
    expect(runs).toEqual([
      [d(1), d(2)], // Thu holiday
      [d(3), d(5)], // Sat–Sun
      [d(8), d(9)], // Thu holiday
      [d(10), d(12)], // Sat–Sun
    ]);
  });

  test("summarises the working week", () => {
    expect(summarizeWeek(p)).toBe("Mon–Fri 08:00–12:00, 13:00–17:00 (8h)");
    const sixDay = parseCalendarData(
      weekOnly(day(2, ["07:00", "17:00"]) + day(3, ["07:00", "17:00"]) + day(7, ["08:00", "12:00"])),
    )!;
    expect(summarizeWeek(sixDay)).toBe("Mon–Tue 07:00–17:00 (10h); Sat 08:00–12:00 (4h)");
  });
});

describe("calendars in the sample file", () => {
  const xer = parseXer(sampleText);
  const schedule = buildSchedule(xer, listProjects(xer)[0]!.id);

  test("the default calendar has a parsed Mon–Fri pattern with holidays", () => {
    const cal = schedule.defaultCalendar!;
    expect(cal.name).toBe("5 Day Workweek");
    expect(summarizeWeek(cal.pattern!)).toBe("Mon–Fri 08:00–12:00, 13:00–17:00 (8h)");
    expect(holidayCount(cal.pattern!)).toBe(14);
  });

  test("hours per day follow each activity's calendar", () => {
    const foundation = schedule.activities.find((a) => a.code === "FD1010")!;
    const design = schedule.activities.find((a) => a.code === "DE1000")!;
    expect(foundation.dayHrs).toBe(10);
    expect(design.dayHrs).toBe(8);
    expect(foundation.origDurHrs).toBe(120); // 12 days × 10h
  });

  test("scheduled dates never land on a holiday or weekend", () => {
    const pattern = schedule.defaultCalendar!.pattern!;
    for (const a of schedule.activities) {
      if (a.type === "loe" || a.start === null) continue;
      expect(periodsOn(pattern, new Date(a.start)).length).toBeGreaterThan(0);
    }
  });

  test("activity counts per calendar add up", () => {
    const total = [...schedule.calendarUsage.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(schedule.activities.length);
  });
});

describe("base calendar inheritance", () => {
  const xer = parseXer(
    [
      "ERMHDR\t8.4\t2024-01-15\tProject\tadmin\tdb\tPM\tUSD",
      "%T\tPROJECT\r\n%F\tproj_id\tproj_short_name\tclndr_id\r\n%R\t1\tA\t20",
      "%T\tCALENDAR\r\n%F\tclndr_id\tdefault_flag\tclndr_name\tbase_clndr_id\tclndr_type\tday_hr_cnt\tclndr_data",
      `%R\t10\tY\tGlobal\t\tCA_Base\t\t${build()}`,
      "%R\t20\tN\tProject copy\t10\tCA_Project\t\t",
      "%E",
    ].join("\r\n"),
  );
  const schedule = buildSchedule(xer, "1");

  test("a calendar without its own data uses its base calendar's pattern", () => {
    expect(schedule.calendars.get("20")!.pattern).toBe(schedule.calendars.get("10")!.pattern);
    expect(schedule.defaultCalendar!.id).toBe("20");
  });

  test("hours per day are derived from the pattern when P6 doesn't supply them", () => {
    expect(schedule.calendars.get("10")!.dayHrs).toBe(8);
  });
});
