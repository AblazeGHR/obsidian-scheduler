import { Plugin, WorkspaceLeaf, MarkdownPostProcessorContext } from "obsidian";
import { SchedulerSettings, ViewType } from "./types";
import { DEFAULT_SETTINGS, SchedulerSettingTab } from "./settings";
import { SchedulerView, VIEW_TYPE_SCHEDULER, createCodeblockRenderer } from "./views/react-renderer";
import { isDataviewAvailable } from "./utils/dataview-api";

export default class SchedulerPlugin extends Plugin {
	settings!: SchedulerSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

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
			})
		);

		// Also register individual codeblock aliases
		this.registerMarkdownCodeBlockProcessor(
			"scheduler-table",
			this.createBlockProcessor({ initialView: "table" })
		);
		this.registerMarkdownCodeBlockProcessor(
			"scheduler-calendar",
			this.createBlockProcessor({ initialView: "calendar" })
		);
		this.registerMarkdownCodeBlockProcessor(
			"scheduler-timeline",
			this.createBlockProcessor({ initialView: "timeline" })
		);

		console.log("Scheduler plugin loaded");
	}

	onunload(): void {
		console.log("Scheduler plugin unloaded");
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
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
	private createBlockProcessor(opts: { initialView?: ViewType }) {
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

			const root = createCodeblockRenderer(el, this, initialView);
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
			const match = line.match(/^\s*(\w+)\s*:\s*(.+)$/);
			if (match) {
				params[match[1].toLowerCase()] = match[2].trim();
			}
		}
		return params;
	}
}
