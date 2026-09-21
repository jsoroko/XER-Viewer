import { averageWorkdayHours, parseCalendarData, type WorkPattern } from "./calendar";
import { reader, type XerFile } from "./parse";
import { naturalCompare, parseDate, parseNumber } from "./values";

export type ActivityStatus = "not-started" | "in-progress" | "completed";
export type ActivityType =
  | "task"
  | "resource"
  | "loe"
  | "start-milestone"
  | "finish-milestone"
  | "wbs-summary";
export type RelationshipType = "FS" | "SS" | "FF" | "SF";

export interface Project {
  id: string;
  shortName: string;
  name: string;
  plannedStart: number | null;
  scheduledFinish: number | null;
  dataDate: number | null;
  defaultCalendarId: string;
  /** Activities with total float at or below this many hours are critical. */
  criticalFloatHrs: number;
  criticalByDrivingPath: boolean;
}

export interface Calendar {
  id: string;
  name: string;
  type: string;
  /** Hours per day used to convert hour-based durations to days (P6's own setting when present). */
  dayHrs: number;
  weekHrs: number;
  isDefault: boolean;
  /** Work pattern parsed from `clndr_data`, inherited from the base calendar when absent; null if unreadable. */
  pattern: WorkPattern | null;
}

export interface Activity {
  id: string;
  projectId: string;
  wbsId: string;
  calendarId: string;
  code: string;
  name: string;
  type: ActivityType;
  typeRaw: string;
  status: ActivityStatus;
  durationType: string;
  pctType: string;
  percent: number;
  origDurHrs: number | null;
  remDurHrs: number | null;
  totalFloatHrs: number | null;
  freeFloatHrs: number | null;
  actualStart: number | null;
  actualFinish: number | null;
  earlyStart: number | null;
  earlyFinish: number | null;
  lateStart: number | null;
  lateFinish: number | null;
  targetStart: number | null;
  targetFinish: number | null;
  constraintType: string;
  constraintDate: number | null;
  constraint2Type: string;
  constraint2Date: number | null;
  primaryResourceId: string;
  /** Date the bar begins / ends on the Gantt chart. */
  start: number | null;
  finish: number | null;
  critical: boolean;
  dayHrs: number;
}

export interface Relationship {
  id: string;
  taskId: string;
  predTaskId: string;
  type: RelationshipType;
  lagHrs: number;
}

export interface Resource {
  id: string;
  name: string;
  shortName: string;
  type: string;
}

export interface Assignment {
  id: string;
  taskId: string;
  resourceId: string;
  resourceName: string;
  resourceType: string;
  budgetedQty: number | null;
  actualQty: number | null;
  remainingQty: number | null;
  budgetedCost: number | null;
  actualCost: number | null;
  remainingCost: number | null;
  start: number | null;
  finish: number | null;
}

export interface ActivityCodeValue {
  /** actv_code_id */
  id: string;
  /** actv_code_type_id */
  typeId: string;
  /** actv_code_type */
  typeName: string;
  /** short_name */
  code: string;
  /** actv_code_name */
  description: string;
}

export interface WbsNode {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  seq: number;
  isProjectRoot: boolean;
  children: WbsNode[];
  activities: Activity[];
  /** Rolled-up bar dates across all descendant activities. */
  start: number | null;
  finish: number | null;
  activityCount: number;
}

export interface ScheduleStats {
  activities: number;
  byStatus: Record<ActivityStatus, number>;
  milestones: number;
  levelOfEffort: number;
  critical: number;
  wbsNodes: number;
  relationships: number;
  byRelationshipType: Record<RelationshipType, number>;
  assignments: number;
  resources: number;
  calendars: number;
  /** Duration-weighted overall percent complete. */
  overallPercent: number;
  missingPredecessors: number;
  missingSuccessors: number;
}

export interface Schedule {
  project: Project;
  roots: WbsNode[];
  wbs: Map<string, WbsNode>;
  activities: Activity[];
  /** All activities in the file, keyed by id (relationships can cross projects). */
  activityById: Map<string, Activity>;
  calendars: Map<string, Calendar>;
  /** The project's default calendar; drives non-working-time shading on the Gantt chart. */
  defaultCalendar: Calendar | undefined;
  /** Number of this project's activities on each calendar. */
  calendarUsage: Map<string, number>;
  resources: Map<string, Resource>;
  predecessors: Map<string, Relationship[]>;
  successors: Map<string, Relationship[]>;
  assignments: Map<string, Assignment[]>;
  codes: Map<string, ActivityCodeValue[]>;
  stats: ScheduleStats;
  /** Full extent of the schedule on the time axis, or null when nothing is dated. */
  range: { start: number; finish: number } | null;
}

const STATUS: Record<string, ActivityStatus> = {
  TK_NotStart: "not-started",
  TK_Active: "in-progress",
  TK_Complete: "completed",
};

const TYPE: Record<string, ActivityType> = {
  TT_Task: "task",
  TT_Rsrc: "resource",
  TT_LOE: "loe",
  TT_Mile: "start-milestone",
  TT_FinMile: "finish-milestone",
  TT_WBS: "wbs-summary",
};

const REL_TYPE: Record<string, RelationshipType> = {
  PR_FS: "FS",
  PR_SS: "SS",
  PR_FF: "FF",
  PR_SF: "SF",
};

export const isMilestone = (a: Activity) => a.type === "start-milestone" || a.type === "finish-milestone";

export function listProjects(xer: XerFile): Project[] {
  const proj = reader(xer.tables.get("PROJECT"));
  const wbs = reader(xer.tables.get("PROJWBS"));

  // The project's display name lives on its root WBS node.
  const rootNames = new Map<string, string>();
  for (const r of wbs.rows) {
    if (wbs.get(r, "proj_node_flag") === "Y") rootNames.set(wbs.get(r, "proj_id"), wbs.get(r, "wbs_name"));
  }

  return proj.rows.map((r) => {
    const id = proj.get(r, "proj_id");
    const shortName = proj.get(r, "proj_short_name");
    return {
      id,
      shortName,
      name: rootNames.get(id) || shortName || `Project ${id}`,
      plannedStart: parseDate(proj.get(r, "plan_start_date")),
      scheduledFinish: parseDate(proj.get(r, "scd_end_date")),
      dataDate: parseDate(proj.get(r, "last_recalc_date")),
      defaultCalendarId: proj.get(r, "clndr_id"),
      criticalFloatHrs: parseNumber(proj.get(r, "critical_drtn_hr_cnt")) ?? 0,
      criticalByDrivingPath: proj.get(r, "critical_path_type") === "CT_DrivPath",
    };
  });
}

function percentComplete(
  status: ActivityStatus,
  pctType: string,
  physPct: number | null,
  origDur: number | null,
  remDur: number | null,
  actQty: number,
  remQty: number,
): number {
  if (status === "completed") return 100;
  if (status === "not-started") return 0;
  let pct: number;
  if (pctType === "CP_Phys") pct = physPct ?? 0;
  else if (pctType === "CP_Units") pct = actQty + remQty > 0 ? (actQty / (actQty + remQty)) * 100 : 0;
  else pct = origDur && origDur > 0 ? (1 - (remDur ?? 0) / origDur) * 100 : 0;
  return Math.min(100, Math.max(0, pct));
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function buildSchedule(xer: XerFile, projectId: string): Schedule {
  const project = listProjects(xer).find((p) => p.id === projectId);
  if (!project) throw new Error(`Project ${projectId} not found in this file.`);

  // --- Calendars & resources -------------------------------------------------
  const cal = reader(xer.tables.get("CALENDAR"));
  const ownPatterns = new Map<string, WorkPattern | null>();
  const baseOf = new Map<string, string>();
  for (const r of cal.rows) {
    const id = cal.get(r, "clndr_id");
    ownPatterns.set(id, parseCalendarData(cal.get(r, "clndr_data")));
    baseOf.set(id, cal.get(r, "base_clndr_id"));
  }
  // Derived (project/resource) calendars fall back to their base calendar's pattern.
  const resolvePattern = (id: string, seen = new Set<string>()): WorkPattern | null => {
    const own = ownPatterns.get(id);
    if (own) return own;
    const base = baseOf.get(id);
    if (!base || seen.has(base)) return null;
    seen.add(id);
    return resolvePattern(base, seen);
  };

  const calendars = new Map<string, Calendar>();
  for (const r of cal.rows) {
    const id = cal.get(r, "clndr_id");
    const pattern = resolvePattern(id);
    calendars.set(id, {
      id,
      name: cal.get(r, "clndr_name"),
      type: cal.get(r, "clndr_type"),
      dayHrs: parseNumber(cal.get(r, "day_hr_cnt")) || (pattern && averageWorkdayHours(pattern)) || 8,
      weekHrs: parseNumber(cal.get(r, "week_hr_cnt")) || 40,
      isDefault: cal.get(r, "default_flag") === "Y",
      pattern,
    });
  }
  const defaultCalendar =
    calendars.get(project.defaultCalendarId) ?? [...calendars.values()].find((c) => c.isDefault);

  const rs = reader(xer.tables.get("RSRC"));
  const resources = new Map<string, Resource>();
  for (const r of rs.rows) {
    const id = rs.get(r, "rsrc_id");
    resources.set(id, {
      id,
      name: rs.get(r, "rsrc_name"),
      shortName: rs.get(r, "rsrc_short_name"),
      type: rs.get(r, "rsrc_type"),
    });
  }

  // --- Activities (all projects, so cross-project links can be resolved) ------
  const tk = reader(xer.tables.get("TASK"));
  const activityById = new Map<string, Activity>();
  const activities: Activity[] = [];
  const calendarUsage = new Map<string, number>();
  for (const r of tk.rows) {
    const status = STATUS[tk.get(r, "status_code")] ?? "not-started";
    const typeRaw = tk.get(r, "task_type");
    const projId = tk.get(r, "proj_id");
    const calendarId = tk.get(r, "clndr_id");
    const origDurHrs = parseNumber(tk.get(r, "target_drtn_hr_cnt"));
    const remDurHrs = parseNumber(tk.get(r, "remain_drtn_hr_cnt"));
    const pctType = tk.get(r, "complete_pct_type");
    const actualStart = parseDate(tk.get(r, "act_start_date"));
    const actualFinish = parseDate(tk.get(r, "act_end_date"));
    const earlyStart = parseDate(tk.get(r, "early_start_date"));
    const earlyFinish = parseDate(tk.get(r, "early_end_date"));
    const targetStart = parseDate(tk.get(r, "target_start_date"));
    const targetFinish = parseDate(tk.get(r, "target_end_date"));
    const restart = parseDate(tk.get(r, "restart_date"));
    const reend = parseDate(tk.get(r, "reend_date"));
    const totalFloatHrs = parseNumber(tk.get(r, "total_float_hr_cnt"));

    const isThisProject = projId === project.id;
    // Level-of-effort and WBS-summary activities are derived from other work and are never critical.
    const critical =
      isThisProject &&
      status !== "completed" &&
      typeRaw !== "TT_LOE" &&
      typeRaw !== "TT_WBS" &&
      (project.criticalByDrivingPath
        ? tk.get(r, "driving_path_flag") === "Y"
        : totalFloatHrs !== null && totalFloatHrs <= project.criticalFloatHrs);

    const a: Activity = {
      id: tk.get(r, "task_id"),
      projectId: projId,
      wbsId: tk.get(r, "wbs_id"),
      calendarId,
      code: tk.get(r, "task_code"),
      name: tk.get(r, "task_name"),
      type: TYPE[typeRaw] ?? "task",
      typeRaw,
      status,
      durationType: tk.get(r, "duration_type"),
      pctType,
      percent: percentComplete(
        status,
        pctType,
        parseNumber(tk.get(r, "phys_complete_pct")),
        origDurHrs,
        remDurHrs,
        (parseNumber(tk.get(r, "act_work_qty")) ?? 0) + (parseNumber(tk.get(r, "act_equip_qty")) ?? 0),
        (parseNumber(tk.get(r, "remain_work_qty")) ?? 0) + (parseNumber(tk.get(r, "remain_equip_qty")) ?? 0),
      ),
      origDurHrs,
      remDurHrs,
      totalFloatHrs,
      freeFloatHrs: parseNumber(tk.get(r, "free_float_hr_cnt")),
      actualStart,
      actualFinish,
      earlyStart,
      earlyFinish,
      lateStart: parseDate(tk.get(r, "late_start_date")),
      lateFinish: parseDate(tk.get(r, "late_end_date")),
      targetStart,
      targetFinish,
      constraintType: tk.get(r, "cstr_type"),
      constraintDate: parseDate(tk.get(r, "cstr_date")),
      constraint2Type: tk.get(r, "cstr_type2"),
      constraint2Date: parseDate(tk.get(r, "cstr_date2")),
      primaryResourceId: tk.get(r, "rsrc_id"),
      start: actualStart ?? earlyStart ?? restart ?? targetStart,
      finish: actualFinish ?? earlyFinish ?? reend ?? targetFinish,
      critical,
      dayHrs: calendars.get(calendarId)?.dayHrs ?? 8,
    };
    activityById.set(a.id, a);
    if (isThisProject) {
      activities.push(a);
      calendarUsage.set(calendarId, (calendarUsage.get(calendarId) ?? 0) + 1);
    }
  }

  // --- WBS tree ---------------------------------------------------------------
  const wb = reader(xer.tables.get("PROJWBS"));
  const wbs = new Map<string, WbsNode>();
  for (const r of wb.rows) {
    if (wb.get(r, "proj_id") !== project.id) continue;
    const id = wb.get(r, "wbs_id");
    wbs.set(id, {
      id,
      parentId: wb.get(r, "parent_wbs_id") || null,
      code: wb.get(r, "wbs_short_name"),
      name: wb.get(r, "wbs_name"),
      seq: parseNumber(wb.get(r, "seq_num")) ?? 0,
      isProjectRoot: wb.get(r, "proj_node_flag") === "Y",
      children: [],
      activities: [],
      start: null,
      finish: null,
      activityCount: 0,
    });
  }

  const roots: WbsNode[] = [];
  for (const node of wbs.values()) {
    const parent = node.parentId ? wbs.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  // Activities pointing at an unknown WBS get a synthetic bucket rather than vanishing.
  let orphans: WbsNode | null = null;
  for (const a of activities) {
    const node = wbs.get(a.wbsId);
    if (node) node.activities.push(a);
    else {
      orphans ??= {
        id: "__orphans__",
        parentId: null,
        code: "?",
        name: "(No WBS)",
        seq: Number.MAX_SAFE_INTEGER,
        isProjectRoot: false,
        children: [],
        activities: [],
        start: null,
        finish: null,
        activityCount: 0,
      };
      orphans.activities.push(a);
    }
  }
  if (orphans) {
    roots.push(orphans);
    wbs.set(orphans.id, orphans);
  }

  const bySeq = (a: WbsNode, b: WbsNode) => a.seq - b.seq || naturalCompare(a.code, b.code);
  const byCode = (a: Activity, b: Activity) => naturalCompare(a.code, b.code);
  const rollUp = (node: WbsNode) => {
    node.children.sort(bySeq);
    node.activities.sort(byCode);
    let start: number | null = null;
    let finish: number | null = null;
    let count = node.activities.length;
    const widen = (s: number | null, f: number | null) => {
      if (s !== null && (start === null || s < start)) start = s;
      if (f !== null && (finish === null || f > finish)) finish = f;
    };
    for (const a of node.activities) widen(a.start, a.finish);
    for (const c of node.children) {
      rollUp(c);
      widen(c.start, c.finish);
      count += c.activityCount;
    }
    node.start = start;
    node.finish = finish;
    node.activityCount = count;
  };
  roots.sort(bySeq);
  roots.forEach(rollUp);

  // --- Relationships ------------------------------------------------------------
  const tp = reader(xer.tables.get("TASKPRED"));
  const predecessors = new Map<string, Relationship[]>();
  const successors = new Map<string, Relationship[]>();
  const byRelationshipType: Record<RelationshipType, number> = { FS: 0, SS: 0, FF: 0, SF: 0 };
  let relationships = 0;
  for (const r of tp.rows) {
    const taskId = tp.get(r, "task_id");
    const predTaskId = tp.get(r, "pred_task_id");
    const successor = activityById.get(taskId);
    if (!successor || successor.projectId !== project.id) continue;
    const rel: Relationship = {
      id: tp.get(r, "task_pred_id"),
      taskId,
      predTaskId,
      type: REL_TYPE[tp.get(r, "pred_type")] ?? "FS",
      lagHrs: parseNumber(tp.get(r, "lag_hr_cnt")) ?? 0,
    };
    push(predecessors, taskId, rel);
    push(successors, predTaskId, rel);
    byRelationshipType[rel.type]++;
    relationships++;
  }

  // --- Resource assignments -------------------------------------------------------
  const tr = reader(xer.tables.get("TASKRSRC"));
  const assignments = new Map<string, Assignment[]>();
  const assignedResources = new Set<string>();
  let assignmentCount = 0;
  for (const r of tr.rows) {
    const taskId = tr.get(r, "task_id");
    if (activityById.get(taskId)?.projectId !== project.id) continue;
    const resourceId = tr.get(r, "rsrc_id");
    const resource = resources.get(resourceId);
    const actReg = parseNumber(tr.get(r, "act_reg_qty"));
    const actOt = parseNumber(tr.get(r, "act_ot_qty"));
    const actRegCost = parseNumber(tr.get(r, "act_reg_cost"));
    const actOtCost = parseNumber(tr.get(r, "act_ot_cost"));
    push(assignments, taskId, {
      id: tr.get(r, "taskrsrc_id"),
      taskId,
      resourceId,
      resourceName: resource?.name ?? (resourceId ? `Resource ${resourceId}` : "(Role)"),
      resourceType: resource?.type ?? "",
      budgetedQty: parseNumber(tr.get(r, "target_qty")),
      actualQty: actReg === null && actOt === null ? null : (actReg ?? 0) + (actOt ?? 0),
      remainingQty: parseNumber(tr.get(r, "remain_qty")),
      budgetedCost: parseNumber(tr.get(r, "target_cost")),
      actualCost: actRegCost === null && actOtCost === null ? null : (actRegCost ?? 0) + (actOtCost ?? 0),
      remainingCost: parseNumber(tr.get(r, "remain_cost")),
      start: parseDate(tr.get(r, "target_start_date")),
      finish: parseDate(tr.get(r, "target_end_date")),
    });
    if (resourceId) assignedResources.add(resourceId);
    assignmentCount++;
  }

  // --- Activity codes ---------------------------------------------------------------
  const codeTypes = new Map<string, string>();
  const at = reader(xer.tables.get("ACTVTYPE"));
  for (const r of at.rows) codeTypes.set(at.get(r, "actv_code_type_id"), at.get(r, "actv_code_type"));
  const codeValues = new Map<string, { typeId: string; code: string; description: string }>();
  const ac = reader(xer.tables.get("ACTVCODE"));
  for (const r of ac.rows) {
    codeValues.set(ac.get(r, "actv_code_id"), {
      typeId: ac.get(r, "actv_code_type_id"),
      code: ac.get(r, "short_name"),
      description: ac.get(r, "actv_code_name"),
    });
  }
  const codes = new Map<string, ActivityCodeValue[]>();
  const ta = reader(xer.tables.get("TASKACTV"));
  for (const r of ta.rows) {
    const value = codeValues.get(ta.get(r, "actv_code_id"));
    if (!value) continue;
    push(codes, ta.get(r, "task_id"), {
      id: ta.get(r, "actv_code_id"),
      typeId: value.typeId,
      typeName: codeTypes.get(value.typeId) ?? `Code type ${value.typeId}`,
      code: value.code,
      description: value.description,
    });
  }

  // --- Statistics & range ---------------------------------------------------------------
  const byStatus: Record<ActivityStatus, number> = { "not-started": 0, "in-progress": 0, completed: 0 };
  let milestones = 0;
  let levelOfEffort = 0;
  let critical = 0;
  let weightedPct = 0;
  let totalWeight = 0;
  let missingPredecessors = 0;
  let missingSuccessors = 0;
  let rangeStart: number | null = null;
  let rangeFinish: number | null = null;
  for (const a of activities) {
    byStatus[a.status]++;
    if (isMilestone(a)) milestones++;
    if (a.type === "loe") levelOfEffort++;
    if (a.critical) critical++;
    const w = a.origDurHrs ?? 0;
    weightedPct += a.percent * w;
    totalWeight += w;
    if (a.status !== "completed" && a.type !== "loe" && a.type !== "wbs-summary") {
      if (!predecessors.has(a.id)) missingPredecessors++;
      if (!successors.has(a.id)) missingSuccessors++;
    }
    if (a.start !== null && (rangeStart === null || a.start < rangeStart)) rangeStart = a.start;
    if (a.finish !== null && (rangeFinish === null || a.finish > rangeFinish)) rangeFinish = a.finish;
  }
  for (const d of [project.dataDate, project.plannedStart, project.scheduledFinish]) {
    if (d === null) continue;
    if (rangeStart === null || d < rangeStart) rangeStart = d;
    if (rangeFinish === null || d > rangeFinish) rangeFinish = d;
  }

  return {
    project,
    roots,
    wbs,
    activities,
    activityById,
    calendars,
    defaultCalendar,
    calendarUsage,
    resources,
    predecessors,
    successors,
    assignments,
    codes,
    stats: {
      activities: activities.length,
      byStatus,
      milestones,
      levelOfEffort,
      critical,
      wbsNodes: wbs.size,
      relationships,
      byRelationshipType,
      assignments: assignmentCount,
      resources: assignedResources.size,
      calendars: calendars.size,
      overallPercent: totalWeight > 0 ? weightedPct / totalWeight : 0,
      missingPredecessors,
      missingSuccessors,
    },
    range: rangeStart !== null && rangeFinish !== null ? { start: rangeStart, finish: rangeFinish } : null,
  };
}

const branchCache = new WeakMap<Schedule, Map<string, WbsNode[]>>();

/**
 * The WBS group an activity sits in plus every group above it, nearest first. The project's own root node is left
 * out: it carries the project's name, so matching it would make everything match. Cached per schedule.
 */
export function wbsBranch(schedule: Schedule, wbsId: string): WbsNode[] {
  let cache = branchCache.get(schedule);
  if (!cache) branchCache.set(schedule, (cache = new Map()));
  let branch = cache.get(wbsId);
  if (!branch) {
    branch = [];
    // `seen` only guards against a corrupt file whose parents loop back on themselves.
    const seen = new Set<string>();
    let n = schedule.wbs.get(wbsId);
    while (n && !seen.has(n.id)) {
      seen.add(n.id);
      if (!n.isProjectRoot) branch.push(n);
      n = n.parentId ? schedule.wbs.get(n.parentId) : undefined;
    }
    cache.set(wbsId, branch);
  }
  return branch;
}

export function wbsPath(schedule: Schedule, wbsId: string): string[] {
  const path: string[] = [];
  let node = schedule.wbs.get(wbsId);
  while (node) {
    path.unshift(node.name);
    node = node.parentId ? schedule.wbs.get(node.parentId) : undefined;
  }
  return path;
}
