import { PageEntry, FieldMapping } from "../types";
import { formatCellValue } from "../views/table/table-utils";

// ============================================================
// Markdown export — render entries as a Markdown table
// ============================================================

/** Escape a cell value for safe inclusion in a Markdown table. */
function escapeCell(s: string): string {
	return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

/** Build a Markdown table string from entries and the chosen columns. */
export function entriesToMarkdown(entries: PageEntry[], columns: string[], mapping: FieldMapping): string {
	const cols = columns.length > 0 ? columns : ["title", "date"];
	const header = `| ${cols.map((c) => escapeCell(c)).join(" | ")} |`;
	const divider = `| ${cols.map(() => "---").join(" | ")} |`;
	const rows = entries.map((e) => {
		const cells = cols.map((c) => escapeCell(formatCellValue(e, c)));
		return `| ${cells.join(" | ")} |`;
	});
	return [header, divider, ...rows].join("\n") + "\n";
}
