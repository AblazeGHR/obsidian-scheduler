import { h, render, Component } from "preact";
import { useState, useMemo, useEffect } from "preact/hooks";
import { MarkdownRenderChild, WorkspaceLeaf, ItemView } from "obsidian";
import type SchedulerPlugin from "../main";
import { getDataviewApi } from "../utils/dataview-api";
import { QueryEngine } from "../query/query-engine";
import { CalendarView } from "./calendar/calendar-view";
import { TimelineView } from "./timeline/timeline-view";
import { ViewType, SortConfig, FilterCondition, PageEntry, FieldMapping } from "../types";
import { filtersToFrontmatter, buildFrontmatterString, sanitizeFilename } from "../utils/new-file-builder";
import { NewEntryModal } from "../utils/new-entry-modal";

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
// Fields helpers
// ============================================================

const INTERNAL_FIELD_PREFIXES = ["file.", "settings", "recursiveSubTask", "maxRecursiveRender"];

function isInternalField(key: string): boolean {
	return INTERNAL_FIELD_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function isDisplayableValue(val: unknown): boolean {
	if (val === null || val === undefined) return false;
	if (typeof val === "string") return val.length > 0;
	if (typeof val === "number") return true;
	if (typeof val === "boolean") return true;
	if (val instanceof Date) return !isNaN(val.getTime());
	if (Array.isArray(val)) {
		const first = val[0];
		return typeof first === "string";
	}
	return false;
}

/** Collect all user-facing sorted column names from entries */
function collectColumns(entries: PageEntry[], mapping: FieldMapping): string[] {
	const allKeys = new Set<string>();
	for (const entry of entries) {
		for (const key of Object.keys(entry.fields ?? {})) {
			if (!isInternalField(key)) allKeys.add(key);
		}
	}
	const baseColumns = ["title", "date", ...mapping.tagFields];
	const extra = Array.from(allKeys).filter(
		(k) => k !== mapping.titleField && k !== mapping.dateField && !baseColumns.includes(k)
	);
	return [...baseColumns, ...extra].filter((c, i, arr) => arr.indexOf(c) === i);
}

function formatCellValue(entry: PageEntry, column: string): string {
	switch (column) {
		case "title":
			return entry.title;
		case "date":
			return entry.date ? formatDate(entry.date) : "";
		default:
			const val = entry.fields?.[column];
			if (val === null || val === undefined) return "";
			if (isDisplayableValue(val)) {
				if (Array.isArray(val)) return val.join(", ");
				if (val instanceof Date) return formatDate(val);
				return String(val);
			}
			return "";
	}
}

function formatDate(val: unknown): string {
	if (val instanceof Date) return val.toLocaleDateString();
	if (typeof val === "number") return new Date(val).toLocaleDateString();
	if (typeof val === "string") {
		const d = new Date(val);
		if (!isNaN(d.getTime())) return d.toLocaleDateString();
	}
	return String(val ?? "");
}

// ============================================================
// Root component: SchedulerApp
// ============================================================

interface SchedulerAppProps {
	plugin: SchedulerPlugin;
	initialView?: ViewType;
	/** Override folder for new file creation (from codeblock param) */
	newFileFolder?: string;
}

export function SchedulerApp({ plugin, initialView, newFileFolder }: SchedulerAppProps) {
	const [viewType, setViewType] = useState<ViewType>(initialView ?? plugin.settings.defaultView);
	const [sort, setSort] = useState<SortConfig[]>([]);
	const [filters, setFilters] = useState<FilterCondition[]>([]);
	const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
	const [inlineEntries, setInlineEntries] = useState<PageEntry[]>([]);
	const [dataVersion, setDataVersion] = useState(0);

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

	const engine = new QueryEngine(plugin.app);
	const entries = engine.fetchPages(plugin.settings.fieldMapping, plugin.settings.folders);
	// Merge page entries with inline task entries
	const allEntries = useMemo(
		() => entries.concat(inlineEntries),
		[entries, inlineEntries]
	);
	const columns = useMemo(() => collectColumns(allEntries, plugin.settings.fieldMapping), [allEntries]);

	/** Handle drag-drop date change: write new date to file frontmatter */
	function handleDateChange(path: string, newDateStr: string) {
		const dateField = plugin.settings.fieldMapping.dateField;
		const file = plugin.app.vault.getAbstractFileByPath(path) as import("obsidian").TFile;
		if (!file) return;
		plugin.app.vault.process(file,
			(data: string) => {
				// Match the YAML frontmatter block
				const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
				const match = data.match(frontmatterRegex);
				if (!match) {
					// No frontmatter — prepend one
					return `---\n${dateField}: ${newDateStr}\n---\n\n${data}`;
				}
				const fm = match[1];
				const dateRegex = new RegExp(`^(${dateField}\\s*:\\s*).+`, "m");
				if (dateRegex.test(fm)) {
					const newFm = fm.replace(dateRegex, `$1${newDateStr}`);
					return data.replace(frontmatterRegex, `---\n${newFm}\n---`);
				} else {
					// Field doesn't exist — append it
					const newFm = fm + `\n${dateField}: ${newDateStr}`;
					return data.replace(frontmatterRegex, `---\n${newFm}\n---`);
				}
			}
		);
	}

	/** Handle time block drag/resize: write new start/end to file frontmatter */
	function handleTimeChange(path: string, newStart: string, newEnd: string) {
		const startField = plugin.settings.fieldMapping.startField;
		const endField = plugin.settings.fieldMapping.endField;
		const file = plugin.app.vault.getAbstractFileByPath(path) as import("obsidian").TFile;
		if (!file) return;

		plugin.app.vault.process(file, (data: string) => {
			const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
			const match = data.match(frontmatterRegex);
			if (!match) {
				return `---\n${startField}: ${newStart}\n${endField}: ${newEnd}\n---\n\n${data}`;
			}
			let fm = match[1];

			const startRegex = new RegExp(`^(${startField}\\s*:\\s*).+`, "m");
			const endRegex = new RegExp(`^(${endField}\\s*:\\s*).+`, "m");

			fm = fm.replace(startRegex, `$1${newStart}`);
			fm = fm.replace(endRegex, `$1${newEnd}`);

			// If fields don't exist, append them
			if (!startRegex.test(fm)) fm += `\n${startField}: ${newStart}`;
			if (!endRegex.test(fm)) fm += `\n${endField}: ${newEnd}`;

			return data.replace(frontmatterRegex, `---\n${fm}\n---`);
		});
	}

	/** Handle table cell edit: write new value to frontmatter field */
	function handleCellEdit(path: string, field: string, newValue: string) {
		const file = plugin.app.vault.getAbstractFileByPath(path) as import("obsidian").TFile;
		if (!file) return;

		plugin.app.vault.process(file, (data: string) => {
			const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
			const match = data.match(frontmatterRegex);
			if (!match) {
				return `---\n${field}: ${newValue}\n---\n\n${data}`;
			}
			let fm = match[1];

			const fieldRegex = new RegExp(`^(${field}\\s*:\\s*).+`, "m");
			if (fieldRegex.test(fm)) {
				fm = fm.replace(fieldRegex, `$1${newValue}`);
			} else {
				fm += `\n${field}: ${newValue}`;
			}

			return data.replace(frontmatterRegex, `---\n${fm}\n---`);
		});
	}

	/** Create a new MD file with frontmatter inherited from current filters */
	function handleCreateEntry(dateStr?: string) {
		// Use local time to avoid timezone offset
		const now = new Date();
		const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
		const baseDate = dateStr ?? todayLocal;

		// Convert filters to frontmatter
		const fmFields = filtersToFrontmatter(filters, baseDate);

		// Set dateField: always when a specific date is provided, or when filters include it
		const dateField = plugin.settings.fieldMapping.dateField;
		if (dateStr || (filters.length > 0 && filters.some((f) => f.field === dateField))) {
			fmFields[dateField] = baseDate;
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

			plugin.app.vault.create(filePath, finalFm)
				.then(() => setDataVersion((v) => v + 1))
				.catch(() => {
				plugin.app.vault.create(
					folder ? `${folder}/${filename} 1.md` : `${filename} 1.md`,
					finalFm
				).then(() => setDataVersion((v) => v + 1));
			});
		}).open();
	}

	return (
		<div class="scheduler-root">
			<SchedulerViewTabs current={viewType} onChange={setViewType} />
			<div class="scheduler-view-content">
				{viewType === "table" && (
					<TableView
						entries={allEntries}
						columns={columns}
						mapping={plugin.settings.fieldMapping}
						sort={sort}
						onSortChange={setSort}
						filters={filters}
						onFiltersChange={setFilters}
						hiddenCols={hiddenCols}
						onHiddenColsChange={setHiddenCols}
						onCellEdit={handleCellEdit}
						onCreateEntry={() => handleCreateEntry()}
					/>
				)}
				{viewType === "calendar" && (
					<ErrorBoundary>
						<CalendarView entries={allEntries} mapping={plugin.settings.fieldMapping} onDateChange={handleDateChange} onCreateEntry={(dateStr) => handleCreateEntry(dateStr)} />
					</ErrorBoundary>
				)}
				{viewType === "timeline" && (
					<ErrorBoundary>
						<TimelineView entries={allEntries} mapping={plugin.settings.fieldMapping} onTimeChange={handleTimeChange} onCreateEntry={() => handleCreateEntry()} />
					</ErrorBoundary>
				)}
			</div>
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
// Table View
// ============================================================

interface TableViewProps {
	entries: PageEntry[];
	columns: string[];
	mapping: FieldMapping;
	sort: SortConfig[];
	onSortChange: (sort: SortConfig[]) => void;
	filters: FilterCondition[];
	onFiltersChange: (filters: FilterCondition[]) => void;
	hiddenCols: Set<string>;
	onHiddenColsChange: (cols: Set<string>) => void;
	onCellEdit?: (path: string, field: string, value: string) => void;
	onCreateEntry?: () => void;
}

function TableView({ entries, columns, mapping, sort, onSortChange, filters, onFiltersChange, hiddenCols, onHiddenColsChange, onCellEdit, onCreateEntry }: TableViewProps) {
	const visibleCols = columns.filter((c) => !hiddenCols.has(c));

	// Apply filters then sort (both are pure static functions)
	const filtered = filters.length > 0 ? QueryEngine.applyFilters(entries, filters) : entries;
	const sorted = sort.length > 0 ? QueryEngine.applySort(filtered, sort) : filtered;

	function handleSort(column: string) {
		const existing = sort.find((s) => s.field === column);
		if (!existing) {
			onSortChange([...sort, { field: column, direction: "asc" }]);
		} else if (existing.direction === "asc") {
			onSortChange(sort.map((s) => (s.field === column ? { ...s, direction: "desc" } : s)));
		} else {
			onSortChange(sort.filter((s) => s.field !== column));
		}
	}

	function getSortIcon(column: string): string {
		const idx = sort.findIndex((s) => s.field === column);
		if (idx === -1) return "";
		const arrow = sort[idx].direction === "asc" ? "\u2191" : "\u2193";
		const prio = idx + 1;
		return ` ${arrow}${prio}`;
	}

	function getSortTitle(column: string): string {
		const idx = sort.findIndex((s) => s.field === column);
		if (idx === -1) return `Sort by ${column}`;
		const dir = sort[idx].direction === "asc" ? "ascending" : "descending";
		return `Sort #${idx + 1}: ${column} (${dir}) — click to toggle, delete last to remove`;
	}

	if (entries.length === 0) {
		return (
			<div class="scheduler-empty">
				<p>No entries found. Create markdown files with frontmatter fields to see data here.</p>
			</div>
		);
	}

	return (
		<div>
			<FilterBar
				columns={columns}
				filters={filters}
				onFiltersChange={onFiltersChange}
				hiddenCols={hiddenCols}
				onHiddenColsChange={onHiddenColsChange}
				entriesCount={sorted.length}
				totalCount={entries.length}
				onCreateEntry={onCreateEntry}
			/>
			<table class="scheduler-table">
				<thead>
					<tr>
						{visibleCols.map((col) => (
							<th onClick={() => handleSort(col)} title={getSortTitle(col)}>
								{col}
								<span class="scheduler-sort-icon">{getSortIcon(col)}</span>
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{sorted.map((entry) => (
						<tr key={entry.path}>
							{visibleCols.map((col) => (
								col === "title" ? (
									<td
										class="scheduler-cell-title"
										onClick={() => {
											const app = (globalThis as any).app;
											if (app) app.workspace.openLinkText(entry.path, "", false);
										}}
									>
										{formatCellValue(entry, col)}
									</td>
								) : (
									<td
										contentEditable={true}
										class="scheduler-cell-editable"
										onBlur={(e) => {
											const text = (e.target as HTMLElement).textContent?.trim() ?? "";
											const prev = formatCellValue(entry, col);
											if (text !== prev) {
												onCellEdit?.(entry.path, col, text);
											}
										}}
									>
										{formatCellValue(entry, col)}
									</td>
								)
							))}
						</tr>
					))}
				</tbody>
				{onCreateEntry && (
					<tfoot>
						<tr>
							<td colspan={visibleCols.length} class="scheduler-table-add-row" onClick={onCreateEntry}>
								+ New entry
							</td>
						</tr>
					</tfoot>
				)}
			</table>
		</div>
	);
}

// ============================================================
// Filter Bar
// ============================================================

interface FilterBarProps {
	columns: string[];
	filters: FilterCondition[];
	onFiltersChange: (filters: FilterCondition[]) => void;
	hiddenCols: Set<string>;
	onHiddenColsChange: (cols: Set<string>) => void;
	entriesCount: number;
	totalCount: number;
	onCreateEntry?: () => void;
}

function FilterBar({ columns, filters, onFiltersChange, hiddenCols, onHiddenColsChange, entriesCount, totalCount, onCreateEntry }: FilterBarProps) {
	const operators = [
		{ value: "equals", label: "=" },
		{ value: "contains", label: "contains" },
		{ value: "greater_than", label: ">" },
		{ value: "less_than", label: "<" },
		{ value: "before", label: "< date" },
		{ value: "after", label: "> date" },
	];

	function addFilter() {
		onFiltersChange([
			...filters,
			{ field: columns[0] ?? "title", operator: "contains", value: "" },
		]);
	}

	function updateFilter(index: number, patch: Partial<FilterCondition>) {
		const next = [...filters];
		next[index] = { ...next[index], ...patch };
		onFiltersChange(next);
	}

	function removeFilter(index: number) {
		onFiltersChange(filters.filter((_, i) => i !== index));
	}

	function clearFilters() {
		onFiltersChange([]);
	}

	function toggleColumn(col: string) {
		const next = new Set(hiddenCols);
		if (next.has(col)) {
			next.delete(col);
		} else {
			next.add(col);
		}
		onHiddenColsChange(next);
	}

	// Show column toggle dropdown state
	const [showColMenu, setShowColMenu] = useState(false);

	return (
		<div class="scheduler-filter-bar">
			<div class="scheduler-filter-bar-left">
				{filters.map((f, i) => (
					<div class="scheduler-filter-row" key={i}>
						<select
							class="scheduler-filter-select"
							value={f.field}
							onChange={(e: any) => updateFilter(i, { field: e.target.value })}
						>
							{columns.map((c) => (
								<option value={c}>{c}</option>
							))}
						</select>
						<select
							class="scheduler-filter-operator"
							value={f.operator}
							onChange={(e: any) => updateFilter(i, { operator: e.target.value })}
						>
							{operators.map((op) => (
								<option value={op.value}>{op.label}</option>
							))}
						</select>
						<input
							class="scheduler-filter-value"
							type="text"
							value={f.value}
							placeholder="value..."
							onInput={(e: any) => updateFilter(i, { value: e.target.value })}
						/>
						<button class="scheduler-filter-remove" onClick={() => removeFilter(i)} title="Remove filter">
							&times;
						</button>
					</div>
				))}
				<button class="scheduler-filter-add" onClick={addFilter} title="Add filter">
					+ Filter
				</button>
				{filters.length > 0 && (
					<button class="scheduler-filter-clear" onClick={clearFilters}>
						Clear
					</button>
				)}
			</div>

			<div class="scheduler-filter-bar-right">
				{onCreateEntry && (
					<button class="scheduler-filter-new" onClick={onCreateEntry} title="New entry with current filters">
						+ New
					</button>
				)}
				<span class="scheduler-filter-count">
					{entriesCount === totalCount
						? `${totalCount} entries`
						: `${entriesCount} / ${totalCount} entries`}
				</span>

				<div class="scheduler-col-toggle">
					<button
						class="scheduler-col-toggle-btn"
						onClick={() => setShowColMenu(!showColMenu)}
						title="Toggle columns"
					>
						Columns
					</button>
					{showColMenu && (
						<div class="scheduler-col-menu">
							{columns.map((col) => (
								<label class="scheduler-col-menu-item">
									<input
										type="checkbox"
										checked={!hiddenCols.has(col)}
										onChange={() => toggleColumn(col)}
									/>
									{col}
								</label>
							))}
						</div>
					)}
				</div>
			</div>
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
	newFileFolder?: string
): ReactRenderer {
	return new ReactRenderer(el, <SchedulerApp plugin={plugin} initialView={initialView} newFileFolder={newFileFolder} />);
}
