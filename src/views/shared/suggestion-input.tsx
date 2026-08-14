import { h } from "preact";
import { useState, useRef, useMemo } from "preact/hooks";
import { Popover } from "./popover";
import { rankSuggestions, SuggestionOption } from "../../utils/suggest";

interface SuggestionInputProps {
	/** Current value (fully controlled, identical to a plain <input>). */
	value: string;
	/** All candidate options for the input's field. */
	suggestions: SuggestionOption[];
	/** Placeholder shown when empty. */
	placeholder?: string;
	/** CSS class applied to the underlying <input>. */
	class?: string;
	/** Called when the value changes (typing or picking a suggestion). */
	onInput: (value: string) => void;
}

const SUGGEST_LIMIT = 8;

/**
 * A plain text input (identical behavior to a bare controlled `<input>` — no
 * IME handling, no local buffer — so typing is never interfered with) plus a
 * separate ▾ button that opens a suggestion dropdown on demand. Suggestions are
 * ranked by similarity to the current value (prefix > substring > edit distance).
 */
export function SuggestionInput({ value, suggestions, placeholder, class: cls, onInput }: SuggestionInputProps) {
	const [open, setOpen] = useState(false);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const wrapRef = useRef<HTMLDivElement | null>(null);

	const ranked = useMemo(() => rankSuggestions(value, suggestions, SUGGEST_LIMIT), [value, suggestions]);

	function pick(opt: SuggestionOption) {
		onInput(opt.value);
		setOpen(false);
		inputRef.current?.focus();
	}

	return (
		<div class={`scheduler-suggestion ${cls ?? ""}${open ? " open" : ""}`} ref={wrapRef}>
			<input
				ref={inputRef}
				class={cls ?? ""}
				type="text"
				value={value}
				placeholder={placeholder}
				onInput={(e: any) => onInput(e.target.value)}
			/>
			<button
				type="button"
				class="scheduler-suggestion-btn"
				onMouseDown={(e: any) => e.preventDefault()}
				onClick={() => setOpen((o) => !o)}
				title="Show suggestions for this field"
			>
				▾
			</button>
			{open && ranked.length > 0 && (
				<Popover
					anchorRef={wrapRef}
					open={open}
					className="scheduler-suggestion-dropdown"
					offsetY={2}
					onOutsideClick={() => setOpen(false)}
				>
					<div class="scheduler-suggestion-list">
						{ranked.map((opt) => (
							<div
								class="scheduler-suggestion-item"
								onMouseDown={(e: any) => e.preventDefault()}
								onClick={() => pick(opt)}
							>
								{opt.label}
							</div>
						))}
					</div>
				</Popover>
			)}
		</div>
	);
}
