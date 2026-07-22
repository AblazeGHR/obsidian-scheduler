import { FieldMapping, PageEntry } from "../types";

/**
 * Map Dataview page fields to our PageEntry type using configured field mapping.
 */
export function mapPageEntry(rawPage: Record<string, unknown>, path: string, mapping: FieldMapping): PageEntry {
	const fields: Record<string, unknown> = {};
	for (const key of Object.keys(rawPage)) {
		fields[key] = rawPage[key];
	}

	// Extract title
	const titleRaw = fields[mapping.titleField];
	const title = typeof titleRaw === "string" ? titleRaw : fileNameFromPath(path);

	// Extract date (frontmatter date fields come as luxon DateTime from Dataview)
	const dateRaw = fields[mapping.dateField];
	const date = coerceToDate(dateRaw);

	// Extract optional end date for multi-day events
	const dateEndRaw = mapping.endDateField ? fields[mapping.endDateField] : undefined;
	const dateEnd = dateEndRaw !== undefined ? coerceToDate(dateEndRaw) : null;

	// Extract start/end times
	const startRaw = fields[mapping.startField];
	const endRaw = fields[mapping.endField];
	const start = coerceToDate(startRaw);
	const end = coerceToDate(endRaw);

	// Extract tags
	const tags: string[] = [];
	for (const tagField of mapping.tagFields) {
		const tagRaw = fields[tagField];
		if (Array.isArray(tagRaw)) {
			tags.push(...tagRaw.map((t) => (typeof t === "string" ? t : String(t))));
		} else if (typeof tagRaw === "string") {
			tags.push(tagRaw);
		}
	}

	// File metadata
	const ctimeRaw = fields["file.ctime"];
	const ctime = coerceToDate(ctimeRaw) ?? new Date();

	const mtimeRaw = fields["file.mtime"];
	const mtime = coerceToDate(mtimeRaw) ?? new Date();

	const folder = fileNameFromPath(fileNameFromPath(path) ? path : "");

	return {
		path,
		title,
		date,
		dateEnd,
		start,
		end,
		tags,
		fields,
		ctime,
		mtime,
		folder: getFolderName(path),
	};
}

function fileNameFromPath(path: string): string {
	const parts = path.split("/");
	const last = parts[parts.length - 1];
	return last.replace(/\.md$/, "");
}

function getFolderName(path: string): string {
	const lastSlash = path.lastIndexOf("/");
	return lastSlash > 0 ? path.substring(0, lastSlash) : "/";
}

/**
 * Coerce a Dataview value to a Date.
 * Dataview returns luxon DateTime objects for frontmatter dates.
 */
function coerceToDate(value: unknown): Date | null {
	if (value === null || value === undefined) return null;

	// luxon DateTime (Dataview standard)
	if (typeof value === "object" && value !== null) {
		const obj = value as Record<string, unknown>;
		if (typeof obj["ts"] === "number") return new Date(obj["ts"]);
		// Try ISO string
		if (typeof obj["toISO"] === "function") {
			const d = new Date((obj["toISO"] as () => string)());
			if (!isNaN(d.getTime())) return d;
		}
		// Try path-like date string (Dataview dates serialize as path strings)
		if (typeof obj["path"] === "string") {
			const d = new Date(obj["path"]);
			if (!isNaN(d.getTime())) return d;
		}
	}

	// String date
	if (typeof value === "string") {
		const d = new Date(value);
		if (!isNaN(d.getTime())) return d;
	}

	// Number (timestamp)
	if (typeof value === "number") {
		const d = new Date(value);
		if (!isNaN(d.getTime())) return d;
	}

	return null;
}
