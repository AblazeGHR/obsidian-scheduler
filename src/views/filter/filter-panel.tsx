import { h } from "preact";
import { FilterClause, VisualClause, RawClause, AtomicCondition, FilterOperator } from "../../types";
import { SearchableSelect } from "../shared/searchable-select";

// ============================================================
// FilterPanel — popover content with AND/OR/NOT clause builder
// ============================================================

interface FilterPanelProps {
	columns: string[];
	clauses: FilterClause[];
	onClausesChange: (clauses: FilterClause[]) => void;
	/** Callback for the global `.*` button (opens code-edit modal). */
	onCodeEdit?: () => void;
}

/** All filter operators available in the dropdown. */
const OPERATORS: FilterOperator[] = [
	"equals",
	"not_equals",
	"contains",
	"starts_with",
	"ends_with",
	"regex",
	"greater_than",
	"less_than",
	"before",
	"after",
];

/** Default field to use for a brand-new condition (first column, or "title"). */
function defaultField(columns: string[]): string {
	return columns.length > 0 ? columns[0] : "title";
}

/** Serialize a VisualClause into the compact `[!]field:op:val[::field:op:val]` string
 *  used as the raw-expression preview and for round-tripping. */
function visualToExpression(clause: VisualClause): string {
	const pfx = clause.not ? "!" : "";
	const inner = clause.conditions
		.map((c) => `${c.field}:${c.operator}:${c.value}`)
		.join("::");
	return pfx + inner;
}

/** Try to parse a compact filter string back into FilterClause[].
 *  Delegates to the same parser used by codeblock-state (split by |, handle ! / :: / {…}).
 */
function expressionToClause(expr: string): FilterClause {
	// Detect raw (wrapped in braces)
	if (expr.startsWith("{") && expr.endsWith("}")) {
		return { type: "raw", not: false, expression: expr.slice(1, -1) };
	}

	let not = false;
	let rest = expr;
	if (rest.startsWith("!")) {
		not = true;
		rest = rest.slice(1);
	}

	// Split by :: for OR conditions within the clause
	const parts = rest.split("::");
	const conditions: AtomicCondition[] = [];

	for (const part of parts) {
		const firstColon = part.indexOf(":");
		const secondColon = firstColon >= 0 ? part.indexOf(":", firstColon + 1) : -1;
		if (firstColon >= 0 && secondColon > firstColon) {
			const field = part.slice(0, firstColon).trim();
			const operator = part.slice(firstColon + 1, secondColon).trim() as FilterOperator;
			const value = part.slice(secondColon + 1);
			if (field) {
				conditions.push({ field, operator, value });
			}
		}
	}

	if (conditions.length === 0) {
		// Parse failed — return an empty visual clause
		return { type: "visual", not, conditions: [{ field: "title", operator: "contains", value: expr }] };
	}

	return { type: "visual", not, conditions };
}

export function FilterPanel({ columns, clauses, onClausesChange, onCodeEdit }: FilterPanelProps) {
	function addClause() {
		const cond: AtomicCondition = {
			field: defaultField(columns),
			operator: "contains",
			value: "",
		};
		const clause: VisualClause = { type: "visual", not: false, conditions: [cond] };
		onClausesChange([...clauses, clause]);
	}

	function removeClause(i: number) {
		onClausesChange(clauses.filter((_, idx) => idx !== i));
	}

	function clearAll() {
		onClausesChange([]);
	}

	function addCondition(clauseIndex: number) {
		const next = [...clauses];
		const clause = next[clauseIndex];
		if (clause && clause.type === "visual") {
			const newCond: AtomicCondition = {
				field: defaultField(columns),
				operator: "contains",
				value: "",
			};
			next[clauseIndex] = {
				...clause,
				conditions: [...clause.conditions, newCond],
			};
			onClausesChange(next);
		}
	}

	function removeCondition(clauseIndex: number, condIndex: number) {
		const next = [...clauses];
		const clause = next[clauseIndex];
		if (!clause || clause.type !== "visual") return;

		const newConditions = clause.conditions.filter((_, idx) => idx !== condIndex);
		if (newConditions.length === 0) {
			// No conditions left → remove the entire clause
			onClausesChange(next.filter((_, idx) => idx !== clauseIndex));
		} else {
			next[clauseIndex] = { ...clause, conditions: newConditions };
			onClausesChange(next);
		}
	}

	function updateCondition(clauseIndex: number, condIndex: number, patch: Partial<AtomicCondition>) {
		const next = [...clauses];
		const clause = next[clauseIndex];
		if (!clause || clause.type !== "visual") return;

		const newConditions = clause.conditions.map((c, idx) =>
			idx === condIndex ? { ...c, ...patch } : c,
		);
		next[clauseIndex] = { ...clause, conditions: newConditions };
		onClausesChange(next);
	}

	function toggleNot(clauseIndex: number) {
		const next = [...clauses];
		const clause = next[clauseIndex];
		if (!clause) return;
		next[clauseIndex] = { ...clause, not: !clause.not };
		onClausesChange(next);
	}

	function toggleType(clauseIndex: number) {
		const next = [...clauses];
		const clause = next[clauseIndex];
		if (!clause) return;

		if (clause.type === "visual") {
			// Convert visual → raw, preserving logic as compact expression
			const expr = visualToExpression(clause);
			next[clauseIndex] = { type: "raw", not: clause.not, expression: expr };
		} else {
			// Convert raw → visual. Try parsing the expression back.
			const parsed = expressionToClause(clause.expression);
			parsed.not = clause.not;
			next[clauseIndex] = parsed;
		}
		onClausesChange(next);
	}

	return (
		<div class="scheduler-filter-panel">
			<div class="scheduler-filter-panel-header">
				<span class="scheduler-filter-panel-title">Filters</span>
				{onCodeEdit && (
					<button
						class="scheduler-filter-code-btn"
						onClick={onCodeEdit}
						title="Edit filters as code"
					>
						.*
					</button>
				)}
			</div>

			{clauses.length === 0 && (
				<div class="scheduler-filter-empty">
					No filters yet. Click + Filter to add a clause (AND), then use the dimmed
					<span class="scheduler-filter-keyword">or</span> button to add sub-conditions (OR).
				</div>
			)}

			{clauses.map((clause, i) => (
				<div class="scheduler-filter-clause" key={i}>
					{/* ---- NOT toggle ---- */}
					<button
						class={`scheduler-filter-not-btn${clause.not ? " active" : ""}`}
						onClick={() => toggleNot(i)}
						title={clause.not ? "Negated (click to remove NOT)" : "Negate this clause"}
					>
						not
					</button>

					{/* ---- Clause body ---- */}
					<div class="scheduler-filter-clause-body">
						{clause.type === "visual" ? (
							<div class="scheduler-filter-subconditions">
								{clause.conditions.map((cond, j) => (
									<div class="scheduler-filter-subcond" key={j}>
										{j > 0 && (
											<span class="scheduler-filter-or-label">or</span>
										)}
										<SearchableSelect
											options={columns}
											value={cond.field}
											placeholder="field…"
											onChange={(val: string) => updateCondition(i, j, { field: val })}
										/>
										<select
											class="scheduler-filter-operator"
											value={cond.operator}
											onChange={(e: any) =>
												updateCondition(i, j, {
													operator: e.target.value as FilterOperator,
												})
											}
										>
											{OPERATORS.map((op) => (
												<option value={op}>{op}</option>
											))}
										</select>
										<input
											class="scheduler-filter-value"
											type="text"
											value={cond.value}
											placeholder="value…"
											onInput={(e: any) =>
												updateCondition(i, j, { value: e.target.value })
											}
										/>
										<button
											class="scheduler-filter-remove"
											onClick={() => removeCondition(i, j)}
											title="Remove this condition"
										>
											&times;
										</button>
									</div>
								))}
								<button
									class="scheduler-filter-or-btn"
									onClick={() => addCondition(i)}
									title="Add an OR sub-condition"
								>
									or
								</button>
							</div>
						) : (
							<div class="scheduler-filter-raw">
								<code>{clause.expression}</code>
							</div>
						)}
					</div>

					{/* ---- Clause action buttons ---- */}
					<div class="scheduler-filter-clause-actions">
						<button
							class="scheduler-filter-toggle-btn"
							onClick={() => toggleType(i)}
							title={clause.type === "visual" ? "Switch to raw expression" : "Switch to visual"}
						>
							.*
						</button>
						<button
							class="scheduler-filter-remove"
							onClick={() => removeClause(i)}
							title="Remove this filter clause"
						>
							&times;
						</button>
					</div>
				</div>
			))}

			<div class="scheduler-filter-panel-actions">
				<button class="scheduler-filter-add" onClick={addClause} title="Add a new AND clause">
					+ Filter
				</button>
				{clauses.length > 0 && (
					<button class="scheduler-filter-clear" onClick={clearAll}>
						Clear
					</button>
				)}
			</div>
		</div>
	);
}
