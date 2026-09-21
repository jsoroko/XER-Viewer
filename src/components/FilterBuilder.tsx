import { useMemo } from "react";
import {
  EMPTY_FILTER,
  FIELDS,
  fieldGroups,
  newCondition,
  OPERATORS,
  suggestValues,
  type AdvancedFilter,
  type Condition,
} from "../lib/advancedFilter";
import type { Schedule } from "../lib/xer/model";
import { buttonClass, inputClass } from "./ui";

interface Props {
  schedule: Schedule;
  value: AdvancedFilter;
  onChange: (next: AdvancedFilter) => void;
}

const GROUPS = fieldGroups(FIELDS);
const BY_ID = new Map(FIELDS.map((f) => [f.id, f]));

export function FilterBuilder({ schedule, value, onChange }: Props) {
  // Suggestions are looked up once per field per file, not on every keystroke.
  const suggestions = useMemo(() => new Map<string, string[]>(), [schedule]);
  const suggestionsFor = (fieldId: string) => {
    let list = suggestions.get(fieldId);
    if (!list) {
      list = suggestValues(schedule, fieldId);
      suggestions.set(fieldId, list);
    }
    return list;
  };

  const update = (id: number, patch: Partial<Condition>) =>
    onChange({ ...value, conditions: value.conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const remove = (id: number) => onChange({ ...value, conditions: value.conditions.filter((c) => c.id !== id) });
  const add = () => onChange({ ...value, conditions: [...value.conditions, newCondition()] });

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-600 dark:text-slate-300">Show activities that match</span>
        <select
          aria-label="Match all or any conditions"
          className={inputClass}
          value={value.mode}
          onChange={(e) => onChange({ ...value, mode: e.target.value as AdvancedFilter["mode"] })}
        >
          <option value="all">all</option>
          <option value="any">any</option>
        </select>
        <span className="text-slate-600 dark:text-slate-300">of these conditions</span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          (also applies to the search, status and date filters above)
        </span>
      </div>

      {value.conditions.length === 0 && (
        <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
          No conditions yet. Add one to filter by activity code, task or WBS.
        </p>
      )}

      <ul className="space-y-2">
        {value.conditions.map((c, i) => {
          const def = BY_ID.get(c.field);
          const needsValue = OPERATORS.find((o) => o.op === c.op)?.needsValue ?? true;
          const list = def?.suggest ? suggestionsFor(def.id) : [];
          const listId = list.length > 0 ? `suggest-${c.id}` : undefined;
          return (
            <li key={c.id} className="flex flex-wrap items-center gap-2">
              <span className="w-10 text-right text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {i === 0 ? "Where" : value.mode === "all" ? "And" : "Or"}
              </span>
              <select
                aria-label={`Condition ${i + 1} field`}
                className={`${inputClass} w-48`}
                value={c.field}
                onChange={(e) => update(c.id, { field: e.target.value })}
              >
                {GROUPS.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.fields.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <select
                aria-label={`Condition ${i + 1} operator`}
                className={inputClass}
                value={c.op}
                onChange={(e) => update(c.id, { op: e.target.value as Condition["op"] })}
              >
                {OPERATORS.map((o) => (
                  <option key={o.op} value={o.op}>
                    {o.label}
                  </option>
                ))}
              </select>
              {needsValue && (
                <>
                  <input
                    type="text"
                    aria-label={`Condition ${i + 1} value`}
                    placeholder="value"
                    className={`${inputClass} w-56`}
                    list={listId}
                    value={c.value}
                    onChange={(e) => update(c.id, { value: e.target.value })}
                  />
                  {listId && (
                    <datalist id={listId}>
                      {list.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  )}
                  {c.value.trim() === "" && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">enter a value to apply</span>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={() => remove(c.id)}
                aria-label={`Remove condition ${i + 1}`}
                className="rounded px-2 py-1 text-slate-500 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 dark:hover:bg-slate-800"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex gap-2">
        <button type="button" className={buttonClass} onClick={add}>
          + Add condition
        </button>
        {value.conditions.length > 0 && (
          <button type="button" className={buttonClass} onClick={() => onChange(EMPTY_FILTER)}>
            Clear conditions
          </button>
        )}
      </div>
    </div>
  );
}
