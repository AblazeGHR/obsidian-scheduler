import { FilterCondition } from "../types";

/**
 * Priority scale for resolving "greater_than" / "less_than" operators.
 * Higher index = higher priority.
 */
const PRIORITY_SCALE = ["低", "中", "高", "紧急"];

/**
 * Convert filter conditions to a frontmatter object.
 * Follows the design principle: all filters are inherited by newly created files.
 *
 * Rules:
 * - equals    → write exact value
 * - contains  → write value as-is (for tags: comma-separated)
 * - greater_than → pick next boundary value from priority scale
 * - less_than    → pick previous boundary value from priority scale
 * - before/after (date) → use today's date
 */
export function filtersToFrontmatter(
	filters: FilterCondition[],
	defaultDate: string
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	const today = defaultDate;

	for (const f of filters) {
		switch (f.operator) {
			case "equals":
				result[f.field] = f.value;
				break;

			case "contains":
				// For tag-like fields, store as the value text
				result[f.field] = f.value;
				break;

			case "greater_than": {
				const idx = PRIORITY_SCALE.indexOf(f.value);
				if (idx >= 0 && idx < PRIORITY_SCALE.length - 1) {
					result[f.field] = PRIORITY_SCALE[idx + 1];
				} else {
					result[f.field] = f.value;
				}
				break;
			}

			case "less_than": {
				const idx = PRIORITY_SCALE.indexOf(f.value);
				if (idx > 0) {
					result[f.field] = PRIORITY_SCALE[idx - 1];
				} else {
					result[f.field] = f.value;
				}
				break;
			}

			case "before":
			case "after":
				// Use today's date as the boundary
				result[f.field] = today;
				break;

			default:
				result[f.field] = f.value;
				break;
		}
	}

	return result;
}

/**
 * Build the YAML frontmatter string from a key-value map.
 */
export function buildFrontmatterString(
	fields: Record<string, unknown>,
	titleField: string,
	dateField: string,
	dateValue?: string
): string {
	const lines: string[] = ["---"];

	const added = new Set<string>();

	// Date first
	if (dateValue) {
		lines.push(`${dateField}: ${dateValue}`);
		added.add(dateField);
	}

	// Then remaining fields
	for (const [key, value] of Object.entries(fields)) {
		if (added.has(key)) continue;
		if (key === titleField) continue; // title handled separately

		if (Array.isArray(value)) {
			if (value.length > 1) {
				lines.push(`${key}:`);
				for (const v of value) {
					lines.push(`  - ${v}`);
				}
			} else {
				lines.push(`${key}: ${value[0]}`);
			}
		} else {
			lines.push(`${key}: ${value}`);
		}
		added.add(key);
	}

	lines.push("---\n");
	return lines.join("\n");
}

/**
 * Generate a safe filename from a title string.
 */
export function sanitizeFilename(title: string): string {
	return title
		.replace(/[<>:"/\\|?*]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 80) || "untitled";
}
