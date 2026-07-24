import { h, render } from "preact";
import { useState, useCallback, useEffect, useRef } from "preact/hooks";

export interface ContextMenuItem {
	label: string;
	onClick: () => void;
	/** Renders the item in a warning/danger (red) style. */
	danger?: boolean;
}

export interface ContextMenuApi {
	/** Open the menu at the cursor position for a right-click event. */
	open: (e: MouseEvent, items: ContextMenuItem[]) => void;
	/** Always null — the menu is portalled into <body> so it stays viewport-relative. */
	element: null;
}

/**
 * Lightweight right-click context menu.
 *
 * The menu is rendered into a <body>-level host via a portal. This is required
 * because inside Obsidian's workspace `position: fixed` is offset by the
 * sidebar/header layout (the same issue the calendar box-selection fix solved),
 * so an inline-rendered fixed menu would appear shifted toward the bottom-right.
 * Portalling to <body> makes the fixed coordinates truly viewport-relative.
 *
 * Closes on outside mousedown, Escape, or window resize.
 */
export function useContextMenu(): ContextMenuApi {
	const [state, setState] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
	const hostRef = useRef<HTMLDivElement | null>(null);

	// Create a body-level host for the menu on mount.
	useEffect(() => {
		const host = document.createElement("div");
		host.className = "scheduler-ctx-host";
		document.body.appendChild(host);
		hostRef.current = host;
		return () => {
			render(null, host);
			host.remove();
			hostRef.current = null;
		};
	}, []);

	const close = useCallback(() => setState(null), []);

	const open = useCallback(
		(e: MouseEvent, items: ContextMenuItem[]) => {
			e.preventDefault();
			e.stopPropagation();
			// Keep the menu on-screen: estimate height from item count.
			const width = 180;
			const itemH = 30;
			const x = Math.min(e.clientX, window.innerWidth - width - 8);
			const y = Math.min(e.clientY, window.innerHeight - (items.length * itemH + 8));
			setState({ x, y, items });
		},
		[]
	);

	// Render the menu into the body host whenever state changes.
	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		if (!state) {
			render(null, host);
			return;
		}
		render(
			<div
				class="scheduler-ctx-menu"
				style={{ position: "fixed", left: `${state.x}px`, top: `${state.y}px` }}
			>
				{state.items.map((it, i) => (
					<div
						class={`scheduler-ctx-item${it.danger ? " danger" : ""}`}
						key={i}
						onClick={(ev: any) => {
							ev.stopPropagation();
							it.onClick();
							close();
						}}
						onContextMenu={(ev: any) => ev.preventDefault()}
					>
						{it.label}
					</div>
				))}
			</div>,
			host
		);
	}, [state, close]);

	// Close on outside mousedown, Escape, or resize.
	useEffect(() => {
		if (!state) return;
		function onDown(e: MouseEvent) {
			if (!(e.target as HTMLElement).closest(".scheduler-ctx-menu")) close();
		}
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") close();
		}
		document.addEventListener("mousedown", onDown, true);
		document.addEventListener("keydown", onKey);
		window.addEventListener("resize", close);
		return () => {
			document.removeEventListener("mousedown", onDown, true);
			document.removeEventListener("keydown", onKey);
			window.removeEventListener("resize", close);
		};
	}, [state, close]);

	return { open, element: null };
}
