import { PageEntry, FilterClause, AtomicCondition } from "../types";
import { getFieldValue } from "../query/query-engine";

// ============================================================
// Filter tree evaluator
//
// Evaluates a tree of FilterClause[] against a PageEntry.
// Top-level clauses are ANDed; within a VisualClause
// conditions are ORed; each clause can optionally be negated.
// ============================================================

/** Evaluate a single AtomicCondition against a PageEntry. */
export function evaluateAtomic(entry: PageEntry, cond: AtomicCondition): boolean {
	const val = getFieldValue(entry, cond.field);
	const fv = cond.value;

	switch (cond.operator) {
		case "equals": return atomicEquals(val, fv);
		case "not_equals": return !atomicEquals(val, fv);
		case "contains": return atomicContains(val, fv);
		case "greater_than": return atomicCompare(val, fv) > 0;
		case "less_than": return atomicCompare(val, fv) < 0;
		case "before": return atomicCompare(val, fv) < 0;
		case "after": return atomicCompare(val, fv) > 0;
		case "starts_with": return String(val ?? "").toLowerCase().startsWith(fv.toLowerCase());
		case "ends_with": return String(val ?? "").toLowerCase().endsWith(fv.toLowerCase());
		case "regex":
			try {
				const re = new RegExp(fv, fv.includes("(?i)") ? "" : "i");
				return re.test(String(val ?? ""));
			} catch {
				return false;
			}
		default:
			return true;
	}
}

/** Evaluate a single FilterClause against a PageEntry. */
export function evaluateClause(entry: PageEntry, clause: FilterClause): boolean {
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
			: clause.conditions.some((c) => evaluateAtomic(entry, c));
	}

	return clause.not ? !result : result;
}

/** AND across all top-level clauses. If no clauses, return all entries. */
export function evaluateFilterTree(entries: PageEntry[], clauses: FilterClause[]): PageEntry[] {
	if (!clauses || clauses.length === 0) return entries;
	return entries.filter((entry) => clauses.every((clause) => evaluateClause(entry, clause)));
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
