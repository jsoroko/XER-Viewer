# Changelog

Versions are `YY.MAJOR.MINOR`: the year, then a major and a minor release counter that both restart each January.
Add an entry with `bun run release major` or `bun run release minor`.

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
