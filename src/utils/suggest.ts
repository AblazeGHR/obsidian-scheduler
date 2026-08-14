import { PageEntry, FieldMapping } from "../types";
import { formatDate } from "../views/table/table-utils";
import { toParentPathValue } from "./inline-editor";

// ============================================================
// Suggestion candidates for free-text value inputs
//
// Collects the distinct values observed for each field across entries, so a
// filter value input can offer "high-similarity" suggestions as the user types
// (prefix > substring > edit-distance, see rankSuggestions).
// ============================================================

/** A suggestion shown in the dropdown. `label` is what the user sees, `value`
 *  is what gets written into the input (they differ for `parent`, where the
 *  label is the target's `title(path)` but the stored value is a path). */
export interface SuggestionOption {
	label: string;
	value: string;
}

/** Classic Levenshtein edit distance (case-sensitive, used on lowercased text). */
export function levenshtein(a: string, b: string): number {
	const m = a.length;
	const n = b.length;
	if (m === 0) return n;
	if (n === 0) return m;
	let prev = new Array<number>(n + 1);
	let curr = new Array<number>(n + 1);
	for (let j = 0; j <= n; j++) prev[j] = j;
	for (let i = 1; i <= m; i++) {
		curr[0] = i;
		for (let j = 1; j <= n; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
		}
		[prev, curr] = [curr, prev];
	}
	return prev[n];
}

/**
 * Rank suggestions against a query, most similar first.
 * - empty query → the first `limit` options (already frequency-sorted)
 * - exact match > prefix > substring > fuzzy (edit-distance ≥ 0.6, only for
 *   queries of ≥ 3 chars, to avoid noisy matches on short queries)
 */
export function rankSuggestions(query: string, options: SuggestionOption[], limit = 6): SuggestionOption[] {
	const q = query.trim().toLowerCase();
	if (!q) return options.slice(0, limit);

	const scored: { opt: SuggestionOption; score: number }[] = [];
	for (const opt of options) {
		const label = opt.label.toLowerCase();
		if (label === q) {
			scored.push({ opt, score: 200 });
		} else if (label.startsWith(q)) {
			scored.push({ opt, score: 100 - label.length * 0.5 });
		} else if (label.includes(q)) {
			scored.push({ opt, score: 70 - label.length * 0.5 });
		} else if (q.length >= 3) {
			const dist = levenshtein(q, label);
			const sim = 1 - dist / Math.max(q.length, label.length);
			if (sim >= 0.6) scored.push({ opt, score: sim * 40 });
		}
	}

	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, limit).map((x) => x.opt);
}

/** Fields internal to Dataview / the plugin that never make useful suggestions. */
const INTERNAL_FIELD_PREFIXES = ["file.", "settings", "recursiveSubTask", "maxRecursiveRender"];

function isInternalField(key: string): boolean {
	return INTERNAL_FIELD_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** Stringify a field value into a single suggestion string. */
function fieldValueToString(v: unknown): string {
	if (v === null || v === undefined) return "";
	if (v instanceof Date) return formatDate(v);
	if (Array.isArray(v)) return v.filter((x) => x !== null && x !== undefined).map(String).join(", ");
	if (typeof v === "object") {
		// Dataview Link object → expose its target path
		const path = (v as Record<string, unknown>)["path"];
		if (typeof path === "string") return path;
		return JSON.stringify(v);
	}
	return String(v);
}

/**
 * Collect distinct per-field suggestion options from entries, most frequent
 * first. Title/date/tag/parent fields are handled explicitly; every other
 * (non-internal) frontmatter field is collected generically.
 */
export function collectFieldSuggestions(entries: PageEntry[], mapping: FieldMapping): Map<string, SuggestionOption[]> {
	const titleByPath = new Map<string, string>();
	for (const e of entries) titleByPath.set(e.path, e.title);

	const buckets = new Map<string, Map<string, { label: string; value: string; count: number }>>();
	const add = (field: string, value: string, label?: string) => {
		const v = value.trim();
		if (!v) return;
		const m = buckets.get(field) ?? new Map();
		const key = v;
		const existing = m.get(key);
		if (existing) {
			existing.count++;
		} else {
			m.set(key, { label: label ?? v, value: v, count: 1 });
		}
		buckets.set(field, m);
	};

	for (const e of entries) {
		add(mapping.titleField, e.title);
		add("title", e.title);
		if (e.date) add(mapping.dateField, formatDate(e.date));

		for (const tf of mapping.tagFields) {
			const raw = e.fields?.[tf];
			if (Array.isArray(raw)) {
				for (const item of raw) add(tf, String(item));
			} else if (typeof raw === "string") {
				add(tf, raw);
			}
		}

		const parent = toParentPathValue(e.fields?.["parent"]);
		if (parent) {
			const title = titleByPath.get(parent);
			add("parent", parent, title ? `${title}(${parent})` : parent);
		}

		for (const [k, v] of Object.entries(e.fields ?? {})) {
			if (
				k === "parent" ||
				k === mapping.titleField ||
				mapping.tagFields.includes(k) ||
				isInternalField(k)
			) {
				continue;
			}
			const s = fieldValueToString(v);
			if (s) add(k, s);
		}
	}

	const out = new Map<string, SuggestionOption[]>();
	for (const [field, m] of buckets) {
		out.set(
			field,
			[...m.values()]
				.sort((a, b) => b.count - a.count)
				.map(({ label, value }) => ({ label, value }))
		);
	}
	return out;
}
