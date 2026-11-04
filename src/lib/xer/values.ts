const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/;

/**
 * Parses "YYYY-MM-DD HH:mm" (local time, as P6 writes it) to epoch ms. A schedule has thousands of activities on each
 * date, so results are remembered by their text: building a Date (which has to resolve the local time zone) is the
 * expensive part. Bounded, so a file of unusual dates can't grow it without limit.
 */
const dateCache = new Map<string, number | null>();
const DATE_CACHE_MAX = 50_000;
export function parseDate(s: string): number | null {
  if (!s) return null;
  const hit = dateCache.get(s);
  if (hit !== undefined) return hit;
  const m = DATE_RE.exec(s);
  const ms = m ? new Date(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)).getTime() : null;
  if (dateCache.size >= DATE_CACHE_MAX) dateCache.clear();
  dateCache.set(s, ms);
  return ms;
}

export function parseNumber(s: string): number | null {
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
export const naturalCompare = (a: string, b: string) => collator.compare(a, b);

export const TASK_TYPE_LABEL: Record<string, string> = {
  TT_Task: "Task Dependent",
  TT_Rsrc: "Resource Dependent",
  TT_LOE: "Level of Effort",
  TT_Mile: "Start Milestone",
  TT_FinMile: "Finish Milestone",
  TT_WBS: "WBS Summary",
};

export const DURATION_TYPE_LABEL: Record<string, string> = {
  DT_FixedDUR2: "Fixed Duration & Units/Time",
  DT_FixedQty: "Fixed Units",
  DT_FixedDrtn: "Fixed Duration & Units",
  DT_FixedRate: "Fixed Units/Time",
};

export const PCT_TYPE_LABEL: Record<string, string> = {
  CP_Drtn: "Duration",
  CP_Phys: "Physical",
  CP_Units: "Units",
};

export const CONSTRAINT_LABEL: Record<string, string> = {
  CS_MSO: "Start On",
  CS_MSOA: "Start On or After",
  CS_MSOB: "Start On or Before",
  CS_MEO: "Finish On",
  CS_MEOA: "Finish On or After",
  CS_MEOB: "Finish On or Before",
  CS_MANDSTART: "Mandatory Start",
  CS_MANDFIN: "Mandatory Finish",
  CS_ALAP: "As Late As Possible",
};

export const CALENDAR_TYPE_LABEL: Record<string, string> = {
  CA_Base: "Global",
  CA_Project: "Project",
  CA_Rsrc: "Resource",
};

export const RESOURCE_TYPE_LABEL: Record<string, string> = {
  RT_Labor: "Labor",
  RT_Equip: "Nonlabor",
  RT_Mat: "Material",
};
