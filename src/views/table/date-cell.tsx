import { h } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { PageEntry, FieldMapping } from "../../types";
import { formatCellValue, writeFieldFor, toInputDate } from "./table-utils";

// ============================================================
// DateCell — plain-text date that opens the OS-native date picker
// (<input type="date">) on click. No custom popover and no Obsidian-internal
// component: the browser renders the calendar at the OS level, so it is never
// clipped by the table and behaves consistently on every platform.
// ============================================================

interface DateCellProps {
	entry: PageEntry;
	column: string;
	mapping: FieldMapping;
	onEdit?: (path: string, field: string, value: string) => void;
}

export function DateCell({ entry, column, mapping, onEdit }: DateCellProps) {
	const field = writeFieldFor(column, mapping);
	const display = formatCellValue(entry, column);
	const initialISO = toInputDate(entry.date ?? (entry.fields ? entry.fields[column] : undefined)) || "";

	const [editing, setEditing] = useState(false);
	const inputRef = useRef<HTMLInputElement | null>(null);

	// On entering edit mode, focus the input and try to open the native picker
	// right away. showPicker() is supported in Chromium/Electron; on mobile the
	// OS picker opens on focus automatically. If the browser blocks it (no user
	// gesture), the input is still focused and its built-in calendar icon works.
	useEffect(() => {
		if (!editing) return;
		const el = inputRef.current;
		if (!el) return;
		el.focus();
		try {
			(el as any).showPicker?.();
		} catch {
			/* not a user-gesture context — focus is enough as a fallback */
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [editing]);

	function commit(e: any) {
		const val = e.target.value as string;
		setEditing(false);
		if (val && onEdit) onEdit(entry.path, field, val);
	}

	function cancel() {
		setEditing(false);
	}

	if (editing) {
		return (
			<td class="scheduler-cell">
				<input
					ref={inputRef}
					type="date"
					class="scheduler-date-input"
					value={initialISO}
					onChange={commit}
					onBlur={cancel}
					onKeyDown={(e: any) => {
						if (e.key === "Escape") cancel();
					}}
				/>
			</td>
		);
	}

	return (
		<td
			class="scheduler-cell scheduler-cell-display"
			onClick={() => setEditing(true)}
			title="Click to pick a date"
		>
			{display || "—"}
		</td>
	);
}
