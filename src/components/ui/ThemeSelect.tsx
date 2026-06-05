import { useEffect, useId, useRef, useState } from "react";

export interface ThemeSelectOption {
  value: string;
  label: string;
}

interface ThemeSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: ThemeSelectOption[];
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}

export default function ThemeSelect({
  value,
  onChange,
  options,
  placeholder = "—",
  className = "",
  "aria-label": ariaLabel,
}: ThemeSelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const selected = options.find((o) => o.value === value);
  const label = selected?.label ?? placeholder;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`ui-theme-select relative ${className}`.trim()}>
      <button
        type="button"
        className={`ui-theme-select-trigger w-full ${open ? "ui-theme-select-trigger-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`truncate ${selected ? "text-fg" : "text-fg-faint"}`}>{label}</span>
        <svg
          className={`ui-theme-select-chevron shrink-0 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {open ? (
        <ul id={listId} role="listbox" className="ui-theme-select-menu" aria-label={ariaLabel}>
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <li key={opt.value || "__empty__"} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`ui-theme-select-option ${active ? "ui-theme-select-option-active" : ""}`}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <span className="truncate">{opt.label}</span>
                  {active ? (
                    <svg className="w-3.5 h-3.5 shrink-0 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
