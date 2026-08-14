import { h } from "preact";
import { useState, useRef, useEffect, useMemo } from "preact/hooks";
import { Popover } from "./popover";
import { rankSuggestions, SuggestionOption } from "../../utils/suggest";

interface SuggestionInputProps {
	/** Current value (controlled — committed on every non-IME change). */
	value: string;
	/** All candidate options for the input's field. */
	suggestions: SuggestionOption[];
	/** Placeholder shown when empty. */
	placeholder?: string;
	/** CSS class applied to the underlying <input>. */
	class?: string;
	/** Called when the input value changes (typing, picking a suggestion). */
	onInput: (value: string) => void;
}

const SUGGEST_LIMIT = 6;

/**
 * A free-text input with a suggestion dropdown, ranked by similarity to what
 * the user is typing (prefix > substring > edit distance).
 *
 * The input binds to a LOCAL buffer (`localValue`) rather than the controlled
 * `value` prop. This is what keeps IME composition intact: mid-composition the
 * buffer always mirrors the DOM, so a parent re-render can never write a stale
 * `value` back into the field and reset the IME candidate window. The buffer is
 * committed to the parent on every non-IME change and on composition end.
 */
export function SuggestionInput({ value, suggestions, placeholder, class: cls, onInput }: SuggestionInputProps) {
	const [open, setOpen] = useState(false);
	const [activeIdx, setActiveIdx] = useState(-1);
	const [localValue, setLocalValue] = useState(value);
	const composingRef = useRef(false);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const wrapRef = useRef<HTMLDivElement | null>(null);

	const ranked = useMemo(() => rankSuggestions(localValue, suggestions, SUGGEST_LIMIT), [localValue, suggestions]);

	// Mirror externally-driven value changes (e.g. a suggestion picked by
	// keyboard elsewhere, or the parent resetting the field). Never clobber
	// text the user is still composing.
	useEffect(() => {
		if (!composingRef.current && value !== localValue) {
			setLocalValue(value);
		}
	}, [value, localValue]);

	// Close the dropdown whenever the options source disappears entirely
	useEffect(() => {
		if (open && ranked.length === 0) setOpen(false);
	}, [ranked, open]);

	function commitValue(v: string) {
		onInput(v);
		setActiveIdx(-1);
		setOpen(true);
	}

	function handleInput(e: Event) {
		const v = (e.target as HTMLInputElement).value;
		// Always mirror the DOM into the local buffer first, so re-renders can
		// never roll the text back.
		setLocalValue(v);
		if (composingRef.current) return; // IME composing — commit on compositionend
		commitValue(v);
	}

	function handleCompositionEnd(e: CompositionEvent) {
		composingRef.current = false;
		const v = (e.currentTarget as HTMLInputElement).value;
		setLocalValue(v);
		commitValue(v);
	}

	function pick(opt: SuggestionOption) {
		setLocalValue(opt.value);
		onInput(opt.value);
		setOpen(false);
		setActiveIdx(-1);
		inputRef.current?.focus();
	}

	function handleKey(e: KeyboardEvent) {
		// While composing, arrow/enter keys drive the IME candidate window —
		// never interpret them as suggestion navigation.
		if (composingRef.current) return;
		if (e.key === "Escape") {
			setOpen(false);
			return;
		}
		if (!open || ranked.length === 0) return;

		if (e.key === "ArrowDown") {
			e.preventDefault();
			setActiveIdx((i) => Math.min(i + 1, ranked.length - 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setActiveIdx((i) => (i <= 0 ? -1 : i - 1));
		} else if ((e.key === "Enter" || e.key === "Tab") && activeIdx >= 0 && activeIdx < ranked.length) {
			e.preventDefault();
			pick(ranked[activeIdx]);
		}
	}

	return (
		<div
			class={`scheduler-suggestion ${cls ?? ""}${open && ranked.length > 0 ? " open" : ""}`}
			ref={wrapRef}
		>
			<input
				ref={inputRef}
				class={cls ?? ""}
				type="text"
				value={localValue}
				placeholder={placeholder}
				onInput={handleInput}
				onCompositionStart={() => { composingRef.current = true; }}
				onCompositionEnd={handleCompositionEnd}
				onFocus={() => setOpen(true)}
				onKeyDown={(e: any) => handleKey(e)}
			/>
			{open && ranked.length > 0 && (
				<Popover
					anchorRef={wrapRef}
					open={open}
					className="scheduler-suggestion-dropdown"
					offsetY={2}
					onOutsideClick={() => setOpen(false)}
				>
					<div class="scheduler-suggestion-list">
						{ranked.map((opt, idx) => (
							<div
								class={`scheduler-suggestion-item${idx === activeIdx ? " active" : ""}${opt.value === localValue ? " selected" : ""}`}
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
