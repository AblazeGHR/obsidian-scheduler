import { PluginSettingTab, Setting, App } from "obsidian";
import type SchedulerPlugin from "./main";
import { SchedulerSettings } from "./types";

export const DEFAULT_SETTINGS: SchedulerSettings = {
	fieldMapping: {
		dateField: "due",
		startField: "start",
		endField: "end",
		titleField: "title",
		tagFields: ["tags"],
		filterableFields: ["due", "title", "tags", "priority", "status", "folder", "ctime", "mtime", "start", "end"],
	},
	folders: [],
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

		containerEl.createEl("h3", { text: "Display" });

		new Setting(containerEl)
			.setName("Default View")
			.setDesc("Which view to show when opening a scheduler block")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("table", "Table")
					.addOption("calendar", "Calendar")
					.addOption("timeline", "Timeline")
					.setValue(this.plugin.settings.defaultView)
					.onChange(async (value) => {
						this.plugin.settings.defaultView = value as "table" | "calendar" | "timeline";
						await this.plugin.saveSettings();
					})
			);
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
