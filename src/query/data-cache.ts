import { App, TFile } from "obsidian";
import { FieldMapping, PageEntry } from "../types";
import { getDataviewApi } from "../utils/dataview-api";
import { mapPageEntry } from "../schema/field-mapping";

// ============================================================
// Data cache layer
//
// Parsed entries are cached and only rebuilt when the folder/mapping signature
// changes or when the vault contents change (file create/rename/delete or
// metadata change). On each build we also merge Obsidian's inline fields
// (whole-line `key:: value`) as a guaranteed fallback so they appear in the
// views even when Dataview's index is stale.
// ============================================================

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

export class SchedulerDataCache {
	private app: App;
	private cache: PageEntry[] | null = null;
	private signature = "";

	constructor(app: App) {
		this.app = app;
	}

	/** Drop the cached entries (e.g. when a file changes). */
	invalidate(): void {
		this.cache = null;
		this.signature = "";
	}

	/** Return cached entries, rebuilding only when needed. */
	getEntries(mapping: FieldMapping, folders: string[]): PageEntry[] {
		const sig = this.computeSignature(mapping, folders);
		if (this.cache && this.signature === sig) return this.cache;
		this.cache = this.build(mapping, folders);
		this.signature = sig;
		return this.cache;
	}

	private computeSignature(mapping: FieldMapping, folders: string[]): string {
		return folders.join("|") + "::" + JSON.stringify(mapping);
	}

	private build(mapping: FieldMapping, folders: string[]): PageEntry[] {
		const api = getDataviewApi(this.app);
		if (!api) return [];

		let query: string | undefined;
		if (folders.length > 0) {
			query = `FROM ${folders.map((f) => `"${f}"`).join(" or ")}`;
		}

		const rawPages = api.pages(query);
		if (!rawPages) return [];

		const out: PageEntry[] = [];
		for (const rawPage of Array.from(rawPages as Iterable<Record<string, unknown>>)) {
			const path =
				(rawPage["file.path"] as string) ??
				((rawPage["file"] as Record<string, unknown> | undefined)?.["path"] as string | undefined);
			if (!path) continue;

			const entry = mapPageEntry(rawPage, path, mapping);
			this.mergeInlineFields(entry, path, mapping);
			out.push(entry);
		}
		return out;
	}

	/** Merge Obsidian metadata-cache inline fields (whole-line `key:: value`) as a fallback. */
	private mergeInlineFields(entry: PageEntry, path: string, mapping: FieldMapping): void {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		const cache = this.app.metadataCache.getFileCache(file) as Record<string, unknown> | null;
		const inline = cache?.inlineFields as Array<{ key: string; value: unknown }> | undefined;
		if (!inline || inline.length === 0) return;

		let changed = false;
		for (const f of inline) {
			const key = f.key;
			if (key in entry.fields) continue; // prefer Dataview's typed value
			let val: unknown = f.value;
			if (typeof val === "string" && DATE_RE.test(val) && !isNaN(new Date(val).getTime())) {
				val = new Date(val);
			}
			entry.fields[key] = val;
			changed = true;

			// Surface tag fields that only appear inline
			if (mapping.tagFields.includes(key)) {
				if (Array.isArray(val)) entry.tags.push(...val.map(String));
				else if (typeof val === "string" && val) entry.tags.push(val);
			}
		}

		if (changed) {
			entry.tags = Array.from(new Set(entry.tags));
		}
	}
}
