import { h } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { PageEntry, FieldMapping } from "../../types";
import { formatCellValue, writeFieldFor, toISODate } from "./table-utils";

// ============================================================
// DateCell — mimics Obsidian's native date property:
// shows the date text with a small calendar icon; clicking the icon (or the
// date) opens a month-grid popover to pick a date in place.
// ============================================================

interface DateCellProps {
	entry: PageEntry;
	column: string;
	mapping: FieldMapping;
	onEdit?: (path: string, field: string, value: string) => void;
}

function atMidnight(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number): Date {
	const x = new Date(d);
	x.setDate(x.getDate() + n);
	return x;
}
function daysInMonth(y: number, m: number): number {
	return new Date(y, m + 1, 0).getDate();
}
function isoOf(d: Date): string {
	return toISODate(d);
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function DateCell({ entry, column, mapping, onEdit }: DateCellProps) {
	const field = writeFieldFor(column, mapping);
	const selected = entry.date ? atMidnight(entry.date) : null;
	const display = formatCellValue(entry, column);

	const [open, setOpen] = useState(false);
	const [cursor, setCursor] = useState<Date>(() => selected ?? atMidnight(new Date()));
	const wrapRef = useRef<HTMLSpanElement | null>(null);

	// Close on outside click / Escape.
	useEffect(() => {
		if (!open) return;
		function onDown(e: MouseEvent) {
			if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
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

	function pick(d: Date) {
		if (onEdit) onEdit(entry.path, field, isoOf(d));
		setOpen(false);
	}

	// Build the visible month grid.
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
				onClick={() => setOpen((o) => !o)}
				title="Click to open date picker"
			>
				{display || "—"}
			</span>
			<button
				class="scheduler-date-icon"
				type="button"
				title="Pick a date"
				onClick={(e: any) => {
					e.stopPropagation();
					setCursor(selected ?? atMidnight(new Date()));
					setOpen((o) => !o);
				}}
			>
				<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<rect x="3" y="4" width="18" height="18" rx="2" />
					<line x1="3" y1="9" x2="21" y2="9" />
					<line x1="8" y1="2" x2="8" y2="6" />
					<line x1="16" y1="2" x2="16" y2="6" />
				</svg>
			</button>

			{open && (
				<div class="scheduler-date-popover" onClick={(e: any) => e.stopPropagation()}>
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
