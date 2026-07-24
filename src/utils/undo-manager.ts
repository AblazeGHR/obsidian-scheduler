import { App, TFile } from "obsidian";

// ============================================================
// Undo / redo for programmatic frontmatter edits.
//
// Obsidian's own undo stack does not cover edits we make via vault.process,
// so we snapshot the full file content before each write and restore it on
// undo/redo. A `notify` callback bumps the view after a restore.
// ============================================================

interface Edit {
	path: string;
	before: string;
	after: string;
}

export class UndoManager {
	private app: App;
	private undoStack: Edit[] = [];
	private redoStack: Edit[] = [];
	private notify?: () => void;
	private readonly limit = 100;

	constructor(app: App, notify?: () => void) {
		this.app = app;
		this.notify = notify;
	}

	/**
	 * Apply `transform` to a file's content, recording before/after so the edit
	 * can be undone/redone. The read and write happen inside a single
	 * `vault.process`, so `before` is always the true current content even when
	 * edits to the same file happen in quick succession (the old capture() +
	 * separate process() could snapshot a stale `before`).
	 */
	async apply(path: string, transform: (data: string) => string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		await this.app.vault.process(file, (data) => {
			const before = data;
			const after = transform(data);
			this.undoStack.push({ path, before, after });
			if (this.undoStack.length > this.limit) this.undoStack.shift();
			this.redoStack = [];
			return after;
		});
	}

	/**
	 * Apply a raw edit with explicit file path and resulting content.
	 * Used for inline edits where the entry path contains #L suffix.
	 */
	applyRaw(filePath: string, before: string, after: string): void {
		this.undoStack.push({ path: filePath, before, after });
		if (this.undoStack.length > this.limit) this.undoStack.shift();
		this.redoStack = [];
	}

	get canUndo(): boolean {
		return this.undoStack.length > 0;
	}
	get canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	async undo(): Promise<void> {
		const e = this.undoStack.pop();
		if (!e) return;
		await this.write(e.path, e.before);
		this.redoStack.push(e);
		this.notify?.();
	}

	async redo(): Promise<void> {
		const e = this.redoStack.pop();
		if (!e) return;
		await this.write(e.path, e.after);
		this.undoStack.push(e);
		this.notify?.();
	}

	private async write(path: string, content: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			await this.app.vault.process(file, () => content);
		}
	}
}
