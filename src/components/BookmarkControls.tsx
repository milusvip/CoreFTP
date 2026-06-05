import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import type { Bookmark } from "../stores/settingsStore";

interface BookmarkControlsProps {
  bookmarks: Bookmark[];
  currentPath: string;
  isBookmarked: boolean;
  onToggle: () => void;
  onNavigate: (path: string) => void;
  onRemove: (id: string) => void;
}

function StarIcon({ filled }: { filled: boolean }) {
  if (filled) {
    return (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" />
      </svg>
    );
  }
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" />
    </svg>
  );
}

export default function BookmarkControls({
  bookmarks,
  currentPath,
  isBookmarked,
  onToggle,
  onNavigate,
  onRemove,
}: BookmarkControlsProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
    <div ref={rootRef} className="relative flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={onToggle}
        className={`inline-flex items-center justify-center w-7 h-7 rounded-md border border-surface-light/50 bg-surface/80 shrink-0 transition-colors ${
          isBookmarked ? "text-accent border-accent/40" : "text-fg-subtle hover:text-accent hover:border-surface-hover"
        }`}
        title={isBookmarked ? t("bookmark.toggleRemove") : t("bookmark.toggleAdd")}
      >
        <StarIcon filled={isBookmarked} />
      </button>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 h-7 pl-2 pr-1.5 rounded-md border border-surface-light/50 bg-surface/80 text-[10px] text-fg-muted whitespace-nowrap transition-colors hover:text-fg hover:border-surface-hover ${
          open ? "border-surface-hover bg-surface-light/60 text-fg" : ""
        }`}
        title={t("bookmark.title")}
        aria-expanded={open}
      >
        <span>{t("bookmark.title")}</span>
        {bookmarks.length > 0 && (
          <span className="text-fg-faint tabular-nums">{bookmarks.length}</span>
        )}
        <svg
          className={`w-3 h-3 shrink-0 text-fg-subtle transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-[60] w-64 rounded-lg border border-surface-light/80 bg-surface-darker shadow-xl py-1 max-h-56 scroll-y-stable"
          role="menu"
        >
          <div
            className="px-3 py-1.5 text-[10px] text-fg-faint border-b border-surface-light/50 truncate font-mono"
            title={currentPath}
          >
            {currentPath || "/"}
          </div>
          {bookmarks.length === 0 ? (
            <p className="px-3 py-3 text-xs text-fg-faint leading-relaxed">{t("bookmark.empty")}</p>
          ) : (
            bookmarks.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-1 px-2 py-1 hover:bg-surface-light/40 group"
                role="menuitem"
              >
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left rounded-md py-0.5"
                  onClick={() => {
                    onNavigate(b.path);
                    setOpen(false);
                  }}
                >
                  <div className="text-xs font-medium text-fg truncate leading-tight">{b.label}</div>
                  <div className="text-[10px] text-fg-faint truncate font-mono leading-tight mt-0.5">{b.path}</div>
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(b.id)}
                  className="inline-flex items-center justify-center w-6 h-6 rounded-md text-fg-faint hover:text-red-400 hover:bg-red-400/10 shrink-0"
                  title={t("bookmark.remove")}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
