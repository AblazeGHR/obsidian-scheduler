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

// ============================================================
// Long-press → contextmenu (mobile)
//
// Touch devices have no right-click. Long-pressing for `ms` (default 500)
// dispatches a synthetic `contextmenu` MouseEvent onto the touched element,
// so existing onContextMenu handlers open the menu with the tap coordinates.
// If the finger moves >10px the long press is cancelled (scroll/drag).
// A successful long press suppresses the following click via `consumeClick`.
// ============================================================

export interface LongPressHandlers {
	onTouchStart: (e: TouchEvent) => void;
	onTouchMove: (e: TouchEvent) => void;
	onTouchEnd: () => void;
	onTouchCancel: () => void;
	/** Returns true (and clears the flag) if a long press just fired — call first in onClick. */
	consumeClick: () => boolean;
}

export function makeLongPressHandlers(ms = 500): LongPressHandlers {
	let timer: number | null = null;
	let start: { x: number; y: number } | null = null;
	let suppressClick = false;

	function clear() {
		if (timer !== null) window.clearTimeout(timer);
		timer = null;
		start = null;
	}

	return {
		onTouchStart(e: TouchEvent) {
			if (e.touches.length !== 1) return;
			const t = e.touches[0];
			start = { x: t.clientX, y: t.clientY };
			timer = window.setTimeout(() => {
				const s = start;
				const target = e.target as HTMLElement;
				clear();
				if (!s || !target) return;
				suppressClick = true;
				// Synthesize a contextmenu so existing onContextMenu handlers fire
				// with the long-press coordinates.
				const ev = new MouseEvent("contextmenu", {
					bubbles: true,
					cancelable: true,
					clientX: s.x,
					clientY: s.y,
				});
				target.dispatchEvent(ev);
			}, ms);
		},
		onTouchMove(e: TouchEvent) {
			if (timer === null || !start) return;
			const t = e.touches[0];
			if (Math.abs(t.clientX - start.x) > 10 || Math.abs(t.clientY - start.y) > 10) {
				clear();
			}
		},
		onTouchEnd: clear,
		onTouchCancel: clear,
		consumeClick() {
			const v = suppressClick;
			suppressClick = false;
			return v;
		},
	};
}
