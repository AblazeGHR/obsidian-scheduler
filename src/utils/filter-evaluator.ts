import { PageEntry, FilterClause, AtomicCondition } from "../types";
import { getFieldValue } from "../query/query-engine";
import { toParentPathValue } from "./inline-editor";

// ============================================================
// Filter tree evaluator
//
// Evaluates a tree of FilterClause[] against a PageEntry.
// Top-level clauses are ANDed; within a VisualClause
// conditions are ORed; each clause can optionally be negated.
// ============================================================

/** Evaluate a single AtomicCondition against a PageEntry.
 *  `titleByPath` (path → title) enables matching `parent` conditions by the
 *  parent entry's title as well as by its stored path/link. */
export function evaluateAtomic(
	entry: PageEntry,
	cond: AtomicCondition,
	titleByPath?: Map<string, string>
): boolean {
	const val = getFieldValue(entry, cond.field);
	const fv = cond.value;

	// For `parent`, the stored value is a path/link but users think in titles:
	// also match the resolved title. Comparison operators keep using the raw
	// value (a title has no meaningful ordering).
	const values = cond.field === "parent"
		? expandParentValues(val, titleByPath)
		: [val];

	switch (cond.operator) {
		case "equals": return values.some((v) => atomicEquals(v, fv));
		case "not_equals": return !values.some((v) => atomicEquals(v, fv));
		case "contains": return values.some((v) => atomicContains(v, fv));
		case "greater_than": return atomicCompare(val, fv) > 0;
		case "less_than": return atomicCompare(val, fv) < 0;
		case "before": return atomicCompare(val, fv) < 0;
		case "after": return atomicCompare(val, fv) > 0;
		case "starts_with": return values.some((v) => String(v ?? "").toLowerCase().startsWith(fv.toLowerCase()));
		case "ends_with": return values.some((v) => String(v ?? "").toLowerCase().endsWith(fv.toLowerCase()));
		case "regex":
			try {
				const re = new RegExp(fv, fv.includes("(?i)") ? "" : "i");
				return values.some((v) => re.test(String(v ?? "")));
			} catch {
				return false;
			}
		default:
			return true;
	}
}

/** For a `parent` field value, return [path, title] so string operators match
 *  either. Falls back to just the raw value when nothing is resolvable. */
function expandParentValues(val: unknown, titleByPath?: Map<string, string>): unknown[] {
	const path = toParentPathValue(val);
	if (!path || !titleByPath) return [val];
	const title = titleByPath.get(path);
	if (!title || title === path) return [val];
	return [val, title];
}

/** Evaluate a single FilterClause against a PageEntry. */
export function evaluateClause(
	entry: PageEntry,
	clause: FilterClause,
	titleByPath?: Map<string, string>
): boolean {
	let result: boolean;

	if (clause.type === "raw") {
		try {
			// eslint-disable-next-line no-new-func
			result = !!new Function("entry", "return !!(" + clause.expression + ")")(entry);
		} catch {
			result = false;
		}
	} else {
		// VisualClause — OR across conditions
		result = clause.conditions.length === 0
			? true
			: clause.conditions.some((c) => evaluateAtomic(entry, c, titleByPath));
	}

	return clause.not ? !result : result;
}

/** AND across all top-level clauses. If no clauses, return all entries. */
export function evaluateFilterTree(entries: PageEntry[], clauses: FilterClause[]): PageEntry[] {
	if (!clauses || clauses.length === 0) return entries;
	const titleByPath = new Map(entries.map((e) => [e.path, e.title]));
	return entries.filter((entry) => clauses.every((clause) => evaluateClause(entry, clause, titleByPath)));
}

/** Alias for evaluateFilterTree — same semantics, friendlier name for integration points. */
export function applyFilterTree(entries: PageEntry[], clauses: FilterClause[]): PageEntry[] {
	return evaluateFilterTree(entries, clauses);
}

// ---- internal helpers ----

/** Compare two values for equals, handling Date specially (local-date compare). */
function atomicEquals(a: unknown, b: string): boolean {
	if (a instanceof Date) {
		const d = new Date(b);
		return !isNaN(d.getTime()) && dateCompare(a, d) === 0;
	}
	return String(a ?? "").toLowerCase() === b.toLowerCase();
}

function atomicContains(a: unknown, b: string): boolean {
	if (a instanceof Date) {
		return a.toLocaleDateString().toLowerCase().includes(b.toLowerCase());
	}
	if (Array.isArray(a)) {
		return a.some((v) => String(v).toLowerCase().includes(b.toLowerCase()));
	}
	return String(a ?? "").toLowerCase().includes(b.toLowerCase());
}

function atomicCompare(a: unknown, b: string): number {
	if (a instanceof Date) {
		const d = new Date(b);
		if (isNaN(d.getTime())) return 0;
		return dateCompare(a, d);
	}
	return String(a ?? "").localeCompare(b);
}

function dateCompare(a: Date, b: Date): number {
	const y = a.getFullYear() - b.getFullYear();
	if (y !== 0) return y;
	const m = a.getMonth() - b.getMonth();
	if (m !== 0) return m;
	return a.getDate() - b.getDate();
}
