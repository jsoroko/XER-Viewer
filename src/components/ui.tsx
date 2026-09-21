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

/**
 * An iOS-style on/off switch. It is a real checkbox underneath (role="switch"), so clicking the label, the Space key
 * and screen readers all work; only its appearance is replaced.
 */
export function Switch({
  checked,
  onChange,
  label,
  title,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  title?: string;
  /** Greyed out and not clickable, e.g. when the file has nothing for the option to act on. */
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex select-none items-center gap-1.5 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400 ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
      title={title}
    >
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className="relative h-5 w-9 shrink-0 rounded-full bg-slate-300 transition-colors duration-200 after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-200 peer-checked:bg-green-500 peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-accent-500/60 peer-focus-visible:ring-offset-1 dark:bg-slate-600 dark:peer-focus-visible:ring-offset-slate-900"
      />
      {label}
    </label>
  );
}

export const inputClass =
  "h-8 rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 placeholder:text-slate-400 " +
  "focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30 " +
  "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

/** A button that stays visibly "on" while pressed. */
export const toggleClass = (on: boolean) =>
  "inline-flex h-8 items-center justify-center rounded-md border px-2.5 text-sm font-medium " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 disabled:opacity-40 " +
  (on
    ? "border-accent-500 bg-accent-50 text-accent-700 hover:bg-accent-100 dark:border-accent-500 dark:bg-accent-950 dark:text-accent-300 dark:hover:bg-accent-900"
    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800");

export const buttonClass =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-sm " +
  "font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 " +
  "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:disabled:hover:bg-slate-900";
