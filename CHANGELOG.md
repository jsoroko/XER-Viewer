# Changelog

Versions are `YY.MAJOR.MINOR`: the year, then a major and a minor release counter that both restart each January.
Add an entry with `bun run release major` or `bun run release minor`.

## 26.6.0 (2026-11-27)

- Add Help: a side panel with a search box and an article for each tool, with a Show me button that rings the real control; Cmd+/ now opens it

## 26.5.1 (2026-11-27)

- Keep the Activity tab open in the bottom panel while a trace is showing, as the selection moves between activities

## 26.5.0 (2026-11-27)

- Add keyboard shortcuts: search, chart zoom/fit/data date/print, row navigation, Esc closes windows

## 26.4.1 (2026-11-27)

- Keep the bottom panel's height and details tab as activities change, and let Fit shrink

## 26.4.0 (2026-11-26)

- Make the table divider easy to find: grip tab, full-height grab strip, first-visit tip

## 26.3.2 (2026-11-26)

- Show the PDF preview in Safari: drop frame-ancestors from the CSP
- Stop the PDF preview frame showing a hover tooltip over the dialog

## 26.3.1 (2026-11-26)

- Allow the PDF preview frame in the CSP, and offer Fit on the standalone details panel

## 26.3.0 (2026-11-26)

- Add circle-node level guides, a settings menu, a PDF print dialog and trace/activity tabs
- Make the deployment guide generic: placeholder hostname and GitHub user

## 26.2.2 (2026-11-04)

- Explain each Compare by option, and drop Duration and make Progress opt-in

## 26.2.1 (2026-11-04)

- Fix dark-mode bleed-through and fast-scroll glitches, trim duplicate code
- Print the grouped legend and layout notes to PDF

## 26.2.0 (2026-11-04)

- Use one spacing rhythm across the toolbar and menus
- Space the buttons on the right of the toolbar like those on the left
- Show the WBS level as an icon button with the level on a badge
- Move the legend into a Legend button with a grouped panel
- Size the sort, WBS level and Columns menus to their content
- Tidy the README line about the sort order button
- Show the sort order as an icon button
- Stop text being selected while dragging a panel's resize handle
- Sort same-day starts by finish, then code, when sorting by date
- Show a group row's button only while the pointer is over the row
- Show one button on a group's row, not two
- Make Collapse close the selected group itself, not only what is below it
- Expand or collapse everything inside one selected WBS group
- Clearer Replace and Exit compare in the Compare tools menu
- Keep a long file name inside the Compare tools drop area
- Stop long activity codes running into the next column
- Make every column except Activity switchable from the Columns menu
- Add baseline and change columns to the compare view
- Compare driving-logic traces between two programmes
- Add comparing two programmes
- Make release tags annotated so --follow-tags pushes them

## 26.1.0 (2026-11-03)

- First versioned release.
- Schedule: WBS grouping depth (including No groups), sort order, optional columns, date range filter, filter builder, Fit View menu, Today line and non-working shading.
- Trace driving logic: backward, forward and combined, from the selected activity or any activity ID, with Path only and CSV.
- PDF export carries the optional columns, shading, Today line and the traced path.
