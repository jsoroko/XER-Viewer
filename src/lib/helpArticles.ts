/**
 * The help articles: what each tool does and how to use it, as plain data, so the drawer, its search and the tests all read
 * the same thing. Nothing here knows about React.
 *
 * Text can carry a few markers, turned into pieces by `parseHelpText`:
 *   {icon:trace}    a small chip with the tool's icon (the ids are `HelpIconId`)
 *   {key:print}     the shortcut from `SHORTCUTS`, written for this platform (⌘P or Ctrl+P), so it cannot go out of date
 *   {kbd:Esc}       a key that is not one of those shortcuts (arrows, Enter, Esc ...)
 *   **words**       bold, for the names of buttons and options
 *
 * `target` lists the `data-help` ids of the controls "Show me" rings. Each id is put on the control itself, where it is drawn.
 */
import { SHORTCUTS } from "./shortcuts";

export type HelpView = "overview" | "schedule" | "tables" | "general";
export type ShortcutId = keyof typeof SHORTCUTS;

export const HELP_ICON_IDS = [
  "start",
  "settings",
  "keyboard",
  "overview",
  "search",
  "filter",
  "calendar",
  "groups",
  "wbs",
  "columns",
  "trace",
  "compare",
  "switches",
  "legend",
  "zoom",
  "fit",
  "minus",
  "plus",
  "target",
  "print",
  "rows",
  "table",
  "download",
] as const;
export type HelpIconId = (typeof HELP_ICON_IDS)[number];

export interface HelpArticle {
  id: string;
  view: HelpView;
  title: string;
  /** One line, shown in the list and searched. */
  summary: string;
  icon: HelpIconId;
  /** Numbered steps, in the text format above. */
  steps: string[];
  /** A short extra note, shown after the steps. */
  tip?: string;
  /** Shortcuts to show under the steps. */
  keys?: ShortcutId[];
  /** `data-help` ids of the controls "Show me" rings (together, when there are several); leave out when there is nothing to ring. */
  target?: string[];
  /** Other articles worth reading next. */
  see?: string[];
  /** Appears in the strip of toolbar icons at the top of the view's page. */
  strip?: boolean;
  /** The article has a button that does something. */
  action?: "shortcuts";
}

export const HELP_VIEWS: Array<{ id: Exclude<HelpView, "general">; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "schedule", label: "Schedule" },
  { id: "tables", label: "Tables" },
];

export const HELP_VIEW_LABEL: Record<HelpView, string> = { overview: "Overview", schedule: "Schedule", tables: "Tables", general: "General" };

/** In the order the tools are laid out on screen, which is also the order "Next" follows. */
export const HELP_ARTICLES: readonly HelpArticle[] = [
  // ---- General -------------------------------------------------------------------------------------------------------
  {
    id: "open",
    view: "general",
    title: "Open a file",
    summary: "Load an .xer file. It never leaves your browser.",
    icon: "start",
    steps: [
      "Drop an .xer file anywhere on the page, or press **Open…** at the top.",
      "The file is read in your browser. Nothing is uploaded.",
      "It opens again the next time you visit. **Close** forgets it in this browser.",
      "If the file holds more than one project, pick one from the list beside the file name.",
    ],
    target: ["open"],
  },
  {
    id: "settings",
    view: "general",
    title: "Settings",
    summary: "Colours, light or dark, and level guides.",
    icon: "settings",
    steps: [
      "Press {icon:settings} at the top right.",
      "**Appearance** sets the colour palette and light or dark mode.",
      "**Level guides** give each WBS level its own colour, which helps you see how deep a row sits. You can switch them off and choose the colours.",
    ],
    target: ["settings"],
  },
  {
    id: "shortcuts",
    view: "general",
    title: "Keyboard shortcuts",
    summary: "Every shortcut, and the rules they follow.",
    icon: "keyboard",
    steps: [
      "Press {key:help} to open or close Help from anywhere.",
      "Press {icon:keyboard} at the top right for the full list of shortcuts.",
      "Shortcuts that type a letter always use the command key (⌘ on a Mac, Ctrl elsewhere), so typing in a box is never affected.",
    ],
    keys: ["help", "find"],
    target: ["shortcuts"],
    action: "shortcuts",
  },

  // ---- Overview ------------------------------------------------------------------------------------------------------
  {
    id: "overview",
    view: "overview",
    title: "The Overview",
    summary: "The project at a glance.",
    icon: "overview",
    steps: [
      "**Progress** shows how many activities are not started, in progress and complete.",
      "**Schedule health** counts activities with no predecessor or successor, and the types of relationship used.",
      "**Next critical activities** lists the open critical activities coming up. Press one to open it in the Schedule.",
      "**Tables in this file** lists the raw tables. Press one to open it in Tables.",
    ],
    target: ["tab-overview"],
    see: ["tables-browse"],
  },

  // ---- Schedule, in the order of the toolbar --------------------------------------------------------------------------
  {
    id: "search",
    view: "schedule",
    title: "Search",
    summary: "Find an activity by ID or name.",
    icon: "search",
    steps: [
      "Press {key:find} to go to the search box, then type. The list shows only the activities that match.",
      "A match is an activity whose ID or name contains your text. With **Groups** on, the names and codes of the WBS groups count too.",
      "Press {kbd:Enter} for the next match and {kbd:Shift+Enter} for the previous one.",
      "Press {kbd:Esc} to clear the search, and again to go back to the rows.",
      "The drop-down beside the search box limits the list by status: Critical, Not started, In progress, Completed or Milestones.",
    ],
    tip: "The search, the status drop-down, the filters and the date range all apply together.",
    keys: ["find"],
    target: ["search"],
    strip: true,
    see: ["filters"],
  },
  {
    id: "filters",
    view: "schedule",
    title: "Filters",
    summary: "Build rules to narrow the activities.",
    icon: "filter",
    steps: [
      "Press {icon:filter} to open the filter builder under the toolbar.",
      "Press **+ Add condition**, then pick a field (an activity code, a task field or a WBS field), a test and a value.",
      "With more than one condition, choose whether an activity must match **all** of them or **any**.",
      "The number on the icon shows how many conditions are in use. Remove a condition to widen the list again.",
    ],
    target: ["filters"],
    strip: true,
    see: ["search", "dates"],
  },
  {
    id: "dates",
    view: "schedule",
    title: "Date range",
    summary: "Show only the activities in a period.",
    icon: "calendar",
    steps: [
      "Press {icon:calendar} and set **From**, **To** or both.",
      "Choose whether to show activities that are **active in**, **starting in** or **finishing in** the range.",
      "**Clear dates** removes the range.",
    ],
    tip: "With a range set, the Fit button can fit the chart to the selected dates.",
    target: ["dates"],
    strip: true,
    see: ["zoom"],
  },
  {
    id: "groups",
    view: "schedule",
    title: "Expand and collapse groups",
    summary: "Open or close WBS groups.",
    icon: "groups",
    steps: [
      "Press the arrow beside a group to open or close it. Shift-click to open everything inside it.",
      "The first two buttons of the second toolbar row open or close every group.",
      "Click a group's name to select it. The next two buttons then open or close everything inside that group.",
      "With a group selected, {kbd:←} closes it and {kbd:→} opens it. Add {kbd:Shift} to include everything inside.",
    ],
    target: ["groups"],
    strip: true,
    see: ["wbs", "rows"],
  },
  {
    id: "wbs",
    view: "schedule",
    title: "WBS level and order",
    summary: "How deep the groups go, and in what order.",
    icon: "wbs",
    steps: [
      "Press the level button to choose how many WBS levels get a row of their own. Activities below that level are listed straight under the deepest group shown.",
      "Press the order button to arrange groups in the project's own sequence, or by their start date.",
      "Click the heading of a date column to order the activities inside each group.",
    ],
    tip: "The level button only appears when the file's WBS has more than one level.",
    target: ["wbs-level", "wbs-order"],
    strip: true,
    see: ["groups"],
  },
  {
    id: "columns",
    view: "schedule",
    title: "Columns",
    summary: "Choose what the list shows.",
    icon: "columns",
    steps: [
      "Press {icon:columns} to open the list of columns.",
      "Orig, Rem, Start, Finish and TF (original and remaining duration, and total float) are on to begin with. % Complete, the actual dates and free float can be switched on.",
      "While two files are compared, a **Compare** group of baseline and change columns appears.",
      "**Reset to default columns** puts it all back.",
    ],
    tip: "The button is highlighted while the columns differ from the default.",
    target: ["columns"],
    strip: true,
  },
  {
    id: "trace",
    view: "schedule",
    title: "Trace logic",
    summary: "Follow predecessors and successors.",
    icon: "trace",
    steps: [
      "Select an activity, or choose to type an activity ID.",
      "Press {icon:trace} and choose a direction: **Backward** (what drives it), **Forward** (what it drives) or **Combined** (the whole chain).",
      "The steps open in the panel at the bottom, and the path is highlighted on the chart with the rest dimmed.",
      "**Path only** hides everything off the path. **CSV** downloads the steps.",
    ],
    tip: "The Links switch draws just the selected activity's own predecessors and successors.",
    target: ["trace"],
    strip: true,
    see: ["switches", "compare"],
  },
  {
    id: "compare",
    view: "schedule",
    title: "Compare two files",
    summary: "See what changed between two updates.",
    icon: "compare",
    steps: [
      "Press {icon:compare}, then drop a second .xer file on the panel, choose one, or pick one opened lately.",
      "The file with the earlier data date is the baseline. **Swap order** reverses it.",
      "The strip under the toolbar counts the new, removed and modified activities. Press a count to hide or show that kind.",
      "Under **Compare by**, choose which fields count as a change. **Show baseline bars** and **Show unchanged activities** change what is drawn.",
      "**Exit compare** goes back to the schedule on its own.",
    ],
    tip: "Activities are matched by ID, so two different projects will show few matches.",
    target: ["compare"],
    strip: true,
    see: ["columns", "trace"],
  },
  {
    id: "switches",
    view: "schedule",
    title: "Links, Non-working and Today",
    summary: "Three things you can draw on the chart.",
    icon: "switches",
    steps: [
      "**Links** draws the selected activity's predecessors and successors.",
      "**Non-working** shades weekends and holidays from the project's default calendar. It shows once you zoom in.",
      "**Today** draws a line at today's date, taken from this computer's clock.",
    ],
    target: ["switches"],
    see: ["legend"],
  },
  {
    id: "legend",
    view: "schedule",
    title: "Legend",
    summary: "What the colours and lines mean.",
    icon: "legend",
    steps: [
      "Press the **Legend** button, at the right of the second toolbar row.",
      "It lists the colours, lines and markers that are on the chart right now, and nothing that isn't.",
    ],
    target: ["legend"],
    strip: true,
  },
  {
    id: "zoom",
    view: "schedule",
    title: "Zoom and fit",
    summary: "Change the scale of the chart.",
    icon: "zoom",
    steps: [
      "{icon:minus} zooms the chart out and {icon:plus} zooms it in.",
      "{icon:fit} fits the whole project in the window. With a date range or a filter on, it also offers to fit the selected dates or the rows shown.",
    ],
    tip: "The browser's own page zoom keeps its keys. The shortcuts here add Shift.",
    keys: ["zoomOut", "zoomIn", "fit"],
    target: ["zoom-out", "fit", "zoom-in"],
    strip: true,
    see: ["data-date", "dates"],
  },
  {
    id: "data-date",
    view: "schedule",
    title: "Data date",
    summary: "Jump to the line that marks the update.",
    icon: "target",
    steps: [
      "Press {icon:target} to scroll the chart to the data date, which is drawn as a vertical line.",
      "The data date is the date the schedule was last updated. It comes from the file, not from today's date.",
    ],
    tip: "The button is greyed out when the project has no data date.",
    keys: ["dataDate"],
    target: ["data-date"],
    strip: true,
    see: ["switches"],
  },
  {
    id: "print",
    view: "schedule",
    title: "Print to PDF",
    summary: "Save what is shown as a PDF.",
    icon: "print",
    steps: [
      "Press **PDF** at the top right of the toolbar, or {key:print}. On the Schedule that replaces the browser's own print.",
      "Choose the paper, how long names are handled, and what the bar labels say. The preview shows one page exactly as it will print, and you can step through the pages.",
      "Press **Download PDF**.",
    ],
    tip: "It prints what is shown, so the search, filters, groups and zoom all apply. Your choices are remembered.",
    keys: ["print"],
    target: ["print"],
    strip: true,
  },
  {
    id: "rows",
    view: "schedule",
    title: "Rows and details",
    summary: "Select activities and move through them.",
    icon: "rows",
    steps: [
      "Click an activity to open its details in the panel at the bottom: General, Relationships, Resources and Codes.",
      "Click a group's name to select the group instead.",
      "With a row selected, {kbd:↑} and {kbd:↓} move through the rows, {kbd:Home} and {kbd:End} go to the first and last, and {kbd:Esc} deselects.",
      "Drag the divider between the table and the chart to resize them.",
    ],
    see: ["groups", "trace"],
  },

  // ---- Tables --------------------------------------------------------------------------------------------------------
  {
    id: "tables-browse",
    view: "tables",
    title: "Browse a table",
    summary: "Read the raw tables in the file.",
    icon: "table",
    steps: [
      "Pick a table from the list on the left. The number beside it is its row count, and **Filter tables…** narrows the list.",
      "**Search rows…** keeps the rows that contain your text. {key:find} goes to it.",
      "Click a column heading to sort by it. Click again for the opposite order, and a third time to clear it.",
    ],
    target: ["tables-list"],
    strip: true,
    see: ["tables-export"],
  },
  {
    id: "tables-export",
    view: "tables",
    title: "Export CSV",
    summary: "Download a table as a spreadsheet file.",
    icon: "download",
    steps: ["Press **Export CSV** above the table.", "Only the rows shown are exported, in the order shown, so a search or a sort applies."],
    target: ["tables-export"],
    strip: true,
  },
];

const BY_ID = new Map(HELP_ARTICLES.map((a) => [a.id, a]));

export const articleById = (id: string): HelpArticle | undefined => BY_ID.get(id);

export const articlesFor = (view: HelpView): HelpArticle[] => HELP_ARTICLES.filter((a) => a.view === view);

/** The article after this one in its own view, for the "Next" link; none after the last. */
export function nextArticle(id: string): HelpArticle | undefined {
  const a = BY_ID.get(id);
  if (!a) return undefined;
  const same = articlesFor(a.view);
  return same[same.indexOf(a) + 1];
}

// ---- The small markup ------------------------------------------------------------------------------------------------

export type HelpPart =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "icon"; id: HelpIconId }
  | { kind: "key"; id: ShortcutId }
  | { kind: "kbd"; text: string };

const MARKER = /\{(icon|key|kbd):([^}]+)\}|\*\*([^*]+)\*\*/g;

/** Splits a piece of help text into plain text, bold, icons, shortcuts and keys. */
export function parseHelpText(source: string): HelpPart[] {
  const parts: HelpPart[] = [];
  let last = 0;
  for (const m of source.matchAll(MARKER)) {
    if (m.index > last) parts.push({ kind: "text", text: source.slice(last, m.index) });
    if (m[3] !== undefined) parts.push({ kind: "bold", text: m[3] });
    else if (m[1] === "icon") parts.push({ kind: "icon", id: m[2] as HelpIconId });
    else if (m[1] === "key") parts.push({ kind: "key", id: m[2] as ShortcutId });
    else parts.push({ kind: "kbd", text: m[2]! });
    last = m.index + m[0].length;
  }
  if (last < source.length) parts.push({ kind: "text", text: source.slice(last) });
  return parts;
}

/** The words of a piece of text, for searching: markers become what they stand for. */
export function plainHelpText(source: string): string {
  return parseHelpText(source)
    .map((p) => (p.kind === "key" ? SHORTCUTS[p.id].label : p.kind === "icon" ? "" : p.text))
    .join("");
}

const searchable = (a: HelpArticle) => ({
  title: a.title.toLowerCase(),
  rest: [a.summary, ...a.steps.map(plainHelpText), a.tip ?? "", HELP_VIEW_LABEL[a.view]].join(" ").toLowerCase(),
});

/**
 * The articles that mention every word typed, the ones with the words in the title first, otherwise in the order they are
 * laid out. A word matches the start of a word or anywhere inside one, so "col" finds "Columns".
 */
export function searchHelp(query: string, articles: readonly HelpArticle[] = HELP_ARTICLES): HelpArticle[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const hits: Array<{ a: HelpArticle; inTitle: boolean }> = [];
  for (const a of articles) {
    const s = searchable(a);
    if (!words.every((w) => s.title.includes(w) || s.rest.includes(w))) continue;
    hits.push({ a, inTitle: words.every((w) => s.title.includes(w)) });
  }
  return [...hits.filter((h) => h.inTitle), ...hits.filter((h) => !h.inTitle)].map((h) => h.a);
}
