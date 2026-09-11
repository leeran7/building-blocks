"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * Custom Select — an accessible listbox styled for the ASCENT design system.
 *
 * A drop-in replacement for a native `<select>` where the OS-rendered dropdown
 * doesn't fit the dark editorial palette. Implements the WAI-ARIA collapsible
 * listbox pattern: keyboard driven (↑/↓/Home/End/Enter/Esc/type-ahead),
 * closes on outside click / blur, and matches the field styling used by the
 * native selects in submit/page.tsx (same border, radius, padding, focus ring).
 *
 * Controlled component: the rendered selection derives entirely from `value`,
 * so `onChange` must update that prop synchronously for the checkmark and
 * active option to reflect the new choice.
 */

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectOptionGroup = {
  /** Group heading (rendered non-selectable, like <optgroup label>). */
  label: string;
  options: SelectOption[];
};

/** Accept a flat list of options or grouped options (optgroup-style). */
export type SelectItems = SelectOption[] | SelectOptionGroup[];

type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectItems;
  /** Shown when no option is selected. Not a selectable value. */
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  /** "md" matches the submit-form INPUT; "sm" is compact (admin rows). */
  size?: "md" | "sm";
  className?: string;
  /** Provide when there is no visible <label htmlFor>. */
  "aria-label"?: string;
  /** id of a visible label element (alternative to aria-label). */
  "aria-labelledby"?: string;
};

const TRIGGER_BASE =
  "w-full flex items-center justify-between gap-2 bg-surface border border-border-subtle rounded-lg text-left text-text-primary transition-colors focus:outline-hidden focus:border-signal focus:ring-1 focus:ring-signal disabled:opacity-50 disabled:cursor-not-allowed";

const TRIGGER_SIZE = {
  md: "px-4 py-3 text-base",
  sm: "px-3 py-2 text-sm",
} as const;

const OPTION_SIZE = {
  // md keeps a 44px touch target (DESIGN.md); sm is a compact desktop admin row.
  md: "px-4 py-2.5 text-sm min-h-[44px]",
  sm: "px-3 py-2 text-sm",
} as const;

function isGrouped(items: SelectItems): items is SelectOptionGroup[] {
  return items.length > 0 && "options" in items[0];
}

/** Flatten to a single ordered list of selectable options for keyboard nav. */
function flatten(items: SelectItems): SelectOption[] {
  return isGrouped(items) ? items.flatMap((g) => g.options) : items;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled = false,
  id,
  name,
  size = "md",
  className = "",
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
}: SelectProps) {
  const autoId = useId();
  const listboxId = `${id ?? autoId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const typeahead = useRef({ query: "", timer: 0 });

  const flat = useMemo(() => flatten(options), [options]);
  const selected = flat.find((o) => o.value === value) ?? null;

  const selectableIndexes = useMemo(
    () => flat.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0),
    [flat],
  );

  const commit = useCallback(
    (index: number) => {
      const opt = flat[index];
      if (!opt || opt.disabled) return;
      onChange(opt.value);
      setOpen(false);
    },
    [flat, onChange],
  );

  // Open the listbox with the current selection (or first option) active.
  const openList = useCallback(() => {
    if (disabled) return;
    const current = flat.findIndex((o) => o.value === value && !o.disabled);
    setActiveIndex(current >= 0 ? current : (selectableIndexes[0] ?? -1));
    setOpen(true);
  }, [disabled, flat, value, selectableIndexes]);

  const moveActive = useCallback(
    (dir: 1 | -1) => {
      if (selectableIndexes.length === 0) return;
      const pos = selectableIndexes.indexOf(activeIndex);
      let next: number;
      if (pos === -1) {
        next = dir === 1 ? selectableIndexes[0] : selectableIndexes[selectableIndexes.length - 1];
      } else {
        const nextPos = Math.min(
          selectableIndexes.length - 1,
          Math.max(0, pos + dir),
        );
        next = selectableIndexes[nextPos];
      }
      setActiveIndex(next);
    },
    [activeIndex, selectableIndexes],
  );

  // Type-ahead: jump to the option whose label starts with the typed string.
  const onType = useCallback(
    (char: string) => {
      window.clearTimeout(typeahead.current.timer);
      typeahead.current.query += char.toLowerCase();
      const q = typeahead.current.query;
      const match = flat.findIndex(
        (o) => !o.disabled && o.label.toLowerCase().startsWith(q),
      );
      if (match >= 0) setActiveIndex(match);
      typeahead.current.timer = window.setTimeout(() => {
        typeahead.current.query = "";
      }, 600);
    },
    [flat],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (!open) openList();
          else moveActive(1);
          break;
        case "ArrowUp":
          e.preventDefault();
          if (!open) openList();
          else moveActive(-1);
          break;
        case "Home":
          if (open) {
            e.preventDefault();
            setActiveIndex(selectableIndexes[0] ?? -1);
          }
          break;
        case "End":
          if (open) {
            e.preventDefault();
            setActiveIndex(selectableIndexes[selectableIndexes.length - 1] ?? -1);
          }
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (!open) openList();
          else if (activeIndex >= 0) commit(activeIndex);
          break;
        case "Escape":
          if (open) {
            e.preventDefault();
            setOpen(false);
          }
          break;
        case "Tab":
          setOpen(false);
          break;
        default:
          if (open && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
            onType(e.key);
          }
      }
    },
    [disabled, open, openList, moveActive, selectableIndexes, activeIndex, commit, onType],
  );

  // Close on outside pointer-down.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Clear any pending type-ahead reset timer on unmount.
  useEffect(() => () => window.clearTimeout(typeahead.current.timer), []);

  // Keep the active option scrolled into view while navigating.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const activeOptionId =
    open && activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined;

  const renderOption = (opt: SelectOption, index: number) => {
    const isSelected = opt.value === value;
    const isActive = index === activeIndex;
    return (
      <li
        key={opt.value}
        id={`${listboxId}-opt-${index}`}
        role="option"
        data-index={index}
        aria-selected={isSelected}
        aria-disabled={opt.disabled || undefined}
        onClick={() => commit(index)}
        onMouseEnter={() => !opt.disabled && setActiveIndex(index)}
        className={[
          "flex items-center justify-between gap-2 cursor-pointer select-none",
          OPTION_SIZE[size],
          opt.disabled
            ? "text-text-disabled cursor-not-allowed"
            : isActive
              ? "bg-elevated text-text-primary"
              : "text-text-secondary",
          isSelected && !opt.disabled ? "text-signal" : "",
        ].join(" ")}
      >
        <span className="truncate">{opt.label}</span>
        {isSelected && (
          <svg
            className="w-4 h-4 shrink-0 text-signal"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </li>
    );
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {/* Mirror the value into a hidden input so this works inside forms. */}
      {name && <input type="hidden" name={name} value={value} />}

      <button
        type="button"
        id={id}
        className={`${TRIGGER_BASE} ${TRIGGER_SIZE[size]}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span className={selected ? "truncate" : "truncate text-text-muted"}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          className={`w-5 h-5 shrink-0 text-text-muted transition-transform duration-200 motion-reduce:transition-none ${
            open ? "rotate-180" : ""
          }`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledby}
          aria-multiselectable={false}
          aria-activedescendant={activeOptionId}
          className="absolute z-50 mt-1.5 max-h-64 w-full overflow-auto rounded-lg border border-border-strong bg-surface-raised py-1 shadow-lifted focus:outline-hidden"
        >
          {isGrouped(options)
            ? (() => {
                let running = -1;
                return options.map((group) => (
                  <li key={group.label} role="group" aria-label={group.label}>
                    <div
                      aria-hidden="true"
                      className="px-4 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-text-muted"
                    >
                      {group.label}
                    </div>
                    {group.options.map((opt) => {
                      running += 1;
                      return renderOption(opt, running);
                    })}
                  </li>
                ));
              })()
            : options.map((opt, i) => renderOption(opt, i))}
        </ul>
      )}
    </div>
  );
}
