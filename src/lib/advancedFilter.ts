import { wbsBranch, type Activity, type Schedule } from "./xer/model";

/**
 * User-built filters: any number of conditions ("field  operator  value"), combined with AND or OR.
 *
 * Every field is text. Activity-code fields (Activity ID / Code / Name / Type ID / Type Name) can hold several
 * values per activity, because an activity can carry one code per code type. For those, a positive operator
 * (equals, contains, starts / ends with) passes if ANY value matches, while a negative one (does not equal /
 * contain) passes only if NO value matches. Each condition is checked on its own.
 *
 * The WBS fields are multi-valued in the same way: an activity has the id / code / name of its own WBS group and of
 * every group above it, so "WBS Name contains WP23" finds everything inside a WP23 group, however deep.
 */

export type Operator =
  | "equals"
  | "notEquals"
  | "contains"
  | "notContains"
  | "startsWith"
  | "endsWith"
  | "isEmpty"
  | "notEmpty";

export interface FieldDef {
  id: string;
  label: string;
  group: string;
  /** Offer the values found in the schedule as suggestions while typing. */
  suggest?: boolean;
}

export interface Condition {
  id: number;
  field: string;
  op: Operator;
  value: string;
}

export interface AdvancedFilter {
  mode: "all" | "any";
  conditions: Condition[];
}

export const EMPTY_FILTER: AdvancedFilter = { mode: "all", conditions: [] };

let nextConditionId = 1;
export const newCondition = (field = "taskCode", op: Operator = "contains", value = ""): Condition => ({
  id: nextConditionId++,
  field,
  op,
  value,
});

// ---- Operators -------------------------------------------------------------------------------------

export interface OperatorDef {
  op: Operator;
  label: string;
  needsValue: boolean;
}

export const OPERATORS: OperatorDef[] = [
  { op: "equals", label: "equals", needsValue: true },
  { op: "notEquals", label: "does not equal", needsValue: true },
  { op: "contains", label: "contains", needsValue: true },
  { op: "notContains", label: "does not contain", needsValue: true },
  { op: "startsWith", label: "starts with", needsValue: true },
  { op: "endsWith", label: "ends with", needsValue: true },
  { op: "isEmpty", label: "is empty", needsValue: false },
  { op: "notEmpty", label: "is not empty", needsValue: false },
];

// ---- Fields ----------------------------------------------------------------------------------------
// Names follow the P6 tables they come from: activity codes (ACTVCODE / ACTVTYPE), the task (TASK), the WBS (PROJWBS).

interface Def extends FieldDef {
  values: (a: Activity, schedule: Schedule) => string[];
}

const codesOf = (a: Activity, s: Schedule) => s.codes.get(a.id) ?? [];
/** The activity's own WBS group and every group above it (not the project root); see wbsBranch. */
const branchOf = (a: Activity, s: Schedule) => wbsBranch(s, a.wbsId);

const DEFS: Def[] = [
  { id: "actvId", label: "Activity ID", group: "Activity codes", values: (a, s) => codesOf(a, s).map((v) => v.id) },
  { id: "actvCode", label: "Activity Code", group: "Activity codes", suggest: true, values: (a, s) => codesOf(a, s).map((v) => v.code) },
  { id: "actvName", label: "Activity Name", group: "Activity codes", suggest: true, values: (a, s) => codesOf(a, s).map((v) => v.description) },
  { id: "actvTypeId", label: "Activity Type ID", group: "Activity codes", values: (a, s) => codesOf(a, s).map((v) => v.typeId) },
  { id: "actvTypeName", label: "Activity Type Name", group: "Activity codes", suggest: true, values: (a, s) => codesOf(a, s).map((v) => v.typeName) },

  { id: "taskId", label: "Task ID", group: "Task", values: (a) => [a.id] },
  { id: "taskCode", label: "Task Code", group: "Task", values: (a) => [a.code] },
  { id: "taskName", label: "Task Name", group: "Task", values: (a) => [a.name] },

  { id: "wbsId", label: "WBS ID", group: "WBS", values: (a, s) => branchOf(a, s).map((n) => n.id) },
  { id: "wbsCode", label: "WBS Code", group: "WBS", suggest: true, values: (a, s) => branchOf(a, s).map((n) => n.code) },
  { id: "wbsName", label: "WBS Name", group: "WBS", suggest: true, values: (a, s) => branchOf(a, s).map((n) => n.name) },
];

const BY_ID = new Map(DEFS.map((d) => [d.id, d]));

/** The fields the user can pick, in display order. */
export const FIELDS: FieldDef[] = DEFS;

export function fieldGroups(fields: FieldDef[] = FIELDS): Array<{ group: string; fields: FieldDef[] }> {
  const groups: Array<{ group: string; fields: FieldDef[] }> = [];
  for (const f of fields) {
    const last = groups[groups.length - 1];
    if (last && last.group === f.group) last.fields.push(f);
    else groups.push({ group: f.group, fields: [f] });
  }
  return groups;
}

/** Distinct values found in the schedule for a field, for autocomplete. */
export function suggestValues(schedule: Schedule, fieldId: string, limit = 300): string[] {
  const def = BY_ID.get(fieldId);
  if (!def?.suggest) return [];
  const seen = new Set<string>();
  for (const a of schedule.activities) {
    for (const v of def.values(a, schedule)) {
      const t = v.trim();
      if (t) seen.add(t);
    }
    if (seen.size >= limit) break;
  }
  return [...seen].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// ---- Evaluation ------------------------------------------------------------------------------------

const norm = (s: string) => s.trim().toLowerCase();

function test(op: Operator, values: string[], needle: string): boolean {
  const vals = values.map(norm).filter((v) => v !== "");
  const n = norm(needle);
  switch (op) {
    case "isEmpty":
      return vals.length === 0;
    case "notEmpty":
      return vals.length > 0;
    case "equals":
      return vals.some((v) => v === n);
    case "contains":
      return vals.some((v) => v.includes(n));
    case "startsWith":
      return vals.some((v) => v.startsWith(n));
    case "endsWith":
      return vals.some((v) => v.endsWith(n));
    case "notEquals":
      return !vals.some((v) => v === n);
    case "notContains":
      return !vals.some((v) => v.includes(n));
    default:
      return false;
  }
}

/**
 * Turns one condition into a check, or null while it is incomplete (e.g. "contains" with nothing typed yet).
 * Incomplete conditions are ignored rather than matching nothing, so the list doesn't empty as you type.
 */
function compileCondition(c: Condition, schedule: Schedule): ((a: Activity) => boolean) | null {
  const def = BY_ID.get(c.field);
  const opDef = OPERATORS.find((o) => o.op === c.op);
  if (!def || !opDef) return null;
  const value = c.value.trim();
  if (opDef.needsValue && value === "") return null;
  return (a) => test(c.op, def.values(a, schedule), value);
}

export interface CompiledFilter {
  /** Null when there is nothing to filter by. */
  predicate: ((a: Activity) => boolean) | null;
  /** How many conditions are complete enough to apply. */
  active: number;
}

export function compileFilter(schedule: Schedule, filter: AdvancedFilter): CompiledFilter {
  const tests = filter.conditions
    .map((c) => compileCondition(c, schedule))
    .filter((t): t is (a: Activity) => boolean => t !== null);
  if (tests.length === 0) return { predicate: null, active: 0 };
  return {
    active: tests.length,
    predicate: filter.mode === "all" ? (a) => tests.every((t) => t(a)) : (a) => tests.some((t) => t(a)),
  };
}
