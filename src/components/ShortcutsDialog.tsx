import { useEffect, useRef, type ReactNode } from "react";
import { LuX } from "react-icons/lu";
import { SHORTCUTS, formatShortcut, isMac, type Shortcut } from "../lib/shortcuts";
import { iconButtonClass } from "./ui";

const Key = ({ children }: { children: ReactNode }) => (
  <kbd className="whitespace-nowrap rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
    {children}
  </kbd>
);

type Entry = { keys: ReactNode; what: string };

function Section({ title, note, entries }: { title: string; note?: string; entries: Entry[] }) {
  return (
    <section className="mt-4 first:mt-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h3>
      {note && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{note}</p>}
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5 text-sm">
        {entries.map((e) => (
          <div key={e.what} className="contents">
            <dt className="flex flex-wrap justify-end gap-1">{e.keys}</dt>
            <dd>{e.what}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** All the keyboard shortcuts, opened from the keyboard icon in the top bar or with the help shortcut itself. */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const mac = isMac();
  const k = (s: Shortcut) => <Key>{formatShortcut(s, mac)}</Key>;
  const mod = mac ? "⌘" : "Ctrl";

  // Focus moves into the dialog, and back to where it was when it closes. `onClose` is read through a ref so a new function
  // on every render of the parent does not move the focus again.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      close.current();
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      before?.focus?.();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 dark:bg-black/60"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        tabIndex={-1}
        className="max-h-[92vh] w-[min(520px,96vw)] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl outline-none dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="sticky top-0 flex items-center border-b border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
          <h2 id="shortcuts-title" className="text-sm font-semibold">
            Keyboard shortcuts
          </h2>
          <button type="button" className={`${iconButtonClass} ml-auto`} aria-label="Close" title="Close" onClick={onClose}>
            <LuX size={16} aria-hidden />
          </button>
        </div>

        <div className="px-4 py-4">
          <Section
            title="Anywhere"
            entries={[
              { keys: k(SHORTCUTS.find), what: "Go to the search box (instead of the browser's find)" },
              { keys: k(SHORTCUTS.help), what: "Show or hide this list" },
            ]}
          />
          <Section
            title="Schedule: the chart"
            entries={[
              { keys: k(SHORTCUTS.zoomOut), what: "Zoom out" },
              { keys: k(SHORTCUTS.zoomIn), what: "Zoom in" },
              { keys: k(SHORTCUTS.fit), what: "Fit the whole project in the window" },
              { keys: k(SHORTCUTS.dataDate), what: "Go to the data date" },
              { keys: k(SHORTCUTS.print), what: "Print to PDF" },
            ]}
          />
          <Section
            title="Schedule: the rows"
            note="Click a row first. These keys never work while you are typing in a box."
            entries={[
              { keys: <><Key>↑</Key><Key>↓</Key></>, what: "Previous or next row, groups included" },
              { keys: <><Key>Home</Key><Key>End</Key></>, what: "First or last row" },
              { keys: <Key>←</Key>, what: "Close the group, or go to the group above" },
              { keys: <Key>→</Key>, what: "Open the group, or go into it" },
              { keys: <><Key>Shift</Key>+<Key>←</Key></>, what: "Close the group and everything inside it" },
              { keys: <><Key>Shift</Key>+<Key>→</Key></>, what: "Open the group and everything inside it" },
              { keys: <Key>Esc</Key>, what: "Deselect" },
            ]}
          />
          <Section
            title="In the search boxes"
            entries={[
              { keys: <Key>Enter</Key>, what: "Schedule: select the next match" },
              { keys: <><Key>Shift</Key>+<Key>Enter</Key></>, what: "Schedule: select the previous match" },
              { keys: <Key>Esc</Key>, what: "Clear the search; again, to go back to the rows" },
            ]}
          />
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            While the Schedule is showing, {mod}+P prints the chart to PDF instead of printing the page. The browser's page zoom keeps {mod}+0, {mod}+− and {mod}+= (a + typed with Shift is {mod}+Shift+= and zooms the chart here).
          </p>
        </div>
      </div>
    </div>
  );
}
