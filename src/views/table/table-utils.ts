import { PageEntry, FieldMapping } from "../../types";
import { FieldKind } from "../../schema/field-types";

/** Fields that are internal to Dataview / the plugin and should not be shown as columns */
const INTERNAL_FIELD_PREFIXES = ["file.", "settings", "recursiveSubTask", "maxRecursiveRender"];

export function isInternalField(key: string): boolean {
	return INTERNAL_FIELD_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function isDisplayableValue(val: unknown): boolean {
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
export function collectColumns(entries: PageEntry[], mapping: FieldMapping): string[] {
	const allKeys = new Set<string>();
	for (const entry of entries) {
		for (const key of Object.keys(entry.fields ?? {})) {
			if (!isInternalField(key)) allKeys.add(key);
		}
	}
	const baseColumns = ["title", "date", "file", ...mapping.tagFields];
	const extra = Array.from(allKeys).filter(
		(k) => k !== mapping.titleField && k !== mapping.dateField && !baseColumns.includes(k)
	);
	// Show at most 3 extra fields as columns; the rest are accessible via the "…" cell.
	const limitedExtra = extra.slice(0, 3);
	return [...baseColumns, ...limitedExtra].filter((c, i, arr) => arr.indexOf(c) === i);
}

export function formatCellValue(entry: PageEntry, column: string): string {
	switch (column) {
		case "title":
			return entry.title;
		case "date":
			return entry.date ? formatDate(entry.date) : "";
		case "file":
			return fileBaseName(entry.path);
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

export function formatDate(val: unknown): string {
	if (val instanceof Date) return val.toLocaleDateString();
	if (typeof val === "number") return new Date(val).toLocaleDateString();
	if (typeof val === "string") {
		const d = new Date(val);
		if (!isNaN(d.getTime())) return d.toLocaleDateString();
	}
	return String(val ?? "");
}

/** Basename (without .md) of an entry's source file path. Inline tasks carry a
 *  `file.md#Ln` path, so the line suffix is kept to show exactly where it lives. */
export function fileBaseName(path: string): string {
	const last = path.split("/").pop() ?? path;
	return last.replace(/\.md$/, "");
}

/** Convert a Date to a yyyy-mm-dd string (local time, no timezone offset) */
export function toISODate(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/** Normalize an arbitrary frontmatter value into a yyyy-mm-dd string for a date input, or "" */
export function toInputDate(raw: unknown): string {
	if (raw instanceof Date) return toISODate(raw);
	if (typeof raw === "string") {
		// Already an ISO date portion?
		if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
		const d = new Date(raw);
		if (!isNaN(d.getTime())) return toISODate(d);
	}
	if (typeof raw === "number") {
		const d = new Date(raw);
		if (!isNaN(d.getTime())) return toISODate(d);
	}
	return "";
}

/** Determine the kind of editor to use for a given column */
export type CellKind = "text" | "date" | "tags" | "file";

export function getCellKind(column: string, mapping: FieldMapping, kinds?: Record<string, FieldKind>): CellKind {
	if (column === "file") return "file";
	if (column === "date" || column === mapping.dateField) return "date";
	if (mapping.tagFields.includes(column)) return "tags";
	if (kinds) {
		const k = kinds[column];
		if (k === "tags") return "tags";
		if (k === "date") return "date";
	}
	return "text";
}

/** The actual frontmatter field name to write for a given column */
export function writeFieldFor(column: string, mapping: FieldMapping): string {
	if (column === "date") return mapping.dateField;
	return column;
}

/** Format a tag/array value for writing back to frontmatter as a YAML array */
export function formatTagValue(values: string[]): string {
	const clean = values.map((v) => v.trim()).filter((v) => v.length > 0);
	if (clean.length === 0) return "[]";
	return `[${clean.join(", ")}]`;
}
