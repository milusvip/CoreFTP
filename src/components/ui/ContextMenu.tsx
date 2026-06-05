import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface ContextMenuItem {
  id: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
  accent?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  header?: string;
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, header, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pad = 8;
    const rect = el.getBoundingClientRect();
    let nx = x;
    let ny = y;
    if (nx + rect.width > window.innerWidth - pad) nx = window.innerWidth - rect.width - pad;
    if (ny + rect.height > window.innerHeight - pad) ny = window.innerHeight - rect.height - pad;
    if (nx < pad) nx = pad;
    if (ny < pad) ny = pad;
    setPos({ x: nx, y: ny });
  }, [x, y, items.length, header]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-[45]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        ref={ref}
        className="ui-menu fixed z-[46]"
        style={{ left: pos.x, top: pos.y }}
        role="menu"
      >
        {header && (
          <div className="px-3 py-1.5 text-[10px] text-fg-subtle border-b border-surface-light/60 truncate max-w-[220px]">
            {header}
          </div>
        )}
        {items.map((item) => (
          <div key={item.id}>
            {item.separatorBefore && <div className="h-px bg-surface-light/60 my-1" />}
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={`ui-menu-item w-full text-left ${
                item.danger ? "ui-menu-item-danger" : item.accent ? "ui-menu-item-accent" : ""
              } ${item.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
              onClick={() => {
                if (item.disabled) return;
                item.onClick();
                onClose();
              }}
            >
              {item.label}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
