import { h, Fragment } from "preact";
import { useState, useMemo, useEffect, useRef } from "preact/hooks";
import { useContextMenu } from "../context-menu";
import { QueryEngine } from "../../query/query-engine";
import { PageEntry, FieldMapping, SortConfig, FilterClause, AtomicCondition, FilterOperator } from "../../types";
import {
	formatCellValue,
	getCellKind,
	writeFieldFor,
	toInputDate,
	toISODate,
	formatTagValue,
} from "./table-utils";
import { expandRecurring } from "../../utils/recurrence";
import { inferEntryFieldKinds, FieldKind } from "../../schema/field-types";
import { DateCell } from "./date-cell";

// ============================================================
// EditableCell — inline editing with date / tag / text support
// ============================================================

interface EditableCellProps {
	entry: PageEntry;
	column: string;
	mapping: FieldMapping;
	kinds?: Record<string, FieldKind>;
	onEdit?: (path: string, field: string, value: string) => void;
}

/** Parse user-typed text into an ISO yyyy-mm-dd string, or null if unparseable. */
function parseDateInput(s: string): string | null {
	const t = s.trim();
	if (!t) return null;
	if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
	const d = new Date(t);
	if (!isNaN(d.getTime())) return toISODate(d);
	return null;
}

/**
 * Excel-style inline cell: shows plain text; on click the same text becomes
 * directly editable in place (contentEditable). No input box, no style change.
 * Commits on blur / Enter; Escape cancels.
 */
function EditableCell({ entry, column, mapping, kinds, onEdit }: EditableCellProps) {
	const kind = getCellKind(column, mapping, kinds);
	const field = writeFieldFor(column, mapping);
	const raw = column === "date" ? entry.date : entry.fields?.[column];
	const display = formatCellValue(entry, column);

	const [editing, setEditing] = useState(false);

	// The "file" column is the read-only source note — never editable inline.
	if (kind === "file") {
		return (
			<td class="scheduler-cell scheduler-cell-readonly" title={entry.path}>
				{display}
			</td>
		);
	}
	const cellRef = useRef<HTMLTableCellElement | null>(null);

	// On entering edit mode, seed the cell with the displayed text and focus it
	// (caret at end). Runs only when `editing` flips, so typing isn't clobbered.
	useEffect(() => {
		if (editing && cellRef.current) {
			cellRef.current.textContent = display;
			cellRef.current.focus();
			const range = document.createRange();
			range.selectNodeContents(cellRef.current);
			range.collapse(false);
			const sel = window.getSelection();
			sel?.removeAllRanges();
			sel?.addRange(range);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [editing]);

	function commit() {
		const el = cellRef.current;
		const val = el ? (el.textContent ?? "") : "";
		// Clear the manually-set text so React's display re-render inserts a
		// single value (otherwise the stale text node lingers and doubles up).
		if (el) el.textContent = "";
		setEditing(false);
		if (!onEdit) return;
		if (kind === "date") {
			const iso = parseDateInput(val);
			if (iso && iso !== toInputDate(raw)) onEdit(entry.path, field, iso);
		} else if (kind === "tags") {
			if (val.trim() !== display.trim()) {
				const arr = val.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
				onEdit(entry.path, field, formatTagValue(arr));
			}
		} else {
			if (val !== display) onEdit(entry.path, field, val);
		}
	}

	if (editing) {
		return (
			<td
				ref={cellRef}
			class="scheduler-cell scheduler-cell-display"
			contentEditable
			onBlur={commit}
				onKeyDown={(e: any) => {
					if (e.key === "Enter") {
						e.preventDefault();
						commit();
					} else if (e.key === "Escape") {
						if (cellRef.current) cellRef.current.textContent = display;
						commit();
					}
				}}
			/>
		);
	}

	return (
		<td
			ref={cellRef}
			class="scheduler-cell scheduler-cell-display"
			onClick={() => setEditing(true)}
			title="Click to edit"
		>
			{display}
		</td>
	);
}

// ============================================================
// Filter Bar
// ============================================================

interface FilterBarProps {
	columns: string[];
	filters: FilterClause[];
	onFiltersChange: (filters: FilterClause[]) => void;
	hiddenCols: Set<string>;
	onHiddenColsChange: (cols: Set<string>) => void;
	entriesCount: number;
	totalCount: number;
	sort: SortConfig[];
	onSortChange: (sort: SortConfig[]) => void;
	kinds?: Record<string, FieldKind>;
	onCreateEntry?: () => void;
}

function FilterBar({ columns, filters, onFiltersChange, hiddenCols, onHiddenColsChange, entriesCount, totalCount, sort, onSortChange, kinds, onCreateEntry }: FilterBarProps) {
	function toggleColumn(col: string) {
		const next = new Set(hiddenCols);
		if (next.has(col)) {
			next.delete(col);
		} else {
			next.add(col);
		}
		onHiddenColsChange(next);
	}

	const [showColMenu, setShowColMenu] = useState(false);

		return (
		<div class="scheduler-filter-bar">
			<div class="scheduler-filter-bar-left">
				<SortManager columns={columns} sort={sort} onSortChange={onSortChange} />
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
// Batch edit bar — applies a value to all selected rows
// ============================================================

interface BatchEditBarProps {
	selectedCount: number;
	columns: string[];
	mapping: FieldMapping;
	kinds?: Record<string, FieldKind>;
	onApply: (field: string, value: string) => void;
	onClear: () => void;
}

function BatchEditBar({ selectedCount, columns, mapping, kinds, onApply, onClear }: BatchEditBarProps) {
	const [field, setField] = useState(columns[0] ?? "title");
	const [value, setValue] = useState("");

	const kind = getCellKind(field, mapping, kinds);

	function apply() {
		onApply(field, value);
		setValue("");
	}

	return (
		<div class="scheduler-batch-bar">
			<span class="scheduler-batch-count">{selectedCount} selected</span>
			<select
				class="scheduler-batch-field"
				value={field}
				onChange={(e: any) => setField(e.target.value)}
			>
				{columns.map((c) => (
					<option value={c}>{c}</option>
				))}
			</select>
			{kind === "date" ? (
				<input
					class="scheduler-batch-value"
					type="date"
					value={value}
					onChange={(e: any) => setValue(e.target.value)}
				/>
			) : (
				<input
					class="scheduler-batch-value"
					type="text"
					value={value}
					placeholder="value..."
					onInput={(e: any) => setValue(e.target.value)}
					onKeyDown={(e: any) => {
						if (e.key === "Enter") apply();
					}}
				/>
			)}
			<button class="scheduler-batch-apply" onClick={apply} disabled={value.length === 0}>
				Apply
			</button>
			<button class="scheduler-batch-clear" onClick={onClear} title="Clear selection">
				Clear
			</button>
		</div>
	);
}

function formatBatchValue(field: string, raw: string, mapping: FieldMapping): string {
	const kind = getCellKind(field, mapping);
	if (kind === "tags") {
		const arr = raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
		return formatTagValue(arr);
	}
	// date / text: write the raw string as-is
	return raw;
}

// ============================================================
// Sort manager — drag to reorder multi-field sort priority
// ============================================================

interface SortManagerProps {
	columns: string[];
	sort: SortConfig[];
	onSortChange: (sort: SortConfig[]) => void;
}

function SortManager({ columns, sort, onSortChange }: SortManagerProps) {
	const [open, setOpen] = useState(false);
	const [dragIndex, setDragIndex] = useState<number | null>(null);
	const [newField, setNewField] = useState(columns[0] ?? "title");

	function toggleDir(i: number) {
		onSortChange(
			sort.map((s, idx) =>
				idx === i ? { ...s, direction: s.direction === "asc" ? "desc" : "asc" } : s
			)
		);
	}

	function remove(i: number) {
		onSortChange(sort.filter((_, idx) => idx !== i));
	}

	function move(from: number, to: number) {
		if (from === to || from < 0 || to < 0) return;
		const next = [...sort];
		const [item] = next.splice(from, 1);
		next.splice(to, 0, item);
		onSortChange(next);
	}

	function add() {
		if (!newField || sort.some((s) => s.field === newField)) return;
		onSortChange([...sort, { field: newField, direction: "asc" }]);
	}

	return (
		<div class="scheduler-sort-manager">
			<button
				class="scheduler-sort-btn"
				onClick={() => setOpen((o) => !o)}
				title="Manage multi-field sort priority"
			>
				Sort {open ? "▲" : "▼"} ({sort.length})
			</button>
			{open && (
				<div class="scheduler-sort-panel">
					{sort.length === 0 && (
						<div class="scheduler-sort-empty">
							No sort yet. Click a column header to sort, or add a field below.
						</div>
					)}
					{sort.map((s, i) => (
						<div
							class={`scheduler-sort-row${dragIndex === i ? " dragging" : ""}`}
							draggable={true}
							onDragStart={() => setDragIndex(i)}
							onDragOver={(e: any) => e.preventDefault()}
							onDrop={() => {
								if (dragIndex !== null) move(dragIndex, i);
								setDragIndex(null);
							}}
							onDragEnd={() => setDragIndex(null)}
						>
							<span class="scheduler-sort-grip" title="Drag to reorder priority">
								⋮⋮
							</span>
							<span class="scheduler-sort-prio">{i + 1}</span>
							<span class="scheduler-sort-field">{s.field}</span>
							<button
								class="scheduler-sort-dir"
								onClick={() => toggleDir(i)}
								title={s.direction === "asc" ? "Ascending" : "Descending"}
							>
								{s.direction === "asc" ? "↑" : "↓"}
							</button>
							<button class="scheduler-sort-remove" onClick={() => remove(i)} title="Remove sort">
								×
							</button>
						</div>
					))}
					<div class="scheduler-sort-add">
						<select
							class="scheduler-sort-add-field"
							value={newField}
							onChange={(e: any) => setNewField(e.target.value)}
						>
							{columns.map((c) => (
								<option value={c}>{c}</option>
							))}
						</select>
						<button class="scheduler-sort-add-btn" onClick={add} disabled={sort.some((s) => s.field === newField)}>
							Add
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

// ============================================================
// Table View (pagination + resize + multi-select)
// ============================================================

interface TableViewProps {
	entries: PageEntry[];
	columns: string[];
	mapping: FieldMapping;
	sort: SortConfig[];
	onSortChange: (sort: SortConfig[]) => void;
	filters: FilterClause[];
	onFiltersChange: (filters: FilterClause[]) => void;
	hiddenCols: Set<string>;
	onHiddenColsChange: (cols: Set<string>) => void;
	onCellEdit?: (path: string, field: string, value: string) => void;
	onOpenEntry?: (path: string) => void;
	onCreateEntry?: () => void;
	onDeleteEntry?: (path: string) => void;
}

const PAGE_SIZES = [10, 25, 50, 100, 0, -1]; // 0 = all, -1 = custom

function TableView({
	entries,
	columns,
	mapping,
	sort,
	onSortChange,
	filters,
	onFiltersChange,
	hiddenCols,
	onHiddenColsChange,
	onCellEdit,
	onOpenEntry,
	onCreateEntry,
	onDeleteEntry,
}: TableViewProps) {
	const visibleCols = columns.filter((c) => !hiddenCols.has(c));

	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [page, setPage] = useState(0);
	const [pageSize, setPageSize] = useState(50);
	const [customPage, setCustomPage] = useState(false);
	const [customVal, setCustomVal] = useState("");
	const [widths, setWidths] = useState<Record<string, number>>({});
	const [activeRow, setActiveRow] = useState(-1);
	const tableRef = useRef<HTMLTableElement | null>(null);
	const resizeRef = useRef<{ cancel: () => void } | null>(null);
	const ctx = useContextMenu();

	// Expand recurring entries within a fixed horizon so the table stays bounded.
	const expanded = useMemo(() => {
		const now = new Date();
		const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 60);
		const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 365);
		return expandRecurring(entries, from, to, mapping);
	}, [entries, mapping]);

	// Infer field kinds (date / number / tags / text) across entries
	const fieldKinds = useMemo(() => inferEntryFieldKinds(expanded, mapping), [expanded, mapping]);

	// Apply filters then sort (pure static functions)
	const filtered = filters.length > 0 ? QueryEngine.applyFilters(expanded, filters) : expanded;
	const sorted = sort.length > 0 ? QueryEngine.applySort(filtered, sort) : filtered;

	// Reset to first page when the filterable/sortable result set changes
	useEffect(() => {
		setPage(0);
		setActiveRow(-1);
	}, [filters, sort]); // eslint-disable-line react-hooks/exhaustive-deps

	// Reset active row when paging
	useEffect(() => {
		setActiveRow(-1);
	}, [page]); // eslint-disable-line react-hooks/exhaustive-deps

	// Keyboard navigation within the table
	function handleTableKey(e: KeyboardEvent) {
		if (paged.length === 0) return;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setActiveRow((r) => Math.min(paged.length - 1, r + 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setActiveRow((r) => (r <= 0 ? 0 : r - 1));
		} else if (e.key === "Enter") {
			if (activeRow >= 0 && activeRow < paged.length) {
				e.preventDefault();
				openFile(paged[activeRow].path);
			}
		}
	}

	const pageCount = pageSize === 0 ? 1 : Math.max(1, Math.ceil(sorted.length / pageSize));
	const safePage = Math.min(page, pageCount - 1);
	const start = pageSize === 0 ? 0 : safePage * pageSize;
	const paged = pageSize === 0 ? sorted : sorted.slice(start, start + pageSize);

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
		const arrow = sort[idx].direction === "asc" ? "↑" : "↓";
		const prio = idx + 1;
		return ` ${arrow}${prio}`;
	}

	function getSortTitle(column: string): string {
		const idx = sort.findIndex((s) => s.field === column);
		if (idx === -1) return `Sort by ${column}`;
		const dir = sort[idx].direction === "asc" ? "ascending" : "descending";
		return `Sort #${idx + 1}: ${column} (${dir}) — click to toggle, delete last to remove`;
	}

	function openFile(path: string) {
		if (onOpenEntry) {
			onOpenEntry(path);
			return;
		}
		// Fallback for callers that don't wire onOpenEntry (e.g. old stand-alone use).
		const app = (globalThis as any).app;
		if (app) app.workspace.openLinkText(path, "", false);
	}

	// --- selection ---
	function toggleRow(path: string) {
		const next = new Set(selected);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		setSelected(next);
	}

	function toggleAllOnPage() {
		const pagePaths = new Set(paged.map((e) => e.path));
		const allSelected = paged.every((e) => selected.has(e.path));
		const next = new Set(selected);
		if (allSelected) {
			for (const p of pagePaths) next.delete(p);
		} else {
			for (const p of pagePaths) next.add(p);
		}
		setSelected(next);
	}

	const pagePaths = paged.map((e) => e.path);
	const allOnPageSelected = pagePaths.length > 0 && pagePaths.every((p) => selected.has(p));

	// --- batch apply ---
	function applyBatch(field: string, rawValue: string) {
		const writeField = writeFieldFor(field, mapping);
		const value = formatBatchValue(field, rawValue, mapping);
		for (const path of selected) {
			onCellEdit?.(path, writeField, value);
		}
	}

	// --- column resize ---

	/** Cheap hidden <span> for measuring text widths (shared across columns). */
	const measureSpan = useMemo(() => {
		const span = document.createElement("span");
		span.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;font-size:13px;";
		document.body.appendChild(span);
		return span;
	}, []);

	function measureText(text: string): number {
		measureSpan.textContent = text;
		return measureSpan.offsetWidth;
	}

	function startResize(e: MouseEvent, col: string) {
		e.preventDefault();
		e.stopPropagation();
		// Cancel any in-progress resize
		resizeRef.current?.cancel();
		resizeRef.current = null;

		let active = true;
		const startX = e.clientX;
		const startW = widths[col] ?? 160;
		function onMove(ev: MouseEvent) {
			if (!active) return;
			const newW = Math.max(60, startW + (ev.clientX - startX));
			setWidths((w) => ({ ...w, [col]: newW }));
		}
		function onUp() {
			active = false;
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
		}
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
		resizeRef.current = { cancel: () => { active = false; onUp(); } };
	}

	/** Double-click any resize handle → auto-fit every visible column to its
	 *  widest content (header + visible cells). */
	function autoFitAllColumns() {
		resizeRef.current?.cancel();
		resizeRef.current = null;

		const table = tableRef.current;
		if (!table) return;

		const newWidths: Record<string, number> = {};
		const ths = table.querySelectorAll("thead th");

		visibleCols.forEach((col, colIndex) => {
			let max = 60;
			// Measure header
			const th = ths[colIndex + 1]; // +1 skips the checkbox column
			if (th instanceof HTMLElement) {
				max = Math.max(max, measureText(th.textContent ?? ""));
			}
			// Measure every visible body cell in this column
			const cells = table.querySelectorAll(`tbody td:nth-child(${colIndex + 2})`);
			cells.forEach((cell) => {
				if (cell instanceof HTMLElement) {
					max = Math.max(max, measureText(cell.textContent ?? ""));
				}
			});
			newWidths[col] = max + 24; // +24 padding
		});

		setWidths((w) => ({ ...w, ...newWidths }));
	}

	if (expanded.length === 0) {
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
				totalCount={expanded.length}
				sort={sort}
				onSortChange={onSortChange}
				kinds={fieldKinds}
				onCreateEntry={onCreateEntry}
			/>

			{selected.size > 0 && (
				<BatchEditBar
					selectedCount={selected.size}
					columns={columns}
					mapping={mapping}
					kinds={fieldKinds}
					onApply={applyBatch}
					onClear={() => setSelected(new Set())}
				/>
			)}

			<div class="scheduler-table-scroll" tabIndex={0} onKeyDown={(e: any) => handleTableKey(e)}>
				<table class="scheduler-table" ref={tableRef}>
					<colgroup>
						<col style="width: 36px" />
						{visibleCols.map((col) => (
							<col style={widths[col] ? `width: ${widths[col]}px` : undefined} />
						))}
					</colgroup>
					<thead>
						<tr>
							<th class="scheduler-col-select">
								<input
									type="checkbox"
									checked={allOnPageSelected}
									onChange={toggleAllOnPage}
									title="Select all on this page"
								/>
							</th>
							{visibleCols.map((col) => (
								<th onClick={() => handleSort(col)} title={getSortTitle(col)}>
									<span class="scheduler-th-label">{col}</span>
									<span class="scheduler-sort-icon">{getSortIcon(col)}</span>
									<span
										class="scheduler-resize-handle"
										onMouseDown={(e: any) => startResize(e, col)}
										onDblClick={(e: any) => {
											e.stopPropagation();
											e.preventDefault();
											autoFitAllColumns();
										}}
										onClick={(e: any) => e.stopPropagation()}
										title="Drag to resize, double-click to auto-fit all columns"
									/>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
					{paged.map((entry, idx) => (
						<tr
							key={entry.occurrenceId ?? entry.path}
							class={`${selected.has(entry.path) ? "scheduler-row-selected" : ""}${activeRow === idx ? " scheduler-row-active" : ""}`}
							onClick={() => setActiveRow(idx)}
						>
							<td class="scheduler-col-select">
								<input
									type="checkbox"
									checked={selected.has(entry.path)}
									onChange={() => toggleRow(entry.path)}
								/>
							</td>
						{visibleCols.map((col) =>
							col === "title" ? (
								<td
									class="scheduler-cell-title"
									onClick={() => openFile(entry.path)}
									onContextMenu={(e: any) =>
										ctx.open(e, [
											{ label: "Delete entry", danger: true, onClick: () => onDeleteEntry?.(entry.path) },
										])
									}
								>
									{formatCellValue(entry, col)}
									{entry.recurrenceRule && (
										<span class="scheduler-recurring-mark" title={`Repeats: ${entry.recurrenceRule}`}>
											↻
										</span>
									)}
								</td>
							) : getCellKind(col, mapping, fieldKinds) === "date" ? (
								<td class="scheduler-cell scheduler-cell-display">
									<DateCell entry={entry} column={col} mapping={mapping} onEdit={onCellEdit} />
								</td>
							) : (
									<EditableCell
										entry={entry}
										column={col}
										mapping={mapping}
										kinds={fieldKinds}
										onEdit={onCellEdit}
									/>
								)
						)}
							</tr>
						))}
					</tbody>
					{onCreateEntry && (
						<tfoot>
							<tr>
								<td colSpan={visibleCols.length + 1} class="scheduler-table-add-row" onClick={onCreateEntry}>
									+ New entry
								</td>
							</tr>
						</tfoot>
					)}
				</table>
			</div>

			<div class="scheduler-pagination">
				<button
					class="scheduler-page-btn"
					disabled={safePage <= 0}
					onClick={() => setPage(safePage - 1)}
				>
					‹ Prev
				</button>
				<span class="scheduler-page-info">
					{pageSize === 0
						? `All ${sorted.length}`
						: `Page ${safePage + 1} / ${pageCount}`}
				</span>
				<button
					class="scheduler-page-btn"
					disabled={safePage >= pageCount - 1}
					onClick={() => setPage(safePage + 1)}
				>
					Next ›
				</button>
				<select
					class="scheduler-page-size"
					value={PAGE_SIZES.includes(pageSize) ? pageSize : -1}
					onChange={(e: any) => {
						const v = Number(e.target.value);
						if (v === -1) {
							setCustomPage(true);
							setCustomVal("");
						} else {
							setPageSize(v);
							setCustomPage(false);
						}
						setPage(0);
					}}
				>
					{PAGE_SIZES.map((s) => (
						<option value={s}>{s === 0 ? "All" : s === -1 ? "Custom…" : `${s} / page`}</option>
					))}
				</select>
				{customPage && (
					<input
						class="scheduler-page-custom"
						type="number"
						min="1"
						value={customVal}
						placeholder="rows"
						onInput={(e: any) => setCustomVal(e.target.value)}
						onKeyDown={(e: any) => {
							if (e.key === "Enter") {
								const n = parseInt(customVal, 10);
								if (!isNaN(n) && n > 0) {
									setPageSize(n);
									setCustomPage(false);
									setPage(0);
								}
							}
							if (e.key === "Escape") setCustomPage(false);
						}}
					/>
				)}
			</div>
			{ctx.element}
		</div>
	);
}

export { TableView, FilterBar };
