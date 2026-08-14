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
 * A plain controlled `<input>` (byte-for-byte the pre-feature behavior — value
 * is committed on every input event, so real-time filtering keeps working and
 * IME composition is never interfered with). While focused, a suggestion
 * dropdown is shown below the input, ranked by similarity to the *current*
 * value — it reads the already-committed `value` prop, so it needs no extra
 * "refresh" mechanism of its own.
 */
export function SuggestionInput({ value, suggestions, placeholder, class: cls, onInput }: SuggestionInputProps) {
	const [open, setOpen] = useState(false);
	const wrapRef = useRef<HTMLDivElement | null>(null);

	const ranked = useMemo(() => rankSuggestions(value, suggestions, SUGGEST_LIMIT), [value, suggestions]);

	function pick(opt: SuggestionOption) {
		onInput(opt.value);
		// Keep focus so the user can keep typing; the dropdown re-ranks from the
		// updated value.
	}

	return (
		<div class={`scheduler-suggestion ${cls ?? ""}`} ref={wrapRef}>
			<input
				class={cls ?? ""}
				type="text"
				value={value}
				placeholder={placeholder}
				onInput={(e: any) => onInput(e.target.value)}
				onFocus={() => setOpen(true)}
				onBlur={() => setOpen(false)}
			/>
			{open && ranked.length > 0 && (
				<Popover
					anchorRef={wrapRef}
					open={open}
					className="scheduler-suggestion-dropdown"
					offsetY={2}
					onOutsideClick={() => setOpen(false)}
				>
					{ranked.map((opt) => (
						<div
							class="scheduler-suggestion-item"
							onMouseDown={(e: any) => e.preventDefault()}
							onClick={() => pick(opt)}
						>
							{opt.label}
						</div>
					))}
				</Popover>
			)}
		</div>
	);
}
