import { App, TFile } from "obsidian";
import { ViewType, SortConfig, FilterCondition } from "../types";

// ============================================================
// Codeblock View State — serialisation / deserialisation
//
// Maps view-state between the scheduler codeblock body (flat k:v
// parameters) and the React component state. Also provides a
// write-back helper that replaces the codeblock content in the
// markdown file so settings persist across sessions.
// ============================================================

export interface CodeblockViewState {
	viewType?: ViewType;
	sort: SortConfig[];
	filters: FilterCondition[];
	hiddenCols: string[];
	search: string;
}

/** Valid view types */
const VALID_VIEWS: ReadonlySet<string> = new Set(["table", "calendar", "timeline", "kanban"]);

/**
 * Parse view state out of already-parsed codeblock parameters (flat
 * `Record<string, string>` as returned by `parseBlockParams`).
 *
 * Format:
 *   view:  table
 *   sort:  field:asc,field:desc
 *   filters: field:op:val|field:op:val
 *   hidden: col1,col2
 *   search: query
 */
export function parseViewState(params: Record<string, string>): CodeblockViewState {
	const state: CodeblockViewState = { sort: [], filters: [], hiddenCols: [], search: "" };

	// view
	const v = params["view"];
	if (v && VALID_VIEWS.has(v)) state.viewType = v as ViewType;

	// sort: field:dir,field:dir,...
	const sortRaw = params["sort"];
	if (sortRaw) {
		const parts = sortRaw.split(",").map((s) => s.trim()).filter(Boolean);
		for (const p of parts) {
			const colon = p.lastIndexOf(":");
			if (colon > 0) {
				const field = p.slice(0, colon);
				const dir = p.slice(colon + 1);
				if (dir === "asc" || dir === "desc") {
					state.sort.push({ field, direction: dir });
				}
			}
		}
	}

	// filters: field:op:val|field:op:val|...
	const filtersRaw = params["filters"];
	if (filtersRaw) {
		const parts = filtersRaw.split("|").filter(Boolean);
		for (const p of parts) {
			const firstColon = p.indexOf(":");
			const secondColon = firstColon >= 0 ? p.indexOf(":", firstColon + 1) : -1;
			if (firstColon >= 0 && secondColon > firstColon) {
				const field = p.slice(0, firstColon).trim();
				const operator = p.slice(firstColon + 1, secondColon).trim();
				const value = p.slice(secondColon + 1);
				if (field && operator) {
					state.filters.push({ field, operator: operator as FilterCondition["operator"], value });
				}
			}
		}
	}

	// hidden: col1,col2,...
	const hiddenRaw = params["hidden"];
	if (hiddenRaw) {
		state.hiddenCols = hiddenRaw.split(",").map((s) => s.trim()).filter(Boolean);
	}

	// search
	state.search = params["search"] ?? "";

	return state;
}

/**
 * Serialize view state back into the flat key:value lines that form the
 * codeblock body. Non-state params (`folder`, `template`) are preserved
 * from the original param set.
 */
export function serializeViewState(state: CodeblockViewState, keepParams: Record<string, string>): string {
	const lines: string[] = [];

	// view
	if (state.viewType) {
		lines.push(`view: ${state.viewType}`);
	}

	// sort
	if (state.sort.length > 0) {
		const sortStr = state.sort.map((s) => `${s.field}:${s.direction}`).join(", ");
		lines.push(`sort: ${sortStr}`);
	}

	// filters
	if (state.filters.length > 0) {
		const filterStr = state.filters
			.map((f) => `${f.field}:${f.operator}:${f.value}`)
			.join("|");
		lines.push(`filters: ${filterStr}`);
	}

	// hidden
	if (state.hiddenCols.length > 0) {
		lines.push(`hidden: ${state.hiddenCols.join(", ")}`);
	}

	// search
	if (state.search) {
		lines.push(`search: ${state.search}`);
	}

	// Preserve folder / template if present (these are set by the
	// user manually in the codeblock and shouldn't be lost).
	for (const key of ["folder", "template"]) {
		if (keepParams[key] != null && (key !== "folder" || keepParams[key] !== "")) {
			lines.push(`${key}: ${keepParams[key]}`);
		}
	}

	return lines.join("\n");
}

/**
 * Write the serialized view state back to the scheduler codeblock in the
 * markdown file. Searches for the codeblock whose source matches
 * `originalSource` (content between fences) and replaces it atomically
 * via `app.vault.process`.
 *
 * @param app          Obsidian app instance
 * @param filePath     Path to the markdown file
 * @param blockType    Codeblock language tag (e.g. "scheduler")
 * @param originalSource  The raw source content we last read from the block
 * @param newSource    The new source content to write
 */
export async function writeCodeblockState(
	app: App,
	filePath: string,
	blockType: string,
	originalSource: string,
	newSource: string
): Promise<void> {
	const file = app.vault.getAbstractFileByPath(filePath);
	if (!(file instanceof TFile)) return;

	await app.vault.process(file, (data) => {
		const lines = data.split("\n");
		const fence = "```" + blockType;
		const originalTrimmed = originalSource.trim();
		const indentRe = /^(\s*)/;

		for (let i = 0; i < lines.length; i++) {
			const trimmed = lines[i].trim();
			if (trimmed === fence || trimmed.startsWith(fence)) {
				// Collect source content until closing fence
				const contentLines: string[] = [];
				let j = i + 1;
				while (j < lines.length) {
					const t = lines[j].trim();
					if (t.startsWith("```")) break;
					contentLines.push(lines[j]);
					j++;
				}
				const foundContent = contentLines.join("\n").trim();
				if (foundContent === originalTrimmed) {
					// Ensure we don't lose indentation on the opening fence
					const indentMatch = indentRe.exec(lines[i]);
					const indent = (indentMatch && indentMatch[1]) ? indentMatch[1] : "";
					const before = lines.slice(0, i + 1);
					const after = lines.slice(j);
					const newLines = newSource.split("\n").map((l) => indent + l);
					return [...before, ...newLines, ...after].join("\n");
				}
				i = j;
			}
		}
		// Codeblock not found — return unchanged
		return data;
	});
}
