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
  - **Date range filter** – the **Dates** button (it shows the current range) opens From/To (either can be left open)
    with three modes: active in range, starting in range, or finishing in range. The range is shaded on the chart and
    scrolled into view. **Fit View** fits the whole project; once a range is set it opens a menu offering *Project
    Duration* or *Selected Dates*. Selected Dates zooms the chart to the range with one tick of the timescale as
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
    flips upward. Only shown when the file's WBS is more than one level deep, and resets to the file's deepest
    level (showing everything) for a new project.
  - **Filter builder** – the **Filters** button opens a panel where you combine any number of conditions
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
    (so the search, status, date-range and filter-builder results, and any collapsed groups), the Gantt bars fitted
    to the printed activities, and a header line saying which filters are applied. It is built in the browser and
    downloaded as `<project>_<date>.pdf`; nothing is uploaded. Long schedules run over as many pages as needed
    (you are asked to confirm above 100 pages). Characters outside the PDF's built-in fonts (e.g. Chinese or
    Cyrillic) print as `?`, and dependency lines and non-working shading are not drawn. The PDF library is loaded
    only when you press the button, as its own chunk, so it does not slow the first page load.
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

## Deployment

The build output is a static site. For hosting on a Raspberry Pi behind Cloudflare Tunnel and Nginx, with the
app as a rootless Podman Quadlet, see [docs/deployment-raspberrypi.md](docs/deployment-raspberrypi.md).

## Layout

| Path | What it does |
| --- | --- |
| `src/lib/xer/parse.ts` | Tab-delimited XER parser (`%T` / `%F` / `%R`), encoding detection |
| `src/lib/xer/model.ts` | Builds a typed schedule: WBS tree, activities, logic, resources, codes, stats |
| `src/lib/xer/calendar.ts` | Parses P6 `clndr_data` work patterns; working days, non-working runs, summaries |
| `src/lib/scheduleRows.ts`, `timeline.ts`, `useVirtualRows.ts` | Row flattening + filters, Gantt time scale (and the fit-to-range margin logic), windowing |
| `src/lib/advancedFilter.ts` | Filter-builder fields, operators and evaluation |
| `src/lib/links.ts` | Orthogonal routing for the dependency lines |
| `src/lib/themes.ts`, `src/components/ThemeMenu.tsx` | The five palettes (light + dark), turned into CSS variables at run time; the Appearance menu |
| `src/lib/printPdf.ts` | A3-landscape PDF export (jsPDF, lazy-loaded), pagination, filter summary |
| `src/state/fileStore.ts`, `useXerFile.ts` | IndexedDB persistence of the last file; load / restore / close flow |
| `src/components/` | Overview, Schedule (table + Gantt), ActivityDetails, TablesView |
| `scripts/generate-sample.ts` | Regenerates `src/sample/sample.xer` (`bun run sample`) |

## Notes

- Durations and float are shown in days, converted like P6 does: hours ÷ the activity calendar's hours-per-day
  (`day_hr_cnt`, or the average working-day length from its work pattern when that's missing). The separate
  "Working days" figure in activity details counts actual calendar working days between start and finish.
- An activity is **critical** when it is not complete, is not level-of-effort / WBS summary, and its total float is
  at or below the project's critical threshold (or is on the driving path when the project uses that setting).
- Dates are taken as P6 exported them; the viewer never reschedules. Calendars are read for display only, and a
  calendar whose `clndr_data` can't be parsed simply isn't shaded (derived calendars inherit their base's pattern).
- A backend (Elysia + PostgreSQL + React Query) would only be needed for saved projects, sharing, or comparing
  versions across uploads. None of that is required to view a file.
