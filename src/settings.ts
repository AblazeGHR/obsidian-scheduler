import { PluginSettingTab, Setting, App } from "obsidian";
import type SchedulerPlugin from "./main";
import { SchedulerSettings } from "./types";

export const DEFAULT_SETTINGS: SchedulerSettings = {
	fieldMapping: {
		dateField: "due",
		endDateField: "",
		recurrenceField: "recurrence",
		startField: "start",
		endField: "end",
		titleField: "title",
		tagFields: ["tags"],
		filterableFields: ["due", "title", "tags", "priority", "status", "folder", "ctime", "mtime", "start", "end"],
	},
	folders: [],
	enableInlineTasks: true,
	enableReminders: true,
	reminderLeadMinutes: 0,
	templates: [],
	defaultView: "table",
};

export class SchedulerSettingTab extends PluginSettingTab {
	plugin: SchedulerPlugin;

	constructor(app: App, plugin: SchedulerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Scheduler Settings" });

		containerEl.createEl("h3", { text: "Field Mapping" });
		containerEl.createEl("p", {
			text: "Map frontmatter fields to logical meaning. These tell the plugin which field is a date, which is a title, etc.",
			cls: "setting-item-description",
		});

		this.addTextSetting("Date Field", "Which frontmatter field holds the primary date (e.g. 'due', 'date')", "dateField");
		this.addTextSetting(
			"End Date Field",
			"Optional. Frontmatter field holding the end date for multi-day events. Leave empty for single-day events.",
			"endDateField"
		);
		this.addTextSetting(
			"Recurrence Field",
			"Optional. Frontmatter field holding an RRULE string (e.g. 'FREQ=WEEKLY;BYDAY=MO,WE'). Leave empty to disable recurring events.",
			"recurrenceField"
		);
		this.addTextSetting("Title Field", "Which frontmatter field holds the display title (defaults to filename if empty)", "titleField");
		this.addTextSetting(
			"Start Field",
			"Start time for time-range events (e.g. 'start', 'begin')",
			"startField"
		);
		this.addTextSetting(
			"End Field",
			"End time for time-range events (e.g. 'end', 'finish')",
			"endField"
		);

		new Setting(containerEl)
			.setName("Tag Fields")
			.setDesc("Comma-separated list of frontmatter fields that contain tags (e.g. 'tags,category')")
			.addText((text) =>
				text
					.setPlaceholder("tags")
					.setValue(this.plugin.settings.fieldMapping.tagFields.join(","))
					.onChange(async (value) => {
						this.plugin.settings.fieldMapping.tagFields = value
							.split(",")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Filterable Fields")
			.setDesc("Comma-separated list of ALL fields available in the filter UI")
			.addText((text) => {
				text.setPlaceholder("due,title,tags,priority,status")
					.setValue(this.plugin.settings.fieldMapping.filterableFields.join(","))
					.onChange(async (value) => {
						this.plugin.settings.fieldMapping.filterableFields = value
							.split(",")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					});
				text.inputEl.style.width = "300px";
			});

		containerEl.createEl("h3", { text: "Scope" });

		new Setting(containerEl)
			.setName("Folders")
			.setDesc("Only process files in these folders (comma-separated). Leave empty for entire vault.")
			.addText((text) => {
				text.setPlaceholder("projects/, daily/")
					.setValue(this.plugin.settings.folders.join(","))
					.onChange(async (value) => {
						this.plugin.settings.folders = value
							.split(",")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					});
				text.inputEl.style.width = "300px";
			});

		containerEl.createEl("h3", { text: "Inline Fields" });

		new Setting(containerEl)
			.setName("Extract tasks from inline fields")
			.setDesc("When enabled, lines with [key:: value] patterns are extracted as separate entries in all views. Each task becomes a row in the table, an event in the calendar, and a block on the timeline.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableInlineTasks).onChange(async (value) => {
					this.plugin.settings.enableInlineTasks = value;
					await this.plugin.saveSettings();
				})
			);

		containerEl.createEl("h3", { text: "Display" });

		new Setting(containerEl)
			.setName("Default View")
			.setDesc("Which view to show when opening a scheduler block")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("table", "Table")
					.addOption("calendar", "Calendar")
					.addOption("timeline", "Timeline")
					.addOption("kanban", "Kanban")
					.setValue(this.plugin.settings.defaultView)
					.onChange(async (value) => {
						this.plugin.settings.defaultView = value as "table" | "calendar" | "timeline" | "kanban";
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Reminders" });

		new Setting(containerEl)
			.setName("Enable reminders")
			.setDesc("Show an Obsidian notification when an entry becomes due (date-only = on its day, timed = at its start time).")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableReminders).onChange(async (value) => {
					this.plugin.settings.enableReminders = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Reminder lead time (minutes)")
			.setDesc("Notify this many minutes before a timed event's start. 0 = notify at the start time.")
			.addText((text) =>
				text
					.setPlaceholder("0")
					.setValue(String(this.plugin.settings.reminderLeadMinutes))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						this.plugin.settings.reminderLeadMinutes = isNaN(n) || n < 0 ? 0 : n;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "View templates" });
		containerEl.createEl("p", {
			text: "Saved view presets (view + sort + filters). Apply them from the view toolbar dropdown, or load one automatically with a codeblock param: template: <name>.",
			cls: "setting-item-description",
		});

		const templates = this.plugin.settings.templates ?? [];
		if (templates.length === 0) {
			containerEl.createEl("p", { text: "No templates yet. Open a scheduler view and use “Save” to store the current view.", cls: "setting-item-description" });
		}
		for (const tpl of templates) {
			const sortDesc = tpl.sort.length > 0 ? tpl.sort.map((s) => `${s.field} ${s.direction}`).join(", ") : "none";
			const filterDesc = tpl.filters.length > 0 ? tpl.filters.map((f) => `${f.field} ${f.operator} ${f.value}`).join(", ") : "none";
			new Setting(containerEl)
				.setName(tpl.name)
				.setDesc(`View: ${tpl.viewType} · Sort: ${sortDesc} · Filters: ${filterDesc}`)
				.addButton((btn) =>
					btn.setButtonText("Delete").onClick(async () => {
						this.plugin.settings.templates = this.plugin.settings.templates.filter((t) => t.name !== tpl.name);
						await this.plugin.saveSettings();
						this.display();
					})
				);
		}
	}

	private addTextSetting(name: string, desc: string, key: keyof SchedulerSettings["fieldMapping"]): void {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.fieldMapping[key] as string)
					.setValue(this.plugin.settings.fieldMapping[key] as string)
					.onChange(async (value) => {
						(this.plugin.settings.fieldMapping[key] as string) = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
