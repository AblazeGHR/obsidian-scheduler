# Obsidian Scheduler

[English](./README.md) | [中文](./README.zh-CN.md)

[![GitHub release](https://img.shields.io/github/v/release/AblazeGHR/obsidian-scheduler?style=flat-square)](https://github.com/AblazeGHR/obsidian-scheduler/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](./LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-%237C3AED?style=flat-square&logo=obsidian)](https://obsidian.md)

A flexible schedule-management plugin for [Obsidian](https://obsidian.md) that reads dates and metadata from your frontmatter and renders them as **Table**, **Calendar**, **Timeline**, and **Kanban** views — with inline editing, recurring events, reminders, iCal import/export, and saved view templates.

> **Requires** the [Dataview](https://obsidian.md/plugins?id=dataview) community plugin.

---

## Features

### Four Views

| View | Highlights |
|------|------------|
| **Table** | Sort (multi-column, drag to reorder), filter, column show/hide, inline cell editing, multi-select batch edit, pagination, keyboard navigation |
| **Calendar** | Month / week toggle, drag entries to reschedule, **box-selection to multi-select** and batch-move, multi-day event spans, overflow indicator |
| **Timeline** | Day-axis with 24-hour columns, **all-day event strip**, drag to move / resize blocks, click empty space to create, now-line indicator |
| **Kanban** | Group by any field, drag cards between columns, "Unassigned" column, add cards inline |

### Data Sources

- **Frontmatter** — reads `due`, `start`, `end`, `title`, `tags`, and any custom field via configurable field mapping.
- **Inline fields** — supports `[key:: value]` and whole-line `key:: value` inline syntax.
- **Dataview** — queries your vault through the Dataview API; no separate database required.

### Workflow

- **Recurring events** — RRULE subset (`FREQ` / `INTERVAL` / `BYDAY` / `COUNT` / `UNTIL`).
- **Inline entry editing** — entries sourced from inline fields can be edited directly in any view; changes write back to the source line (`file#Ln`). Inline entries also render in the Calendar and Timeline.
- **Reminders** — Obsidian notifications when an entry is due (configurable lead time).
- **iCal import/export** — export the current view to `.ics`; import `.ics` files as markdown notes.
- **Markdown export** — export the current view as a formatted Markdown table.
- **View templates** — save your current view (type, sort, filters) and re-apply from the toolbar or via codeblock parameters.
- **Undo / redo** — programmatic frontmatter edits can be undone / redone via commands.

### Codeblocks

Embed any view directly in a note:

````
```scheduler
```
````

Pre-set views with dedicated block names:

````
```scheduler-table
```
```scheduler-calendar
```
```scheduler-timeline
```
```scheduler-kanban
```
````

Codeblock parameters (one per line):

```
view: table
folder: projects/
template: My Weekly Review
```

View state (sort, filters, hidden columns, search) is automatically persisted to the codeblock when you finish editing.

---

## Installation

### From the Community Plugin Store

1. Open Obsidian → **Settings** → **Community plugins** → **Browse**.
2. Search for **Scheduler** and install.
3. Enable the plugin.

### Manual

1. Make sure **Dataview** is installed and enabled.
2. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/AblazeGHR/obsidian-scheduler/releases).
3. Place them in `<vault>/.obsidian/plugins/obsidian-scheduler/`.
4. Enable **Scheduler** in Settings → Community plugins.

### BRAT (Beta Testing)

Add `AblazeGHR/obsidian-scheduler` to the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin.

---

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| Date Field | Primary date field | `due` |
| End Date Field | Optional multi-day end-date | *(empty)* |
| Recurrence Field | RRULE field | `recurrence` |
| Start / End Field | Time range fields | `start` / `end` |
| Title Field | Display title field | `title` |
| Tag Fields | Comma-separated tag fields | `tags` |
| Filterable Fields | Fields in the filter UI | `due`, `title`, `tags`, ... |
| Folders | Limit scope (empty = whole vault) | *(empty)* |
| Default View | View on panel open | `table` |
| Reminders | Notifications + lead time | on / `0` min |

---

## Usage

Open the Scheduler panel from the ribbon icon (📅) or run **Open Scheduler panel** from the command palette.

Add a codeblock to any note:

````
```scheduler
view: calendar
```
````

For full instructions see [USER_GUIDE.md](./USER_GUIDE.md).

---

## Development

```bash
git clone https://github.com/AblazeGHR/obsidian-scheduler
cd obsidian-scheduler
npm install
npm run dev      # watch mode
npm run build    # production build
npm run deploy   # build + copy to test vault
```

The UI is built with **[Preact](https://preactjs.com)** and bundled with **[esbuild](https://esbuild.github.io)**.

See [DEV_NOTE.md](./DEV_NOTE.md) for architecture details and the development log.

---

## Known Limitations

- **Recurring event edits move the entire series** — editing a single occurrence shifts the anchor date. "This instance only" exceptions are not supported yet.
- **Dataview is required** — this plugin depends on the Dataview community plugin for vault indexing.

---

## License

[MIT](./LICENSE)

---

## Contributing

Issues and pull requests are welcome. Before opening a PR, please:

1. Read [DEV_NOTE.md](./DEV_NOTE.md) for architecture context.
2. Build with `npm run build` and verify it passes.
3. Test manually in a vault with various frontmatter configurations.
