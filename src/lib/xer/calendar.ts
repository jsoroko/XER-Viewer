/**
 * P6 calendar work patterns.
 *
 * The CALENDAR table's `clndr_data` column holds a nested, parenthesised structure:
 *
 *   (0||CalendarData()(
 *     (0||DaysOfWeek()(
 *       (0||1()())                                   ← 1 = Sunday … 7 = Saturday
 *       (0||2()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))
 *       …))
 *     (0||Exceptions()(
 *       (0||0(d|46023)())                            ← non-working day (Excel date serial)
 *       (0||1(d|46030)((0||0(s|08:00|f|12:00)())))   ← working exception
 *     ))))
 *
 * Whitespace and control characters (exports encode line breaks in several ways) are ignored.
 */

/** A work period in minutes from midnight. `end` may exceed 1440 for shifts that cross midnight. */
export interface Period {
  start: number;
  end: number;
}

export interface WorkPattern {
  /** Index 0 = Sunday … 6 = Saturday. */
  weekly: Period[][];
  /** Date-specific overrides, keyed by {@link dateKey}. An empty list means non-working. */
  exceptions: Map<number, Period[]>;
}

interface Node {
  name: string;
  args: string[];
  children: Node[];
}

const isJunk = (code: number) => code <= 32 || code === 127;

function parseNode(s: string, at: { i: number }): Node | null {
  const skip = () => {
    while (at.i < s.length && isJunk(s.charCodeAt(at.i))) at.i++;
  };
  skip();
  if (s[at.i] !== "(") return null;
  at.i++;

  // "<n>||<name>(" — the leading number is always 0 and carries no meaning.
  const sep = s.indexOf("||", at.i);
  if (sep < 0) return null;
  const nameEnd = s.indexOf("(", sep);
  if (nameEnd < 0) return null;
  const name = s.slice(sep + 2, nameEnd).trim();

  const argsEnd = s.indexOf(")", nameEnd);
  if (argsEnd < 0) return null;
  const args = s.slice(nameEnd + 1, argsEnd).split("|").map((a) => a.trim());
  at.i = argsEnd + 1;

  skip();
  if (s[at.i] !== "(") return null;
  at.i++;

  const children: Node[] = [];
  for (;;) {
    skip();
    if (s[at.i] === ")") {
      at.i++;
      break;
    }
    const child = parseNode(s, at);
    if (!child) return null;
    children.push(child);
  }

  skip();
  if (s[at.i] !== ")") return null;
  at.i++;
  return { name, args, children };
}

const argValue = (args: string[], key: string) => {
  for (let i = 0; i + 1 < args.length; i += 2) if (args[i] === key) return args[i + 1];
  return undefined;
};

function toMinutes(hhmm: string | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function periodsOf(nodes: Node[]): Period[] {
  const out: Period[] = [];
  for (const n of nodes) {
    const start = toMinutes(argValue(n.args, "s"));
    let end = toMinutes(argValue(n.args, "f"));
    if (start === null || end === null) continue;
    if (end <= start) end += 1440; // overnight shift
    out.push({ start, end });
  }
  return out.sort((a, b) => a.start - b.start);
}

export const dateKey = (d: Date) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

/** Excel/OLE date serial → local calendar date key (serial 1 is 1899-12-31 after the 1900 leap-year quirk). */
const keyFromSerial = (serial: number) => dateKey(new Date(1899, 11, 30 + Math.floor(serial)));

export function parseCalendarData(data: string): WorkPattern | null {
  if (!data) return null;
  const root = parseNode(data, { i: 0 });
  if (!root || root.name !== "CalendarData") return null;

  const weekly: Period[][] = Array.from({ length: 7 }, () => []);
  const exceptions = new Map<number, Period[]>();
  let sawWeek = false;

  for (const section of root.children) {
    if (section.name === "DaysOfWeek") {
      sawWeek = true;
      for (const day of section.children) {
        const n = Number(day.name);
        if (n >= 1 && n <= 7) weekly[n - 1] = periodsOf(day.children);
      }
    } else if (section.name === "Exceptions") {
      for (const ex of section.children) {
        const serial = Number(argValue(ex.args, "d"));
        if (Number.isFinite(serial)) exceptions.set(keyFromSerial(serial), periodsOf(ex.children));
      }
    }
  }
  return sawWeek ? { weekly, exceptions } : null;
}

const startOfDay = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
const nextDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

export function periodsOn(p: WorkPattern, d: Date): Period[] {
  return p.exceptions.get(dateKey(d)) ?? p.weekly[d.getDay()] ?? [];
}

const hoursOf = (periods: Period[]) => periods.reduce((n, x) => n + (x.end - x.start) / 60, 0);

/** Mean length of a working day, ignoring days off. */
export function averageWorkdayHours(p: WorkPattern): number | null {
  const days = p.weekly.map(hoursOf).filter((h) => h > 0);
  return days.length ? days.reduce((a, b) => a + b, 0) / days.length : null;
}

/** Number of dated exceptions that make a day non-working (holidays, shutdowns). */
export function holidayCount(p: WorkPattern): number {
  let n = 0;
  for (const periods of p.exceptions.values()) if (periods.length === 0) n++;
  return n;
}

/** Working days from `start` to `finish`, inclusive, honouring exceptions. */
export function workingDaysBetween(p: WorkPattern, start: number, finish: number): number {
  let n = 0;
  const last = startOfDay(finish).getTime();
  let guard = 0;
  for (let d = startOfDay(start); d.getTime() <= last && guard < 100_000; d = nextDay(d), guard++) {
    if (periodsOn(p, d).length > 0) n++;
  }
  return n;
}

/** Contiguous runs of non-working days as [from, to) epoch-ms ranges covering [from, to]. */
export function nonWorkingRuns(p: WorkPattern, from: number, to: number): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let runStart: number | null = null;
  let d = startOfDay(from);
  for (; d.getTime() < to; d = nextDay(d)) {
    const off = periodsOn(p, d).length === 0;
    if (off && runStart === null) runStart = d.getTime();
    else if (!off && runStart !== null) {
      runs.push([runStart, d.getTime()]);
      runStart = null;
    }
  }
  if (runStart !== null) runs.push([runStart, d.getTime()]);
  return runs;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hhmm = (min: number) => {
  const m = min === 1440 ? 1440 : min % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** e.g. "Mon–Fri 08:00–12:00, 13:00–17:00 (8h)". */
export function summarizeWeek(p: WorkPattern): string {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const groups: Array<{ first: number; last: number; sig: string; hours: number }> = [];
  for (const day of order) {
    const periods = p.weekly[day] ?? [];
    if (periods.length === 0) continue;
    const sig = periods.map((x) => `${hhmm(x.start)}–${hhmm(x.end)}`).join(", ");
    const prev = groups[groups.length - 1];
    if (prev && prev.sig === sig && order.indexOf(prev.last) === order.indexOf(day) - 1) prev.last = day;
    else groups.push({ first: day, last: day, sig, hours: hoursOf(periods) });
  }
  if (groups.length === 0) return "No working days";
  return groups
    .map((g) => {
      const days = g.first === g.last ? DAY_NAMES[g.first] : `${DAY_NAMES[g.first]}–${DAY_NAMES[g.last]}`;
      return `${days} ${g.sig} (${Number(g.hours.toFixed(1))}h)`;
    })
    .join("; ");
}
