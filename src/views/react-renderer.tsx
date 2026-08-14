import { h, render, Component } from "preact";
import { useState, useMemo, useEffect, useRef } from "preact/hooks";
import { MarkdownRenderChild, WorkspaceLeaf, ItemView, Notice, TFile } from "obsidian";
import type SchedulerPlugin from "../main";
import { getDataviewApi } from "../utils/dataview-api";
import { QueryEngine } from "../query/query-engine";
import { CalendarView } from "./calendar/calendar-view";
import { TimelineView } from "./timeline/timeline-view";
import { ViewType, SortConfig, FilterClause, PageEntry, FieldMapping, ViewTemplate } from "../types";
import { filtersToFrontmatter, buildFrontmatterString, sanitizeFilename } from "../utils/new-file-builder";
import { NewEntryModal } from "../utils/new-entry-modal";
import { collectColumns, formatTagValue } from "./table/table-utils";
import { TableView, FilterBar } from "./table/table-view";
import { KanbanView } from "./kanban/kanban-view";
import { exportToICal, triggerIcsFilePicker } from "../utils/ical";
import { entriesToMarkdown } from "../utils/markdown-export";
import { CodeblockViewState } from "../utils/codeblock-state";
import { isInlinePath, parseInlinePath, applyInlineEdit, toParentPathValue } from "../utils/inline-editor";
import { collectFieldSuggestions } from "../utils/suggest";
import { Popover, isInsidePopoverHost } from "./shared/popover";

// ============================================================
// Error Boundary — catches render errors and shows them
// ============================================================

interface ErrorBoundaryState {
	error: Error | null;
}

class ErrorBoundary extends Component<{ children: any }, ErrorBoundaryState> {
	state: ErrorBoundaryState = { error: null };

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { error };
	}

	componentDidCatch(error: Error) {
		console.error("[scheduler] View render error:", error);
	}

	render() {
		if (this.state.error) {
			return (
				<div class="scheduler-empty">
					<p style="color: var(--text-error)">Render error: {this.state.error.message}</p>
				</div>
			);
		}
		return this.props.children;
	}
}

// ============================================================
// Frontmatter editing helpers
//
// Set one or more frontmatter fields. Replacement uses a function so values
// containing `$` (e.g. inside a tag) are written literally and never treated as
// a regex back-reference. A single `---\n ... \n---` block is expected.
// ============================================================

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;

/** Set a single frontmatter field (append if missing, replace if present). */
function setFrontmatterField(data: string, field: string, value: string): string {
	if (!FRONTMATTER_RE.test(data)) {
		return `---\n${field}: ${value}\n---\n\n${data}`;
	}
	return data.replace(FRONTMATTER_RE, (_m, fm: string) => {
		const fieldRe = new RegExp(`^(${field}\\s*:\\s*).+`, "m");
		const newFm = fieldRe.test(fm)
			? fm.replace(fieldRe, (_s, p1) => `${p1}${value}`)
			: `${fm}\n${field}: ${value}`;
		return `---\n${newFm}\n---`;
	});
}

/** Set several frontmatter fields at once (used for start/end fields). */
function setFrontmatterFields(data: string, fields: Record<string, string>): string {
	if (!FRONTMATTER_RE.test(data)) {
		const body = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n");
		return `---\n${body}\n---\n\n${data}`;
	}
	return data.replace(FRONTMATTER_RE, (_m, fm: string) => {
		let newFm = fm;
		for (const [field, value] of Object.entries(fields)) {
			const fieldRe = new RegExp(`^(${field}\\s*:\\s*).+`, "m");
			newFm = fieldRe.test(newFm)
				? newFm.replace(fieldRe, (_s, p1) => `${p1}${value}`)
				: `${newFm}\n${field}: ${value}`;
		}
		return `---\n${newFm}\n---`;
	});
}

/** Delete a frontmatter field line entirely (used when clearing time fields). */
function deleteFrontmatterField(data: string, field: string): string {
	if (!FRONTMATTER_RE.test(data)) return data;
	return data.replace(FRONTMATTER_RE, (_m, fm: string) => {
		const fieldRe = new RegExp(`^${field}\\s*:.*$\\n?`, "m");
		const newFm = fm.replace(fieldRe, "").replace(/\n{2,}/g, "\n").trimEnd();
		// If frontmatter becomes empty except whitespace, remove the block entirely
		if (newFm.trim() === "") return "";
		return `---\n${newFm}\n---`;
	});
}

// --- Inline field editing helpers ---

/** Escape special regex characters in a string. */
function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extract the value of an inline field from a line of text.
 *  Returns null if the field is not found. */
function getInlineFieldValue(lineText: string, field: string): string | null {
	const re = new RegExp(`\\[${escapeRegExp(field)}::\\s*([^\\]]*)\\]`, "i");
	const m = lineText.match(re);
	return m ? m[1].trim() : null;
}

/** Set, replace, or delete an inline field on a line of text.
 *  - If `value` is "" or undefined, the `[field:: ...]` pattern is removed.
 *  - If the field already exists on the line, its value is replaced.
 *  - Otherwise the inline field is appended at the end of the line. */
function setInlineField(lineText: string, field: string, value: string): string {
	const escField = escapeRegExp(field);
	const re = new RegExp(`\\[${escField}::\\s*[^\\]]*\\]`, "i");

	if (value === "" || value === undefined) {
		// Delete the inline field pattern and collapse extra spaces
		let result = lineText.replace(re, "");
		result = result.replace(/\s{2,}/g, " ").replace(/\s+$/, "");
		return result;
	}

	const replacement = `[${field}:: ${value}]`;
	if (re.test(lineText)) {
		return lineText.replace(re, replacement);
	}
	// Append to end of line
	return lineText.trimEnd() + " " + replacement;
}

// ============================================================
// ReactRenderer bridge
// ============================================================

export class ReactRenderer extends MarkdownRenderChild {
	private _unmount: (() => void) | null = null;

	constructor(
		container: HTMLElement,
		public element: h.JSX.Element
	) {
		super(container);
	}

	onload(): void {
		const root = document.createElement("div");
		root.className = "scheduler-root";
		this.containerEl.appendChild(root);
		render(this.element, root);
		this._unmount = () => render(null, root);
	}

	onunload(): void {
		if (this._unmount) {
			this._unmount();
			this._unmount = null;
		}
		this.containerEl.empty();
	}
}

// ============================================================
// Root component: SchedulerApp
// ============================================================

interface SchedulerAppProps {
	plugin: SchedulerPlugin;
	initialView?: ViewType;
	/** Override folder for new file creation (from codeblock param) */
	newFileFolder?: string;
	/** Name of a saved template to apply on mount (from codeblock param) */
	initialTemplate?: string;
	/** Pre-parsed view state from codeblock params (only on codeblock path) */
	initialState?: CodeblockViewState;
	/** Persist view state back into the codeblock (only on codeblock path) */
	onStateChange?: (state: CodeblockViewState) => void;
}

export function SchedulerApp({ plugin, initialView, newFileFolder, initialTemplate, initialState, onStateChange }: SchedulerAppProps) {
	const [viewType, setViewType] = useState<ViewType>(
		initialState?.viewType ?? initialView ?? plugin.settings.defaultView
	);
	const [sort, setSort] = useState<SortConfig[]>(initialState?.sort ?? []);
	const [filters, setFilters] = useState<FilterClause[]>(initialState?.filters ?? []);
	const [hiddenCols, setHiddenCols] = useState<Set<string>>(
		new Set(initialState?.hiddenCols ?? [])
	);
	const [inlineEntries, setInlineEntries] = useState<PageEntry[]>([]);
	const [dataVersion, setDataVersion] = useState(0);
	const [search, setSearch] = useState(initialState?.search ?? "");
	const [pageSize, setPageSize] = useState(initialState?.pageSize ?? 50);

	// View templates (mirrored from settings so the toolbar updates after saving)
	const [templates, setTemplates] = useState<ViewTemplate[]>(() => plugin.settings.templates ?? []);
	const [saveName, setSaveName] = useState("");

	const api = getDataviewApi(plugin.app);

	// Load inline field tasks on mount
	useEffect(() => {
		if (plugin.settings.enableInlineTasks && api) {
			const engine = new QueryEngine(plugin.app);
			engine.fetchInlineTasks(plugin.settings.fieldMapping, plugin.settings.folders, entries)
				.then((tasks) => setInlineEntries(tasks))
				.catch(() => setInlineEntries([]));
		} else {
			setInlineEntries([]);
		}
	}, [plugin.settings.enableInlineTasks, plugin.settings.folders, dataVersion]);

	if (!api) {
		return (
			<div class="scheduler-dataview-missing">
				<p>Dataview plugin is not installed or enabled.</p>
				<p>This plugin requires Dataview for indexing and querying markdown frontmatter.</p>
			</div>
		);
	}

	const entries = plugin.dataCache.getEntries(plugin.settings.fieldMapping, plugin.settings.folders);
	// Merge page entries with inline task entries
	const allEntries = useMemo(
		() => entries.concat(inlineEntries),
		[entries, inlineEntries]
	);
	const columns = useMemo(() => collectColumns(allEntries, plugin.settings.fieldMapping), [allEntries]);

	// Per-field suggestion options for filter value inputs (based on all entries)
	const fieldSuggestions = useMemo(
		() => collectFieldSuggestions(allEntries, plugin.settings.fieldMapping),
		[allEntries]
	);

	// Convert `visible:` whitelist to hidden set on first render with available columns
	const visibleConverted = useRef(false);
	useEffect(() => {
		if (visibleConverted.current) return;
		const vis = initialState?.visibleCols;
		if (vis && vis.length > 0 && columns.length > 0) {
			const hiddenSet = new Set(columns.filter((c) => !vis.includes(c)));
			setHiddenCols(hiddenSet);
			visibleConverted.current = true;
		}
	}, [columns, initialState]);

	// path→title map for resolving parent links to their target's title in search
	const titleByPath = useMemo(
		() => new Map(allEntries.map((e) => [e.path, e.title])),
		[allEntries]
	);

	// Global search: filter by title + parent target title + any field value (case-insensitive)
	const filteredEntries = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return allEntries;
		return allEntries.filter((e) => {
			if (e.title.toLowerCase().includes(q)) return true;
			// `parent` stores a path/link — also match the target entry's title
			const parentPath = toParentPathValue(e.fields?.["parent"]);
			if (parentPath) {
				const pt = titleByPath.get(parentPath);
				if (pt && pt.toLowerCase().includes(q)) return true;
			}
			const haystack = Object.entries(e.fields ?? {})
				.map(([k, v]) => `${k} ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
				.join(" ");
			return haystack.toLowerCase().includes(q);
		});
	}, [allEntries, search, titleByPath]);

	/** Re-query data after an edit. Bumps dataVersion after a short delay so Dataview
	 * has time to reindex the modified file. */
	function refreshData() {
		setTimeout(() => setDataVersion((v) => v + 1), 150);
	}

	// --- View templates ---
	/** Apply a saved template by name (sets view type, sort and filters). */
	function applyTemplate(name: string) {
		if (!name) return;
		const t = templates.find((x) => x.name === name);
		if (!t) return;
		setViewType(t.viewType);
		setSort(t.sort.map((s) => ({ ...s })));
		setFilters(t.filters.map((f) => ({ ...f })));
	}

	/** Save the current view (type + sort + filters) as a new named template. */
	async function saveTemplate() {
		const name = saveName.trim();
		if (!name) return;
		const tpl: ViewTemplate = {
			name,
			viewType,
			sort: sort.map((s) => ({ ...s })),
			filters: filters.map((f) => ({ ...f })),
		};
		const next = [...templates.filter((t) => t.name !== name), tpl];
		plugin.settings.templates = next;
		await plugin.saveSettings();
		setTemplates(next);
		setSaveName("");
	}

	async function deleteTemplate(name: string) {
		const next = templates.filter((t) => t.name !== name);
		plugin.settings.templates = next;
		await plugin.saveSettings();
		setTemplates(next);
	}

	// Apply a template passed via codeblock param on mount
	useEffect(() => {
		if (initialTemplate) {
			const t = (plugin.settings.templates ?? []).find((x) => x.name === initialTemplate);
			if (t) {
				setViewType(t.viewType);
				setSort(t.sort.map((s) => ({ ...s })));
				setFilters(t.filters.map((f) => ({ ...f })));
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// On mount, Dataview may not have finished building its index yet
	// (especially on startup when files haven't changed — no "resolved"
	// events fire). Wait a short window, then force a cache rebuild and
	// data re-fetch so all page entries are included.
	useEffect(() => {
		const timer = setTimeout(() => {
			plugin.dataCache.invalidate();
			setDataVersion((v) => v + 1);
		}, 500);
		return () => clearTimeout(timer);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Refresh when data changes externally (e.g. after undo/redo restore)
	useEffect(() => {
		const cb = () => setDataVersion((v) => v + 1);
		plugin.onDataChanged(cb);
		return () => plugin.offDataChanged(cb);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// --- codeblock state persistence (save on blur / unmount) ---
	// Instead of writing on every change (which triggers a markdown re-render
	// and an ugly flash), we save once when the view loses focus: either the
	// user clicks outside the scheduler, or the component unmounts (navigate
	// away / tab switch). This gives a smooth "edit → click away → persist"
	// flow.
	const onStateChangeRef = useRef(onStateChange);
	onStateChangeRef.current = onStateChange;
	const rootRef = useRef<HTMLDivElement | null>(null);
	const stateRef = useRef<CodeblockViewState>({ sort: [], filters: [], hiddenCols: [], search: "" });
	// Keep the ref in sync with current state on every render
	stateRef.current = { viewType, sort, filters, hiddenCols: [...hiddenCols], search, pageSize };

	function doSave() {
		if (onStateChangeRef.current) onStateChangeRef.current(stateRef.current);
	}

	// Save on unmount (navigate to another file, close Obsidian, etc.)
	useEffect(() => {
		return () => {
			if (onStateChangeRef.current) onStateChangeRef.current(stateRef.current);
		};
	}, []);

	// Save on mousedown outside the scheduler root. We use mousedown
	// (capture phase) instead of focusout because focusout fires spuriously
	// when the native date picker opens, causing a mid-edit save.
	useEffect(() => {
		if (!onStateChangeRef.current) return;
		function onMouseDown(e: MouseEvent) {
			const root = rootRef.current;
			if (root && !root.contains(e.target as Node) && !isInsidePopoverHost(e.target as Node)) {
				doSave();
			}
		}
		document.addEventListener("mousedown", onMouseDown, true);
		return () => document.removeEventListener("mousedown", onMouseDown, true);
	}, []);

	/** Handle drag-drop date change: write new date to file frontmatter or inline field.
	 *  When sourceDate is provided, also shifts dateEnd by the same offset
	 *  so multi-day entries keep their span. */
	function handleDateChange(path: string, newDateStr: string, sourceDate?: string) {
		const dateField = plugin.settings.fieldMapping.dateField;
		const endDateField = plugin.settings.fieldMapping.endDateField;

		// Inline entry editing
		if (isInlinePath(path)) {
			applyInlineEdit(plugin.app, path, (lineText) => {
				let result = setInlineField(lineText, dateField, newDateStr);

				// Shift the end-date by the same number of days
				if (sourceDate && endDateField) {
					const currentEndStr = getInlineFieldValue(lineText, endDateField);
					if (currentEndStr) {
						const src = new Date(sourceDate);
						const dst = new Date(newDateStr);
						const offsetDays = Math.round(
							(dst.getTime() - src.getTime()) / 86400000
						);
						if (offsetDays !== 0) {
							const oldEnd = new Date(currentEndStr);
							if (!isNaN(oldEnd.getTime())) {
								const newEnd = new Date(oldEnd);
								newEnd.setDate(newEnd.getDate() + offsetDays);
								const y = newEnd.getFullYear();
								const m = String(newEnd.getMonth() + 1).padStart(2, "0");
								const d = String(newEnd.getDate()).padStart(2, "0");
								result = setInlineField(result, endDateField, `${y}-${m}-${d}`);
							}
						}
					}
				}

				return result;
			}).then((res) => {
				if (res) plugin.undo.applyRaw(res.path, res.before, res.after);
				refreshData();
			});
			return;
		}

		// Frontmatter entry editing (original logic)
		plugin.undo
			.apply(path, (data) => {
				let result = setFrontmatterField(data, dateField, newDateStr);

				// Shift the end-date by the same number of days when
				// dragging a multi-day entry across the calendar.
				if (sourceDate && endDateField) {
					const src = new Date(sourceDate);
					const dst = new Date(newDateStr);
					const offsetDays = Math.round(
						(dst.getTime() - src.getTime()) / 86400000
					);
					if (offsetDays !== 0) {
						const fm = result.match(FRONTMATTER_RE);
						if (fm) {
							const re = new RegExp(`^${endDateField}\\s*:\\s*(.+)$`, "m");
							const endMatch = fm[1].match(re);
							if (endMatch) {
								const oldEnd = new Date(endMatch[1].trim());
								if (!isNaN(oldEnd.getTime())) {
									const newEnd = new Date(oldEnd);
									newEnd.setDate(newEnd.getDate() + offsetDays);
									const y = newEnd.getFullYear();
									const m = String(newEnd.getMonth() + 1).padStart(2, "0");
									const d = String(newEnd.getDate()).padStart(2, "0");
									result = setFrontmatterField(result, endDateField, `${y}-${m}-${d}`);
								}
							}
						}
					}
				}

				return result;
			})
			.then(() => refreshData());
	}

	/** Handle time block drag/resize: write new start/end to file frontmatter or inline field.
	 *  When newStart or newEnd are empty strings, the corresponding field is deleted.
	 *  For timed entries the date field is synced to the start day so a block dragged
	 *  across days lands on the correct day. */
	function handleTimeChange(path: string, newStart: string, newEnd: string) {
		const startField = plugin.settings.fieldMapping.startField;
		const endField = plugin.settings.fieldMapping.endField;
		const dateField = plugin.settings.fieldMapping.dateField;
		const newDateStr = newStart ? newStart.slice(0, 10) : "";

		// Inline entry editing
		if (isInlinePath(path)) {
			applyInlineEdit(plugin.app, path, (lineText) => {
				let result = lineText;
				result = setInlineField(result, startField, newStart);
				result = setInlineField(result, endField, newEnd);
				if (newDateStr) result = setInlineField(result, dateField, newDateStr);
				return result;
			}).then((res) => {
				if (res) plugin.undo.applyRaw(res.path, res.before, res.after);
				refreshData();
			});
			return;
		}

		// Frontmatter entry editing — delete fields when value is empty
		const hasEmptyStart = newStart === "";
		const hasEmptyEnd = newEnd === "";

		plugin.undo
			.apply(path, (data) => {
				let result = data;
				if (hasEmptyStart) {
					result = deleteFrontmatterField(result, startField);
				} else {
					result = setFrontmatterField(result, startField, newStart);
				}
				if (hasEmptyEnd) {
					result = deleteFrontmatterField(result, endField);
				} else {
					result = setFrontmatterField(result, endField, newEnd);
				}
				// Keep the date field in sync with the (possibly moved) start day.
				if (newDateStr) {
					result = setFrontmatterField(result, dateField, newDateStr);
				}
				return result;
			})
			.then(() => refreshData());
	}

	/** Handle table cell edit: write new value to frontmatter or inline field */
	function handleCellEdit(path: string, field: string, newValue: string) {
		if (isInlinePath(path)) {
			applyInlineEdit(plugin.app, path, (lineText) => setInlineField(lineText, field, newValue))
				.then((res) => {
					if (res) plugin.undo.applyRaw(res.path, res.before, res.after);
					refreshData();
				});
			return;
		}
		// Clearing the document's parent link removes the frontmatter line entirely
		if (field === "parent" && newValue === "") {
			plugin.undo.apply(path, (data) => deleteFrontmatterField(data, field)).then(() => refreshData());
			return;
		}
		plugin.undo.apply(path, (data) => setFrontmatterField(data, field, newValue)).then(() => refreshData());
	}

	/** Tag-aware field writer used by the Kanban view: writes a scalar value, or a
	 * single-element YAML array when the field is a configured tag field. */
	function handleFieldWrite(path: string, field: string, value: string) {
		const isTag = plugin.settings.fieldMapping.tagFields.includes(field);
		const formatted = isTag ? formatTagValue([value]) : value;

		if (isInlinePath(path)) {
			applyInlineEdit(plugin.app, path, (lineText) => setInlineField(lineText, field, formatted))
				.then((res) => {
					if (res) plugin.undo.applyRaw(res.path, res.before, res.after);
					refreshData();
				});
			return;
		}
		plugin.undo.apply(path, (data) => setFrontmatterField(data, field, formatted)).then(() => refreshData());
	}

	/** Open an entry's file in the workspace */
	function handleOpenEntry(path: string) {
		plugin.app.workspace.openLinkText(path, "", false);
	}

	/** Create a new MD file with frontmatter inherited from current filters.
	 * `inheritFields` lets callers (e.g. Kanban) seed extra fields by column value. */
	function handleCreateEntry(
		dateStr?: string,
		startTime?: string,
		endTime?: string,
		inheritFields?: Record<string, string>
	) {
		// Use local time to avoid timezone offset
		const now = new Date();
		const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
		const baseDate = dateStr ?? todayLocal;

		// Convert filters to frontmatter
		const fmFields = filtersToFrontmatter(filters, baseDate);

		// Set dateField: always when a specific date is provided, or when filters include it
		const dateField = plugin.settings.fieldMapping.dateField;
		if (dateStr || (filters.length > 0 && filters.some((c) => c.type === "visual" && c.conditions.some((co) => co.field === dateField)))) {
			fmFields[dateField] = baseDate;
		}

		// Optional time range for timeline-created events
		const startField = plugin.settings.fieldMapping.startField;
		const endField = plugin.settings.fieldMapping.endField;
		if (startTime && endTime) {
			fmFields[startField] = startTime;
			fmFields[endField] = endTime;
		}

		// Inherit additional fields (e.g. Kanban column value)
		if (inheritFields) {
			for (const [k, v] of Object.entries(inheritFields)) {
				fmFields[k] = plugin.settings.fieldMapping.tagFields.includes(k)
					? formatTagValue([v])
					: v;
			}
		}

		new NewEntryModal(plugin.app, (title) => {
			const filename = sanitizeFilename(title);
			const fm = buildFrontmatterString(
				fmFields,
				plugin.settings.fieldMapping.titleField,
				dateField,
				fmFields[dateField] as string
			);
			// Insert title into frontmatter
			const titleLine = `${plugin.settings.fieldMapping.titleField}: ${title}`;
			const finalFm = fm.replace("---\n", `---\n${titleLine}\n`);

			// Determine folder: codeblock param > settings folders > vault root
			const folder = newFileFolder ?? (plugin.settings.folders.length > 0 ? plugin.settings.folders[0] : "");
			const filePath = folder ? `${folder}/${filename}.md` : `${filename}.md`;

			// Warn if an entry with the same name already exists
			const existing = plugin.app.vault.getAbstractFileByPath(filePath);
			if (existing) {
				new Notice(`"${title}" already exists — appending suffix.`, 4000);
			}

			plugin.app.vault.create(filePath, finalFm)
				.then(() => setDataVersion((v) => v + 1))
				.catch(() => {
				plugin.app.vault.create(
					folder ? `${folder}/${filename} 1.md` : `${filename} 1.md`,
					finalFm
				).then(() => setDataVersion((v) => v + 1));
			});
		}	).open();
	}

	/** Delete an entry: trash the note for frontmatter entries, or remove the
	 *  source line for inline entries. Both are reversible (Obsidian trash /
	 *  the plugin undo stack). */
	function handleDeleteEntry(path: string) {
		// Inline entry — delete the source line (`file.md#Ln`) from its note.
		if (isInlinePath(path)) {
			const parsed = parseInlinePath(path);
			if (!parsed) return;
			const file = plugin.app.vault.getAbstractFileByPath(parsed.filePath);
			if (!(file instanceof TFile)) return;
			plugin.app.vault.read(file).then((before) => {
				const lines = before.split("\n");
				if (parsed.line < 1 || parsed.line > lines.length) return;
				lines.splice(parsed.line - 1, 1);
				const after = lines.join("\n");
				return plugin.app.vault.modify(file, after).then(() => {
					plugin.undo.applyRaw(parsed.filePath, before, after);
					refreshData();
				});
			});
			return;
		}

		// Frontmatter entry — move the whole note to trash (recoverable).
		const file = plugin.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			plugin.app.fileManager.trashFile(file).then(() => refreshData());
		}
	}

	return (
		<div class="scheduler-root" ref={rootRef}>
			<div class="scheduler-toolbar">
				<SchedulerViewTabs current={viewType} onChange={setViewType} />
				<div class="scheduler-search">
					<input
						class="scheduler-search-input"
						type="text"
						value={search}
						placeholder="Search titles & fields…"
						onInput={(e: any) => setSearch(e.target.value)}
					/>
					{search && (
						<button class="scheduler-search-clear" onClick={() => setSearch("")} title="Clear search">
							&times;
						</button>
					)}
				</div>
				<ToolbarDropdown label="Templates">
					{templates.length > 0
						? templates.map((t) => (
							<div class="scheduler-dropdown-item scheduler-dropdown-row">
								<span class="scheduler-dropdown-item-text" onClick={() => applyTemplate(t.name)}>{t.name}</span>
								<button
									class="scheduler-dropdown-del"
									type="button"
									title="Delete template"
									onClick={(e: any) => { e.stopPropagation(); deleteTemplate(t.name); }}
								>
									&times;
								</button>
							</div>
						))
						: (
							<div class="scheduler-dropdown-item" style="color: var(--text-muted); cursor: default;">
								No saved templates
							</div>
						)
					}
					<div class="scheduler-dropdown-separator" />
					<span class="scheduler-dropdown-save-label">Save view as template</span>
					<div class="scheduler-dropdown-save" onClick={(e: any) => e.stopPropagation()}>
						<input
							class="scheduler-template-name"
							type="text"
							value={saveName}
							placeholder="Template name"
							onInput={(e: any) => setSaveName(e.target.value)}
							onKeyDown={(e: any) => {
								if (e.key === "Enter") { saveTemplate(); }
								if (e.key === "Escape") { setSaveName(""); }
								}}
							/>
							<button
								class="scheduler-template-confirm"
								onClick={() => { saveTemplate(); }}
								disabled={!saveName.trim()}
							>
								OK
							</button>
						</div>
				</ToolbarDropdown>
				<ToolbarDropdown label="Export/Import">
					<div class="scheduler-dropdown-item" onClick={() => plugin.exportEntriesToIcal(filteredEntries)}>
						Export .ics
					</div>
					<div class="scheduler-dropdown-item" onClick={() => plugin.exportEntriesToMarkdown(filteredEntries, columns)}>
						Export .md
					</div>
					<div class="scheduler-dropdown-item" onClick={() => triggerIcsFilePicker((text) => plugin.importIcalFromText(text))}>
						Import .ics
					</div>
				</ToolbarDropdown>
			</div>
			<div class="scheduler-view-content">
				{viewType === "table" && (
					<TableView
						entries={filteredEntries}
						columns={columns}
						mapping={plugin.settings.fieldMapping}
						sort={sort}
						onSortChange={setSort}
						filters={filters}
						onFiltersChange={setFilters}
						hiddenCols={hiddenCols}
						onHiddenColsChange={setHiddenCols}
						onCellEdit={handleCellEdit}
						onOpenEntry={handleOpenEntry}
						onCreateEntry={() => handleCreateEntry()}
						onDeleteEntry={handleDeleteEntry}
						initialPageSize={initialState?.pageSize}
						onPageSizeChange={setPageSize}
						suggestions={fieldSuggestions}
					/>
				)}
			{viewType === "calendar" && (
				<ErrorBoundary>
					<CalendarView entries={filteredEntries} mapping={plugin.settings.fieldMapping} onDateChange={handleDateChange} onOpenEntry={handleOpenEntry} onCreateEntry={(dateStr) => handleCreateEntry(dateStr)} onDeleteEntry={handleDeleteEntry} filters={filters} onFiltersChange={setFilters} columns={columns} />
				</ErrorBoundary>
			)}
			{viewType === "timeline" && (
				<ErrorBoundary>
					<TimelineView entries={filteredEntries} mapping={plugin.settings.fieldMapping} onTimeChange={handleTimeChange} onOpenEntry={handleOpenEntry} onCreateEntry={(dateStr, startTime, endTime) => handleCreateEntry(dateStr, startTime, endTime)} onDeleteEntry={handleDeleteEntry} filters={filters} onFiltersChange={setFilters} columns={columns} />
				</ErrorBoundary>
			)}
			{viewType === "kanban" && (
				<ErrorBoundary>
					<KanbanView
						entries={filteredEntries}
						mapping={plugin.settings.fieldMapping}
						onGroupChange={handleFieldWrite}
						onOpenEntry={handleOpenEntry}
						onCreateEntry={(groupField, value) => handleCreateEntry(undefined, undefined, undefined, { [groupField]: value })}
						onDeleteEntry={handleDeleteEntry}
					/>
				</ErrorBoundary>
			)}
			</div>
		</div>
	);
}

// ============================================================
// Toolbar dropdown — reusable absolute-positioned popover menu
// ============================================================

interface ToolbarDropdownProps {
	label: string;
	children: any;
}

function ToolbarDropdown({ label, children }: ToolbarDropdownProps) {
	const [open, setOpen] = useState(false);
	const wrapRef = useRef<HTMLDivElement | null>(null);

	return (
		<div class="scheduler-toolbar-dropdown" ref={wrapRef}>
			<button
				class="scheduler-toolbar-dropdown-btn"
				type="button"
				onClick={() => setOpen((o) => !o)}
			>
				{label} ▼
			</button>
			<Popover
				anchorRef={wrapRef}
				open={open}
				align="end"
				className="scheduler-toolbar-dropdown-menu"
				onOutsideClick={() => setOpen(false)}
			>
				<div onClick={() => setOpen(false)}>{children}</div>
			</Popover>
		</div>
	);
}

// ============================================================
// Tab bar
// ============================================================

function SchedulerViewTabs({ current, onChange }: { current: ViewType; onChange: (v: ViewType) => void }) {
	const tabs: { type: ViewType; label: string }[] = [
		{ type: "table", label: "Table" },
		{ type: "calendar", label: "Calendar" },
		{ type: "timeline", label: "Timeline" },
		{ type: "kanban", label: "Kanban" },
	];

	return (
		<div class="scheduler-view-tabs">
			{tabs.map((tab) => (
				<button
					class={`scheduler-view-tab${tab.type === current ? " active" : ""}`}
					onClick={() => onChange(tab.type)}
				>
					{tab.label}
				</button>
			))}
		</div>
	);
}

// ============================================================
// Obsidian ItemView
// ============================================================

export const VIEW_TYPE_SCHEDULER = "obsidian-scheduler-view";

export class SchedulerView extends ItemView {
	plugin: SchedulerPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: SchedulerPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_SCHEDULER;
	}

	getDisplayText(): string {
		return "Scheduler";
	}

	getIcon(): string {
		return "calendar-clock";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		container.empty();
		container.className = "scheduler-root";
		render(<SchedulerApp plugin={this.plugin} />, container);
	}

	async onClose(): Promise<void> {
		const container = this.containerEl.children[1];
		if (container) {
			render(null, container);
		}
	}
}

// ============================================================
// Codeblock helper
// ============================================================

export function createCodeblockRenderer(
	el: HTMLElement,
	plugin: SchedulerPlugin,
	initialView?: ViewType,
	newFileFolder?: string,
	initialTemplate?: string,
	initialState?: CodeblockViewState,
	onStateChange?: (state: CodeblockViewState) => void
): ReactRenderer {
	return new ReactRenderer(
		el,
		<SchedulerApp
			plugin={plugin}
			initialView={initialView}
			newFileFolder={newFileFolder}
			initialTemplate={initialTemplate}
			initialState={initialState}
			onStateChange={onStateChange}
		/>
	);
}
