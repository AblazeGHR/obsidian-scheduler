import { h } from "preact";
import { useState, useRef, useEffect, useMemo } from "preact/hooks";
import { Popover } from "./popover";
import { rankSuggestions, SuggestionOption } from "../../utils/suggest";

interface SuggestionInputProps {
	/** Current input value (controlled). */
	value: string;
	/** All candidate options for the input's field. */
	suggestions: SuggestionOption[];
	/** Placeholder shown when empty. */
	placeholder?: string;
	/** CSS class applied to the underlying <input>. */
	class?: string;
	/** Called on every change (typing, picking a suggestion, Enter/Tab). */
	onInput: (value: string) => void;
}

const SUGGEST_LIMIT = 6;

/**
 * A free-text input that, while focused/typing, shows a dropdown of the most
 * similar suggestions for the input's field (ranked by prefix/substring/edit
 * distance). Arrow keys move the highlight, Enter/Tab accept it, Esc dismisses.
 * The dropdown is rendered through Popover so it escapes code-block clipping.
 */
export function SuggestionInput({ value, suggestions, placeholder, class: cls, onInput }: SuggestionInputProps) {
	const [open, setOpen] = useState(false);
	const [activeIdx, setActiveIdx] = useState(-1);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const wrapRef = useRef<HTMLDivElement | null>(null);

	const ranked = useMemo(() => rankSuggestions(value, suggestions, SUGGEST_LIMIT), [value, suggestions]);

	// Close the dropdown whenever the options source disappears entirely
	useEffect(() => {
		if (open && ranked.length === 0) setOpen(false);
	}, [ranked, open]);

	function pick(opt: SuggestionOption) {
		onInput(opt.value);
		setOpen(false);
		setActiveIdx(-1);
		inputRef.current?.focus();
	}

	function handleKey(e: KeyboardEvent) {
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
				value={value}
				placeholder={placeholder}
				onInput={(e: any) => {
					onInput(e.target.value);
					setActiveIdx(-1);
					setOpen(true);
				}}
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
								class={`scheduler-suggestion-item${idx === activeIdx ? " active" : ""}${opt.value === value ? " selected" : ""}`}
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
