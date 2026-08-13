import { h, render } from "preact";
import { useRef, useEffect, useState, useCallback } from "preact/hooks";

// ============================================================
// Popover — body-portalled dropdown that escapes code-block clipping
//
// Obsidian renders markdown code blocks inside containers that clip or
// overflow absolutely-positioned descendants, so a dropdown opening
// downward from a small scheduler block gets cut off (filter / sort /
// columns / searchable-select / toolbar menus all suffered from this).
//
// Rendering the menu into a <body>-level host and positioning it with
// `position: fixed` at the trigger's getBoundingClientRect() escapes every
// clipping ancestor. Because <body> has no transformed ancestor, fixed
// coordinates are truly viewport-relative (the same principle the right-
// click context menu uses).
// ============================================================

/** Live body-level hosts, used to treat popover clicks as "inside the plugin". */
const liveHosts = new Set<HTMLElement>();

export function isInsidePopoverHost(target: Node | null): boolean {
	if (!target) return false;
	for (const host of liveHosts) {
		if (host.contains(target)) return true;
	}
	return false;
}

interface PopoverProps {
	/** Ref to the trigger element the popover is anchored to. */
	anchorRef: { current: HTMLElement | null };
	/** Whether the popover is open. */
	open: boolean;
	/** Align the left edge with the anchor's left ("start") or right edge ("end"). */
	align?: "start" | "end";
	/** Vertical gap between the anchor's bottom and the popover's top. */
	offsetY?: number;
	/** Called on mousedown outside both the anchor and the popover. */
	onOutsideClick?: () => void;
	/** Extra CSS class for the popover wrapper. */
	className?: string;
	children: any;
}

export function Popover({
	anchorRef,
	open,
	align = "start",
	offsetY = 4,
	onOutsideClick,
	className,
	children,
}: PopoverProps) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

	// Create the body-level host once and register it for outside-click /
	// save-handler containment checks.
	useEffect(() => {
		const host = document.createElement("div");
		host.className = "scheduler-popover-host";
		document.body.appendChild(host);
		hostRef.current = host;
		liveHosts.add(host);
		return () => {
			render(null, host);
			host.remove();
			liveHosts.delete(host);
			hostRef.current = null;
		};
	}, []);

	// Measure the anchor, then clamp the popover within the viewport.
	const reposition = useCallback(() => {
		const host = hostRef.current;
		const el = host?.firstElementChild as HTMLElement | null;
		const anchor = anchorRef?.current;
		if (!anchor || !el) return;
		const r = anchor.getBoundingClientRect();
		const margin = 8;
		const w = el.offsetWidth || 200;
		const h = el.offsetHeight || 0;
		let left = align === "end" ? r.right - w : r.left;
		let top = r.bottom + offsetY;
		left = Math.max(margin, Math.min(left, window.innerWidth - w - margin));
		top = Math.max(margin, Math.min(top, window.innerHeight - h - margin));
		setPos((prev) =>
			prev && Math.abs(prev.left - left) < 1 && Math.abs(prev.top - top) < 1 ? prev : { left, top }
		);
	}, [anchorRef, align, offsetY]);

	// Render children into the host. `pos` participates so the popover moves
	// to the measured coordinates right after the first render.
	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		if (!open) {
			render(null, host);
			setPos(null);
			return;
		}
		render(
			<div
				class={className}
				style={{
					position: "fixed",
					left: `${pos?.left ?? 0}px`,
					top: `${pos?.top ?? 0}px`,
					right: "auto",
					bottom: "auto",
					marginTop: 0, // offsetY handles the gap; cancel CSS margin-top
					zIndex: 1000,
					maxHeight: "calc(100vh - 16px)",
					overflowY: "auto",
					overflowX: "hidden",
				}}
			>
				{children}
			</div>,
			host
		);
		reposition();
	}, [open, children, pos, reposition]);

	// Reposition on scroll (capture phase catches scroll events from inner
	// scroll containers, e.g. Obsidian's preview scroller) and window resize.
	useEffect(() => {
		if (!open) return;
		window.addEventListener("scroll", reposition, true);
		window.addEventListener("resize", reposition);
		return () => {
			window.removeEventListener("scroll", reposition, true);
			window.removeEventListener("resize", reposition);
		};
	}, [open, reposition]);

	// Close on mousedown outside both the anchor and the portalled popover.
	useEffect(() => {
		if (!open || !onOutsideClick) return;
		function onDown(e: MouseEvent) {
			const host = hostRef.current;
			const anchor = anchorRef?.current;
			const t = e.target as Node;
			if (anchor && anchor.contains(t)) return;
			if (host && host.contains(t)) return;
			onOutsideClick?.();
		}
		document.addEventListener("mousedown", onDown, true);
		return () => document.removeEventListener("mousedown", onDown, true);
	}, [open, onOutsideClick, anchorRef]);

	return null;
}
