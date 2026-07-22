import { PageEntry, FieldMapping } from "../types";

// ============================================================
// Recurrence (RRULE) support
//
// Supports a pragmatic subset of RFC 5545 RRULE:
//   FREQ=DAILY | WEEKLY | MONTHLY | YEARLY
//   INTERVAL=n                 (default 1)
//   BYDAY=MO,WE,FR             (weekdays; also supports nth-weekday, e.g. MO(1), FR(-1) for MONTHLY)
//   COUNT=n                    (max number of occurrences)
//   UNTIL=YYYY-MM-DD           (stop after this date)
// The field is read from mapping.recurrenceField on each entry's frontmatter.
// ============================================================

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface RRule {
	freq: Freq;
	interval: number;
	/** Raw BYDAY tokens, e.g. ["MO", "WE(-1)"] */
	byDay: string[];
	count?: number;
	until?: Date;
}

// Sun-based index matching JS Date.getDay()
const WEEKDAY_INDEX: Record<string, number> = {
	SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};
// Mon-based offset used to add days from a Monday-start week
const BYDAY_OFFSET: Record<string, number> = {
	MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6,
};

export function parseRRule(raw: string): RRule | null {
	if (!raw) return null;
	let body = raw.trim();
	const upper = body.toUpperCase();
	if (upper.startsWith("RRULE:")) body = body.slice(6);

	const parts: Record<string, string> = {};
	for (const token of body.split(";")) {
		const eq = token.indexOf("=");
		if (eq === -1) continue;
		const k = token.slice(0, eq).trim().toUpperCase();
		const v = token.slice(eq + 1).trim();
		if (k) parts[k] = v;
	}

	if (!parts["FREQ"]) return null;
	const freq = parts["FREQ"].toUpperCase();
	if (!(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq))) return null;

	const interval = parts["INTERVAL"] ? Math.max(1, parseInt(parts["INTERVAL"], 10) || 1) : 1;
	const byDay = parts["BYDAY"]
		? parts["BYDAY"].toUpperCase().split(",").map((s) => s.trim()).filter(Boolean)
		: [];
	const untilRaw = parts["UNTIL"];
	const until = untilRaw ? parseDateOnly(untilRaw) ?? undefined : undefined;
	const count = parts["COUNT"] ? parseInt(parts["COUNT"], 10) : undefined;

	return { freq: freq as Freq, interval, byDay, until, count };
}

function parseDateOnly(s: string): Date | null {
	const m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
	if (!m) return null;
	return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

// --- date helpers (local time) ---
function atMidnight(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number): Date {
	const x = atMidnight(d);
	x.setDate(x.getDate() + n);
	return x;
}
function addMonths(d: Date, n: number): Date {
	return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}
function startOfWeekMonday(d: Date): Date {
	const x = atMidnight(d);
	x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
	return x;
}

interface ByDayParsed {
	dow: number; // Sun-based, for getDay comparisons
	offset: number; // Mon-based, for addDays from a Monday
	n: number | null; // ordinal for nth-weekday (MONTHLY)
}

function parseByDayToken(tok: string): ByDayParsed {
	const m = tok.match(/^([A-Z]{2})(?:\((-?\d+)\))?$/);
	if (!m) return { dow: 1, offset: 0, n: null };
	const dow = WEEKDAY_INDEX[m[1]] ?? 1;
	const offset = BYDAY_OFFSET[m[1]] ?? 0;
	const n = m[2] !== undefined ? parseInt(m[2], 10) : null;
	return { dow, offset, n };
}

/** nth weekday of a month. n>0 counts from the start, n<0 from the end. */
function nthWeekdayInMonth(year: number, month: number, dow: number, n: number): Date | null {
	const dim = new Date(year, month + 1, 0).getDate();
	if (n > 0) {
		let seen = 0;
		for (let day = 1; day <= dim; day++) {
			const d = new Date(year, month, day);
			if (d.getDay() === dow) {
				seen++;
				if (seen === n) return d;
			}
		}
	} else {
		let seen = 0;
		for (let day = dim; day >= 1; day--) {
			const d = new Date(year, month, day);
			if (d.getDay() === dow) {
				seen++;
				if (seen === -n) return d;
			}
		}
	}
	return null;
}

function step(d: Date, rule: RRule): Date {
	switch (rule.freq) {
		case "DAILY":
			return addDays(d, rule.interval);
		case "WEEKLY":
			return addDays(d, 7 * rule.interval);
		case "MONTHLY":
			return addMonths(d, rule.interval);
		case "YEARLY":
			return addMonths(d, 12 * rule.interval);
	}
}

function dedupe(dates: Date[]): Date[] {
	const seen = new Set<number>();
	const out: Date[] = [];
	for (const d of dates) {
		const t = d.getTime();
		if (!seen.has(t)) {
			seen.add(t);
			out.push(d);
		}
	}
	return out;
}

/**
 * Compute occurrence dates for a rule within [from, to] (inclusive, local days).
 * Occurrences are never before the anchor date.
 */
export function computeOccurrences(rule: RRule, anchor: Date, from: Date, to: Date): Date[] {
	const a = atMidnight(anchor);
	const f = atMidnight(from);
	const t = atMidnight(to);
	const out: Date[] = [];

	const valid = (d: Date) => d.getTime() >= a.getTime() && d.getTime() >= f.getTime() && d.getTime() <= t.getTime();

	// WEEKLY with BYDAY
	if (rule.freq === "WEEKLY" && rule.byDay.length > 0) {
		let week = startOfWeekMonday(a);
		let guard = 0;
		while (guard++ < 2000) {
			if (rule.count !== undefined && out.length >= rule.count) break;
			if (week.getTime() > t.getTime() && rule.until === undefined && rule.count === undefined) break;
			for (const tok of rule.byDay) {
				const { offset } = parseByDayToken(tok);
				const d = addDays(week, offset);
				if (valid(d)) out.push(d);
			}
			if (rule.until && week.getTime() > rule.until.getTime()) break;
			week = addDays(week, 7 * rule.interval);
		}
		return dedupe(out);
	}

	// MONTHLY with BYDAY (nth weekday)
	if (rule.freq === "MONTHLY" && rule.byDay.length > 0) {
		let year = a.getFullYear();
		let month = a.getMonth();
		let guard = 0;
		while (guard++ < 2000) {
			if (rule.count !== undefined && out.length >= rule.count) break;
			if (new Date(year, month, 1).getTime() > t.getTime() && rule.until === undefined && rule.count === undefined) break;
			for (const tok of rule.byDay) {
				const { dow, n } = parseByDayToken(tok);
				const d = nthWeekdayInMonth(year, month, dow, n ?? 1);
				if (d && valid(d)) out.push(d);
			}
			if (rule.until && new Date(year, month, 1).getTime() > rule.until.getTime()) break;
			month += rule.interval;
			while (month > 11) {
				month -= 12;
				year++;
			}
		}
		return dedupe(out);
	}

	// DAILY / WEEKLY(no BYDAY) / MONTHLY(no BYDAY) / YEARLY
	let cur = new Date(a);
	let fg = 0;
	while (cur.getTime() < f.getTime() && fg++ < 5000) cur = step(cur, rule);

	let guard = 0;
	while (guard++ < 4000) {
		if (rule.count !== undefined && out.length >= rule.count) break;
		if (cur.getTime() > t.getTime() && rule.until === undefined && rule.count === undefined) break;
		if (valid(cur)) out.push(cur);
		if (rule.until && cur.getTime() > rule.until.getTime()) break;
		cur = step(cur, rule);
	}
	return dedupe(out);
}

function isoOf(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Expand recurring entries into individual occurrences within [from, to].
 * Non-recurring entries pass through unchanged. Each occurrence is a clone with
 * its own `date` (and shifted `dateEnd` for multi-day events), plus recurrence
 * metadata and a unique `occurrenceId`.
 */
export function expandRecurring(entries: PageEntry[], from: Date, to: Date, mapping: FieldMapping): PageEntry[] {
	const field = mapping.recurrenceField;
	if (!field) return entries; // recurrence disabled

	const out: PageEntry[] = [];
	for (const e of entries) {
		const raw = e.fields?.[field];
		const rule = raw ? parseRRule(String(raw)) : null;
		if (!rule || !e.date) {
			out.push(e);
			continue;
		}
		const anchor = e.date;
		const spanDays = e.dateEnd
			? Math.round((atMidnight(e.dateEnd).getTime() - atMidnight(anchor).getTime()) / 86400000)
			: 0;
		const occ = computeOccurrences(rule, anchor, from, to);
		if (occ.length === 0) continue; // no occurrence in this window

		for (const d of occ) {
			const isAnchor = d.getTime() === atMidnight(anchor).getTime();
			out.push({
				...e,
				date: d,
				dateEnd: spanDays > 0 ? addDays(d, spanDays) : null,
				recurrenceRule: String(raw),
				isRecurrence: !isAnchor,
				occurrenceId: `${e.path}@${isoOf(d)}`,
			});
		}
	}
	return out;
}
