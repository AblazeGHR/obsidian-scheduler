import { App, TFile } from "obsidian";
import { PageEntry, FieldMapping } from "../types";
import { mapPageEntry } from "../schema/field-mapping";

/** An inline-field-tagged task extracted from a page */
export interface TaskEntry {
	/** Display text (the task line content without the inline fields) */
	text: string;
	/** Raw line containing the task */
	rawLine: string;
	/** Inline fields parsed from [key:: value] */
	fields: Record<string, string>;
	/** Line number in the file */
	line: number;
}

/** Regex to match inline fields: [key:: value] where value is anything except ] */
const INLINE_FIELD_RE = /\[([^\]:]+)::\s*([^\]]*)\]/g;

/** Match markdown task checkbox prefix like `- [ ] ` or `* [x] ` */
const TASK_PREFIX_RE = /^[-*+]\s*\[.\]\s*/;

/**
 * Extract inline fields from a single line of text.
 * Returns a map of field names to values, and the text with fields and
 * any markdown task prefix stripped.
 */
function parseInlineFields(line: string): { fields: Record<string, string>; strippedText: string } {
	const fields: Record<string, string> = {};
	let stripped = line;
	let match: RegExpExecArray | null;

	const re = new RegExp(INLINE_FIELD_RE.source, "g");
	while ((match = re.exec(line)) !== null) {
		const key = match[1].trim();
		const val = match[2].trim();
		fields[key] = val;
		stripped = stripped.replace(match[0], "");
	}

	// Clean up double spaces from removal and the task checkbox prefix
	stripped = stripped.replace(TASK_PREFIX_RE, "").replace(/\s{2,}/g, " ").trim();

	return { fields, strippedText: stripped };
}

/**
 * Extract inline-field-tagged tasks from a file.
 * Reads the file content and finds lines that contain [key:: value] patterns.
 */
export async function extractTasksWithInlineFields(app: App, file: TFile): Promise<TaskEntry[]> {
	const content = await app.vault.read(file);
	const lines = content.split("\n");
	const tasks: TaskEntry[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		// Check if line contains inline fields
		if (!INLINE_FIELD_RE.test(line)) {
			INLINE_FIELD_RE.lastIndex = 0;
			continue;
		}
		INLINE_FIELD_RE.lastIndex = 0;

		const { fields, strippedText } = parseInlineFields(line);

		// Only create entries if there are actual fields
		if (Object.keys(fields).length === 0) continue;

		tasks.push({
			text: strippedText,
			rawLine: line,
			fields,
			line: i + 1,
		});
	}

	return tasks;
}

/**
 * Convert a TaskEntry into a PageEntry, inheriting parent page's fields
 * and overriding/augmenting with the inline fields.
 */
export function taskToPageEntry(
	task: TaskEntry,
	parentPage: Record<string, unknown>,
	filePath: string,
	mapping: FieldMapping
): PageEntry {
	// Merge parent fields with inline fields (inline take priority)
	const mergedFields: Record<string, unknown> = { ...parentPage };

	// Override with inline field values
	for (const [key, value] of Object.entries(task.fields)) {
		// Try to parse as number or date
		const numVal = Number(value);
		if (!isNaN(numVal) && value.trim() !== "") {
			mergedFields[key] = numVal;
		} else {
			const dateVal = new Date(value);
			if (!isNaN(dateVal.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
				mergedFields[key] = dateVal;
			} else {
				mergedFields[key] = value;
			}
		}
	}

	// Title: prefer the task's own inline title field, then the stripped
	// task text, then the parent-page title, then empty.
	const titleField = mapping.titleField;
	let title: string;
	if (task.fields[titleField]) {
		title = task.fields[titleField];
	} else if (task.text) {
		title = task.text;
	} else {
		title = (parentPage[titleField] as string) || "";
	}

	// Override the parent-page title so mapPageEntry picks up the
	// task-specific value instead of inheriting the file's title.
	mergedFields[titleField] = title;

	// Unique path: file path + line number
	const uniquePath = `${filePath}#L${task.line}`;

	return mapPageEntry(mergedFields, uniquePath, mapping);
}
