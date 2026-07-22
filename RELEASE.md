# Release checklist

Steps to cut a new release of the **Scheduler** plugin.

## Pre-release

- [ ] `npm run build` passes with no `tsc` errors and a clean esbuild bundle (`main.js` produced).
- [ ] Manual smoke test in a test vault (`../test-vault`):
  - [ ] Table: sort, multi-column sort, filter, inline edit, batch edit, pagination, column resize, column show/hide, keyboard nav (↑/↓/Enter).
  - [ ] Calendar: month/week toggle, drag-to-reschedule, multi-day event spans, `+` create, `+N more` overflow.
  - [ ] Timeline: day count switch, drag move/resize, selection-create, now-line.
  - [ ] Kanban: group-by switch, drag card across columns, `+ Add`, Unassigned column.
  - [ ] Recurring events render on the right days; editing a recurrence writes the anchor (documented limitation).
  - [ ] Reminders fire near the due time (or on the due day for all-day).
  - [ ] iCal export produces a valid `.ics`; import creates notes.
  - [ ] Markdown export writes a table note.
  - [ ] Undo/redo (`Undo last scheduler edit` / `Redo last scheduler edit`) restores frontmatter.
  - [ ] View templates save/apply/delete; `template:` codeblock param loads one.
- [ ] `manifest.json`: bump `version`; confirm `minAppVersion` (≥ 1.4.0) and `isDesktopOnly: false`.
- [ ] `package.json` `version` matches `manifest.json`.
- [ ] Update `USER_GUIDE.md` / `DEV_NOTE.md` if behavior changed.

## Versioning

- Current manifest version: **0.1.0** (pre-1.0, active development).
- For the first public/stable cut, bump to **1.0.0** once the known issues below are accepted or resolved.

## Package contents

The released folder must contain, at minimum:

- `main.js` (bundled output)
- `manifest.json`
- `styles.css`
- `README.md` (recommended for the community store)

## Known limitations (carry into release notes)

- **Repeated-event edits move the anchor** — dragging or editing a single occurrence of a recurring entry writes the root `date`/`start`/`end` field, shifting the whole series. "This instance only" exceptions are not supported in v1.
- **Left Ribbon mini-calendar is not implemented** — the panel/codeblock views are the supported entry points. (Tracked in `DEV_NOTE.md → 未完成功能`.)
- **Same-file rapid edits** — undo snapshots are captured inside a single atomic `vault.process`, so each edit is independently undoable; extremely rapid successive edits still record separate steps.

## Submitting

- Community plugin submissions need the repo to host `manifest.json`, `main.js`, and `styles.css`, plus a README.
- No network calls, no external dependencies shipped at runtime (Dataview is a peer requirement, not bundled).
