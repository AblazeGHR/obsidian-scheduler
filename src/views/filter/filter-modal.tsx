import { h } from "preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { FilterClause, VisualClause, RawClause, AtomicCondition } from "../../types";

/* ------------------------------------------------------------------ */
/*  local helpers                                                      */
/* ------------------------------------------------------------------ */

function serializeClauses(clauses: FilterClause[]): string {
	return clauses
		.map((c) => {
			const pfx = c.not ? "!" : "";
			if (c.type === "raw") {
				return `${pfx}{${c.expression}}`;
			}
			const inner = c.conditions
				.map((cond) => `${cond.field}:${cond.operator}:${cond.value}`)
				.join("::");
			return `${pfx}${inner}`;
		})
		.join("\n");
}

function parseClauses(text: string): FilterClause[] {
	const lines = text.split("\n");
	const clauses: FilterClause[] = [];

	for (let line of lines) {
		line = line.trim();
		if (!line) continue;

		let not = false;
		let body = line;
		if (body.startsWith("!")) {
			not = true;
			body = body.slice(1);
		}

		// Raw clause — wrapped in { and }
		if (body.startsWith("{") && body.endsWith("}")) {
			clauses.push({
				type: "raw",
				not,
				expression: body.slice(1, -1),
			});
			continue;
		}

		// Visual clause — split sub-conditions by ::
		const subCondStrs = body
			.split("::")
			.map((p) => p.trim())
			.filter(Boolean);

		const conditions: AtomicCondition[] = [];
		for (const part of subCondStrs) {
			const firstColon = part.indexOf(":");
			const secondColon = firstColon >= 0 ? part.indexOf(":", firstColon + 1) : -1;
			const field = firstColon >= 0 ? part.slice(0, firstColon).trim() : "";
			const operator = secondColon >= 0 ? part.slice(firstColon + 1, secondColon).trim() : "";
			const value = secondColon >= 0 ? part.slice(secondColon + 1) : "";
			if (field && operator) {
				conditions.push({ field, operator: operator as any, value });
			}
		}

		if (conditions.length > 0) {
			clauses.push({ type: "visual", not, conditions });
		}
	}

	return clauses;
}

/* ------------------------------------------------------------------ */
/*  component                                                          */
/* ------------------------------------------------------------------ */

export interface FilterModalProps {
	clauses: FilterClause[];
	onClose: () => void;
	onSave: (clauses: FilterClause[]) => void;
}

export function FilterModal({ clauses, onClose, onSave }: FilterModalProps) {
	const initial = serializeClauses(clauses);
	const [text, setText] = useState(initial);
	const [error, setError] = useState("");
	const textRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (textRef.current) {
			textRef.current.focus();
			textRef.current.setSelectionRange(initial.length, initial.length);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	function handleSave() {
		try {
			const parsed = parseClauses(text);
			onSave(parsed);
			onClose();
		} catch (e: any) {
			setError(e.message ?? "Failed to parse filter expression.");
		}
	}

	return (
		<div
			class="scheduler-filter-modal-overlay"
			onClick={(e: any) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div class="scheduler-filter-modal-content">
				<div class="scheduler-filter-modal-title">Edit Filters (.*)</div>
				<textarea
					ref={textRef}
					class="scheduler-filter-modal-textarea"
					value={text}
					onInput={(e: any) => {
						setText(e.target.value);
						setError("");
					}}
					onKeyDown={(e: any) => {
						if (e.key === "Escape") {
							e.preventDefault();
							onClose();
						} else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
							e.preventDefault();
							handleSave();
						}
					}}
					rows={Math.max(8, text.split("\n").length + 1)}
					spellcheck={false}
				/>
				{error && <div class="scheduler-filter-modal-error">{error}</div>}
				<div class="scheduler-filter-modal-actions">
					<button class="scheduler-filter-modal-btn scheduler-filter-modal-cancel" onClick={onClose}>
						Cancel
					</button>
					<button class="scheduler-filter-modal-btn scheduler-filter-modal-save" onClick={handleSave}>
						Save
					</button>
				</div>
			</div>
		</div>
	);
}
