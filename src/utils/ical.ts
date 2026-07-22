import { PageEntry, FieldMapping } from "../types";
import { buildFrontmatterString, sanitizeFilename } from "./new-file-builder";
import { toISODate } from "../views/table/table-utils";

// ============================================================
// iCal (.ics) import / export
//
// Export turns entries into VEVENTs (DTSTART/DTEND, RRULE for recurring).
// Import parses VEVENTs and creates markdown notes with frontmatter
// matching the configured field mapping.
// ============================================================

const PAD = (n: number) => String(n).padStart(2, "0");

/** A parsed iCal event (intermediate representation). */
export interface ICalEvent {
	uid?: string;
	title: string;
	date: Date | null;
	start: Date | null;
	end: Date | null;
	dateEnd: Date | null;
	recurrence?: string;
	description?: string;
	tags: string[];
}

function escapeICalText(s: string): string {
	return s
		.replace(/\\/g, "\\\\")
		.replace(/;/g, "\\;")
		.replace(/,/g, "\\,")
		.replace(/\r?\n/g, "\\n");
}

function fmtDateICal(d: Date): string {
	return `${d.getFullYear()}${PAD(d.getMonth() + 1)}${PAD(d.getDate())}`;
}
function fmtDateTimeICal(d: Date): string {
	return `${fmtDateICal(d)}T${PAD(d.getHours())}${PAD(d.getMinutes())}00`;
}
function fmtTimeHM(d: Date): string {
	return `${PAD(d.getHours())}:${PAD(d.getMinutes())}`;
}
function addDays(d: Date, n: number): Date {
	const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
	x.setDate(x.getDate() + n);
	return x;
}

/** Build an .ics document string from entries. Recurrence clones are skipped. */
export function exportToICal(entries: PageEntry[], mapping: FieldMapping): string {
	const lines: string[] = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//obsidian-scheduler//EN",
		"CALSCALE:GREGORIAN",
	];

	for (const e of entries) {
		if (e.isRecurrence) continue; // only export the anchor occurrence
		if (!e.date) continue;

		const uid = `entry-${e.path.replace(/[^a-zA-Z0-9]/g, "-")}`;
		const timed = !!(e.start && e.end);

		lines.push("BEGIN:VEVENT");
		lines.push(`UID:${uid}`);
		lines.push(`DTSTAMP:${fmtDateTimeICal(new Date())}`);
		lines.push(`SUMMARY:${escapeICalText(e.title)}`);

		if (timed) {
			lines.push(`DTSTART:${fmtDateTimeICal(e.start!)}`);
			lines.push(`DTEND:${fmtDateTimeICal(e.end!)}`);
		} else if (e.dateEnd) {
			lines.push(`DTSTART;VALUE=DATE:${fmtDateICal(e.date)}`);
			// iCal all-day DTEND is exclusive (next day)
			lines.push(`DTEND;VALUE=DATE:${fmtDateICal(addDays(e.dateEnd, 1))}`);
		} else {
			lines.push(`DTSTART;VALUE=DATE:${fmtDateICal(e.date)}`);
			lines.push(`DTEND;VALUE=DATE:${fmtDateICal(addDays(e.date, 1))}`);
		}

		if (e.recurrenceRule) {
			const rule = e.recurrenceRule.toUpperCase().startsWith("RRULE:")
				? e.recurrenceRule.slice(6)
				: e.recurrenceRule;
			lines.push(`RRULE:${rule}`);
		}
		if (e.tags && e.tags.length > 0) {
			lines.push(`CATEGORIES:${e.tags.join(",")}`);
		}
		lines.push("END:VEVENT");
	}

	lines.push("END:VCALENDAR");
	return lines.join("\r\n");
}

/** Parse an .ics document into events (handles RFC5545 line folding). */
export function parseICal(text: string): ICalEvent[] {
	const rawLines = text.split(/\r?\n/);
	const lines: string[] = [];
	for (const line of rawLines) {
		if (/^[ \t]/.test(line) && lines.length > 0) {
			lines[lines.length - 1] += line.slice(1);
		} else {
			lines.push(line);
		}
	}

	const events: ICalEvent[] = [];
	let cur: Partial<ICalEvent> | null = null;

	const parseDateTime = (value: string): Date | null => {
		const v = value.trim();
		const dt = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
		if (!dt) return null;
		const y = parseInt(dt[1], 10);
		const m = parseInt(dt[2], 10) - 1;
		const d = parseInt(dt[3], 10);
		if (dt[4] !== undefined) {
			return new Date(y, m, d, parseInt(dt[4], 10), parseInt(dt[5], 10), parseInt(dt[6], 10));
		}
		return new Date(y, m, d);
	};

	for (const line of lines) {
		const upper = line.toUpperCase();
		if (upper === "BEGIN:VEVENT") {
			cur = { title: "", tags: [], date: null, start: null, end: null, dateEnd: null };
		} else if (upper === "END:VEVENT") {
			if (cur) {
				// Resolve all-day multi-day: DTEND is exclusive next day
				if (cur.date && cur.dateEnd && !cur.start) {
					const diffDays = Math.round(
						(atMidnight(cur.dateEnd).getTime() - atMidnight(cur.date).getTime()) / 86400000
					);
					if (diffDays <= 1) cur.dateEnd = null; // single all-day
				}
				events.push(cur as ICalEvent);
			}
			cur = null;
		} else if (cur) {
			const m = line.match(/^([A-Z]+)(?:;[^:]*)?:(.+)$/);
			if (!m) continue;
			const key = m[1].toUpperCase();
			const val = m[2].trim();
			switch (key) {
				case "UID":
					cur.uid = val;
					break;
				case "SUMMARY":
					cur.title = val.replace(/\\([,;\\])/g, "$1").replace(/\\n/gi, "\n");
					break;
				case "DESCRIPTION":
					cur.description = val.replace(/\\n/gi, "\n");
					break;
				case "DTSTART": {
					const d = parseDateTime(val);
					if (d) {
						if (/VALUE=DATE/i.test(line) || !val.includes("T")) {
							cur.date = d;
						} else {
							cur.date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
							cur.start = d;
						}
					}
					break;
				}
				case "DTEND": {
					const d = parseDateTime(val);
					if (d) {
						if (/VALUE=DATE/i.test(line) || !val.includes("T")) {
							cur.dateEnd = d;
						} else {
							cur.end = d;
						}
					}
					break;
				}
				case "RRULE":
					cur.recurrence = val;
					break;
				case "CATEGORIES":
					cur.tags = val.split(",").map((s) => s.trim()).filter(Boolean);
					break;
			}
		}
	}

	return events;
}

function atMidnight(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Build a markdown note { path, content } from a parsed iCal event. */
export function buildNoteFromICalEvent(
	ev: ICalEvent,
	mapping: FieldMapping,
	folder: string
): { path: string; content: string } {
	const fields: Record<string, unknown> = {};

	if (ev.recurrence && mapping.recurrenceField) {
		fields[mapping.recurrenceField] = ev.recurrence.toUpperCase().startsWith("RRULE:")
			? ev.recurrence.slice(6)
			: ev.recurrence;
	}
	if (ev.tags.length > 0 && mapping.tagFields.length > 0) {
		fields[mapping.tagFields[0]] = ev.tags;
	}
	if (ev.description) fields["description"] = ev.description;

	if (ev.start) fields[mapping.startField] = fmtTimeHM(ev.start);
	if (ev.end) fields[mapping.endField] = fmtTimeHM(ev.end);
	if (ev.dateEnd) fields[mapping.endDateField] = toISODate(ev.dateEnd);

	const dateStr = ev.date ? toISODate(ev.date) : "";
	let fm = buildFrontmatterString(fields, mapping.titleField, mapping.dateField, dateStr);
	// Insert the title line right after the opening frontmatter delimiter
	const titleLine = `${mapping.titleField}: ${ev.title}`;
	fm = fm.replace("---\n", `---\n${titleLine}\n`);

	const filename = sanitizeFilename(ev.title);
	const path = folder ? `${folder}/${filename}.md` : `${filename}.md`;
	return { path, content: fm };
}

/** Open a native file picker for .ics and hand the text to `onText`. */
export function triggerIcsFilePicker(onText: (text: string) => void): void {
	const input = document.createElement("input");
	input.type = "file";
	input.accept = ".ics,text/calendar";
	input.onchange = () => {
		const file = input.files && input.files[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => onText(String(reader.result ?? ""));
		reader.readAsText(file);
	};
	input.click();
}
