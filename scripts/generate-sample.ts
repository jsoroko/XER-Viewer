/**
 * Generates src/sample/sample.xer: a small but realistic P6 export used for the
 * "Try a sample" button and the tests. Dates and floats come from a real CPM
 * forward/backward pass so the Gantt chart and critical path look right.
 *
 *   bun scripts/generate-sample.ts
 */

const DAY_HRS = 8;
const DATA_DATE = new Date(2026, 3, 6, 8, 0); // Mon 6 Apr 2026

// Calendars: both are Mon–Fri and share holidays; the concrete calendar just works longer days.
const CAL_STANDARD = 2001;
const CAL_CONCRETE = 2002;
const HOURS_PER_DAY: Record<number, number> = { [CAL_STANDARD]: 8, [CAL_CONCRETE]: 10 };
const HOLIDAYS: Array<[number, number, number]> = [
  [2026, 1, 1], [2026, 1, 19], [2026, 2, 16], [2026, 5, 25], [2026, 6, 19], [2026, 7, 3],
  [2026, 9, 7], [2026, 10, 12], [2026, 11, 11], [2026, 11, 26], [2026, 12, 25],
  [2027, 1, 1], [2027, 1, 18], [2027, 2, 15],
];
const holidayKeys = new Set(HOLIDAYS.map(([y, m, d]) => y * 10000 + m * 100 + d));

interface Def {
  code: string;
  name: string;
  wbs: string;
  days: number; // working days; 0 = milestone
  preds?: Array<[string, ("FS" | "SS" | "FF" | "SF")?, number?]>;
  type?: "TT_Task" | "TT_Mile" | "TT_FinMile" | "TT_LOE";
  rsrc?: Array<[string, number]>; // [resource short name, qty]
  disc?: string;
}

const wbsTree = [
  { id: 1, parent: null, code: "RIV", name: "Riverside Office Building", seq: 0, root: true },
  { id: 2, parent: 1, code: "RIV.1", name: "Pre-Construction", seq: 10 },
  { id: 3, parent: 2, code: "RIV.1.1", name: "Design & Engineering", seq: 10 },
  { id: 4, parent: 2, code: "RIV.1.2", name: "Permits & Procurement", seq: 20 },
  { id: 5, parent: 1, code: "RIV.2", name: "Site Works", seq: 20 },
  { id: 6, parent: 1, code: "RIV.3", name: "Structure", seq: 30 },
  { id: 7, parent: 6, code: "RIV.3.1", name: "Foundations", seq: 10 },
  { id: 8, parent: 6, code: "RIV.3.2", name: "Superstructure", seq: 20 },
  { id: 9, parent: 1, code: "RIV.4", name: "Building Envelope", seq: 40 },
  { id: 10, parent: 1, code: "RIV.5", name: "MEP Installation", seq: 50 },
  { id: 11, parent: 1, code: "RIV.6", name: "Interior Fit-Out", seq: 60 },
  { id: 12, parent: 1, code: "RIV.7", name: "Commissioning & Handover", seq: 70 },
];
const wbsIdByCode = new Map(wbsTree.map((w) => [w.code, w.id]));

const defs: Def[] = [
  { code: "M0010", name: "Notice to Proceed", wbs: "RIV.1", days: 0, type: "TT_Mile" },
  { code: "DE1000", name: "Concept Design", wbs: "RIV.1.1", days: 15, preds: [["M0010"]], rsrc: [["ARCH", 120]], disc: "Design" },
  { code: "DE1010", name: "Structural Design", wbs: "RIV.1.1", days: 20, preds: [["DE1000"]], rsrc: [["ENG", 160]], disc: "Design" },
  { code: "DE1020", name: "MEP Design", wbs: "RIV.1.1", days: 20, preds: [["DE1000"]], rsrc: [["ENG", 160]], disc: "Design" },
  { code: "DE1030", name: "Facade Design", wbs: "RIV.1.1", days: 15, preds: [["DE1000"]], rsrc: [["ARCH", 120]], disc: "Design" },
  { code: "DE1040", name: "Design Coordination & Clash Detection", wbs: "RIV.1.1", days: 10, preds: [["DE1010"], ["DE1020"], ["DE1030"]], rsrc: [["ENG", 80]], disc: "Design" },
  { code: "PR1000", name: "Building Permit Application", wbs: "RIV.1.2", days: 30, preds: [["DE1000", "FS", 0]], rsrc: [["PM", 60]], disc: "Management" },
  { code: "PR1010", name: "Procure Rebar & Structural Steel", wbs: "RIV.1.2", days: 25, preds: [["DE1010"]], rsrc: [["PM", 40]], disc: "Procurement" },
  { code: "PR1020", name: "Procure Curtain Wall System", wbs: "RIV.1.2", days: 45, preds: [["DE1030"]], rsrc: [["PM", 40]], disc: "Procurement" },
  { code: "PR1030", name: "Procure MEP Equipment", wbs: "RIV.1.2", days: 40, preds: [["DE1020"]], rsrc: [["PM", 40]], disc: "Procurement" },
  { code: "M0020", name: "Permit Approved", wbs: "RIV.1.2", days: 0, type: "TT_Mile", preds: [["PR1000"]] },
  { code: "SW1000", name: "Site Mobilization", wbs: "RIV.2", days: 5, preds: [["M0020"]], rsrc: [["FORE", 40]], disc: "Civil" },
  { code: "SW1010", name: "Clearing & Grubbing", wbs: "RIV.2", days: 8, preds: [["SW1000"]], rsrc: [["EXC", 64], ["FORE", 16]], disc: "Civil" },
  { code: "SW1020", name: "Bulk Excavation", wbs: "RIV.2", days: 15, preds: [["SW1010"]], rsrc: [["EXC", 120]], disc: "Civil" },
  { code: "SW1030", name: "Temporary Shoring", wbs: "RIV.2", days: 10, preds: [["SW1020", "SS", 5]], rsrc: [["FORE", 80]], disc: "Civil" },
  { code: "SW1040", name: "Site Utilities - Underground", wbs: "RIV.2", days: 12, preds: [["SW1020"]], rsrc: [["ELEC", 96]], disc: "Civil" },
  { code: "FD1000", name: "Blinding & Waterproofing", wbs: "RIV.3.1", days: 6, preds: [["SW1020"], ["SW1030"]], rsrc: [["CONC", 48]], disc: "Structure" },
  { code: "FD1010", name: "Footing Rebar", wbs: "RIV.3.1", days: 12, preds: [["FD1000"], ["PR1010"]], rsrc: [["CONC", 96]], disc: "Structure" },
  { code: "FD1020", name: "Footing Formwork", wbs: "RIV.3.1", days: 8, preds: [["FD1000"]], rsrc: [["CARP", 64]], disc: "Structure" },
  { code: "FD1030", name: "Pour Footings", wbs: "RIV.3.1", days: 5, preds: [["FD1010"], ["FD1020"]], rsrc: [["CONC", 40], ["MAT-C", 180]], disc: "Structure" },
  { code: "FD1040", name: "Basement Walls", wbs: "RIV.3.1", days: 15, preds: [["FD1030"]], rsrc: [["CONC", 120], ["MAT-C", 220]], disc: "Structure" },
  { code: "FD1050", name: "Concrete Curing (Foundations)", wbs: "RIV.3.1", days: 7, preds: [["FD1040"]], disc: "Structure" },
  { code: "SS1000", name: "Ground Floor Slab", wbs: "RIV.3.2", days: 10, preds: [["FD1050"]], rsrc: [["CONC", 80], ["MAT-C", 260]], disc: "Structure" },
  { code: "SS1010", name: "Level 1 Columns & Slab", wbs: "RIV.3.2", days: 14, preds: [["SS1000"]], rsrc: [["CONC", 112], ["MAT-C", 240]], disc: "Structure" },
  { code: "SS1020", name: "Level 2 Columns & Slab", wbs: "RIV.3.2", days: 14, preds: [["SS1010"]], rsrc: [["CONC", 112], ["MAT-C", 240]], disc: "Structure" },
  { code: "SS1030", name: "Level 3 Columns & Slab", wbs: "RIV.3.2", days: 14, preds: [["SS1020"]], rsrc: [["CONC", 112], ["MAT-C", 240]], disc: "Structure" },
  { code: "SS1040", name: "Roof Slab", wbs: "RIV.3.2", days: 12, preds: [["SS1030"]], rsrc: [["CONC", 96], ["MAT-C", 200]], disc: "Structure" },
  { code: "SS1050", name: "Stair & Lift Cores", wbs: "RIV.3.2", days: 20, preds: [["SS1010", "SS", 5]], rsrc: [["CONC", 160]], disc: "Structure" },
  { code: "M0030", name: "Structure Topped Out", wbs: "RIV.3.2", days: 0, type: "TT_FinMile", preds: [["SS1040"], ["SS1050"]] },
  { code: "EN1000", name: "Roof Waterproofing", wbs: "RIV.4", days: 10, preds: [["SS1040"]], rsrc: [["FORE", 80]], disc: "Envelope" },
  { code: "EN1010", name: "Curtain Wall Install - Level 1-2", wbs: "RIV.4", days: 18, preds: [["SS1020"], ["PR1020"]], rsrc: [["GLAZ", 144]], disc: "Envelope" },
  { code: "EN1020", name: "Curtain Wall Install - Level 3-Roof", wbs: "RIV.4", days: 18, preds: [["EN1010"], ["SS1040"]], rsrc: [["GLAZ", 144]], disc: "Envelope" },
  { code: "EN1030", name: "External Cladding", wbs: "RIV.4", days: 20, preds: [["EN1010", "SS", 8]], rsrc: [["GLAZ", 160]], disc: "Envelope" },
  { code: "EN1040", name: "Building Weathertight", wbs: "RIV.4", days: 0, type: "TT_Mile", preds: [["EN1020"], ["EN1030"], ["EN1000"]] },
  { code: "ME1000", name: "MEP Rough-In - Level 1", wbs: "RIV.5", days: 15, preds: [["SS1010"], ["PR1030"]], rsrc: [["ELEC", 120], ["PLMB", 120]], disc: "MEP" },
  { code: "ME1010", name: "MEP Rough-In - Level 2", wbs: "RIV.5", days: 15, preds: [["ME1000", "SS", 8], ["SS1020"]], rsrc: [["ELEC", 120], ["PLMB", 120]], disc: "MEP" },
  { code: "ME1020", name: "MEP Rough-In - Level 3", wbs: "RIV.5", days: 15, preds: [["ME1010", "SS", 8], ["SS1030"]], rsrc: [["ELEC", 120], ["PLMB", 120]], disc: "MEP" },
  { code: "ME1030", name: "Install HVAC Plant on Roof", wbs: "RIV.5", days: 10, preds: [["SS1040"], ["PR1030"]], rsrc: [["EXC", 40], ["PLMB", 80]], disc: "MEP" },
  { code: "ME1040", name: "Main Switchgear & Distribution", wbs: "RIV.5", days: 12, preds: [["ME1000"]], rsrc: [["ELEC", 96]], disc: "MEP" },
  { code: "ME1050", name: "Fire Protection & Sprinklers", wbs: "RIV.5", days: 18, preds: [["ME1020"]], rsrc: [["PLMB", 144]], disc: "MEP" },
  { code: "ME1060", name: "MEP Second Fix", wbs: "RIV.5", days: 25, preds: [["ME1020"], ["EN1040"]], rsrc: [["ELEC", 200], ["PLMB", 200]], disc: "MEP" },
  { code: "IN1000", name: "Partition Framing - Level 1-3", wbs: "RIV.6", days: 20, preds: [["EN1040"], ["ME1020", "SS", 5]], rsrc: [["CARP", 160]], disc: "Interiors" },
  { code: "IN1010", name: "Drywall & Taping", wbs: "RIV.6", days: 20, preds: [["IN1000"], ["ME1050", "FS", -5]], rsrc: [["CARP", 160]], disc: "Interiors" },
  { code: "IN1020", name: "Ceiling Grid & Tiles", wbs: "RIV.6", days: 15, preds: [["IN1010"], ["ME1060", "SS", 10]], rsrc: [["CARP", 120]], disc: "Interiors" },
  { code: "IN1030", name: "Flooring", wbs: "RIV.6", days: 15, preds: [["IN1010"]], rsrc: [["CARP", 120]], disc: "Interiors" },
  { code: "IN1040", name: "Painting & Decoration", wbs: "RIV.6", days: 18, preds: [["IN1010"]], rsrc: [["PAINT", 144]], disc: "Interiors" },
  { code: "IN1050", name: "Doors, Joinery & Ironmongery", wbs: "RIV.6", days: 12, preds: [["IN1040", "SS", 6]], rsrc: [["CARP", 96]], disc: "Interiors" },
  { code: "CM1000", name: "HVAC Commissioning", wbs: "RIV.7", days: 15, preds: [["ME1060"], ["ME1030"], ["IN1020"]], rsrc: [["ENG", 120]], disc: "Commissioning" },
  { code: "CM1010", name: "Electrical Testing & Energization", wbs: "RIV.7", days: 10, preds: [["ME1040"], ["ME1060"]], rsrc: [["ELEC", 80]], disc: "Commissioning" },
  { code: "CM1020", name: "Fire Alarm Acceptance Test", wbs: "RIV.7", days: 5, preds: [["CM1010"], ["ME1050"]], rsrc: [["ENG", 40]], disc: "Commissioning" },
  { code: "CM1030", name: "Snagging & Defect Rectification", wbs: "RIV.7", days: 15, preds: [["IN1030"], ["IN1050"], ["IN1020"]], rsrc: [["FORE", 120]], disc: "Commissioning" },
  { code: "CM1040", name: "Client Inspection & Sign-Off", wbs: "RIV.7", days: 5, preds: [["CM1000"], ["CM1020"], ["CM1030"]], rsrc: [["PM", 40]], disc: "Management" },
  { code: "CM1050", name: "Occupancy Certificate", wbs: "RIV.7", days: 10, preds: [["CM1040"]], rsrc: [["PM", 40]], disc: "Management" },
  { code: "M0090", name: "Practical Completion", wbs: "RIV.7", days: 0, type: "TT_FinMile", preds: [["CM1050"]] },
  { code: "LOE100", name: "Project Management", wbs: "RIV.1", days: 0, type: "TT_LOE", preds: [["M0010", "SS"], ["M0090", "FF"]], rsrc: [["PM", 1400]], disc: "Management" },
  { code: "LOE110", name: "Site Supervision", wbs: "RIV.2", days: 0, type: "TT_LOE", preds: [["SW1000", "SS"], ["CM1030", "FF"]], rsrc: [["FORE", 2200]], disc: "Management" },
];

// ---- Working-day calendar helpers (Mon–Fri, minus holidays) -------------------------
const isWorkday = (d: Date) =>
  d.getDay() !== 0 && d.getDay() !== 6 && !holidayKeys.has(d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
function snapForward(d: Date): Date {
  let x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  while (!isWorkday(x)) x = addDays(x, 1);
  return x;
}
function addWorkdays(d: Date, n: number): Date {
  let x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const step = n < 0 ? -1 : 1;
  for (let left = Math.abs(n); left > 0; ) {
    x = addDays(x, step);
    if (isWorkday(x)) left--;
  }
  return x;
}
function workdaysBetween(a: Date, b: Date): number {
  // signed count of workdays from a to b (exclusive of a)
  const step = b >= a ? 1 : -1;
  let n = 0;
  let x = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  while (x.getTime() !== end.getTime()) {
    x = addDays(x, step);
    if (isWorkday(x)) n += step;
  }
  return n;
}

// ---- CPM --------------------------------------------------------------------------
const byCode = new Map(defs.map((d) => [d.code, d]));
const order: Def[] = [];
{
  const seen = new Set<string>();
  const visit = (d: Def) => {
    if (seen.has(d.code)) return;
    seen.add(d.code);
    for (const [p] of d.preds ?? []) visit(byCode.get(p)!);
    order.push(d);
  };
  defs.forEach(visit);
}

const PROJECT_START = new Date(2026, 0, 5); // Mon 5 Jan 2026
interface Sched {
  es: Date; // first working day it occupies (or the milestone day)
  ef: Date; // last working day it occupies
  ls: Date;
  lf: Date;
  tf: number;
}
const sched = new Map<string, Sched>();
const isMile = (d: Def) => d.days === 0 && d.type !== "TT_LOE";

for (const d of order) {
  if (d.type === "TT_LOE") continue;
  let es = snapForward(PROJECT_START);
  for (const [pc, rel = "FS", lag = 0] of d.preds ?? []) {
    const p = sched.get(pc);
    if (!p) continue; // LOE preds are ignored
    const pd = byCode.get(pc)!;
    let c: Date;
    if (rel === "FS") c = isMile(pd) ? p.ef : addWorkdays(p.ef, 1);
    else if (rel === "SS") c = p.es;
    else if (rel === "FF") c = addWorkdays(p.ef, -(Math.max(d.days, 1) - 1));
    else c = addWorkdays(p.es, -(Math.max(d.days, 1) - 1) + 0);
    c = lag === 0 ? c : addWorkdays(c, lag);
    if (c > es) es = snapForward(c);
  }
  const ef = isMile(d) ? es : addWorkdays(es, d.days - 1);
  sched.set(d.code, { es, ef, ls: es, lf: ef, tf: 0 });
}
const projectFinish = [...sched.values()].reduce((m, s) => (s.ef > m ? s.ef : m), PROJECT_START);

// Backward pass (FS logic only is enough for float purposes here).
const succs = new Map<string, Array<{ code: string; rel: string; lag: number }>>();
for (const d of defs)
  for (const [pc, rel = "FS", lag = 0] of d.preds ?? []) {
    if (!sched.has(pc) || !sched.has(d.code)) continue;
    if (!succs.has(pc)) succs.set(pc, []);
    succs.get(pc)!.push({ code: d.code, rel, lag });
  }
for (const d of [...order].reverse()) {
  const s = sched.get(d.code);
  if (!s) continue;
  let lf = projectFinish;
  for (const sc of succs.get(d.code) ?? []) {
    const ss = sched.get(sc.code)!;
    const sd = byCode.get(sc.code)!;
    let cand: Date;
    if (sc.rel === "FS") cand = isMile(sd) ? ss.ls : addWorkdays(ss.ls, -1);
    else if (sc.rel === "SS") cand = addWorkdays(ss.ls, Math.max(d.days, 1) - 1);
    else if (sc.rel === "FF") cand = ss.lf;
    else cand = addWorkdays(ss.lf, Math.max(d.days, 1) - 1);
    if (sc.lag) cand = addWorkdays(cand, -sc.lag);
    if (cand < lf) lf = cand;
  }
  s.lf = lf;
  s.ls = isMile(d) ? lf : addWorkdays(lf, -(d.days - 1));
  s.tf = Math.max(0, workdaysBetween(s.ef, s.lf));
}

// ---- XER writer --------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date | null, h = 8) =>
  d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(h)}:00` : "";
const start = (d: Date) => fmt(d, 8);
const finish = (d: Date) => fmt(d, 17);

const out: string[] = [];
const table = (name: string, fields: string[], rows: Array<Array<string | number>>) => {
  out.push(`%T\t${name}`, `%F\t${fields.join("\t")}`);
  for (const r of rows) out.push(`%R\t${r.join("\t")}`);
};

out.push(["ERMHDR", "20.12", "2026-04-06", "Project", "admin", "PMDB_Sample", "Project Management", "USD"].join("\t"));

table("CURRTYPE", ["curr_id", "decimal_digit_cnt", "curr_symbol", "decimal_symbol", "digit_group_symbol", "pos_curr_fmt_type", "neg_curr_fmt_type", "curr_type", "curr_short_name", "group_digit_cnt", "base_exch_rate"], [
  [1, 2, "$", ".", ",", "#1.1", "(#1.1)", "US Dollar", "USD", 3, 1],
]);

const pid = 1001;
table("PROJECT", ["proj_id", "proj_short_name", "clndr_id", "last_recalc_date", "plan_start_date", "scd_end_date", "critical_drtn_hr_cnt", "critical_path_type", "def_complete_pct_type", "guid"], [
  [pid, "RIVERSIDE", 2001, fmt(DATA_DATE, 8), start(PROJECT_START), finish(projectFinish), 0, "CT_TotFloat", "CP_Drtn", "8F2B6C1E9A7D4E5F8B3A1C2D4E6F7A8B"],
]);

// P6's `clndr_data`: 1 = Sunday … 7 = Saturday; exceptions are Excel date serials.
const serial = ([y, m, d]: [number, number, number]) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000);
function calendarData(periods: Array<[string, string]>): string {
  const shifts = periods.map(([s, f], i) => `(0||${i}(s|${s}|f|${f})())`).join("");
  const week = [1, 2, 3, 4, 5, 6, 7]
    .map((n) => (n >= 2 && n <= 6 ? `(0||${n}()(${shifts}))` : `(0||${n}()())`))
    .join("");
  const exceptions = HOLIDAYS.map((h, i) => `(0||${i}(d|${serial(h)})())`).join("");
  return `(0||CalendarData()((0||DaysOfWeek()(${week}))(0||VIEW(ShowTotal|Y)())(0||Exceptions()(${exceptions}))))`;
}

table("CALENDAR", ["clndr_id", "default_flag", "clndr_name", "proj_id", "base_clndr_id", "clndr_type", "day_hr_cnt", "week_hr_cnt", "month_hr_cnt", "year_hr_cnt", "rsrc_private", "clndr_data"], [
  [CAL_STANDARD, "Y", "5 Day Workweek", "", "", "CA_Base", 8, 40, 172, 2000, "N", calendarData([["08:00", "12:00"], ["13:00", "17:00"]])],
  [CAL_CONCRETE, "N", "5 Day - 10h (Concrete)", "", "", "CA_Base", 10, 50, 215, 2500, "N", calendarData([["07:00", "12:00"], ["13:00", "18:00"]])],
]);

const rsrcDefs: Array<[number, string, string, string]> = [
  [3001, "Project Manager", "PM", "RT_Labor"],
  [3002, "Architect", "ARCH", "RT_Labor"],
  [3003, "Design Engineer", "ENG", "RT_Labor"],
  [3004, "Site Foreman", "FORE", "RT_Labor"],
  [3005, "Concrete Crew", "CONC", "RT_Labor"],
  [3006, "Carpenter", "CARP", "RT_Labor"],
  [3007, "Electrician", "ELEC", "RT_Labor"],
  [3008, "Plumber / Pipefitter", "PLMB", "RT_Labor"],
  [3009, "Glazier", "GLAZ", "RT_Labor"],
  [3010, "Painter", "PAINT", "RT_Labor"],
  [3011, "Excavator & Crane", "EXC", "RT_Equip"],
  [3012, "Ready-Mix Concrete (m³)", "MAT-C", "RT_Mat"],
];
const rate: Record<string, number> = { PM: 85, ARCH: 95, ENG: 80, FORE: 60, CONC: 48, CARP: 50, ELEC: 62, PLMB: 60, GLAZ: 58, PAINT: 44, EXC: 120, "MAT-C": 145 };
table("RSRC", ["rsrc_id", "rsrc_name", "rsrc_short_name", "rsrc_type", "clndr_id", "active_flag", "def_qty_per_hr", "curr_id"],
  rsrcDefs.map(([id, name, short, type]) => [id, name, short, type, 2001, "Y", 1, 1]));

table("PROJWBS", ["wbs_id", "proj_id", "seq_num", "proj_node_flag", "wbs_short_name", "wbs_name", "parent_wbs_id", "status_code"],
  wbsTree.map((w) => [4000 + w.id, pid, w.seq, w.root ? "Y" : "N", w.code, w.name, w.parent ? 4000 + w.parent : "", "WS_Open"]));

// Progress against the data date.
const dd = snapForward(DATA_DATE);
const taskId = new Map(defs.map((d, i) => [d.code, 5001 + i]));
const taskRows: Array<Array<string | number>> = [];
const state = new Map<string, "done" | "active" | "todo">();

for (const d of defs) {
  const id = taskId.get(d.code)!;
  const wbsId = 4000 + wbsIdByCode.get(d.wbs)!;
  const s = sched.get(d.code);
  const cal = d.wbs.startsWith("RIV.3") ? CAL_CONCRETE : CAL_STANDARD;
  const hpd = HOURS_PER_DAY[cal]!;
  const dur = d.days * hpd;

  if (d.type === "TT_LOE") {
    const first = sched.get("M0010")!;
    const last = projectFinish;
    const loeHrs = (workdaysBetween(first.es, last) + 1) * DAY_HRS;
    taskRows.push([
      id, pid, wbsId, CAL_STANDARD, d.code, d.name, "TT_LOE", "TK_Active", "CP_Drtn", "DT_FixedDUR2",
      start(first.es), "",
      start(first.es), finish(last),
      start(first.es), finish(last),
      start(first.es), finish(last),
      "", "", "", "",
      0, 0,
      loeHrs, Math.max(DAY_HRS, workdaysBetween(dd, last) * DAY_HRS),
    ]);
    state.set(d.code, "active");
    continue;
  }

  const es = s!.es;
  const ef = s!.ef;
  let status = "TK_NotStart";
  let actStart = "";
  let actEnd = "";
  let remDur = dur;
  const mile = isMile(d);

  if (ef < dd || (mile && es <= dd)) {
    status = "TK_Complete";
    actStart = start(es);
    actEnd = mile ? start(es) : finish(ef);
    remDur = 0;
    state.set(d.code, "done");
  } else if (es < dd) {
    status = "TK_Active";
    actStart = start(es);
    remDur = Math.max(hpd, workdaysBetween(dd, ef) * hpd + hpd);
    state.set(d.code, "active");
  } else {
    state.set(d.code, "todo");
  }

  const tfHrs = s!.tf * hpd;
  const isDone = status === "TK_Complete";
  const startTxt = mile && d.type === "TT_FinMile" ? finish(es) : start(es);
  const endTxt = mile ? (d.type === "TT_FinMile" ? finish(ef) : start(ef)) : finish(ef);
  const lateStartTxt = mile && d.type === "TT_FinMile" ? finish(s!.ls) : start(s!.ls);
  const lateEndTxt = mile ? (d.type === "TT_FinMile" ? finish(s!.lf) : start(s!.lf)) : finish(s!.lf);

  taskRows.push([
    id, pid, wbsId, cal, d.code, d.name,
    d.type ?? "TT_Task", status, "CP_Drtn", "DT_FixedDUR2",
    actStart, actEnd,
    isDone ? "" : startTxt, isDone ? "" : endTxt,
    lateStartTxt, lateEndTxt,
    startTxt, endTxt,
    "", "", "", "",
    isDone ? 0 : tfHrs, isDone ? 0 : tfHrs,
    dur, remDur,
  ]);
}

table("TASK", [
  "task_id", "proj_id", "wbs_id", "clndr_id", "task_code", "task_name",
  "task_type", "status_code", "complete_pct_type", "duration_type",
  "act_start_date", "act_end_date",
  "early_start_date", "early_end_date",
  "late_start_date", "late_end_date",
  "target_start_date", "target_end_date",
  "cstr_date", "cstr_type", "cstr_date2", "cstr_type2",
  "total_float_hr_cnt", "free_float_hr_cnt",
  "target_drtn_hr_cnt", "remain_drtn_hr_cnt",
], taskRows);

const predRows: Array<Array<string | number>> = [];
let predId = 7001;
const REL = { FS: "PR_FS", SS: "PR_SS", FF: "PR_FF", SF: "PR_SF" } as const;
for (const d of defs)
  for (const [pc, rel = "FS", lag = 0] of d.preds ?? [])
    predRows.push([predId++, taskId.get(d.code)!, taskId.get(pc)!, pid, pid, REL[rel], lag * (d.wbs.startsWith("RIV.3") ? HOURS_PER_DAY[CAL_CONCRETE]! : DAY_HRS)]);
table("TASKPRED", ["task_pred_id", "task_id", "pred_task_id", "proj_id", "pred_proj_id", "pred_type", "lag_hr_cnt"], predRows);

const rsrcId = new Map(rsrcDefs.map(([id, , short]) => [short, id]));
const assignRows: Array<Array<string | number>> = [];
let assignId = 8001;
for (const d of defs) {
  const st = state.get(d.code)!;
  for (const [short, qty] of d.rsrc ?? []) {
    const cost = qty * (rate[short] ?? 50);
    const spent = st === "done" ? qty : st === "active" ? Math.round(qty * 0.45) : 0;
    assignRows.push([
      assignId++, taskId.get(d.code)!, pid, rsrcId.get(short)!, qty, rate[short] ?? 50, cost,
      spent, spent * (rate[short] ?? 50), qty - spent, (qty - spent) * (rate[short] ?? 50),
      start(sched.get(d.code)?.es ?? PROJECT_START), finish(sched.get(d.code)?.ef ?? projectFinish),
    ]);
  }
}
table("TASKRSRC", ["taskrsrc_id", "task_id", "proj_id", "rsrc_id", "target_qty", "cost_per_qty", "target_cost", "act_reg_qty", "act_reg_cost", "remain_qty", "remain_cost", "target_start_date", "target_end_date"], assignRows);

const discs = [...new Set(defs.map((d) => d.disc).filter(Boolean))] as string[];
table("ACTVTYPE", ["actv_code_type_id", "actv_short_len", "seq_num", "actv_code_type", "proj_id", "actv_code_type_scope"], [
  [9001, 10, 10, "Discipline", pid, "AS_Project"],
]);
table("ACTVCODE", ["actv_code_id", "parent_actv_code_id", "actv_code_type_id", "actv_code_name", "short_name", "seq_num"],
  discs.map((n, i) => [9101 + i, "", 9001, n, n.slice(0, 4).toUpperCase(), (i + 1) * 10]));
table("TASKACTV", ["task_id", "actv_code_type_id", "actv_code_id", "proj_id"],
  defs.filter((d) => d.disc).map((d) => [taskId.get(d.code)!, 9001, 9101 + discs.indexOf(d.disc!), pid]));

out.push("%E");
const path = new URL("../src/sample/sample.xer", import.meta.url).pathname;
await Bun.write(path, out.join("\r\n") + "\r\n");
console.log(`Wrote ${path} — ${defs.length} activities, ${predRows.length} relationships, finish ${finish(projectFinish)}`);
