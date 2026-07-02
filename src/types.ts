/** Shared type definitions for obsidian-scheduler */

/** Field mapping configuration that maps frontmatter keys to logical meaning */
export interface FieldMapping {
    /** Which frontmatter field represents the primary date (e.g. "due", "date", "scheduled") */
    dateField: string;
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
    /** Folders to include (empty = entire vault) */
    folders: string[];
    /** Default view mode */
    defaultView: "table" | "calendar" | "timeline";
}

/** Supported view types */
export type ViewType = "table" | "calendar" | "timeline";

/** Sort configuration */
export interface SortConfig {
    field: string;
    direction: "asc" | "desc";
}

/** Filter condition */
export interface FilterCondition {
    field: string;
    operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than" | "before" | "after";
    value: string;
}

/** View state passed to rendering components */
export interface ViewState {
    viewType: ViewType;
    sort: SortConfig[];
    filters: FilterCondition[];
    page: number;
    pageSize: number;
}
