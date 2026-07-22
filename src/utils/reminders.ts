import { PageEntry, FieldMapping } from "../types";
import { expandRecurring } from "./recurrence";

// ============================================================
// Reminders: derive a due instant for every (possibly recurring) entry
// occurrence within a window, so the plugin can surface Obsidian notices.
// ============================================================

export interface Reminder {
	entry: PageEntry;
	/** When the entry is actually due */
	due: Date;
	/** True when the entry has no start time (all-day style) */
	isAllDay: boolean;
}

/** Local midnight helper */
function atMidnight(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Compute reminders for all occurrences whose due instant falls within [from, to].
 * - Timed entries: due = occurrence date + the start field's time-of-day.
 * - All-day entries: due = 09:00 on the occurrence date.
 */
export function computeReminders(entries: PageEntry[], mapping: FieldMapping, from: Date, to: Date): Reminder[] {
	const expanded = expandRecurring(entries, from, to, mapping);
	const out: Reminder[] = [];

	for (const e of expanded) {
		if (!e.date) continue;
		const y = e.date.getFullYear();
		const m = e.date.getMonth();
		const d = e.date.getDate();

		if (e.start) {
			const due = new Date(y, m, d, e.start.getHours(), e.start.getMinutes());
			out.push({ entry: e, due, isAllDay: false });
		} else {
			const due = new Date(y, m, d, 9, 0);
			out.push({ entry: e, due, isAllDay: true });
		}
	}

	out.sort((a, b) => a.due.getTime() - b.due.getTime());
	return out;
}

/** Format a due instant for display in a notification */
export function formatDueLabel(r: Reminder, now: Date): string {
	const due = r.due;
	const sameDay = atMidnight(due).getTime() === atMidnight(now).getTime();
	const tomorrow = atMidnight(now).getTime() + 86400000;
	const isTomorrow = atMidnight(due).getTime() === tomorrow;

	const time = `${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}`;
	if (r.isAllDay) {
		if (sameDay) return "Today";
		if (isTomorrow) return "Tomorrow";
		return due.toLocaleDateString();
	}
	if (sameDay) return `Today ${time}`;
	if (isTomorrow) return `Tomorrow ${time}`;
	return `${due.toLocaleDateString()} ${time}`;
}

/**
 * Decide whether a reminder should fire now.
 * - Timed: fire once when `now` is within [due - lead, due + 10min grace].
 * - All-day: fire once when `now` is on the same calendar day as `due`.
 */
export function shouldNotify(r: Reminder, now: Date, leadMinutes: number): boolean {
	const due = r.due.getTime();
	const nowT = now.getTime();

	if (r.isAllDay) {
		return atMidnight(new Date(nowT)).getTime() === atMidnight(new Date(due)).getTime();
	}
	const lead = leadMinutes * 60000;
	const start = due - lead;
	const grace = 10 * 60000; // still catch it shortly after start
	return nowT >= start && nowT <= due + grace;
}
