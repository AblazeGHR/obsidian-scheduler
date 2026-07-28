import { Plugin, WorkspaceLeaf, MarkdownPostProcessorContext, Notice } from "obsidian";
import { SchedulerSettings, ViewType, PageEntry } from "./types";
import { DEFAULT_SETTINGS, SchedulerSettingTab } from "./settings";
import { SchedulerView, VIEW_TYPE_SCHEDULER, createCodeblockRenderer } from "./views/react-renderer";
import { isDataviewAvailable } from "./utils/dataview-api";
import { SchedulerDataCache } from "./query/data-cache";
import { UndoManager } from "./utils/undo-manager";
import { computeReminders, formatDueLabel, shouldNotify, Reminder } from "./utils/reminders";
import { exportToICal, parseICal, buildNoteFromICalEvent, triggerIcsFilePicker } from "./utils/ical";
import { entriesToMarkdown } from "./utils/markdown-export";
import { collectColumns } from "./views/table/table-utils";
import { parseViewState, serializeViewState, writeCodeblockState, CodeblockViewState } from "./utils/codeblock-state";

export default class SchedulerPlugin extends Plugin {
	settings!: SchedulerSettings;
	/** Cached, parsed entries (invalidated on vault/metadata changes) */
	dataCache!: SchedulerDataCache;
	/** Undo/redo manager for programmatic frontmatter edits */
	undo!: UndoManager;
	/** Listeners notified when underlying data changes (e.g. after undo/redo) */
	private dataChangeListeners = new Set<() => void>();
	private resolveTimer?: number;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Data cache layer (invalidated on vault / metadata changes)
		this.dataCache = new SchedulerDataCache(this.app);
		// Debounced refresh: on each metadata change invalidate the cache and
		// notify views after a short silence so we don't re-render hundreds of
		// times during initial vault indexing.
		const scheduleRefresh = () => {
			this.dataCache.invalidate();
			window.clearTimeout(this.resolveTimer);
			this.resolveTimer = window.setTimeout(() => {
				this.notifyDataChanged();
				this.resolveTimer = undefined;
			}, 200);
		};
		this.registerEvent(this.app.metadataCache.on("changed", scheduleRefresh));
		this.registerEvent(this.app.metadataCache.on("resolved", scheduleRefresh));
		this.registerEvent(this.app.vault.on("rename", () => this.dataCache.invalidate()));
		this.registerEvent(this.app.vault.on("delete", () => this.dataCache.invalidate()));
		this.registerEvent(this.app.vault.on("create", () => this.dataCache.invalidate()));

		// Undo/redo manager (refreshes views after a restore)
		this.undo = new UndoManager(this.app, () => this.notifyDataChanged());

		// Register settings tab
		this.addSettingTab(new SchedulerSettingTab(this.app, this));

		// Register standalone view
		this.registerView(VIEW_TYPE_SCHEDULER, (leaf: WorkspaceLeaf) => new SchedulerView(leaf, this));

		// Add ribbon icon to open standalone panel
		this.addRibbonIcon("calendar-clock", "Open Scheduler", () => {
			this.activateView();
		});

		// Add command to open scheduler panel
		this.addCommand({
			id: "open-scheduler-view",
			name: "Open Scheduler panel",
			callback: () => this.activateView(),
		});

		// Register codeblock processor for in-note views
		this.registerMarkdownCodeBlockProcessor(
			"scheduler",
			this.createBlockProcessor({
				initialView: this.settings.defaultView,
				blockType: "scheduler",
			})
		);

		// Also register individual codeblock aliases
		this.registerMarkdownCodeBlockProcessor(
			"scheduler-table",
			this.createBlockProcessor({ initialView: "table", blockType: "scheduler-table" })
		);
		this.registerMarkdownCodeBlockProcessor(
			"scheduler-calendar",
			this.createBlockProcessor({ initialView: "calendar", blockType: "scheduler-calendar" })
		);
		this.registerMarkdownCodeBlockProcessor(
			"scheduler-timeline",
			this.createBlockProcessor({ initialView: "timeline", blockType: "scheduler-timeline" })
		);
		this.registerMarkdownCodeBlockProcessor(
			"scheduler-kanban",
			this.createBlockProcessor({ initialView: "kanban", blockType: "scheduler-kanban" })
		);

		// Register command to manually check reminders
		this.addCommand({
			id: "check-reminders",
			name: "Check reminders now",
			callback: () => this.checkReminders(),
		});

		// iCal export / import commands
		this.addCommand({
			id: "export-ical",
			name: "Export scheduler to .ics",
			callback: () => this.exportAllToIcal(),
		});
		this.addCommand({
			id: "import-ical",
			name: "Import .ics file",
			callback: () => triggerIcsFilePicker((text) => this.importIcalFromText(text)),
		});

		// Markdown export command
		this.addCommand({
			id: "export-markdown",
			name: "Export scheduler to Markdown",
			callback: () => this.exportAllToMarkdown(),
		});

		// Undo / redo commands
		this.addCommand({
			id: "undo-edit",
			name: "Undo last scheduler edit",
			callback: () => this.undo.undo(),
		});
		this.addCommand({
			id: "redo-edit",
			name: "Redo last scheduler edit",
			callback: () => this.undo.redo(),
		});

		// Schedule reminder checks (auto-cleaned by Obsidian on unload)
		if (this.settings.enableReminders) {
			this.registerInterval(window.setInterval(() => this.checkReminders(), 60000));
			setTimeout(() => this.checkReminders(), 2000);
		}

		console.log("Scheduler plugin loaded");
	}

	onunload(): void {
		window.clearTimeout(this.resolveTimer);
		console.log("Scheduler plugin unloaded");
	}

	/** Keys of already-notified occurrences ("path|dueTime") so each fires once */
	private notifiedKeys = new Set<string>();

	/** Scan entries and surface Obsidian notices for anything due right now. */
	private checkReminders(): void {
		const settings = this.settings;
		if (!settings.enableReminders) return;
		if (!isDataviewAvailable(this.app)) return;

		const entries = this.dataCache.getEntries(settings.fieldMapping, settings.folders);
		const now = new Date();
		const from = new Date(now.getTime() - 86400000); // include yesterday (past-due, all-day)
		const to = new Date(now.getTime() + 7 * 86400000); // 7-day horizon

		const reminders = computeReminders(entries, settings.fieldMapping, from, to);

		// Prune keys older than 2 days so the set doesn't grow forever
		for (const key of Array.from(this.notifiedKeys)) {
			const t = parseInt(key.split("|")[1], 10);
			if (!isNaN(t) && t < now.getTime() - 2 * 86400000) this.notifiedKeys.delete(key);
		}

		for (const r of reminders) {
			if (!shouldNotify(r, now, settings.reminderLeadMinutes)) continue;
			const key = `${r.entry.path}|${r.due.getTime()}`;
			if (this.notifiedKeys.has(key)) continue;
			this.notifiedKeys.add(key);
			this.showReminder(r, now);
		}
	}

	private showReminder(r: Reminder, now: Date): void {
		const when = formatDueLabel(r, now);
		const notice = new Notice(`🔔 Reminder: ${r.entry.title}\n${when}`, 12000);
		notice.noticeEl.addEventListener("click", () => {
			this.app.workspace.openLinkText(r.entry.path, "", false);
		});
	}

	// --- iCal export / import ---

	/** Export the given entries to an .ics file in the vault. */
	exportEntriesToIcal(entries: PageEntry[]): void {
		if (!isDataviewAvailable(this.app)) {
			new Notice("Dataview plugin is required to export.", 8000);
			return;
		}
		const ics = exportToICal(entries, this.settings.fieldMapping);
		const folder = this.settings.folders.length > 0 ? this.settings.folders[0] : "";
		const stamp = new Date();
		const fname = `scheduler-export-${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, "0")}${String(stamp.getDate()).padStart(2, "0")}.ics`;
		const path = folder ? `${folder}/${fname}` : fname;
		this.app.vault
			.create(path, ics)
			.then(() => new Notice(`Exported ${entries.length} entries to ${path}`, 8000))
			.catch(() => new Notice("iCal export failed (file may already exist).", 8000));
	}

	/** Export all entries (no expansion) to an .ics file in the vault. */
	exportAllToIcal(): void {
		if (!isDataviewAvailable(this.app)) return;
		const entries = this.dataCache.getEntries(this.settings.fieldMapping, this.settings.folders);
		this.exportEntriesToIcal(entries);
	}

	/** Export the given entries to a Markdown table file in the vault. */
	exportEntriesToMarkdown(entries: PageEntry[], columns: string[]): void {
		if (!isDataviewAvailable(this.app)) {
			new Notice("Dataview plugin is required to export.", 8000);
			return;
		}
		const md = entriesToMarkdown(entries, columns, this.settings.fieldMapping);
		const folder = this.settings.folders.length > 0 ? this.settings.folders[0] : "";
		const stamp = new Date();
		const fname = `scheduler-export-${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, "0")}${String(stamp.getDate()).padStart(2, "0")}.md`;
		const path = folder ? `${folder}/${fname}` : fname;
		this.app.vault
			.create(path, md)
			.then(() => new Notice(`Exported ${entries.length} entries to ${path}`, 8000))
			.catch(() => new Notice("Markdown export failed (file may already exist).", 8000));
	}

	/** Export all entries (no expansion) to a Markdown table file in the vault. */
	exportAllToMarkdown(): void {
		if (!isDataviewAvailable(this.app)) return;
		const entries = this.dataCache.getEntries(this.settings.fieldMapping, this.settings.folders);
		const columns = collectColumns(entries, this.settings.fieldMapping);
		this.exportEntriesToMarkdown(entries, columns);
	}

	/** Parse .ics text and create one markdown note per VEVENT. */
	async importIcalFromText(text: string): Promise<void> {
		const events = parseICal(text);
		if (events.length === 0) {
			new Notice("No events found in the .ics file.", 8000);
			return;
		}
		const folder = this.settings.folders.length > 0 ? this.settings.folders[0] : "";
		let created = 0;
		let skipped = 0;
		for (const ev of events) {
			const built = buildNoteFromICalEvent(ev, this.settings.fieldMapping, folder);
			const existing = this.app.vault.getAbstractFileByPath(built.path);
			if (existing) {
				skipped++;
				continue;
			}
			try {
				await this.app.vault.create(built.path, built.content);
				created++;
			} catch {
				skipped++;
			}
		}
		new Notice(`iCal import: ${created} created, ${skipped} skipped.`, 8000);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** Register a listener called when underlying data changes (e.g. undo/redo). */
	onDataChanged(cb: () => void): void {
		this.dataChangeListeners.add(cb);
	}

	/** Remove a previously registered data-change listener. */
	offDataChanged(cb: () => void): void {
		this.dataChangeListeners.delete(cb);
	}

	/** Notify all listeners that data changed so views can refresh. */
	notifyDataChanged(): void {
		for (const cb of this.dataChangeListeners) cb();
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_SCHEDULER)[0];

		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: VIEW_TYPE_SCHEDULER, active: true });
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	/**
	 * Create a codeblock processor that renders the scheduler UI as a Preact component.
	 */
	private createBlockProcessor(opts: { initialView?: ViewType; blockType?: string }) {
		const blockType = opts.blockType ?? "scheduler";

		return async (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
			// Check if Dataview is available - show warning if not
			if (!isDataviewAvailable(this.app)) {
				el.createDiv({ cls: "scheduler-dataview-missing" }, (div) => {
					div.createEl("p", { text: "Dataview plugin is required." });
					div.createEl("p", { text: "Please install and enable the Dataview community plugin." });
				});
				return;
			}

			// Check if this block is disabled with a `disabled` parameter
			const trimmed = source.trim().toLowerCase();
			if (trimmed === "disabled" || trimmed === "false") {
				return;
			}

			// Parse block parameters (key: value pairs, one per line)
			const params = this.parseBlockParams(source);
			const initialView = (params["view"] as ViewType) ?? opts.initialView ?? this.settings.defaultView;
			const newFileFolder = params["folder"];
			const initialTemplate = params["template"];

			// Parse view state from codeblock (sort, filters, hidden cols, search)
			const { state: initialState, warnings } = parseViewState(params);
			if (!initialState.viewType) initialState.viewType = initialView;

			// Show toast for any invalid keys or values found during parsing
			const validKeys = new Set(["view", "sort", "filters", "hidden", "visible", "search", "page-size", "folder", "template"]);
			for (const key of Object.keys(params)) {
				if (!validKeys.has(key)) {
					warnings.push(`Unknown parameter "${key}" — will be ignored`);
				}
			}
			for (const w of warnings) {
				new Notice(w);
			}

			// Only the main `scheduler` block writes back state automatically;
			// the aliases (scheduler-table etc.) force a specific view.
			const isPersistent = blockType === "scheduler";
			const onStateChange = isPersistent
				? (state: CodeblockViewState) => {
					// Preserve non-state params that the user may have written
					// manually (folder, template).
					const keepParams: Record<string, string> = {};
					if (params["folder"] != null) keepParams["folder"] = params["folder"];
					if (params["template"] != null) keepParams["template"] = params["template"];
					const newSource = serializeViewState(state, keepParams);
					// Skip the file write if nothing actually changed —
					// avoids an unnecessary markdown re-render + scroll shift.
					if (newSource === source.trim()) return;
					writeCodeblockState(this.app, ctx.sourcePath, blockType, source, newSource);
				}
				: undefined;

			const root = createCodeblockRenderer(el, this, initialView, newFileFolder, initialTemplate, initialState, onStateChange);
			ctx.addChild(root);
		};
	}

	/**
	 * Parse key: value parameters from a codeblock source.
	 */
	private parseBlockParams(source: string): Record<string, string> {
		const params: Record<string, string> = {};
		const lines = source.split("\n");
		for (const line of lines) {
			const match = line.match(/^\s*([\w-]+)\s*:\s*(.+)$/);
			if (match) {
				params[match[1].toLowerCase()] = match[2].trim();
			}
		}
		return params;
	}
}
