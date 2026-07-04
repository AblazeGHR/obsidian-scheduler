import { App, Modal, Setting } from "obsidian";

/**
 * Simple text input modal for entering a new file title.
 */
export class NewEntryModal extends Modal {
	private title = "";
	private onSubmit: (title: string) => void;

	constructor(app: App, onSubmit: (title: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: "New Entry" });

		new Setting(contentEl)
			.setName("Title")
			.addText((text) => {
				text.setPlaceholder("Entry title...")
					.onChange((value) => (this.title = value));
				text.inputEl.addEventListener("keydown", (e) => {
					if (e.key === "Enter") {
						this.submit();
					}
				});
				// Auto-focus
				setTimeout(() => text.inputEl.focus(), 50);
			});

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText("Create")
					.setCta()
					.onClick(() => this.submit())
			);
	}

	private submit(): void {
		const t = this.title.trim();
		if (t) {
			this.onSubmit(t);
		}
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
