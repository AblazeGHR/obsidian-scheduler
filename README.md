# Scheduler

A flexible schedule-management plugin for [Obsidian](https://obsidian.md), powered by the [Dataview](https://github.com/blacksmithgu/obsidian-dataview) plugin. Scheduler reads dates and metadata from your notes' frontmatter (and inline fields) and renders them as **Table**, **Calendar**, **Timeline**, and **Kanban** views — with inline editing, recurring events, reminders, iCal import/export, and saved view templates.

## Features

- **Four views** — Table (sortable/filterable, inline cell editing, multi-select batch edit), Calendar (month/week, drag to reschedule, multi-day events), Timeline (day/hour axis, drag to move/resize, multi-day columns), Kanban (group by any field, drag cards between columns).
- **Dataview-backed** — queries your vault through the Dataview API; no separate database.
- **Frontmatter & inline fields** — reads `due`, `start`, `end`, `title`, `tags`, and any custom field; also supports `[key:: value]` and whole-line `key:: value` inline fields.
- **Recurring events** — RRULE subset (`FREQ`/`INTERVAL`/`BYDAY`/`COUNT`/`UNTIL`) with bounded expansion.
- **Reminders** — Obsidian notifications when an entry becomes due (configurable lead time).
- **iCal import/export** — export current entries to `.ics`; import `.ics` to create notes.
- **Markdown export** — dump the current view to a Markdown table note.
- **View templates** — save the current view (type + sort + filters) and re-apply from the toolbar, or via the `template:` codeblock parameter.
- **Undo/redo** — programmatic frontmatter edits can be undone/redone (`Undo last scheduler edit` / `Redo last scheduler edit` commands).
- **Codeblocks** — embed any view in a note with ` ```scheduler `, ` ```scheduler-table `, ` ```scheduler-calendar `, ` ```scheduler-timeline `, ` ```scheduler-kanban ` (supports `view:`, `folder:`, `template:` params).

## Requirements

- Obsidian **≥ 1.4.0**
- The **Dataview** community plugin must be installed and enabled.

## Installation

1. Enable the **Dataview** community plugin (Settings → Community plugins → Browse → Dataview).
2. Copy the `obsidian-scheduler` folder (containing `main.js`, `manifest.json`, `styles.css`) into your vault's `.obsidian/plugins/` directory.
3. Enable **Scheduler** in Settings → Community plugins.
4. Open the panel from the ribbon icon (calendar-clock) or the command palette (`Open Scheduler panel`).

See [USER_GUIDE.md](./USER_GUIDE.md) for full usage instructions, and [DEV_NOTE.md](./DEV_NOTE.md) for the development log.

## Configuration

All options live in **Settings → Scheduler**:

| Setting | Purpose | Default |
|---------|---------|---------|
| Date Field | Frontmatter field holding the primary date | `due` |
| End Date Field | Optional multi-day end-date field | _(empty)_ |
| Recurrence Field | Frontmatter field holding an RRULE string | `recurrence` |
| Start / End Field | Time-range fields | `start` / `end` |
| Title Field | Display title field | `title` |
| Tag Fields | Comma-separated tag fields | `tags` |
| Filterable Fields | Fields offered in the filter UI | `due,title,tags,priority,status,...` |
| Folders | Limit scope (empty = whole vault) | _(empty)_ |
| Default View | View opened by the panel/codeblocks | `table` |
| Enable reminders / lead time | Notification behavior | on / `0` |

## Development

```bash
npm install        # install deps
npm run dev        # esbuild watch mode
npm run build      # tsc --noEmit + production bundle (main.js)
npm run deploy     # build + copy into ../test-vault/.obsidian/plugins/obsidian-scheduler/
```

The UI is built with **Preact** (`jsxImportSource: preact`) and bundled with **esbuild**. `tsc --noEmit` runs first as a type gate.

## Project layout

See `DEV_NOTE.md → 文件结构` for the full source tree. Key entry points:

- `src/main.ts` — plugin lifecycle, commands, codeblock processors, reminders, iCal/Markdown export.
- `src/views/react-renderer.tsx` — `SchedulerApp` root (toolbar, tabs, search, templates) and the four frontmatter edit handlers.
- `src/query/data-cache.ts` — cached entry fetching with automatic invalidation.
- `src/utils/recurrence.ts`, `reminders.ts`, `ical.ts`, `undo-manager.ts` — feature modules.

## License

MIT
