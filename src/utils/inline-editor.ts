import { App, TFile } from "obsidian";

// Regex to detect inline paths: "file.md#L5"
const INLINE_PATH_RE = /#L\d+$/;

// Check if a path is an inline entry path
export function isInlinePath(path: string): boolean {
	return INLINE_PATH_RE.test(path);
}

// Parse "file.md#L5" into { filePath: "file.md", line: 5 }
export function parseInlinePath(path: string): { filePath: string; line: number } | null {
	const m = path.match(/^(.+)#L(\d+)$/);
	if (!m) return null;
	return { filePath: m[1], line: parseInt(m[2]) };
}

// Apply an edit to a specific line's inline fields.
// The transform receives the target line text and should return the new line text.
// This wraps the file I/O and provides before/after snapshots for undo.
export async function applyInlineEdit(
	app: App,
	path: string,
	transform: (lineText: string) => string
): Promise<{ path: string; before: string; after: string } | null> {
	const parsed = parseInlinePath(path);
	if (!parsed) return null;
	const file = app.vault.getAbstractFileByPath(parsed.filePath);
	if (!(file instanceof TFile)) return null;

	let result: { path: string; before: string; after: string } | null = null;
	await app.vault.process(file, (data) => {
		const lines = data.split("\n");
		if (parsed.line < 1 || parsed.line > lines.length) return data;
		const lineIdx = parsed.line - 1;
		const originalLine = lines[lineIdx];
		const newLine = transform(originalLine);
		if (newLine === originalLine) return data; // no change
		lines[lineIdx] = newLine;
		const after = lines.join("\n");
		result = { path: parsed.filePath, before: data, after };
		return after;
	});
	return result;
}
