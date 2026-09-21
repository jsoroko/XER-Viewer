import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { downloadText, toCsv } from "../lib/csv";
import { fmtInt } from "../lib/format";
import { naturalCompare } from "../lib/xer/values";
import type { XerFile, XerTable } from "../lib/xer/parse";
import { useVirtualRows } from "../lib/useVirtualRows";
import { buttonClass, inputClass } from "./ui";

const ROW_H = 26;
const HEADER_H = 32;
const NUM_W = 56;

interface Props {
  xer: XerFile;
  /** Table to show; changing it (e.g. from the Overview) switches the view. */
  requested: { name: string; nonce: number } | null;
}

const NUMERIC = /^-?\d+(\.\d+)?$/;

// Lower-cased row text for searching, built once per table on first use.
const haystacks = new WeakMap<XerTable, string[]>();
function haystackFor(table: XerTable): string[] {
  let h = haystacks.get(table);
  if (!h) {
    h = table.rows.map((r) => r.join("\t").toLowerCase());
    haystacks.set(table, h);
  }
  return h;
}

function columnWidths(table: XerTable): number[] {
  const sample = table.rows.slice(0, 200);
  return table.fields.map((f, c) => {
    let longest = f.length;
    for (const r of sample) {
      const len = r[c]?.length ?? 0;
      if (len > longest) longest = len;
    }
    return Math.min(360, Math.max(72, Math.round(longest * 7.2) + 24));
  });
}

function isNumericColumn(table: XerTable, c: number): boolean {
  let seen = 0;
  for (const r of table.rows) {
    const v = r[c];
    if (!v) continue;
    if (!NUMERIC.test(v)) return false;
    if (++seen >= 200) break;
  }
  return seen > 0;
}

export function TablesView({ xer, requested }: Props) {
  const names = useMemo(() => [...xer.tables.keys()].sort(), [xer]);
  const initial = xer.tables.has("TASK") ? "TASK" : (names[0] ?? "");
  const [selected, setSelected] = useState(initial);
  const [listQuery, setListQuery] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);

  useEffect(() => {
    setSelected(xer.tables.has("TASK") ? "TASK" : (names[0] ?? ""));
  }, [xer, names]);

  useEffect(() => {
    if (requested && xer.tables.has(requested.name)) setSelected(requested.name);
  }, [requested, xer]);

  useEffect(() => {
    setQuery("");
    setSort(null);
  }, [selected]);

  const table = xer.tables.get(selected);
  const deferredQuery = useDeferredValue(query);
  const widths = useMemo(() => (table ? columnWidths(table) : []), [table]);

  const indices = useMemo(() => {
    if (!table) return [] as number[];
    const q = deferredQuery.trim().toLowerCase();
    let idx: number[];
    if (q) {
      const h = haystackFor(table);
      idx = [];
      for (let i = 0; i < h.length; i++) if (h[i]!.includes(q)) idx.push(i);
    } else {
      idx = Array.from({ length: table.rows.length }, (_, i) => i);
    }
    if (sort) {
      const { col, dir } = sort;
      const numeric = isNumericColumn(table, col);
      const rows = table.rows;
      idx.sort((a, b) => {
        const x = rows[a]![col] ?? "";
        const y = rows[b]![col] ?? "";
        if (x === "" || y === "") return x === y ? 0 : x === "" ? 1 : -1; // blanks always last
        return dir * (numeric ? Number(x) - Number(y) : naturalCompare(x, y));
      });
    }
    return idx;
  }, [table, deferredQuery, sort]);

  const virtual = useVirtualRows({ count: indices.length, rowHeight: ROW_H, overscan: 8 });
  const totalW = NUM_W + widths.reduce((n, w) => n + w, 0);

  const shownNames = names.filter((n) => n.toLowerCase().includes(listQuery.trim().toLowerCase()));

  const exportCsv = () => {
    if (!table) return;
    downloadText(`${table.name}.csv`, toCsv(table.fields, indices.map((i) => table.rows[i]!)));
  };

  const cycleSort = (col: number) =>
    setSort((s) => (s?.col !== col ? { col, dir: 1 } : s.dir === 1 ? { col, dir: -1 } : null));

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="p-2">
          <input
            type="search"
            aria-label="Filter tables"
            placeholder="Filter tables…"
            className={`${inputClass} w-full`}
            value={listQuery}
            onChange={(e) => setListQuery(e.target.value)}
          />
        </div>
        <ul className="min-h-0 flex-1 overflow-auto pb-2">
          {shownNames.map((n) => (
            <li key={n}>
              <button
                type="button"
                onClick={() => setSelected(n)}
                aria-current={n === selected}
                className={`flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/40 ${
                  n === selected
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                    : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                }`}
              >
                <span className="truncate font-mono text-xs">{n}</span>
                <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                  {fmtInt(xer.tables.get(n)!.rows.length)}
                </span>
              </button>
            </li>
          ))}
          {shownNames.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No matching tables.</li>}
        </ul>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {table ? (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="font-mono text-sm font-semibold">{table.name}</h2>
              <input
                type="search"
                aria-label="Search rows"
                placeholder="Search rows…"
                className={`${inputClass} w-64`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                {deferredQuery.trim()
                  ? `${fmtInt(indices.length)} of ${fmtInt(table.rows.length)} rows`
                  : `${fmtInt(table.rows.length)} rows`}
                {" · "}
                {table.fields.length} columns
              </span>
              <button type="button" className={`${buttonClass} ml-auto`} onClick={exportCsv} disabled={indices.length === 0}>
                Export CSV
              </button>
            </div>

            <div ref={virtual.ref} className="min-h-0 flex-1 overflow-auto bg-white dark:bg-slate-950">
              <div style={{ width: totalW, minWidth: "100%" }}>
                <div
                  className="sticky top-0 z-10 flex border-b border-slate-300 bg-slate-100 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                  style={{ height: HEADER_H, width: totalW }}
                >
                  <div className="shrink-0 px-2 text-right leading-8" style={{ width: NUM_W }}>
                    #
                  </div>
                  {table.fields.map((f, c) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => cycleSort(c)}
                      title={`Sort by ${f}`}
                      aria-sort={sort?.col === c ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                      className="flex shrink-0 items-center gap-1 truncate px-2 text-left font-mono hover:bg-slate-200/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/40 dark:hover:bg-slate-800"
                      style={{ width: widths[c] }}
                    >
                      <span className="truncate">{f}</span>
                      {sort?.col === c && <span aria-hidden>{sort.dir === 1 ? "▲" : "▼"}</span>}
                    </button>
                  ))}
                </div>

                <div className="relative" style={{ height: virtual.totalHeight, width: totalW }}>
                  {indices.slice(virtual.start, virtual.end).map((rowIndex, k) => {
                    const row = table.rows[rowIndex]!;
                    return (
                      <div
                        key={rowIndex}
                        className="absolute left-0 flex border-b border-slate-100 text-xs hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                        style={{ top: (virtual.start + k) * ROW_H, height: ROW_H, width: totalW }}
                      >
                        <div className="shrink-0 px-2 text-right leading-[25px] tabular-nums text-slate-400" style={{ width: NUM_W }}>
                          {rowIndex + 1}
                        </div>
                        {row.map((v, c) => (
                          <div key={c} className="shrink-0 truncate px-2 leading-[25px]" style={{ width: widths[c] }} title={v}>
                            {v}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {indices.length === 0 && (
                    <p className="sticky left-0 p-6 text-sm text-slate-500 dark:text-slate-400">No rows match “{deferredQuery}”.</p>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <p className="p-6 text-sm text-slate-500">This file has no tables.</p>
        )}
      </section>
    </div>
  );
}
