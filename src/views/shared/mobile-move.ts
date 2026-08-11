import { useState, useCallback } from "preact/hooks";
import { Platform } from "obsidian";

/**
 * Mobile "select-to-move" state.
 *
 * HTML5 drag & drop does not fire on touch devices, so on phones the views
 * switch to a two-tap interaction: tap an entry to pick it up, then tap a
 * target (day / column / time) to drop it. Desktop behaviour is untouched.
 */
export function useMobileMove() {
	const [pendingPath, setPendingPath] = useState<string | null>(null);

	/** Pick up (or release) an entry for moving. */
	const toggle = useCallback((path: string) => {
		setPendingPath((cur) => (cur === path ? null : path));
	}, []);

	/** Cancel any pending move. */
	const cancel = useCallback(() => setPendingPath(null), []);

	/** Take the pending path and clear the state. Returns null if nothing pending. */
	const consume = useCallback((): string | null => {
		let path: string | null = null;
		setPendingPath((cur) => {
			path = cur;
			return null;
		});
		return path;
	}, []);

	return { isMobile: Platform.isMobile, pendingPath, toggle, cancel, consume };
}
