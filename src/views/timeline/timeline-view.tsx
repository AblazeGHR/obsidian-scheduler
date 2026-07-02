import { h } from "preact";
import { useState } from "preact/hooks";
import { PageEntry, FieldMapping } from "../../types";

const HOUR_HEIGHT = 60; // px per hour
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface TimelineViewProps {
	entries: PageEntry[];
	mapping: FieldMapping;
	onTimeChange?: (path: string, newStart: string, newEnd: string) => void;
}

/** Format a Date to HH:MM */
function formatTime(d: Date): string {
	const h = String(d.getHours()).padStart(2, "0");
	const m = String(d.getMinutes()).padStart(2, "0");
	return `${h}:${m}`;
}

/** Calculate top offset in px for a date's time within the timeline */
function timeToTop(d: Date): number {
	return (d.getHours() * 60 + d.getMinutes()) / 60 * HOUR_HEIGHT;
}

/** Calculate height in px for a duration (start to end dates) */
function durationToHeight(start: Date, end: Date): number {
	const diffMinutes = (end.getTime() - start.getTime()) / 60000;
	return Math.max(diffMinutes / 60 * HOUR_HEIGHT, 20); // min 20px height
}

/** Split entries into all-day and timed */
function splitEntries(entries: PageEntry[]): { allDay: PageEntry[]; timed: PageEntry[] } {
	const allDay: PageEntry[] = [];
	const timed: PageEntry[] = [];
	for (const e of entries) {
		if (e.start && e.end) {
			timed.push(e);
		} else {
			allDay.push(e);
		}
	}
	return { allDay, timed };
}

/** Detect overlapping groups and assign column indices */
function layoutOverlaps(blocks: Array<{ id: string; top: number; height: number; end: Date }>): Array<{ id: string; top: number; height: number; col: number; totalCols: number }> {
	// Simple greedy overlap resolution
	// Sort by top
	const sorted = [...blocks].sort((a, b) => a.top - b.top);
	const groups: number[][] = []; // group of indices that overlap
	let currentGroup: number[] = [];
	let groupEnd = 0;

	for (let i = 0; i < sorted.length; i++) {
		if (currentGroup.length === 0 || sorted[i].top >= groupEnd) {
			// Start new group if needed
			if (currentGroup.length > 0) groups.push(currentGroup);
			currentGroup = [i];
			groupEnd = sorted[i].top + sorted[i].height;
		} else {
			currentGroup.push(i);
			groupEnd = Math.max(groupEnd, sorted[i].top + sorted[i].height);
		}
	}
	if (currentGroup.length > 0) groups.push(currentGroup);

	const result = sorted.map((b) => ({ ...b, col: 0, totalCols: 1 }));

	for (const group of groups) {
		if (group.length === 1) {
			result[group[0]].totalCols = 1;
			continue;
		}
		// Assign columns to each block in the group
		const total = group.length;
		group.forEach((idx, ci) => {
			result[idx].col = ci;
			result[idx].totalCols = total;
		});
	}

	return result;
}

export function TimelineView({ entries, mapping, onTimeChange }: TimelineViewProps) {
	const [selectedDate, setSelectedDate] = useState(() => new Date());
	const [dragging, setDragging] = useState<{ path: string; type: "move" | "resize"; startY: number; originalStart: Date; originalEnd: Date } | null>(null);

	const { allDay, timed } = splitEntries(entries);

	// Build time blocks for today's date
	const dateStr = selectedDate.toISOString().slice(0, 10);
	const dayTimed = timed.filter((e) => {
		return e.date && e.date.toISOString().slice(0, 10) === dateStr;
	});

	const blocks = dayTimed.map((e) => {
		const top = timeToTop(e.start!);
		const height = durationToHeight(e.start!, e.end!);
		return { id: e.path, top, height, end: e.end!, start: e.start! };
	});

	const layout = layoutOverlaps(blocks);

	// Current time indicator
	const now = new Date();
	const nowMinutes = now.getHours() * 60 + now.getMinutes();
	const nowTop = (nowMinutes / 60) * HOUR_HEIGHT;
	const isToday = dateStr === now.toISOString().slice(0, 10);

	function prevDay() {
		const d = new Date(selectedDate);
		d.setDate(d.getDate() - 1);
		setSelectedDate(d);
	}

	function nextDay() {
		const d = new Date(selectedDate);
		d.setDate(d.getDate() + 1);
		setSelectedDate(d);
	}

	function goToToday() {
		setSelectedDate(new Date());
	}

	function handleMouseDown(e: MouseEvent, path: string, type: "move" | "resize", start: Date, end: Date) {
		e.preventDefault();
		e.stopPropagation();
		setDragging({ path, type, startY: e.clientY, originalStart: new Date(start), originalEnd: new Date(end) });
	}

	function handleMouseMove(e: MouseEvent) {
		if (!dragging || !onTimeChange) return;
		const deltaY = e.clientY - dragging.startY;
		const deltaMinutes = Math.round((deltaY / HOUR_HEIGHT) * 60 / 15) * 15; // snap to 15min

		if (dragging.type === "move") {
			const newStart = new Date(dragging.originalStart.getTime() + deltaMinutes * 60000);
			const duration = dragging.originalEnd.getTime() - dragging.originalStart.getTime();
			const newEnd = new Date(newStart.getTime() + duration);
			onTimeChange(dragging.path, newStart.toISOString(), newEnd.toISOString());
		} else {
			const newEnd = new Date(dragging.originalEnd.getTime() + deltaMinutes * 60000);
			if (newEnd.getTime() > dragging.originalStart.getTime() + 60000) {
				onTimeChange(dragging.path, dragging.originalStart.toISOString(), newEnd.toISOString());
			}
		}
	}

	function handleMouseUp() {
		setDragging(null);
	}

	// Track dragging state
	if (dragging) {
		// We use document-level handlers for smooth drag
		document.addEventListener("mouseup", handleMouseUp, { once: true });
		document.addEventListener("mousemove", handleMouseMove as any);
	}

	const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

	return (
		<div class="scheduler-timeline">
			{/* Header */}
			<div class="scheduler-timeline-header">
				<button class="scheduler-timeline-nav" onClick={prevDay}>&lsaquo;</button>
				<div class="scheduler-timeline-date">
					{dayNames[selectedDate.getDay()]}, {selectedDate.toLocaleDateString()}
				</div>
				<button class="scheduler-timeline-nav" onClick={nextDay}>&rsaquo;</button>
				<button class="scheduler-timeline-today" onClick={goToToday}>Today</button>
			</div>

			{/* All-day entries section */}
			{allDay.length > 0 && (
				<div class="scheduler-timeline-allday">
					<div class="scheduler-timeline-allday-label">All day</div>
					<div class="scheduler-timeline-allday-events">
						{allDay.map((e) => (
							<div
								class="scheduler-timeline-allday-event"
								onClick={() => {
									const app = (globalThis as any).app;
									if (app) app.workspace.openLinkText(e.path, "", false);
								}}
							>
								{e.title}
							</div>
						))}
					</div>
				</div>
			)}

			{/* Timeline grid */}
			<div class="scheduler-timeline-scroll">
				<div class="scheduler-timeline-grid">
					{/* Hour labels */}
					<div class="scheduler-timeline-labels">
						{HOURS.map((h) => (
							<div class="scheduler-timeline-hour-label" style={{ height: `${HOUR_HEIGHT}px` }}>
								{`${String(h).padStart(2, "0")}:00`}
							</div>
						))}
					</div>

					{/* Time slots */}
					<div class="scheduler-timeline-slots">
						{HOURS.map((h) => (
							<div class="scheduler-timeline-slot" style={{ height: `${HOUR_HEIGHT}px` }} />
						))}

						{/* Current time indicator */}
						{isToday && (
							<div class="scheduler-timeline-now" style={{ top: `${nowTop}px` }}>
								<div class="scheduler-timeline-now-dot" />
								<div class="scheduler-timeline-now-line" />
							</div>
						)}

						{/* Time blocks */}
						{layout.map((block) => {
							const entry = dayTimed.find((e) => e.path === block.id)!;
							const width = 100 / block.totalCols;
							return (
								<div
									class="scheduler-timeline-block"
									style={{
										top: `${block.top}px`,
										height: `${block.height}px`,
										left: `${block.col * width}%`,
										width: `${width - 2}%`,
									}}
									onClick={() => {
										const app = (globalThis as any).app;
										if (app) app.workspace.openLinkText(entry.path, "", false);
									}}
								>
									<div
										class="scheduler-timeline-block-grip scheduler-timeline-block-grip-top"
										onMouseDown={(e) => handleMouseDown(e, entry.path, "move", entry.start!, entry.end!)}
									/>
									<div class="scheduler-timeline-block-content">
										<div class="scheduler-timeline-block-time">
											{formatTime(entry.start!)} — {formatTime(entry.end!)}
										</div>
										<div class="scheduler-timeline-block-title">{entry.title}</div>
									</div>
									<div
										class="scheduler-timeline-block-grip scheduler-timeline-block-grip-bottom"
										onMouseDown={(e) => handleMouseDown(e, entry.path, "resize", entry.start!, entry.end!)}
									/>
								</div>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
}
