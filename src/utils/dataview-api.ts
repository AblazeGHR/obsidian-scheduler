import { App } from "obsidian";

/** Runtime Dataview API interface (subset we use) */
export interface DataviewApi {
	pages(query?: string, originFile?: string): Array<Record<string, unknown>>;
	page(path: string, originFile?: string): Record<string, unknown> | undefined;
}

/**
 * Get Dataview API from the running Obsidian app.
 * Returns null if Dataview is not installed or not ready.
 */
export function getDataviewApi(app: App): DataviewApi | null {
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const plugins = (app as any).plugins;
		const dv = plugins?.plugins?.["dataview"] as { api?: DataviewApi } | undefined;
		if (!dv?.api) {
			return null;
		}
		return dv.api;
	} catch {
		return null;
	}
}

/**
 * Check if Dataview is installed and enabled.
 */
export function isDataviewAvailable(app: App): boolean {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return (app as any).plugins?.enabledPlugins?.has?.("dataview") ?? false;
}
