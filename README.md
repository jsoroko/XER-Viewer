# XER Viewer

A browser-based viewer for Primavera P6 `.xer` exports. Everything runs client-side: the file is read and parsed in
the browser and never leaves your machine, so there is no backend.

**Stack:** Bun · React 19 · Tailwind CSS 4 · TypeScript · [react-icons](https://react-icons.github.io/react-icons/) (Lucide set) for toolbar icons

## Features

- **Resizable panels** – drag the table's right edge, or the top edge of the activity details panel underneath
  the schedule, to resize either one. Both sizes are remembered between visits.
- **Overview** – project dates, progress, critical count, schedule-health checks (open ends, relationship mix),
  next critical activities, file metadata and a table inventory.
- **Schedule** – WBS-grouped activity table with a synchronized Gantt chart: actual/remaining split at the data
  date, critical path in red, milestones, level-of-effort bars, WBS summary bars, zoom/fit, virtualized rows
  (tested with 50,000 activities). Search (task code and task name; switch **Groups** on to also match the name or
  code of any WBS group above a task, so "WP23" finds everything inside a WP23 group; the project's top row is
  ignored), status/critical/milestone
  filters, keyboard navigation (↑/↓), and a details panel with General, Relationships (click to jump), Resources and Activity Codes.
  - **Dependency lines** – switch **Links** on, then select an activity to draw its predecessors (amber) and successors (violet) with
    FS/SS/FF/SF-aware routing. Links to activities hidden by a filter or collapsed group are counted, not drawn.
  - **Trace driving logic** – click the **Trace** (route) icon, which is always available. Choose where to trace from, **Selected** (the
    activity selected in the schedule) or **By ID** (type an activity ID or part of a name and pick from the matches;
    Enter takes the first), and a direction: **Backward** (what drives it: its driving predecessors, and theirs, back
    to where the chain starts), **Forward** (what it drives) or **Combined** (both: the whole chain through it).
    The direction is remembered, and the activity traced from becomes the selected one and is scrolled to. A relationship *drives* when it has no relationship
    float: the successor's date is exactly what the predecessor's date plus lag asks for. That is measured in working
    time on the predecessor's calendar (P6's default calendar for lag) from the dates already in the file, so
    calendars, lags, constraints and progress are respected, and nothing is rescheduled. Tied chains are all
    shown. The path is outlined on the chart with its links drawn in cyan, every other row is dimmed, and a panel
    (which takes the details panel's place until you close it) lists each step in date order with the relationship
    that feeds it, its float and the path's overall span; click a step to select it and the schedule scrolls to it, rows and bar. **Path only** narrows the
    schedule, WBS groups included, to the path, and the PDF header says so; **CSV** downloads the steps.
    Level-of-effort and WBS summary activities take their dates from other activities, so they never drive and are
    left out. Relationships to undated activities can't be measured and break the chain. Unlike P6's own Longest
    Path / Multiple Float Paths, which are worked out for one end activity when the schedule is calculated, this
    works for any activity in any exported file.
  - **Compare two programmes** – click the **Compare tools** icon (two arrows). Add the second file there: drop an `.xer`
    on the dotted area, choose one, or pick one of the files opened lately (the last five are kept in this browser).
    Nothing is uploaded. The file with the earlier data date is the **baseline** and the later one the **current**
    programme; **Swap order** reverses that. Activities are matched by **Activity ID** (not the database id, which changes
    when a file is exported again), so a revision exported from another database still lines up. A file with several
    projects is compared on the one with the same name as the open project, and the menu lets you pick another.
    Each activity is **new** (green `+`), **removed** (red `−`, struck through, drawn as a dashed outline at its old
    place, in the group it came from), **modified** (amber `~`) or unchanged (grey). Changed dates are amber with the old
    value in the tooltip, and a modified bar shows how far it moved (`+14d`) with a thin baseline bar under it. Select an
    activity to see in the details panel exactly what differs: dates, durations, predecessors added or removed and lag
    changes, status and percent, constraints, renames. A strip under the toolbar names the two files and has a chip per kind
    of change, with its count, that switches that kind on or off (all on shows everything; unchanged activities
    show only then). **Compare by** in the menu chooses what counts as a difference (dates, duration, logic, progress,
    constraints, names), and you can hide the baseline bars or the unchanged activities. The **Extra columns** menu gains a
    **Compare** group while you compare: **Baseline Start / Finish / Dur** and **Δ Start / Finish / Dur**. A date's change is in
    calendar days (▲ red when later, ▼ green when earlier; new and removed activities say so), and the change in duration is in the
    activity's own working days, like the Orig column. Baseline Start, Baseline Finish and Δ Finish are on to begin with, and
    the choice is remembered. The PDF prints the same colours, markers, baseline bars, legend and chosen columns, with the two
    files named in its header.

    **Tracing while comparing** – a trace is run on both programmes, from the same Activity ID, and every step is marked:
    **on both** paths, **joined** the path (it drives now but didn't), or **dropped** off it (it drove in the baseline and
    no longer does, because its logic or dates changed or it was removed). Dropped steps are outlined dashed grey, with the
    baseline-only links drawn dashed, while the current path keeps its cyan outline and links; the trace panel lists every
    step with its status, shows how many activities are on the path (and how many were), how far its finish moved, and
    filters by status. **Baseline path** hides the dropped steps; **Path only** and the CSV and PDF follow it. Tracing from a
    new activity says there was no baseline path; from a removed one, its old path is shown as dropped.
  - **Date range filter** – the **Dates** (calendar) icon (hover for the current range) opens From/To (either can be left open)
    with three modes: active in range, starting in range, or finishing in range. The range is shaded on the chart and
    scrolled into view. **Fit View** (the corners icon beside zoom) fits the whole project; once a range is set, or a search, filter or trace leaves
    rows covering less than the whole project, it opens a menu offering *Project Duration*, *Selected Dates*,
    *Visible Rows* (the period everything on screen covers, group rows included) and *Visible Activities* (just
    the activities, offered when the group rows above them reach further, which they do whenever a filter or
    trace removes most of a branch; group bars then run off the edges). The chart always keeps a fixed margin of empty space at each end, and a bar's
    label moves to its left when it would run past the right edge. Selected Dates zooms the chart to the range with one tick of the timescale as
    margin either side: 3 days when the chart shows days, a week for weeks, a month for months, a
    quarter for quarters. The margin is measured in whichever timescale the chart ends up showing. A range with only
    one end set runs to the project's own start or finish on the other side.
  - **Today** – switch **Today** on to draw a dashed magenta line at today's date (from your computer's clock),
    separate from the solid orange data date. It is included in the PDF while the switch is on.
  - **Non-working time** – switch **Non-working** on (it is remembered) to shade weekends and holidays from the project's default calendar
    with a tint darker than the grid lines, when zoomed in.
  - **Columns** – the columns icon (next to Expand/Collapse all) adds any of four extra columns beyond the fixed
    Orig / Rem / Start / Finish / TF: % Complete, Actual Start, Actual Finish and Free Float. Each is switched on
    independently and remembered between visits; the icon is highlighted while any are on. Activity ID and
    Calendar aren't offered, since their values run too long to fit one line. A faint vertical line separates every
    column, fixed and extra alike, and every header has a tooltip explaining it.
  - **Sort order** – **By code** (the default) is the file's own order: WBS groups as arranged in the project,
    activities by activity code. **By date** reorders every level instead — WBS groups by their own rolled-up
    start date, activities by their own start date — applied recursively, so a date-sorted group's own sub-groups
    are themselves in date order, all the way down. Remembered between visits, like Non-working and Groups; unlike
    the WBS depth control, it does not reset for a new project.
  - **WBS grouping depth** – choose how many WBS levels get their own row (**WBS level 1**, **2**, … ), similar
    to P6's "Group by WBS" level setting. Activities below the chosen level are listed directly under the deepest
    group shown, with no rows for the levels folded away; group dates, activity counts and filter match counts
    still cover the whole branch. It opens as a menu below the button rather than a native dropdown, so it never
    flips upward. The first choice, **No groups**, drops every group row and lists just the activities in one flat list (by
    date, the whole list is sorted together), which suits a trace or search whose results are scattered. Resets to the file's deepest
    level (showing everything) for a new project.
  - **Filter builder** – the **Filters** (funnel) icon, which carries the number of conditions in use, opens a panel where you combine any number of conditions
    (*field, operator, value*) with **all** (AND) or **any** (OR). There are eleven fields, named after the P6 data
    they read: **Activity codes** (Activity ID, Activity Code, Activity Name, Activity Type ID, Activity Type Name),
    **Task** (Task ID, Task Code, Task Name) and **WBS** (WBS ID, WBS Code, WBS Name; these match an activity's own
    group *and every group above it*, so a parent group finds everything inside it). Operators: equals, does not
    equal, contains, does not contain, starts with, ends with, is empty, is not empty (case-insensitive). An activity
    can carry several codes (and sits under several WBS groups), so for those fields a positive operator passes if *any* code matches, and
    "does not equal / contain" passes only if *none* does. Each condition is checked on its own. Conditions still
    missing a value are ignored until you fill them in, and the builder combines with the search box, the status /
    critical / milestone dropdown and the date range, which cover status and dates.
  - **Print to PDF** – the **PDF** button makes an A3 landscape sheet of exactly what is on screen: the same rows
    (so the search, status, date-range and filter-builder results, the sort order, the WBS depth and any collapsed
    groups), the Gantt bars fitted to the printed activities, and a header line saying which filters are applied.
    It also carries the other view settings:
    - **Extra columns** – any of the optional columns switched on (% Complete, Actual Start, Actual Finish, Free
      Float) print after TF, with shorter headings; the chart gets correspondingly narrower.
    - **Non-working time** – with the switch on, weekends and holidays are shaded on the chart, with a legend entry.
      As on screen, it is left out when the printed span is so long that a day would be under a point wide.
    - **Rows and chart ends** – the PDF prints the rows as listed, so **No groups** and the WBS level are honoured.
      The chart is sized to the activities printed (as Visible Activities does on screen), with a margin at each end,
      and a label that would run off the right edge moves to the left of its bar.
    - **Today** – the dashed line, as before.
    - **Traced path** – a driving-logic trace is printed as on screen: its rows tinted, its bars outlined, its links
      drawn and everything else faded, with the trace named in the header ("Path only" when that switch is on). A
      link that runs across a page break is left out; both ends have to be on the same page.

    It is built in the browser and downloaded as `<project>_<date>.pdf`; nothing is uploaded. Long schedules run over
    as many pages as needed (you are asked to confirm above 100 pages). Characters outside the PDF's built-in fonts
    (e.g. Chinese or Cyrillic) print as `?`, and the selected activity's own predecessor/successor lines (the Links
    switch) are not drawn. The PDF library is loaded only when you press the button, as its own chunk, so it does not
    slow the first page load.
- **Calendars** – the Overview lists the calendars the project uses (work week, hours/day, holidays, activity
  count); activity details show the calendar's work week and the number of working days the activity spans.
- **Tables** – browse every raw table in the file with search, column sorting and CSV export.
- **Themes** – the palette button in the top bar opens **Appearance**: choose **Light** or **Dark**, and one of five
  colour themes (Clean, Graphite, Midnight, Sand, Sage). Both choices are remembered in this browser; with nothing
  saved the app follows your system's light / dark setting. Status colours (complete, critical, actual and remaining
  bars) are the same in every theme so they always mean the same thing. The PDF is always printed on white.
- Multi-project files (project picker), drag-and-drop anywhere, UTF-8 and Windows-1252 files.
- **Remembers your last file** – reopened automatically on your next visit. It's stored in this browser only
  (IndexedDB, so large files are fine); **Close** forgets it. The bundled sample is never remembered. If the file
  can't be saved (e.g. storage is full) the top bar says so and the old remembered file is dropped.

## Usage

```bash
bun install
bun dev            # http://localhost:3000 (set PORT to change)
bun test           # parser + model tests
bun run typecheck
bun run build      # static site in dist/ — host it anywhere
```

Click **Try a sample project** on the start screen to explore without a file.

## Versioning

The version is `YY.MAJOR.MINOR` (for example `26.1.0`): the two-digit year, then a major and a minor release counter
that both start again each January, so the first release of a year is always `YY.1.0`. **Major** is a significant new
capability or redesign; **minor** is a smaller feature, improvement or fix. It lives in `package.json`, and the start
screen shows it after the credit line, with the build date in its tooltip.

```bash
bun run release minor            # or: major. Commit your changes first
git push origin main --follow-tags
```

`bun run release` works out the next version (restarting at `YY.1.0` in a new year), updates `package.json`, adds an entry
to [CHANGELOG.md](CHANGELOG.md) listing the commits since the last release, then commits and tags `vYY.M.N`. Add
`--dry-run` to see what it would do. It never pushes.

## Deployment

The build output is a static site. For hosting on a Raspberry Pi behind Cloudflare Tunnel and Nginx, with the
app as a rootless Podman Quadlet, see [docs/deployment-raspberrypi.md](docs/deployment-raspberrypi.md).

## Layout

| Path | What it does |
| --- | --- |
| `src/lib/xer/parse.ts` | Tab-delimited XER parser (`%T` / `%F` / `%R`), encoding detection |
| `src/lib/xer/model.ts` | Builds a typed schedule: WBS tree, activities, logic, resources, codes, stats |
| `src/lib/xer/calendar.ts` | Parses P6 `clndr_data` work patterns; working days and hours, non-working runs, summaries |
| `src/lib/scheduleRows.ts`, `timeline.ts`, `useVirtualRows.ts` | Row flattening + filters, Gantt time scale (and the fit-to-range margin logic), windowing |
| `src/lib/advancedFilter.ts` | Filter-builder fields, operators and evaluation |
| `src/lib/links.ts` | Orthogonal routing for the dependency lines (and the traced path's links) |
| `src/lib/drivingPath.ts`, `activityLookup.ts`, `traceCsv.ts` | Driving-logic tracing (backward / forward / combined), its step list and CSV |
| `src/lib/version.ts`, `appVersion.ts`, `scripts/release.ts` | Version numbering, the version and build date shown on the start screen, the release command |
| `src/lib/themes.ts`, `src/components/ThemeMenu.tsx` | The five palettes (light + dark), turned into CSS variables at run time; the Appearance menu |
| `src/lib/printPdf.ts` | A3-landscape PDF export (jsPDF, lazy-loaded), pagination, filter summary, extra columns, shading, traced path, compared programmes |
| `src/lib/compare.ts`, `compareTrace.ts`, `compareColumns.ts`, `state/useCompare.ts` | Matching two programmes by Activity ID, classifying each as new / removed / modified, describing the change; tracing both and marking joined / dropped steps; loading the second file |
| `src/state/fileStore.ts`, `useXerFile.ts` | IndexedDB persistence of the last file and the five most recent; load / restore / close flow |
| `src/components/` | Overview, Schedule (table + Gantt), ActivityDetails, TraceMenu / TracePanel, CompareMenu / CompareBar, TablesView |
| `scripts/generate-sample.ts` | Regenerates `src/sample/sample.xer` (`bun run sample`) |

## Notes

- Durations and float are shown in days, converted like P6 does: hours ÷ the activity calendar's hours-per-day
  (`day_hr_cnt`, or the average working-day length from its work pattern when that's missing). The separate
  "Working days" figure in activity details counts actual calendar working days between start and finish.
- An activity is **critical** when it is not complete, is not level-of-effort / WBS summary, and its total float is
  at or below the project's critical threshold (or is on the driving path when the project uses that setting).
- Dates are taken as P6 exported them; the viewer never reschedules. Calendars are read for display only, and a
  calendar whose `clndr_data` can't be parsed simply isn't shaded (derived calendars inherit their base's pattern).
- A backend (Elysia + PostgreSQL + React Query) would only be needed for saved projects or sharing. None of that is
  required to view or compare files.
