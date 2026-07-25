import { App, MarkdownPostProcessorContext } from "obsidian";
import { h, render } from "preact";
import { FieldMapping } from "../../types";
import { EntryFieldsModal } from "../table/entry-fields-modal";
import { formatCellValue } from "../table/table-utils";
import { applyInlineEdit } from "../../utils/inline-editor";

const INLINE_FIELD_RE = /\[([^\]:]+)::\s*([^\]]*)\]/g;

/**
 * Create a markdown post-processor that collapses extra inline fields on
 * task items in reading mode.  Only the first 3 fields are visible; a "…"
 * button opens a modal showing (and allowing edits to) all fields.
 */
export function createInlineCollapseProcessor(app: App, mapping: FieldMapping) {
	return (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
		const filePath = ctx.sourcePath;

		const items = el.querySelectorAll<HTMLElement>("li[data-line]");
		for (const item of items) {
			const line = parseInt(item.getAttribute("data-line") ?? "", 10);
			if (!line) continue;

			const html = item.innerHTML;

			// Parse inline fields from raw HTML
			const fields: Record<string, string> = {};
			const rawMatches = [...html.matchAll(new RegExp(INLINE_FIELD_RE.source, "g"))];
			for (const m of rawMatches) {
				fields[m[1].trim()] = m[2].trim();
			}
			const keys = Object.keys(fields);
			if (keys.length <= 3) continue;

			// Build compact HTML: show first 3 fields, hide the rest
			const visibleHtml = keys.slice(0, 3)
				.map((k) => ` <span class="inl-fld"><span class="inl-fld-key">${escapeHtml(k)}</span>:<span class="inl-fld-val">${escapeHtml(fields[k])}</span></span>`)
				.join("");

			const hiddenFields: Record<string, string> = {};
			for (let i = 3; i < keys.length; i++) {
				hiddenFields[keys[i]] = fields[keys[i]];
			}

			// Clean the HTML: remove all [key:: value] patterns
			let cleanHtml = html.replace(new RegExp(INLINE_FIELD_RE.source, "g"), "");

			// Remove task prefix for text extraction
			const text = cleanHtml.replace(/<[^>]+>/g, "").replace(/^\s*[-*+]\s*\[.\]\s*/, "").trim();

			const containerId = `inl-more-${line}`;

			item.innerHTML = `${cleanHtml}<span class="inl-fields-vis">${visibleHtml}</span><span class="inl-fields-more" id="${containerId}"> …</span>`;
			item.setAttribute("data-inl-processed", "1");

			// Attach click handler
			const moreBtn = item.querySelector<HTMLElement>(`#${containerId}`);
			if (moreBtn) {
				moreBtn.addEventListener("click", (e) => {
					e.stopPropagation();
					openFieldsModal(app, mapping, fields, filePath, line, text, moreBtn);
				});
			}
		}
	};
}

/**
 * Open the EntryFieldsModal as a portal, passing a pseudo-PageEntry built from
 * inline field data so the modal can edit fields via applyInlineEdit.
 */
function openFieldsModal(
	app: App,
	mapping: FieldMapping,
	fields: Record<string, string>,
	filePath: string,
	line: number,
	title: string,
	anchor: HTMLElement,
) {
	const portal = document.createElement("div");
	portal.className = "scheduler-inline-modal-portal";
	document.body.appendChild(portal);

	const uniquePath = `${filePath}#L${line}`;

	// Pseudo PageEntry — only the pieces EntryFieldsModal touches
	const pseudoEntry = {
		path: uniquePath,
		title,
		date: null as Date | null,
		dateEnd: null as Date | null,
		start: null as Date | null,
		end: null as Date | null,
		tags: [] as string[],
		fields: fields as Record<string, unknown>,
		ctime: new Date(),
		mtime: new Date(),
		folder: filePath.replace(/\/[^/]+$/, "") || "/",
	};

	function handleEdit(p: string, field: string, value: string) {
		applyInlineEdit(app, uniquePath, (lineText) => {
			// Set inline field on the target line
			const re = new RegExp(`\\[${escapeRegex(field)}::\\s*[^\\]]*\\]`, "i");
			if (re.test(lineText)) {
				return lineText.replace(re, `[${field}:: ${value}]`);
			}
			return lineText.trimEnd() + ` [${field}:: ${value}]`;
		}).then((res) => {
			// Re-render will happen when Obsidian catches the file change
		});
	}

	render(
		h(EntryFieldsModal, {
			entry: pseudoEntry as any,
			mapping,
			fields: Object.keys(fields),
			onEdit: handleEdit,
			onClose: () => {
				render(null, portal);
				portal.remove();
			},
		}),
		portal,
	);
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
