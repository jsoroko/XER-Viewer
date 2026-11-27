import { useRef, useState, type ReactNode } from "react";
import { LuChevronsDownUp, LuX } from "react-icons/lu";
import type { Activity } from "../lib/xer/model";
import { ResizeGrip } from "./ResizeGrip";
import { DEFAULT_PANEL_H, useHeightResize } from "./useHeightResize";

type PanelTab = "trace" | "activity";

interface TabProps {
  id: string;
  panelId: string;
  selected: boolean;
  onSelect: () => void;
  onClose: () => void;
  closeLabel: string;
  closeTitle: string;
  /** Present only on the shown tab: sets the panel's height to just fit this tab's content. */
  onFit?: () => void;
  children: ReactNode;
}

const TAB_BUTTON =
  "rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 dark:hover:bg-slate-800 dark:hover:text-slate-200";

/** One tab: the button that shows its panel, with small buttons beside it (not inside it: a button can't hold a button). */
function Tab({ id, panelId, selected, onSelect, onClose, closeLabel, closeTitle, onFit, children }: TabProps) {
  return (
    <div
      className={`-mb-px flex min-w-0 max-w-80 items-center rounded-t-md border border-b-0 text-xs ${
        selected
          ? "border-slate-200 bg-white font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
      }`}
    >
      <button
        id={id}
        type="button"
        role="tab"
        aria-selected={selected}
        aria-controls={panelId}
        tabIndex={selected ? 0 : -1}
        onClick={onSelect}
        className="flex min-w-0 items-center gap-1.5 rounded-tl-md py-1.5 pl-2.5 pr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/40"
      >
        {children}
      </button>
      {onFit && (
        <button type="button" onClick={onFit} aria-label="Fit panel to content" title="Fit the panel's height to its content" className={`mr-0.5 ${TAB_BUTTON}`}>
          <LuChevronsDownUp size={12} aria-hidden />
        </button>
      )}
      <button type="button" onClick={onClose} aria-label={closeLabel} title={closeTitle} className={`mr-1 ${TAB_BUTTON}`}>
        <LuX size={12} aria-hidden />
      </button>
    </div>
  );
}

/**
 * The panel along the bottom while a driving-logic trace is showing: a tab for the trace, and, only while an activity is
 * selected, a tab for that activity's details. Selecting something does not switch tabs by itself (that would take the
 * list of steps away every time one is clicked); the tab just appears, and clicking it shows the details. Once the details
 * are the tab being looked at they stay so as the selection moves from activity to activity, even across a moment with
 * nothing selected. Each tab closes
 * only itself: the trace, or the selection.
 */
export function BottomPanel({
  activity,
  trace,
  details,
  onCloseTrace,
  onDeselect,
}: {
  /** The selected activity, if any: it decides whether there is an Activity tab, and what it is called. */
  activity: Activity | null;
  trace: ReactNode;
  details: ReactNode;
  onCloseTrace: () => void;
  onDeselect: () => void;
}) {
  const [tab, setTab] = useState<PanelTab>("trace");
  const panel = useRef<HTMLDivElement>(null);
  const { height, fit, separator } = useHeightResize();
  // With nothing selected there is only the trace. The choice of tab is kept all the same, so that stepping over a group's
  // row (which has no details, and so deselects the activity) or pressing Escape brings the details back on the next
  // selection, on the tab that was open. Closing the Activity tab itself is the way to go back to the trace for good.
  const shown: PanelTab = activity && tab === "activity" ? "activity" : "trace";
  // Sets the height to what the tab being looked at needs; the height then stays as it is, whichever activity is selected.
  const fitToContent = () => fit(panel.current);

  return (
    <div
      ref={panel}
      className="relative flex shrink-0 flex-col border-t border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"
      // The details fill the panel's height; until the height has been set the trace is as tall as its steps need, up to the
      // stock height, and after that it has that height too.
      style={shown === "activity" || height !== DEFAULT_PANEL_H ? { height } : { maxHeight: height }}
    >
      <ResizeGrip orientation="horizontal" label="Resize panel" {...separator} />
      <div role="tablist" aria-label="Trace and activity" className="flex shrink-0 items-end gap-0.5 border-b border-slate-200 bg-slate-50 px-3 pt-1 dark:border-slate-800 dark:bg-slate-950/50">
        <Tab id="panel-tab-trace" panelId="panel-trace" selected={shown === "trace"} onSelect={() => setTab("trace")} onClose={onCloseTrace} closeLabel="Close trace" closeTitle="Close the trace" onFit={shown === "trace" ? fitToContent : undefined}>
          Driving trace
        </Tab>
        {activity && (
          <Tab
            id="panel-tab-activity"
            panelId="panel-activity"
            selected={shown === "activity"}
            onSelect={() => setTab("activity")}
            onClose={() => {
              setTab("trace");
              onDeselect();
            }}
            closeLabel="Deselect activity"
            closeTitle="Deselect this activity and close its details"
            onFit={shown === "activity" ? fitToContent : undefined}
          >
            <span className="shrink-0 font-mono text-[11px] text-slate-500 dark:text-slate-400">{activity.code}</span>
            <span className="truncate">{activity.name}</span>
          </Tab>
        )}
      </div>
      <div id="panel-trace" role="tabpanel" aria-labelledby="panel-tab-trace" hidden={shown !== "trace"} className="flex min-h-0 flex-1 flex-col">
        {trace}
      </div>
      {activity && (
        <div id="panel-activity" role="tabpanel" aria-labelledby="panel-tab-activity" hidden={shown !== "activity"} className="flex min-h-0 flex-1 flex-col">
          {details}
        </div>
      )}
    </div>
  );
}
