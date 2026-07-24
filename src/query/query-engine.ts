import { App, TFile } from "obsidian";
import { getDataviewApi } from "../utils/dataview-api";
import { FieldMapping, PageEntry, SortConfig, FilterCondition } from "../types";
import { mapPageEntry } from "../schema/field-mapping";
import { extractTasksWithInlineFields, taskToPageEntry } from "../schema/inline-fields";

/**
 * Query engine wraps Dataview API calls and applies field mapping + filtering.
 */
export class QueryEngine {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/** Fetch all pages matching the configured folders and field mapping. */
	fetchPages(mapping: FieldMapping, folders: string[]): PageEntry[] {
		const api = getDataviewApi(this.app);
		if (!api) return [];

		let query: string | undefined;
		if (folders.length > 0) {
			const folderClauses = folders.map((f) => `"${f}"`).join(" or ");
			query = `FROM ${folderClauses}`;
		}

		const rawPages = api.pages(query);
		if (!rawPages) return [];

		const entries: PageEntry[] = [];
		const pagesArray = Array.from(rawPages as Iterable<Record<string, unknown>>);

		for (const rawPage of pagesArray) {
			const path = (rawPage["file.path"] as string) ?? (rawPage["file"] as Record<string, unknown>)?.["path"] as string;
			if (!path) continue;
			entries.push(mapPageEntry(rawPage, path, mapping));
		}
		return entries;
	}

	/** Fetch inline-field-tagged tasks and convert to PageEntry format. */
	async fetchInlineTasks(mapping: FieldMapping, folders: string[], existingEntries: PageEntry[]): Promise<PageEntry[]> {
		const files = this.app.vault.getMarkdownFiles();
		const result: PageEntry[] = [];
		const existingSet = new Set(existingEntries.map((e) => e.path));

		const scope = folders.length > 0
			? files.filter((f) => folders.some((folder) => f.path.startsWith(folder)))
			: files;

		for (const file of scope) {
			const tasks = await extractTasksWithInlineFields(this.app, file);
			// Dataview page data for parent fields
			const api = getDataviewApi(this.app);
			const rawPage = api?.page(file.path);

			for (const task of tasks) {
				const entry = taskToPageEntry(task, (rawPage as Record<string, unknown> | undefined) ?? {}, file.path, mapping);
				result.push(entry);
			}
		}

		return result;
	}

	/** Static: apply sorting to entries (pure function, no state needed). */
	static applySort(entries: PageEntry[], sort: SortConfig[]): PageEntry[] {
		if (sort.length === 0) return entries;
		return [...entries].sort((a, b) => {
			for (const s of sort) {
				const aVal = getFieldValue(a, s.field);
				const bVal = getFieldValue(b, s.field);
				const cmp = compareValues(aVal, bVal);
				if (cmp !== 0) return s.direction === "asc" ? cmp : -cmp;
			}
			return 0;
		});
	}

	/** Static: apply filters to entries (pure function, no state needed). */
	static applyFilters(entries: PageEntry[], filters: FilterCondition[]): PageEntry[] {
		if (filters.length === 0) return entries;
		return entries.filter((entry) => {
			return filters.every((f) => {
				const val = getFieldValue(entry, f.field);
				return evaluateFilter(val, f);
			});
		});
	}
}

/** Extract a field value from a PageEntry by name. */
export function getFieldValue(entry: PageEntry, field: string): unknown {
	switch (field) {
		case "path": return entry.path;
		case "title": return entry.title;
		case "date":
		case "due": return entry.date;
		case "file": {
			const last = entry.path.split("/").pop() ?? entry.path;
			return last.replace(/\.md$/, "");
		}
		case "start": return entry.start;
		case "end": return entry.end;
		case "tags": return entry.tags;
		case "ctime": return entry.ctime;
		case "mtime": return entry.mtime;
		case "folder": return entry.folder;
		default: return entry.fields[field];
	}
}

function compareValues(a: unknown, b: unknown): number {
	if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1;
	if (b === null || b === undefined) return 1;
	if (a instanceof Date && b instanceof Date) return dateCompare(a, b);
	return String(a).localeCompare(String(b));
}

/** Compare two dates by year-month-day (local time), ignoring time portion */
function dateCompare(a: Date, b: Date): number {
	const y = a.getFullYear() - b.getFullYear();
	if (y !== 0) return y;
	const m = a.getMonth() - b.getMonth();
	if (m !== 0) return m;
	return a.getDate() - b.getDate();
}

function evaluateFilter(val: unknown, filter: FilterCondition): boolean {
	const fv = filter.value;

	// For Date values, compare by local date components
	if (val instanceof Date) {
		const filterDate = new Date(fv);
		const d = val;

		switch (filter.operator) {
			case "equals": return isNaN(filterDate.getTime()) ? false : dateCompare(d, filterDate) === 0;
			case "not_equals": return isNaN(filterDate.getTime()) ? true : dateCompare(d, filterDate) !== 0;
			case "greater_than":
			case "after": return isNaN(filterDate.getTime()) ? false : dateCompare(d, filterDate) > 0;
			case "less_than":
			case "before": return isNaN(filterDate.getTime()) ? false : dateCompare(d, filterDate) < 0;
			case "contains": return d.toLocaleDateString().toLowerCase().includes(fv.toLowerCase());
			default: return true;
		}
	}

	// String comparison for non-date values
	const valStr = String(val ?? "");
	switch (filter.operator) {
		case "equals": return valStr.toLowerCase() === fv.toLowerCase();
		case "not_equals": return valStr.toLowerCase() !== fv.toLowerCase();
		case "contains": return valStr.toLowerCase().includes(fv.toLowerCase());
		case "greater_than": return valStr > fv;
		case "less_than": return valStr < fv;
		case "before": return valStr < fv;
		case "after": return valStr > fv;
		default: return true;
	}
}
