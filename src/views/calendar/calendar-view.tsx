import { h } from "preact";
import { useState } from "preact/hooks";
import { PageEntry, FieldMapping } from "../../types";

interface CalendarViewProps {
	entries: PageEntry[];
	mapping: FieldMapping;
	onDateChange?: (path: string, newDate: string) => void;
}

/** Weekday header labels */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Group entries by ISO date string (YYYY-MM-DD). Returns a Map<string, PageEntry[]>. */
function groupByDate(entries: PageEntry[]): Map<string, PageEntry[]> {
	const map = new Map<string, PageEntry[]>();
	for (const entry of entries) {
		if (!entry.date) continue;
		const key = isoDate(entry.date);
		const group = map.get(key);
		if (group) group.push(entry);
		else map.set(key, [entry]);
	}
	return map;
}

function isoDate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

/** Get the number of days in a month */
function daysInMonth(year: number, month: number): number {
	return new Date(year, month + 1, 0).getDate();
}

/** Get the weekday index (0=Sun) for the 1st of a month */
function firstWeekday(year: number, month: number): number {
	return new Date(year, month, 1).getDay();
}

export function CalendarView({ entries, mapping, onDateChange }: CalendarViewProps) {
	const [viewDate, setViewDate] = useState(() => {
		const now = new Date();
		return { year: now.getFullYear(), month: now.getMonth() };
	});

	const dateGroups = groupByDate(entries);

	const { year, month } = viewDate;
	const totalDays = daysInMonth(year, month);
	const startDay = firstWeekday(year, month);

	const monthNames = [
		"January", "February", "March", "April", "May", "June",
		"July", "August", "September", "October", "November", "December",
	];

	function prevMonth() {
		setViewDate((d) => (d.month === 0 ? { year: d.year - 1, month: 11 } : { year: d.year, month: d.month - 1 }));
	}

	function nextMonth() {
		setViewDate((d) => (d.month === 11 ? { year: d.year + 1, month: 0 } : { year: d.year, month: d.month + 1 }));
	}

	function today() {
		const now = new Date();
		setViewDate({ year: now.getFullYear(), month: now.getMonth() });
	}

	function isToday(day: number): boolean {
		const now = new Date();
		return (
			now.getFullYear() === year &&
			now.getMonth() === month &&
			now.getDate() === day
		);
	}

	// Build calendar grid: rows of 7 cells
	const cells: (number | null)[] = [];
	// Leading empty cells
	for (let i = 0; i < startDay; i++) {
		cells.push(null);
	}
	// Day cells
	for (let d = 1; d <= totalDays; d++) {
		cells.push(d);
	}

	// Group into rows of 7
	const rows: (number | null)[][] = [];
	for (let i = 0; i < cells.length; i += 7) {
		rows.push(cells.slice(i, i + 7));
	}

	return (
		<div class="scheduler-calendar">
			{/* Header */}
			<div class="scheduler-calendar-header">
				<button class="scheduler-calendar-nav" onClick={prevMonth} title="Previous month">&lsaquo;</button>
				<div class="scheduler-calendar-title">
					<span class="scheduler-calendar-month">{monthNames[month]}</span>
					<span class="scheduler-calendar-year">{year}</span>
				</div>
				<button class="scheduler-calendar-nav" onClick={nextMonth} title="Next month">&rsaquo;</button>
				<button class="scheduler-calendar-today" onClick={today}>Today</button>
			</div>

			{/* Weekday headers */}
			<div class="scheduler-calendar-weekdays">
				{WEEKDAYS.map((w) => (
					<div class="scheduler-calendar-weekday">{w}</div>
				))}
			</div>

			{/* Day grid */}
			<div class="scheduler-calendar-grid">
				{rows.map((row, ri) => (
					<div class="scheduler-calendar-row" key={ri}>
						{row.map((day, di) => {
							if (day === null) {
								return <div class="scheduler-calendar-cell empty" key={`empty-${ri}-${di}`} />;
							}
							const dateStr = isoDate(new Date(year, month, day));
							const dayEntries = dateGroups.get(dateStr) ?? [];
							const todayClass = isToday(day) ? " today" : "";

							return (
								<CalendarCell
									key={dateStr}
									day={day}
									dateStr={dateStr}
									entries={dayEntries}
									todayClass={todayClass}
									onDateChange={onDateChange}
								/>
							);
						})}
					</div>
				))}
			</div>
		</div>
	);
}

// ============================================================
// Calendar Cell
// ============================================================

const MAX_VISIBLE_EVENTS = 3;

interface CalendarCellProps {
	day: number;
	dateStr: string;
	entries: PageEntry[];
	todayClass: string;
	onDateChange?: (path: string, newDate: string) => void;
}

function CalendarCell({ day, dateStr, entries, todayClass, onDateChange }: CalendarCellProps) {
	const visible = entries.slice(0, MAX_VISIBLE_EVENTS);
	const overflow = entries.length - MAX_VISIBLE_EVENTS;

	function handleDragStart(e: DragEvent, entry: PageEntry) {
		if (!e.dataTransfer) return;
		e.dataTransfer.setData("text/plain", entry.path);
		e.dataTransfer.effectAllowed = "move";
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		e.dataTransfer!.dropEffect = "move";
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		const path = e.dataTransfer!.getData("text/plain");
		if (path && onDateChange) {
			onDateChange(path, dateStr);
		}
	}

	return (
		<div
			class={`scheduler-calendar-cell${todayClass}${entries.length > 0 ? " has-events" : ""}`}
			onDragOver={handleDragOver}
			onDrop={handleDrop}
		>
			<div class="scheduler-calendar-day-num">{day}</div>
			<div class="scheduler-calendar-events">
				{visible.map((entry) => (
					<div
						class="scheduler-calendar-event"
						draggable={true}
						onDragStart={(e) => handleDragStart(e, entry)}
						onClick={() => {
							// Open the file in Obsidian
							const app = (globalThis as any).app;
							if (app) {
								app.workspace.openLinkText(entry.path, "", false);
							}
						}}
						title={entry.title}
					>
						{entry.title}
					</div>
				))}
				{overflow > 0 && (
					<div class="scheduler-calendar-overflow" title={`${overflow} more events`}>
						+{overflow} more
					</div>
				)}
			</div>
		</div>
	);
}
