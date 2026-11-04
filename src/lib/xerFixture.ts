import { buildSchedule } from "./xer/model";
import { parseXer } from "./xer/parse";

/** Small one-project schedules built from a few lines of XER, for tests that need exact dates and logic. */

export interface T {
  id: string;
  code: string;
  name?: string;
  wbs?: string;
  start: string;
  end: string;
  dur?: number;
  status?: string;
  cstr?: string;
}
export interface P {
  task: string;
  pred: string;
  type?: string;
  lag?: number;
}
export interface W {
  id: string;
  parent: string;
  code: string;
}

const table = (name: string, fields: string[], rows: string[][]) =>
  [`%T\t${name}`, `%F\t${fields.join("\t")}`, ...rows.map((r) => `%R\t${r.join("\t")}`), "%E"].join("\r\n");

/** A one-project XER: a root, two work packages, and the given activities and links. */
export function schedule(tasks: T[], preds: P[] = [], wbs: W[] = [{ id: "20", parent: "10", code: "A" }, { id: "30", parent: "10", code: "B" }]) {
  const text = [
    "ERMHDR\t8.4\t2026-01-01\tProject\tadmin\tdb\tProject Management\tGBP",
    table("PROJECT", ["proj_id", "proj_short_name", "last_recalc_date", "clndr_id"], [["1", "TWR", "2026-03-02 08:00", "1"]]),
    table(
      "PROJWBS",
      ["wbs_id", "proj_id", "parent_wbs_id", "wbs_short_name", "wbs_name", "proj_node_flag", "seq_num"],
      [["10", "1", "", "TWR", "Tower", "Y", "1"], ...wbs.map((w, i) => [w.id, "1", w.parent, w.code, `Package ${w.code}`, "N", String(i + 1)])],
    ),
    table(
      "TASK",
      ["task_id", "proj_id", "wbs_id", "clndr_id", "task_code", "task_name", "task_type", "status_code", "target_drtn_hr_cnt", "remain_drtn_hr_cnt", "early_start_date", "early_end_date", "cstr_type"],
      tasks.map((t) => [t.id, "1", t.wbs ?? "20", "1", t.code, t.name ?? `Activity ${t.code}`, "TT_Task", t.status ?? "TK_NotStart", String(t.dur ?? 80), String(t.dur ?? 80), t.start, t.end, t.cstr ?? ""]),
    ),
    table(
      "TASKPRED",
      ["task_pred_id", "task_id", "pred_task_id", "pred_type", "lag_hr_cnt"],
      preds.map((p, i) => [String(i + 1), p.task, p.pred, p.type ?? "PR_FS", String(p.lag ?? 0)]),
    ),
  ].join("\r\n");
  return buildSchedule(parseXer(text), "1");
}

