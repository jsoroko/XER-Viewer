# XER Viewer

A browser-based viewer for Primavera P6 `.xer` exports. Everything runs client-side: the file is read and parsed in
the browser and never leaves your machine, so there is no backend.

**Stack:** Bun · React 19 · Tailwind CSS 4 · TypeScript

## Features

- **Overview** – project dates, progress, critical count, schedule-health checks (open ends, relationship mix),
  next critical activities, file metadata and a table inventory.
- **Schedule** – WBS-grouped activity table with a synchronized Gantt chart: actual/remaining split at the data
  date, critical path in red, milestones, level-of-effort bars, WBS summary bars, zoom/fit, virtualized rows
  (tested with 50,000 activities). Search, status/critical/milestone filters, keyboard navigation (↑/↓), and a
  details panel with General, Relationships (click to jump), Resources and Activity Codes.
  - **Dependency lines** – select an activity to draw its predecessors (amber) and successors (violet) with
    FS/SS/FF/SF-aware routing. Links to activities hidden by a filter or collapsed group are counted, not drawn.
  - **Date range filter** – From/To (either can be left open) with three modes: active in range, starting in
    range, or finishing in range. The range is shaded on the chart and scrolled into view.
  - **Non-working time** – weekends and holidays from the project's default calendar are shaded when zoomed in.
- **Calendars** – the Overview lists the calendars the project uses (work week, hours/day, holidays, activity
  count); activity details show the calendar's work week and the number of working days the activity spans.
- **Tables** – browse every raw table in the file with search, column sorting and CSV export.
- Multi-project files (project picker), drag-and-drop anywhere, light/dark theme, UTF-8 and Windows-1252 files.
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
| `src/lib/scheduleRows.ts`, `timeline.ts`, `useVirtualRows.ts` | Row flattening + filters, Gantt time scale, windowing |
| `src/lib/links.ts` | Orthogonal routing for the dependency lines |
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
