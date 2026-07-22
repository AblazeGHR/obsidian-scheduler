import { h } from "preact";
import { useState, useMemo } from "preact/hooks";
import { PageEntry, FieldMapping } from "../../types";
import { formatCellValue } from "../table/table-utils";

// ============================================================
// Kanban view: group entries into columns by a chosen field.
// Drag a card between columns to change that field's value.
// ============================================================

interface KanbanViewProps {
	entries: PageEntry[];
	mapping: FieldMapping;
	/** Write `value` to `field` for the entry at `path` */
	onGroupChange: (path: string, field: string, value: string) => void;
	/** Open the entry's file */
	onOpenEntry: (path: string) => void;
	/** Create a new entry, seeded with `field` = `value` (column value) */
	onCreateEntry: (field: string, value: string) => void;
}

const UNASSIGNED = "__unassigned__";

/** Extract the display values of `field` for an entry, as an array of strings. */
function getEntryValues(entry: PageEntry, field: string, tagFields: string[]): string[] {
	if (field === "folder") {
		return entry.folder ? [entry.folder] : [];
	}
	const raw = entry.fields?.[field];
	if (raw === undefined || raw === null) return [];
	if (Array.isArray(raw)) {
		// Tags (or any array field) → one column per element
		return raw.map((v) => String(v)).filter((v) => v.length > 0);
	}
	if (raw instanceof Date) return [raw.toISOString().slice(0, 10)];
	return [String(raw)];
}

export function KanbanView({ entries, mapping, onGroupChange, onOpenEntry, onCreateEntry }: KanbanViewProps) {
	// Candidate fields the user can group by (tag fields, filterable fields, plus any
	// field present in the data).
	const candidateFields = useMemo(() => {
		const set = new Set<string>();
		mapping.tagFields.forEach((f) => set.add(f));
		mapping.filterableFields.forEach((f) => set.add(f));
		for (const e of entries) {
			for (const k of Object.keys(e.fields ?? {})) set.add(k);
		}
		set.delete(mapping.titleField);
		set.delete(mapping.dateField);
		set.delete(mapping.startField);
		set.delete(mapping.endField);
		return Array.from(set);
	}, [entries, mapping]);

	const [groupField, setGroupField] = useState<string>(() => {
		const preferred = [...mapping.tagFields, "status", "priority", "category"];
		for (const p of preferred) if (candidateFields.includes(p)) return p;
		return candidateFields[0] ?? "status";
	});

	// Columns derived from data, plus any manually-added empty columns.
	const dataColumns = useMemo(() => {
		const set = new Set<string>();
		for (const e of entries) {
			for (const v of getEntryValues(e, groupField, mapping.tagFields)) {
				set.add(v);
			}
		}
		return Array.from(set).sort((a, b) => a.localeCompare(b));
	}, [entries, groupField, mapping.tagFields]);

	const [extraColumns, setExtraColumns] = useState<string[]>([]);
	const columns = useMemo(() => {
		const merged = Array.from(new Set([...dataColumns, ...extraColumns]));
		merged.sort((a, b) => a.localeCompare(b));
		return merged;
	}, [dataColumns, extraColumns]);

	// Bucket entries into columns
	const buckets = useMemo(() => {
		const map: Record<string, PageEntry[]> = {};
		for (const col of columns) map[col] = [];
		map[UNASSIGNED] = [];

		for (const e of entries) {
			const vals = getEntryValues(e, groupField, mapping.tagFields);
			if (vals.length === 0) {
				map[UNASSIGNED].push(e);
			} else {
				for (const v of vals) {
					// An entry may legitimately land outside the visible columns
					// (e.g. a value no longer present after a change) — keep it in its own bucket.
					if (!map[v]) map[v] = [];
					map[v].push(e);
				}
			}
		}
		return map;
	}, [entries, groupField, mapping.tagFields, columns]);

	const [dragPath, setDragPath] = useState<string | null>(null);
	const [dragOverCol, setDragOverCol] = useState<string | null>(null);
	const [newColInput, setNewColInput] = useState("");

	function handleDrop(colValue: string) {
		if (dragPath && colValue !== UNASSIGNED) {
			onGroupChange(dragPath, groupField, colValue);
		}
		setDragPath(null);
		setDragOverCol(null);
	}

	function commitNewColumn() {
		const name = newColInput.trim();
		if (name && !columns.includes(name)) {
			setExtraColumns((c) => [...c, name]);
		}
		setNewColInput("");
	}

	const isTagField = mapping.tagFields.includes(groupField);

	return (
		<div class="scheduler-kanban">
			<div class="scheduler-kanban-controls">
				<label class="scheduler-kanban-group-label">
					Group by:
					<select
						class="scheduler-kanban-group-select"
						value={groupField}
						onChange={(e: any) => {
							setGroupField(e.target.value);
							setExtraColumns([]);
						}}
					>
						{candidateFields.map((f) => (
							<option value={f}>{f}</option>
						))}
					</select>
				</label>
				{isTagField && (
					<span class="scheduler-kanban-hint">
						Moving a card sets this tag (replaces other tags)
					</span>
				)}
			</div>

			<div class="scheduler-kanban-board">
				{columns.map((col) => (
					<div
						class={`scheduler-kanban-column${dragOverCol === col ? " drag-over" : ""}`}
						onDragOver={(e: any) => {
							e.preventDefault();
							setDragOverCol(col);
						}}
						onDragLeave={() => setDragOverCol((c) => (c === col ? null : c))}
						onDrop={() => handleDrop(col)}
					>
						<div class="scheduler-kanban-column-header">
							<span class="scheduler-kanban-column-title">{col}</span>
							<span class="scheduler-kanban-column-count">{buckets[col]?.length ?? 0}</span>
						</div>
						<div class="scheduler-kanban-column-body">
							{(buckets[col] ?? []).map((entry) => (
								<div
									class="scheduler-kanban-card"
									draggable={true}
									onDragStart={() => setDragPath(entry.path)}
									onDragEnd={() => {
										setDragPath(null);
										setDragOverCol(null);
									}}
									onClick={() => onOpenEntry(entry.path)}
									title={entry.path}
								>
									<div class="scheduler-kanban-card-title">{entry.title}</div>
									{(entry.date || (entry.tags && entry.tags.length > 0)) && (
										<div class="scheduler-kanban-card-meta">
											{entry.date && (
												<span class="scheduler-kanban-card-date">
													{formatCellValue(entry, "date")}
												</span>
											)}
											{entry.tags.map((t) => (
												<span class="scheduler-kanban-card-tag">{t}</span>
											))}
										</div>
									)}
								</div>
							))}
						</div>
						<button
							class="scheduler-kanban-add"
							onClick={() => onCreateEntry(groupField, col)}
							title={`Create entry in "${col}"`}
						>
							+ Add
						</button>
					</div>
				))}

				{/* Unassigned column (entries with no value for the group field) */}
				{(buckets[UNASSIGNED]?.length ?? 0) > 0 && (
					<div
						class={`scheduler-kanban-column scheduler-kanban-column-unassigned${
							dragOverCol === UNASSIGNED ? " drag-over" : ""
						}`}
						onDragOver={(e: any) => {
							e.preventDefault();
							setDragOverCol(UNASSIGNED);
						}}
						onDragLeave={() => setDragOverCol((c) => (c === UNASSIGNED ? null : c))}
						onDrop={() => {
							// Dropping onto "Unassigned" clears the field by writing empty value.
							if (dragPath) onGroupChange(dragPath, groupField, "");
							setDragPath(null);
							setDragOverCol(null);
						}}
					>
						<div class="scheduler-kanban-column-header">
							<span class="scheduler-kanban-column-title">Unassigned</span>
							<span class="scheduler-kanban-column-count">
								{buckets[UNASSIGNED]?.length ?? 0}
							</span>
						</div>
						<div class="scheduler-kanban-column-body">
							{(buckets[UNASSIGNED] ?? []).map((entry) => (
								<div
									class="scheduler-kanban-card"
									draggable={true}
									onDragStart={() => setDragPath(entry.path)}
									onDragEnd={() => {
										setDragPath(null);
										setDragOverCol(null);
									}}
									onClick={() => onOpenEntry(entry.path)}
									title={entry.path}
								>
									<div class="scheduler-kanban-card-title">{entry.title}</div>
									{(entry.date || (entry.tags && entry.tags.length > 0)) && (
										<div class="scheduler-kanban-card-meta">
											{entry.date && (
												<span class="scheduler-kanban-card-date">
													{formatCellValue(entry, "date")}
												</span>
											)}
											{entry.tags.map((t) => (
												<span class="scheduler-kanban-card-tag">{t}</span>
											))}
										</div>
									)}
								</div>
							))}
						</div>
					</div>
				)}

				{/* Add-column input */}
				<div class="scheduler-kanban-column scheduler-kanban-column-add">
					<input
						class="scheduler-kanban-add-input"
						type="text"
						value={newColInput}
						placeholder="+ New column"
						onInput={(e: any) => setNewColInput(e.target.value)}
						onKeyDown={(e: any) => {
							if (e.key === "Enter") commitNewColumn();
						}}
					/>
					<button class="scheduler-kanban-add-confirm" onClick={commitNewColumn}>
						Add
					</button>
				</div>
			</div>
		</div>
	);
}
