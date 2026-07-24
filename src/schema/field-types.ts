import { PageEntry, FieldMapping } from "../types";

// ============================================================
// Field type inference
//
// Detects a semantic kind for each field across all entries so the UI can
// pick the right editor and filter operators without manual configuration.
// ============================================================

export type FieldKind = "date" | "number" | "tags" | "text";

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

/** Infer the kind of a field from the set of its observed values. */
export function inferFieldKind(values: unknown[]): FieldKind {
	const present = values.filter(
		(v) => v !== null && v !== undefined && !(typeof v === "string" && v.trim() === "")
	);
	if (present.length === 0) return "text";

	if (present.every((v) => Array.isArray(v))) return "tags";
	if (present.every((v) => v instanceof Date)) return "date";
	if (present.every((v) => typeof v === "number")) return "number";

	// Heuristic: every value is a date-like string
	if (present.every((v) => typeof v === "string" && DATE_RE.test(v) && !isNaN(new Date(v).getTime()))) {
		return "date";
	}
	return "text";
}

/** Infer kinds for every field present across the entries (mapping overrides win). */
export function inferEntryFieldKinds(entries: PageEntry[], mapping: FieldMapping): Record<string, FieldKind> {
	const buckets: Record<string, unknown[]> = {};
	for (const e of entries) {
		for (const [k, v] of Object.entries(e.fields ?? {})) {
			(buckets[k] ??= []).push(v);
		}
	}

	const out: Record<string, FieldKind> = {};
	for (const k of Object.keys(buckets)) {
		out[k] = inferFieldKind(buckets[k]);
	}

	// Explicit mapping overrides
	out[mapping.dateField] = "date";
	for (const t of mapping.tagFields) out[t] = "tags";
	for (const t of mapping.filterableFields) {
		if (!(t in out)) out[t] = "text";
	}
	return out;
}

/** Filter operators appropriate for a given field kind. */
export function operatorsForKind(kind: FieldKind): { value: string; label: string }[] {
	if (kind === "date") {
		return [
			{ value: "equals", label: "=" },
			{ value: "not_equals", label: "!=" },
			{ value: "before", label: "< date" },
			{ value: "after", label: "> date" },
		];
	}
	if (kind === "number") {
		return [
			{ value: "equals", label: "=" },
			{ value: "not_equals", label: "!=" },
			{ value: "greater_than", label: ">" },
			{ value: "less_than", label: "<" },
		];
	}
	return [
		{ value: "equals", label: "=" },
		{ value: "not_equals", label: "!=" },
		{ value: "contains", label: "contains" },
		{ value: "starts_with", label: "starts with" },
		{ value: "ends_with", label: "ends with" },
		{ value: "regex", label: "regex" },
		{ value: "greater_than", label: ">" },
		{ value: "less_than", label: "<" },
		{ value: "before", label: "< date" },
		{ value: "after", label: "> date" },
	];
}

/** Default operator when starting a new filter on a field of the given kind. */
export function defaultOperatorForKind(kind: FieldKind): string {
	if (kind === "date" || kind === "number") return "equals";
	return "contains";
}
