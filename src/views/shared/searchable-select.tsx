import { h } from "preact";
import { useState, useRef, useEffect, useMemo } from "preact/hooks";

interface SearchableSelectProps {
	/** All available options. */
	options: string[];
	/** Currently selected value. */
	value: string;
	/** Called when user picks an option. */
	onChange: (value: string) => void;
	/** Placeholder shown in the search input. */
	placeholder?: string;
	/** Optional CSS class for the wrapper. */
	class?: string;
}

/**
 * A compact combobox: shows the current value as a read-only label; click
 * opens a popover with a search input that filters the option list.
 */
export function SearchableSelect({ options, value, onChange, placeholder, class: cls }: SearchableSelectProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [activeIdx, setActiveIdx] = useState(-1);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const wrapRef = useRef<HTMLDivElement | null>(null);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return options;
		return options.filter((o) => o.toLowerCase().includes(q));
	}, [options, query]);

	// Re-focus the search input every time the popover opens
	useEffect(() => {
		if (open) {
			setTimeout(() => inputRef.current?.focus(), 0);
			setQuery("");
			setActiveIdx(-1);
		}
	}, [open]);

	// Close on outside click
	useEffect(() => {
		if (!open) return;
		function onDown(e: MouseEvent) {
			if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		document.addEventListener("mousedown", onDown);
		return () => document.removeEventListener("mousedown", onDown);
	}, [open]);

	function pick(val: string) {
		onChange(val);
		setOpen(false);
	}

	function handleKey(e: KeyboardEvent) {
		if (e.key === "Escape") { setOpen(false); return; }
		if (!open) return;

		if (e.key === "ArrowDown") {
			e.preventDefault();
			setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setActiveIdx((i) => (i <= 0 ? -1 : i - 1));
		} else if (e.key === "Enter" && activeIdx >= 0 && activeIdx < filtered.length) {
			e.preventDefault();
			pick(filtered[activeIdx]);
		}
	}

	return (
		<div
			class={`scheduler-searchable ${cls ?? ""}${open ? " open" : ""}`}
			ref={wrapRef}
			onKeyDown={(e: any) => handleKey(e)}
		>
			<button
				type="button"
				class="scheduler-searchable-btn"
				onClick={() => setOpen((o) => !o)}
				title={value || placeholder || "Select…"}
			>
				<span class="scheduler-searchable-val">{value || "\u00A0"}</span>
				<span class="scheduler-searchable-arrow">&#9662;</span>
			</button>
			{open && (
				<div class="scheduler-searchable-dropdown">
					<input
						ref={inputRef}
						class="scheduler-searchable-input"
						type="text"
						value={query}
						placeholder={placeholder ?? "Search…"}
						onInput={(e: any) => { setQuery(e.target.value); setActiveIdx(-1); }}
						onKeyDown={(e: any) => handleKey(e)}
					/>
					<div class="scheduler-searchable-list">
						{filtered.length === 0 && (
							<div class="scheduler-searchable-empty">No results</div>
						)}
						{filtered.map((o, idx) => (
							<div
								class={`scheduler-searchable-item${idx === activeIdx ? " active" : ""}${o === value ? " selected" : ""}`}
								onMouseDown={(e: any) => e.preventDefault()}
								onClick={() => pick(o)}
							>
								{o}
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
