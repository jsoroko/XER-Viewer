import type { ReactNode } from "react";
import type { ActivityStatus } from "../lib/xer/model";

export const STATUS_LABEL: Record<ActivityStatus, string> = {
  "not-started": "Not Started",
  "in-progress": "In Progress",
  completed: "Completed",
};

export const STATUS_DOT: Record<ActivityStatus, string> = {
  "not-started": "bg-slate-400",
  "in-progress": "bg-blue-500",
  completed: "bg-emerald-500",
};

export function StatusBadge({ status }: { status: ActivityStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs">
      <span className={`size-2 rounded-full ${STATUS_DOT[status]}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      {title && (
        <h2 className="border-b border-slate-200 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">{children}</p>;
}

export const inputClass =
  "h-8 rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 placeholder:text-slate-400 " +
  "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 " +
  "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

/** A button that stays visibly "on" while pressed. */
export const toggleClass = (on: boolean) =>
  "inline-flex h-8 items-center justify-center rounded-md border px-2.5 text-sm font-medium " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-40 " +
  (on
    ? "border-blue-500 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800");

export const buttonClass =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-sm " +
  "font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 " +
  "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:disabled:hover:bg-slate-900";
