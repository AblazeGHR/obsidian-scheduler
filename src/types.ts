/** Shared type definitions for obsidian-scheduler */

/** Field mapping configuration that maps frontmatter keys to logical meaning */
export interface FieldMapping {
    /** Which frontmatter field represents the primary date (e.g. "due", "date", "scheduled") */
    dateField: string;
    /** Optional end-date field for multi-day calendar events (e.g. "endDate"). Empty = single day. */
    endDateField: string;
    /** Optional recurrence field holding an RRULE string (e.g. "recurrence"). Empty = no recurrence. */
    recurrenceField: string;
    /** Start time field for time-range events (e.g. "start", "begin") */
    startField: string;
    /** End time field for time-range events (e.g. "end", "finish") */
    endField: string;
    /** Which frontmatter field is the display title (e.g. "title", "name") */
    titleField: string;
    /** Fields that represent tags/categories (e.g. ["tags", "category"]) */
    tagFields: string[];
    /** All fields available for filtering in the UI */
    filterableFields: string[];
}

/** A page entry extracted from Dataview, with fields mapped */
export interface PageEntry {
    /** File path relative to vault root */
    path: string;
    /** Display title (from field mapping or filename fallback) */
    title: string;
    /** Primary date value (parsed DateTime or null) */
    date: Date | null;
    /** End date for multi-day events (parsed DateTime or null) */
    dateEnd: Date | null;
    /** Raw recurrence rule string if this entry repeats (RRULE syntax) */
    recurrenceRule?: string;
    /** True for synthesized occurrences of a recurring entry (not the anchor) */
    isRecurrence?: boolean;
    /** Stable unique id per row/occurrence (path-based for singles, path@date for recurrences) */
    occurrenceId?: string;
    /** Start time (parsed DateTime or null) */
    start: Date | null;
    /** End time (parsed DateTime or null) */
    end: Date | null;
    /** All tags extracted from configured tag fields */
    tags: string[];
    /** Raw frontmatter fields (for display and filtering) */
    fields: Record<string, unknown>;
    /** File creation time */
    ctime: Date;
    /** File modification time */
    mtime: Date;
    /** Parent folder path */
    folder: string;
}

/** Plugin settings */
export interface SchedulerSettings {
    fieldMapping: FieldMapping;
	/** Extract [key:: value] inline fields from task items as separate entries */
	enableInlineTasks: boolean;
	/** Show Obsidian notifications when entries become due */
	enableReminders: boolean;
	/** How many minutes before a timed event's start to notify (0 = at start time) */
	reminderLeadMinutes: number;
	/** Saved view configuration presets */
	templates: ViewTemplate[];
    /** Folders to include (empty = entire vault) */
    folders: string[];
    /** Default view mode */
    defaultView: "table" | "calendar" | "timeline" | "kanban";
}

/** Supported view types */
export type ViewType = "table" | "calendar" | "timeline" | "kanban";

/** Sort configuration */
export interface SortConfig {
    field: string;
    direction: "asc" | "desc";
}

/** Operators available for filter conditions */
export type FilterOperator =
	| "equals"
	| "not_equals"
	| "contains"
	| "greater_than"
	| "less_than"
	| "before"
	| "after"
	| "starts_with"
	| "ends_with"
	| "regex";

/** A single simple field-operator-value condition */
export interface AtomicCondition {
	field: string;
	operator: FilterOperator;
	value: string;
}

/** A visual filter clause with one or more conditions ORed together */
export interface VisualClause {
	type: "visual";
	not: boolean;
	conditions: AtomicCondition[];
}

/** A raw expression clause (future escape hatch, not produced by GUI initially) */
export interface RawClause {
	type: "raw";
	not: boolean;
	expression: string;
}

/** Top-level filter clause (ANDed across clauses) */
export type FilterClause = VisualClause | RawClause;

/** A saved view configuration preset */
export interface ViewTemplate {
	/** Unique preset name */
	name: string;
	/** Which view to show */
	viewType: ViewType;
	/** Sort configuration */
	sort: SortConfig[];
	/** Active filters */
	filters: FilterClause[];
}

/** View state passed to rendering components */
export interface ViewState {
    viewType: ViewType;
    sort: SortConfig[];
    filters: FilterClause[];
    page: number;
    pageSize: number;
}
