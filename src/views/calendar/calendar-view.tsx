import { h } from "preact";
import { useState } from "preact/hooks";
import { PageEntry, FieldMapping } from "../../types";
import { expandRecurring } from "../../utils/recurrence";

interface CalendarViewProps {
	entries: PageEntry[];
	mapping: FieldMapping;
	onDateChange?: (path: string, newDate: string, sourceDate?: string) => void;
	onOpenEntry?: (path: string) => void;
	onCreateEntry?: (dateStr?: string) => void;
}

/** Weekday header labels */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTH_NAMES = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
];

/** A single entry occurrence on a given day, with span flags for multi-day events */
interface CalEntry {
	entry: PageEntry;
	isStart: boolean;
	isEnd: boolean;
}

function isoDate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function atMidnight(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
	const x = new Date(d);
	x.setDate(x.getDate() + n);
	return x;
}

function startOfWeek(d: Date): Date {
	const x = atMidnight(d);
	x.setDate(x.getDate() - x.getDay()); // Sunday-based week
	return x;
}

function monthInputValue(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Expand entries across their [date, dateEnd] range into per-day occurrences.
 * Each day key maps to the list of occurrences visible on that day.
 */
function buildOccurrences(entries: PageEntry[]): Map<string, CalEntry[]> {
	const map = new Map<string, CalEntry[]>();
	for (const entry of entries) {
		if (!entry.date) continue;
		const start = atMidnight(entry.date);
		const end = atMidnight(entry.dateEnd ?? entry.date);
		for (let t = new Date(start); t.getTime() <= end.getTime(); t = addDays(t, 1)) {
			const key = isoDate(t);
			const occ: CalEntry = {
				entry,
				isStart: t.getTime() === start.getTime(),
				isEnd: t.getTime() === end.getTime(),
			};
			const group = map.get(key);
			if (group) group.push(occ);
			else map.set(key, [occ]);
		}
	}
	return map;
}

export function CalendarView({ entries, mapping, onDateChange, onOpenEntry, onCreateEntry }: CalendarViewProps) {
	const [cursor, setCursor] = useState(() => atMidnight(new Date()));
	const [mode, setMode] = useState<"month" | "week">("month");

	// Expand recurring entries within the visible window (so occurrences render on the right days)
	let winStart: Date;
	let winEnd: Date;
	if (mode === "month") {
		const year = cursor.getFullYear();
		const month = cursor.getMonth();
		const startDay = new Date(year, month, 1).getDay();
		const firstCell = new Date(year, month, 1 - startDay);
		const cells = Math.ceil((startDay + daysInMonth(year, month)) / 7) * 7;
		winStart = firstCell;
		winEnd = addDays(firstCell, cells - 1);
	} else {
		const ws = startOfWeek(cursor);
		winStart = ws;
		winEnd = addDays(ws, 6);
	}
	const expanded = expandRecurring(entries, winStart, winEnd, mapping);
	const occurrences = buildOccurrences(expanded);

	function step(dir: number) {
		if (mode === "month") {
			setCursor((c) => new Date(c.getFullYear(), c.getMonth() + dir, 1));
		} else {
			setCursor((c) => addDays(c, 7 * dir));
		}
	}

	function goToday() {
		setCursor(atMidnight(new Date()));
	}

	function jumpMonth(value: string) {
		const [y, m] = value.split("-").map(Number);
		if (!isNaN(y) && !isNaN(m)) {
			setCursor((c) => new Date(y, m - 1, Math.min(c.getDate(), daysInMonth(y, m - 1))));
		}
	}

	function isToday(d: Date): boolean {
		const now = atMidnight(new Date());
		return now.getTime() === atMidnight(d).getTime();
	}

	// --- Build the list of day cells to display ---
	type DayCell = { date: Date; dateStr: string; inMonth: boolean };
	let dayCells: DayCell[] = [];

	if (mode === "month") {
		const year = cursor.getFullYear();
		const month = cursor.getMonth();
		const totalDays = daysInMonth(year, month);
		const startDay = new Date(year, month, 1).getDay();
		for (let i = 0; i < startDay; i++) dayCells.push({ date: new Date(0), dateStr: "", inMonth: false });
		for (let d = 1; d <= totalDays; d++) {
			const date = new Date(year, month, d);
			dayCells.push({ date, dateStr: isoDate(date), inMonth: true });
		}
	} else {
		const ws = startOfWeek(cursor);
		for (let i = 0; i < 7; i++) {
			const date = addDays(ws, i);
			dayCells.push({ date, dateStr: isoDate(date), inMonth: date.getMonth() === cursor.getMonth() });
		}
	}

	// Title
	let title: string;
	if (mode === "month") {
		title = `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`;
	} else {
		const ws = startOfWeek(cursor);
		const we = addDays(ws, 6);
		const sameYear = ws.getFullYear() === we.getFullYear();
		const left = `${MONTH_NAMES[ws.getMonth()].slice(0, 3)} ${ws.getDate()}`;
		const right = `${MONTH_NAMES[we.getMonth()].slice(0, 3)} ${we.getDate()}${sameYear ? "" : ` ${we.getFullYear()}`}`;
		title = `${left} – ${right}, ${we.getFullYear()}`;
	}

	return (
		<div class="scheduler-calendar">
			{/* Header */}
			<div class="scheduler-calendar-header">
				<button class="scheduler-calendar-nav" onClick={() => step(-1)} title="Previous">
					&lsaquo;
				</button>
				<div class="scheduler-calendar-title">
					<span class="scheduler-calendar-month">{title}</span>
				</div>
				<button class="scheduler-calendar-nav" onClick={() => step(1)} title="Next">
					&rsaquo;
				</button>
				<button class="scheduler-calendar-today" onClick={goToday}>Today</button>
				<div class="scheduler-calendar-modes">
					<button
						class={`scheduler-calendar-mode${mode === "month" ? " active" : ""}`}
						onClick={() => setMode("month")}
					>
						Month
					</button>
					<button
						class={`scheduler-calendar-mode${mode === "week" ? " active" : ""}`}
						onClick={() => setMode("week")}
					>
						Week
					</button>
				</div>
				<input
					class="scheduler-calendar-jump"
					type="month"
					value={monthInputValue(cursor)}
					onChange={(e: any) => jumpMonth(e.target.value)}
					title="Jump to month"
				/>
				{onCreateEntry && (
					<button class="scheduler-calendar-new" onClick={() => onCreateEntry()} title="New entry with current filters">
						+ New
					</button>
				)}
			</div>

			{/* Weekday headers */}
			<div class="scheduler-calendar-weekdays">
				{WEEKDAYS.map((w) => (
					<div class="scheduler-calendar-weekday">{w}</div>
				))}
			</div>

			{/* Day grid */}
			<div class={`scheduler-calendar-grid${mode === "week" ? " week" : ""}`}>
				<div class="scheduler-calendar-row">
					{dayCells.map((cell, i) => {
						if (!cell.inMonth) {
							return <div class="scheduler-calendar-cell empty" key={`empty-${i}`} />;
						}
						const dayEntries = occurrences.get(cell.dateStr) ?? [];
						return (
							<CalendarCell
								key={cell.dateStr}
								date={cell.date}
								dateStr={cell.dateStr}
								calEntries={dayEntries}
								today={isToday(cell.date)}
								onDateChange={onDateChange}
								onOpenEntry={onOpenEntry}
								onCreateEntry={onCreateEntry}
							/>
						);
					})}
				</div>
			</div>
		</div>
	);
}

function daysInMonth(year: number, month: number): number {
	return new Date(year, month + 1, 0).getDate();
}

// ============================================================
// Calendar Cell
// ============================================================

const MAX_VISIBLE_EVENTS = 3;

interface CalendarCellProps {
	date: Date;
	dateStr: string;
	calEntries: CalEntry[];
	today: boolean;
	onDateChange?: (path: string, newDate: string, sourceDate?: string) => void;
	onOpenEntry?: (path: string) => void;
	onCreateEntry?: (dateStr?: string) => void;
}

function CalendarCell({ date, dateStr, calEntries, today, onDateChange, onOpenEntry, onCreateEntry }: CalendarCellProps) {
	const visible = calEntries.slice(0, MAX_VISIBLE_EVENTS);
	const overflow = calEntries.length - MAX_VISIBLE_EVENTS;
	const [dragOver, setDragOver] = useState(false);

	function handleDragStart(e: DragEvent, entry: PageEntry) {
		if (!e.dataTransfer) return;
		e.dataTransfer.setData("text/plain", JSON.stringify({ path: entry.path, sourceDate: dateStr }));
		e.dataTransfer.effectAllowed = "move";
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		const raw = e.dataTransfer?.getData("text/plain");
		if (!raw || !onDateChange) return;
		try {
			const parsed = JSON.parse(raw);
			if (parsed.path) {
				onDateChange(parsed.path, dateStr, parsed.sourceDate);
			}
		} catch {
			// Plain text fallback for simple entries (single line `path`)
			onDateChange(raw, dateStr);
		}
	}

	return (
		<div
			class={`scheduler-calendar-cell${today ? " today" : ""}${calEntries.length > 0 ? " has-events" : ""}${dragOver ? " dragover" : ""}`}
			onDragOver={handleDragOver}
			onDragEnter={() => setDragOver(true)}
			onDragLeave={() => setDragOver(false)}
			onDrop={handleDrop}
		>
			<div class="scheduler-calendar-day-num">{date.getDate()}</div>
			<div class="scheduler-calendar-events">
				{visible.map((occ, idx) => (
					<div
						key={occ.entry.occurrenceId ?? occ.entry.path}
						class={`scheduler-calendar-event${occ.isStart ? " span-start" : " span-mid"}${occ.isEnd ? " span-end" : ""}${occ.entry.recurrenceRule ? " recurring" : ""}`}
						draggable={true}
						onDragStart={(e) => handleDragStart(e, occ.entry)}
						onClick={() => {
							if (onOpenEntry) onOpenEntry(occ.entry.path);
						}}
						title={occ.entry.title}
					>
						{occ.isStart && occ.entry.title}
						{!occ.isStart && "⋯"}
						{occ.entry.recurrenceRule && <span class="scheduler-event-recurring" title={`Repeats: ${occ.entry.recurrenceRule}`}>↻</span>}
					</div>
				))}
				{overflow > 0 && (
					<div class="scheduler-calendar-overflow" title={`${overflow} more events`}>
						+{overflow} more
					</div>
				)}
			</div>
			{onCreateEntry && (
				<button
					class="scheduler-calendar-cell-add"
					onClick={(e) => {
						e.stopPropagation();
						onCreateEntry(dateStr);
					}}
					title={`New entry on ${dateStr}`}
				>
					+
				</button>
			)}
		</div>
	);
}
