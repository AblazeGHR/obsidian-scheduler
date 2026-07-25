import { h } from "preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { PageEntry, FieldMapping } from "../../types";
import { formatCellValue, writeFieldFor } from "./table-utils";

interface EntryFieldsModalProps {
	entry: PageEntry;
	mapping: FieldMapping;
	/** All field keys to display. */
	fields: string[];
	onEdit?: (path: string, field: string, value: string) => void;
	onClose: () => void;
	/** Optional lookup for resolving parent:: path to a readable title. */
	parentTitles?: Map<string, string>;
}

/**
 * Modal showing all of an entry's fields in a compact 2-row × n-column grid.
 * Each cell is click-to-edit (contentEditable).  Commits on Enter / blur;
 * Escape cancels.
 */
export function EntryFieldsModal({ entry, mapping, fields, onEdit, onClose, parentTitles }: EntryFieldsModalProps) {
	const cols = Math.ceil(fields.length / 2);

	// Track per-field pending edit values
	const [editingKey, setEditingKey] = useState<string | null>(null);
	const [edits, setEdits] = useState<Record<string, string>>({});
	const cellRef = useRef<HTMLDivElement | null>(null);

	// Focus the cell when entering edit mode
	useEffect(() => {
		if (editingKey && cellRef.current) {
			cellRef.current.focus();
			const range = document.createRange();
			range.selectNodeContents(cellRef.current);
			range.collapse(false);
			const sel = window.getSelection();
			sel?.removeAllRanges();
			sel?.addRange(range);
		}
	}, [editingKey]);

	function commitEdit() {
		if (!editingKey || !onEdit) {
			setEditingKey(null);
			return;
		}
		const raw = cellRef.current ? (cellRef.current.textContent ?? "") : "";
		const original = formatCellValue(entry, editingKey, parentTitles) as string;
		if (raw !== original) {
			const targetField = writeFieldFor(editingKey, mapping);
			onEdit(entry.path, targetField, raw);
			setEdits((prev) => ({ ...prev, [editingKey]: raw }));
		}
		if (cellRef.current) cellRef.current.textContent = "";
		setEditingKey(null);
	}

	function handleKey(e: KeyboardEvent) {
		if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
		if (e.key === "Escape") { e.preventDefault(); setEditingKey(null); }
	}

	// Close on Escape when not editing
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (!editingKey && e.key === "Escape") onClose();
		}
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [editingKey, onClose]);

	function displayValue(key: string): string {
		if (key in edits) return edits[key];
		return (formatCellValue(entry, key, parentTitles) as string) || "(empty)";
	}

	return (
		<div class="scheduler-fields-modal-overlay" onClick={onClose}>
			<div class="scheduler-fields-modal-content" onClick={(e: any) => e.stopPropagation()}>
				<div class="scheduler-fields-modal-header">
					<span class="scheduler-fields-modal-title">{entry.title}</span>
					<button class="scheduler-fields-modal-close" onClick={onClose}>&times;</button>
				</div>
				<div
					class="scheduler-fields-modal-grid"
					style={`grid-template-columns: repeat(${cols}, 1fr);`}
				>
					{fields.map((key) => {
						const isEditing = editingKey === key;
						return (
							<div
								class={`scheduler-fields-modal-cell${isEditing ? " editing" : ""}`}
								onClick={(e: any) => {
									e.stopPropagation();
									if (!isEditing) {
										setEditingKey(key);
										setEdits((prev) => {
											if (key in prev) return prev;
											return { ...prev, [key]: formatCellValue(entry, key, parentTitles) as string };
										});
									}
								}}
							>
								<div class="scheduler-fields-modal-key">{key}</div>
								{isEditing ? (
									<div
										ref={cellRef as any}
										class="scheduler-fields-modal-value editing"
										contentEditable
										onBlur={commitEdit}
										onKeyDown={(e: any) => handleKey(e)}
									>
										{displayValue(key)}
									</div>
								) : (
									<div class="scheduler-fields-modal-value">{displayValue(key)}</div>
								)}
							</div>
						);
					})}
				</div>
				<div class="scheduler-fields-modal-hint">Click any field value to edit — Enter to save, Esc to cancel</div>
			</div>
		</div>
	);
}
