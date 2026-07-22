import { h } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { App } from "obsidian";
import * as Obsidian from "obsidian";
import { PageEntry, FieldMapping } from "../../types";
import { formatCellValue, writeFieldFor, toISODate } from "./table-utils";

// ============================================================
// DateCell — mimics Obsidian's native date property:
// shows the date text with a small calendar icon; clicking opens a date
// picker in place. We prefer Obsidian's internal `DateTimeInput` (the exact
// same widget used by the Properties view) when it is available at runtime,
// and fall back to our own month-grid popover on versions/builds where the
// internal component isn't reachable.
//
// The popover is rendered to `document.body` (position: fixed, top layer) so
// it is never clipped by the table cell's `overflow: hidden` or the table's
// scroll container, and always sits above other content.
// ============================================================

/** Lazily grab Obsidian's internal DateTimeInput. It is NOT in the public
 * typings, but the host `obsidian` module exports it at runtime. */
function getDateTimeInputCtor(): any | null {
	try {
		const Ctor = (Obsidian as any).DateTimeInput;
		return typeof Ctor === "function" ? Ctor : null;
	} catch {
		return null;
	}
}

interface DateCellProps {
	entry: PageEntry;
	column: string;
	mapping: FieldMapping;
	app?: App;
	onEdit?: (path: string, field: string, value: string) => void;
}

function atMidnight(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function daysInMonth(y: number, m: number): number {
	return new Date(y, m + 1, 0).getDate();
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function DateCell({ entry, column, mapping, app, onEdit }: DateCellProps) {
	const field = writeFieldFor(column, mapping);
	const selected = entry.date ? atMidnight(entry.date) : null;
	const display = formatCellValue(entry, column);

	const [open, setOpen] = useState(false);
	// Whether the currently-open popover uses the internal widget.
	const [useNative, setUseNative] = useState(false);
	const [cursor, setCursor] = useState<Date>(() => selected ?? atMidnight(new Date()));
	const wrapRef = useRef<HTMLSpanElement | null>(null);
	// The element the internal DateTimeInput is mounted into.
	const nativeMountRef = useRef<HTMLDivElement | null>(null);
	// The currently visible popover element (native or fallback) — portaled to body.
	const popoverRef = useRef<HTMLDivElement | null>(null);

	// Close on outside click / Escape.
	useEffect(() => {
		if (!open) return;
		function onDown(e: MouseEvent) {
			const t = e.target as Node;
			// Ignore clicks inside the trigger or inside the portaled popover.
			if (wrapRef.current && wrapRef.current.contains(t)) return;
			if (popoverRef.current && popoverRef.current.contains(t)) return;
			setOpen(false);
		}
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") setOpen(false);
		}
		document.addEventListener("mousedown", onDown);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	// Mount the internal DateTimeInput into our popover when using native mode.
	useEffect(() => {
		if (!open || !useNative) return;
		const mountEl = nativeMountRef.current;
		const Ctor = getDateTimeInputCtor();
		if (!mountEl || !Ctor || !app) return;

		let inst: any = null;
		try {
			inst = new Ctor(
				app,
				(value: Date | null) => {
					const out = value instanceof Date ? toISODate(value) : "";
					if (onEdit) onEdit(entry.path, field, out);
					setOpen(false);
				},
				false, // timeOnly — show the full calendar (date + optional time)
				true // allowBlank — provide a clear affordance
			);
			inst.setValue(selected ?? new Date());
			// The component exposes its root element under different property
			// names across Obsidian versions; try the known ones defensively.
			const el: any = inst.containerEl ?? inst.contentEl ?? inst;
			if (el instanceof HTMLElement) {
				mountEl.appendChild(el);
			} else if (typeof el === "string") {
				mountEl.innerHTML = el;
			}
			// load() registers the component (its day-pick listeners attach in
			// onload) and is required for the widget to be interactive.
			inst.load();
		} catch (err) {
			console.error("[scheduler] DateTimeInput unavailable, using fallback popover:", err);
			// Tear down any half-initialized instance and show our own popover.
			try {
				if (inst && inst.unload) inst.unload();
			} catch { /* noop */ }
			setUseNative(false);
			setCursor(selected ?? atMidnight(new Date()));
			return;
		}

		return () => {
			try {
				if (inst && inst.unload) inst.unload();
			} catch { /* noop */ }
			mountEl.empty?.();
			if (mountEl) mountEl.innerHTML = "";
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, useNative]);

	// Portal the visible popover to document.body and position it from the
	// trigger's rect, clamped to the viewport. This keeps it on the top layer,
	// immune to the table cell's overflow and the scroll container.
	useEffect(() => {
		if (!open) return;
		const trigger = wrapRef.current;
		const pop = popoverRef.current;
		if (!trigger || !pop) return;

		document.body.appendChild(pop);
		const rect = trigger.getBoundingClientRect();
		const pw = pop.offsetWidth;
		const ph = pop.offsetHeight;
		let top = rect.bottom + 4;
		let left = rect.left;
		// Flip above the trigger if it would overflow the bottom of the viewport.
		if (top + ph > window.innerHeight - 8) {
			top = Math.max(8, rect.top - ph - 4);
		}
		// Shift left if it would overflow the right edge.
		if (left + pw > window.innerWidth - 8) {
			left = Math.max(8, window.innerWidth - pw - 8);
		}
		pop.style.position = "fixed";
		pop.style.top = `${top}px`;
		pop.style.left = `${left}px`;
		pop.style.marginTop = "0";
		pop.style.zIndex = "9999";
		pop.style.visibility = "visible";

		// Close on scroll so the fixed popover doesn't detach from the trigger.
		function onScroll() {
			setOpen(false);
		}
		window.addEventListener("scroll", onScroll, true);
		return () => {
			window.removeEventListener("scroll", onScroll, true);
		};
	}, [open, useNative, cursor]);

	function toggle(e: any) {
		e.stopPropagation();
		if (open) {
			setOpen(false);
			return;
		}
		const ctor = getDateTimeInputCtor();
		setUseNative(!!(ctor && app));
		setCursor(selected ?? atMidnight(new Date()));
		setOpen(true);
	}

	function pick(d: Date) {
		if (onEdit) onEdit(entry.path, field, toISODate(d));
		setOpen(false);
	}

	// Build the visible month grid (used by the fallback popover).
	const year = cursor.getFullYear();
	const month = cursor.getMonth();
	const startDay = new Date(year, month, 1).getDay();
	const total = daysInMonth(year, month);
	const cells: (Date | null)[] = [];
	for (let i = 0; i < startDay; i++) cells.push(null);
	for (let d = 1; d <= total; d++) cells.push(new Date(year, month, d));
	while (cells.length % 7 !== 0) cells.push(null);

	const today = atMidnight(new Date());
	const selectedTime = selected ? selected.getTime() : -1;

	return (
		<span class="scheduler-date-wrap" ref={wrapRef}>
			<span
				class="scheduler-date-text"
				onClick={toggle}
				title="Click to open date picker"
			>
				{display || "—"}
			</span>
			<button
				class="scheduler-date-icon"
				type="button"
				title="Pick a date"
				onClick={toggle}
			>
				<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<rect x="3" y="4" width="18" height="18" rx="2" />
					<line x1="3" y1="9" x2="21" y2="9" />
					<line x1="8" y1="2" x2="8" y2="6" />
					<line x1="16" y1="2" x2="16" y2="6" />
				</svg>
			</button>

			{open && useNative && (
				<div
					class="scheduler-date-native"
					style={{ visibility: "hidden" }}
					ref={(el: HTMLDivElement | null) => {
						nativeMountRef.current = el;
						popoverRef.current = el;
					}}
					onClick={(e: any) => e.stopPropagation()}
				/>
			)}

			{open && !useNative && (
				<div
					class="scheduler-date-popover"
					style={{ visibility: "hidden" }}
					ref={(el: HTMLDivElement | null) => {
						popoverRef.current = el;
					}}
					onClick={(e: any) => e.stopPropagation()}
				>
					<div class="scheduler-date-pop-header">
						<button type="button" class="scheduler-date-nav" onClick={() => setCursor(new Date(year, month - 1, 1))}>‹</button>
						<span class="scheduler-date-title">
							{`${year}-${String(month + 1).padStart(2, "0")}`}
						</span>
						<button type="button" class="scheduler-date-nav" onClick={() => setCursor(new Date(year, month + 1, 1))}>›</button>
					</div>
					<div class="scheduler-date-weekdays">
						{WEEKDAYS.map((w, i) => (
							<span class="scheduler-date-wd" key={i}>{w}</span>
						))}
					</div>
					<div class="scheduler-date-grid">
						{cells.map((d, i) => {
							if (!d) return <span class="scheduler-date-cell empty" key={`e${i}`} />;
							const t = atMidnight(d).getTime();
							const cls =
								"scheduler-date-cell" +
								(t === selectedTime ? " selected" : "") +
								(t === today.getTime() ? " today" : "");
							return (
								<button type="button" class={cls} key={i} onClick={() => pick(d)}>
									{d.getDate()}
								</button>
							);
						})}
					</div>
					<div class="scheduler-date-pop-footer">
						<button type="button" class="scheduler-date-today" onClick={() => pick(today)}>
							Today
						</button>
					</div>
				</div>
			)}
		</span>
	);
}
