import { h } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { PageEntry, FieldMapping } from "../../types";
import { expandRecurring } from "../../utils/recurrence";

const HOUR_HEIGHT = 60; // px per hour
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const SNAP_MINUTES = 15;

const DAY_COUNTS = [1, 3, 5, 7];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Compare two dates by year-month-day (local time, avoids timezone offset) */
function sameDay(a: Date, b: Date): boolean {
	return a.getFullYear() === b.getFullYear()
		&& a.getMonth() === b.getMonth()
		&& a.getDate() === b.getDate();
}

function atMidnight(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
	const x = new Date(d);
	x.setDate(x.getDate() + n);
	return x;
}

/** Local datetime string (YYYY-MM-DDTHH:MM), no timezone suffix — avoids UTC offset on write-back */
function toLocalDateTime(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	const hh = String(d.getHours()).padStart(2, "0");
	const mm = String(d.getMinutes()).padStart(2, "0");
	return `${y}-${m}-${day}T${hh}:${mm}`;
}

function toDateStr(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function formatTime(d: Date): string {
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function timeToTop(d: Date): number {
	return (d.getHours() * 60 + d.getMinutes()) / 60 * HOUR_HEIGHT;
}

function minutesToTop(min: number): number {
	return (min / 60) * HOUR_HEIGHT;
}

function durationToHeight(start: Date, end: Date): number {
	const diff = (end.getTime() - start.getTime()) / 60000;
	return Math.max((diff / 60) * HOUR_HEIGHT, 20);
}

function durationMinutesToHeight(min: number): number {
	return Math.max((min / 60) * HOUR_HEIGHT, 20);
}

function snap(min: number): number {
	return Math.round(min / SNAP_MINUTES) * SNAP_MINUTES;
}

interface TimelineViewProps {
	entries: PageEntry[];
	mapping: FieldMapping;
	onTimeChange?: (path: string, newStart: string, newEnd: string) => void;
	onOpenEntry?: (path: string) => void;
	onCreateEntry?: (dateStr?: string, startTime?: string, endTime?: string) => void;
}

/** Split entries into all-day and timed for a given day */
function splitEntriesForDay(entries: PageEntry[], day: Date): { allDay: PageEntry[]; timed: PageEntry[] } {
	const allDay: PageEntry[] = [];
	const timed: PageEntry[] = [];
	for (const e of entries) {
		if (!e.date || !sameDay(e.date, day)) continue;
		if (e.start && e.end) timed.push(e);
		else allDay.push(e);
	}
	return { allDay, timed };
}

/** Detect overlapping groups and assign column indices */
function layoutOverlaps(blocks: Array<{ id: string; top: number; height: number; end: Date }>): Array<{ id: string; top: number; height: number; col: number; totalCols: number }> {
	const sorted = [...blocks].sort((a, b) => a.top - b.top);
	const groups: number[][] = [];
	let currentGroup: number[] = [];
	let groupEnd = 0;

	for (let i = 0; i < sorted.length; i++) {
		if (currentGroup.length === 0 || sorted[i].top >= groupEnd) {
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
		const total = group.length;
		group.forEach((idx, ci) => {
			result[idx].col = ci;
			result[idx].totalCols = total;
		});
	}

	return result;
}

interface DragState {
	path: string;
	dayIndex: number;
	type: "move" | "resize-end" | "resize-start";
	startY: number;
	origStart: Date;
	origEnd: Date;
	top: number;
	height: number;
	previewStart: Date;
	previewEnd: Date;
}

interface CreateState {
	dayIndex: number;
	date: Date;
	startMin: number;
	endMin: number;
	rectTop: number;
}

export function TimelineView({ entries, mapping, onTimeChange, onOpenEntry, onCreateEntry }: TimelineViewProps) {
	const [anchor, setAnchor] = useState(() => atMidnight(new Date()));
	const [visibleDays, setVisibleDays] = useState(1);
	const [drag, setDrag] = useState<DragState | null>(null);
	const [create, setCreate] = useState<CreateState | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);

	const dayColumns = Array.from({ length: visibleDays }, (_, i) => addDays(anchor, i));

	// Expand recurring entries within the visible day range
	const expanded = expandRecurring(entries, dayColumns[0], dayColumns[dayColumns.length - 1], mapping);
	const now = new Date();
	const isTodayCol = (i: number) => sameDay(dayColumns[i], now);
	const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_HEIGHT;

	function step(dir: number) {
		setAnchor((d) => addDays(d, dir * visibleDays));
	}

	function goToToday() {
		setAnchor(atMidnight(new Date()));
	}

	// --- block drag (move / resize) ---
	function startBlockDrag(e: MouseEvent, dayIndex: number, path: string, type: "move" | "resize-end" | "resize-start", start: Date, end: Date) {
		e.preventDefault();
		e.stopPropagation();
		setDrag({
			path,
			dayIndex,
			type,
			startY: e.clientY,
			origStart: new Date(start),
			origEnd: new Date(end),
			top: timeToTop(start),
			height: durationToHeight(start, end),
			previewStart: new Date(start),
			previewEnd: new Date(end),
		});
	}

	// --- create selection (drag on empty area) ---
	function startCreate(e: MouseEvent, dayIndex: number) {
		const target = e.target as HTMLElement;
		// only start when clicking empty slot background
	// Allow mousedown on the slots element or any of its children (existing
	// entries, labels, etc.) so clicking empty space anywhere in the column
	// creates a new entry.
	const slotsTarget = target.closest(".scheduler-timeline-slots");
	if (!slotsTarget) return;
	e.preventDefault();
	const rect = slotsTarget.getBoundingClientRect();
	const rectTop = rect.top;
		const min = snap(((e.clientY - rectTop) / HOUR_HEIGHT) * 60);
		setCreate({ dayIndex, date: dayColumns[dayIndex], startMin: min, endMin: min + SNAP_MINUTES, rectTop });
	}

	useEffect(() => {
		if (!drag && !create) return;

		function onMouseUp() {
			if (drag) {
				onTimeChange?.(
					drag.path,
					toLocalDateTime(drag.previewStart),
					toLocalDateTime(drag.previewEnd)
				);
			}
			if (create) {
				if (create.endMin - create.startMin >= SNAP_MINUTES) {
					const start = new Date(create.date);
					start.setMinutes(create.startMin);
					const end = new Date(create.date);
					end.setMinutes(create.endMin);
					onCreateEntry?.(toDateStr(create.date), toLocalDateTime(start), toLocalDateTime(end));
				}
			}
			setDrag(null);
			setCreate(null);
		}

		function onMouseMove(e: MouseEvent) {
			if (drag) {
				const deltaY = e.clientY - drag.startY;
				const deltaMin = snap((deltaY / HOUR_HEIGHT) * 60);
				if (drag.type === "move") {
					const ns = new Date(drag.origStart.getTime() + deltaMin * 60000);
					const dur = drag.origEnd.getTime() - drag.origStart.getTime();
					const ne = new Date(ns.getTime() + dur);
					setDrag((d) => (d ? { ...d, previewStart: ns, previewEnd: ne, top: timeToTop(ns) } : d));
				} else if (drag.type === "resize-end") {
					let ne = new Date(drag.origEnd.getTime() + deltaMin * 60000);
					if (ne.getTime() <= drag.origStart.getTime() + SNAP_MINUTES * 60000) {
						ne = new Date(drag.origStart.getTime() + SNAP_MINUTES * 60000);
					}
					setDrag((d) => (d ? { ...d, previewEnd: ne, height: durationToHeight(d.origStart, ne) } : d));
				} else {
					// resize-start: adjust start time, keep end fixed
					let ns = new Date(drag.origStart.getTime() + deltaMin * 60000);
					if (ns.getTime() >= drag.origEnd.getTime() - SNAP_MINUTES * 60000) {
						ns = new Date(drag.origEnd.getTime() - SNAP_MINUTES * 60000);
					}
					setDrag((d) => (d ? { ...d, previewStart: ns, top: timeToTop(ns), height: durationToHeight(ns, drag.origEnd) } : d));
				}
			} else if (create) {
				const min = snap(((e.clientY - create.rectTop) / HOUR_HEIGHT) * 60);
				const startMin = Math.min(create.startMin, min);
				const endMin = Math.max(create.startMin, min);
				setCreate((c) => (c ? { ...c, startMin, endMin } : c));
			}
		}

		document.addEventListener("mouseup", onMouseUp);
		document.addEventListener("mousemove", onMouseMove);
		return () => {
			document.removeEventListener("mouseup", onMouseUp);
			document.removeEventListener("mousemove", onMouseMove);
		};
	}, [drag, create, onTimeChange, onCreateEntry]);

	const titleRange =
		visibleDays === 1
			? `${DAY_NAMES[anchor.getDay()]} ${MONTH_NAMES[anchor.getMonth()]} ${anchor.getDate()}`
			: `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getDate()} – ${MONTH_NAMES[dayColumns[visibleDays - 1].getMonth()]} ${dayColumns[visibleDays - 1].getDate()}`;

	return (
		<div class="scheduler-timeline">
			{/* Header */}
			<div class="scheduler-timeline-header">
				<button class="scheduler-timeline-nav" onClick={() => step(-1)}>&lsaquo;</button>
				<div class="scheduler-timeline-date">{titleRange}</div>
				<button class="scheduler-timeline-nav" onClick={() => step(1)}>&rsaquo;</button>
				<button class="scheduler-timeline-today" onClick={goToToday}>Today</button>
				<div class="scheduler-timeline-daycount">
					{DAY_COUNTS.map((n) => (
						<button
							class={`scheduler-timeline-daycount-btn${visibleDays === n ? " active" : ""}`}
							onClick={() => setVisibleDays(n)}
						>
							{n}d
						</button>
					))}
				</div>
				{onCreateEntry && (
					<button
						class="scheduler-timeline-new"
						onClick={() => onCreateEntry(toDateStr(anchor))}
						title="New entry on this day"
					>
						+ New
					</button>
				)}
			</div>

			{/* Scrollable body: labels + day columns */}
			<div class="scheduler-timeline-scroll" ref={scrollRef}>
				<div class="scheduler-timeline-body">
					{/* Hour labels column */}
					<div class="scheduler-timeline-labels-col">
						<div class="scheduler-timeline-col-head-spacer" />
						<div class="scheduler-timeline-labels">
							{HOURS.map((hh) => (
								<div class="scheduler-timeline-hour-label" style={{ height: `${HOUR_HEIGHT}px` }}>
									{`${String(hh).padStart(2, "0")}:00`}
								</div>
							))}
						</div>
					</div>

					{/* Day columns */}
					{dayColumns.map((day, di) => {
						const { allDay, timed } = splitEntriesForDay(expanded, day);
						const blocks = timed.map((e) => {
							const top = timeToTop(e.start!);
							const height = durationToHeight(e.start!, e.end!);
							return { id: e.path, top, height, end: e.end!, start: e.start! };
						});
						const layout = layoutOverlaps(blocks);
						const today = isTodayCol(di);

						return (
							<div class="scheduler-timeline-daycol" key={di}>
								<div class={`scheduler-timeline-col-head${today ? " today" : ""}`}>
									<div class="scheduler-timeline-col-weekday">{DAY_NAMES[day.getDay()]}</div>
									<div class="scheduler-timeline-col-date">{day.getDate()}</div>
								</div>

								{/* All-day strip */}
								<div
									class="scheduler-timeline-allday"
									onDragOver={(e: any) => e.preventDefault()}
									onDrop={(e: any) => {
										e.preventDefault();
										const raw = e.dataTransfer?.getData("text/plain");
										if (!raw || !onTimeChange) return;
										// Timed entry dropped on all-day → strip times
										onTimeChange(raw, "", "");
									}}
								>
									{allDay.map((e) => (
									<div
										class="scheduler-timeline-allday-event"
										draggable={true}
										onDragStart={(ev: any) => {
											ev.dataTransfer.setData("text/plain", e.path);
											ev.dataTransfer.effectAllowed = "move";
										}}
										onClick={() => {
											if (onOpenEntry) onOpenEntry(e.path);
										}}
										title={e.title}
									>
											{e.title}
											{e.recurrenceRule && <span class="scheduler-event-recurring" title={`Repeats: ${e.recurrenceRule}`}>↻</span>}
										</div>
									))}
								</div>

								{/* Time slots — 1/16 margin on each side via CSS */}
								<div class="scheduler-timeline-slots" onMouseDown={(e: any) => startCreate(e, di)} onDragOver={(e: any) => e.preventDefault()}
									onDrop={(e: any) => {
										e.preventDefault();
										const raw = e.dataTransfer?.getData("text/plain");
										if (!raw || !onTimeChange) return;
										// All-day entry dropped on slots → convert to timed
										const rect = (e.target as HTMLElement).closest(".scheduler-timeline-slots")?.getBoundingClientRect();
										if (!rect) return;
										const min = snap(((e.clientY - rect.top) / HOUR_HEIGHT) * 60);
										const start = new Date(dayColumns[di]);
										start.setHours(0, min, 0, 0);
										const end = new Date(start.getTime() + 30 * 60000);
										onTimeChange(raw, toLocalDateTime(start), toLocalDateTime(end));
									}}
								>
									{HOURS.map((hh) => (
										<div class="scheduler-timeline-slot" style={{ height: `${HOUR_HEIGHT}px` }} />
									))}

									{today && (
										<div class="scheduler-timeline-now" style={{ top: `${nowTop}px` }}>
											<div class="scheduler-timeline-now-dot" />
											<div class="scheduler-timeline-now-line" />
										</div>
									)}

									{/* Existing blocks (dimmed while dragging this one) */}
									{layout.map((block) => {
										const entry = timed.find((e) => e.path === block.id)!;
										const width = 100 / block.totalCols;
										const isDragging = drag?.path === block.id;
										return (
											<div
												class={`scheduler-timeline-block${isDragging ? " dragging" : ""}`}
												style={{
													top: `${block.top}px`,
													height: `${block.height}px`,
													left: `${block.col * width}%`,
													width: `${width - 2}%`,
												}}
											>
												<div
													class="scheduler-timeline-block-grip scheduler-timeline-block-grip-top"
													onMouseDown={(e) => startBlockDrag(e, di, entry.path, "resize-start", entry.start!, entry.end!)}
												/>
												<div class="scheduler-timeline-block-content"
													onMouseDown={(e) => startBlockDrag(e, di, entry.path, "move", entry.start!, entry.end!)}
												>
													<div class="scheduler-timeline-block-time">
														{formatTime(entry.start!)} — {formatTime(entry.end!)}
													</div>
													<div
														class="scheduler-timeline-block-title"
														onClick={(ev) => {
															ev.stopPropagation();
															if (onOpenEntry) onOpenEntry(entry.path);
														}}
													>{entry.title}</div>
												</div>
												<div
													class="scheduler-timeline-block-grip scheduler-timeline-block-grip-bottom"
													onMouseDown={(e) => startBlockDrag(e, di, entry.path, "resize-end", entry.start!, entry.end!)}
												/>
											</div>
										);
									})}

									{/* Drag ghost preview */}
									{drag && drag.dayIndex === di && (
										<div
											class="scheduler-timeline-block-ghost"
											style={{
												top: `${drag.top}px`,
												height: `${drag.height}px`,
												left: "2%",
												right: "2%",
											}}
										>
											<div class="scheduler-timeline-block-time">
												{formatTime(drag.previewStart)} — {formatTime(drag.previewEnd)}
											</div>
										</div>
									)}

									{/* Create selection */}
									{create && create.dayIndex === di && (
										<div
											class="scheduler-timeline-create-selection"
											style={{
												top: `${minutesToTop(create.startMin)}px`,
												height: `${durationMinutesToHeight(create.endMin - create.startMin)}px`,
												left: "2%",
												right: "2%",
											}}
										>
											<div class="scheduler-timeline-block-time">
												{formatTime(addMinutes(create.date, create.startMin))} — {formatTime(addMinutes(create.date, create.endMin))}
											</div>
										</div>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}

function addMinutes(day: Date, min: number): Date {
	const d = new Date(day);
	d.setMinutes(min);
	return d;
}
