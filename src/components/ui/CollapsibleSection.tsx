import type { ReactNode, MouseEvent } from "react";

interface CollapsibleSectionProps {
  collapsed: boolean;
  onToggle: () => void;
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  expandTitle: string;
  collapseTitle: string;
  children: ReactNode;
  /** 收起时仅显示标题栏的高度 class */
  barClassName?: string;
  /** 展开时整体高度 class */
  expandedClassName?: string;
  hiddenWhenIdle?: boolean;
}

export function CollapsibleSection({
  collapsed,
  onToggle,
  title,
  meta,
  actions,
  expandTitle,
  collapseTitle,
  children,
  barClassName = "h-7",
  expandedClassName = "h-40",
  hiddenWhenIdle = false,
}: CollapsibleSectionProps) {
  if (hiddenWhenIdle) return null;

  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    <div
      className={`ui-dock-section ${collapsed ? barClassName : expandedClassName}`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className={`ui-dock-section-bar ${barClassName}`}
        title={collapsed ? expandTitle : collapseTitle}
        aria-expanded={!collapsed}
      >
        <svg
          className={`w-3.5 h-3.5 shrink-0 text-fg-subtle transition-transform ${collapsed ? "-rotate-90" : ""}`}
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
        <span className="font-medium text-fg-muted">{title}</span>
        {meta}
        {actions && (
          <div className="ml-auto flex items-center gap-1" onClick={stop}>
            {actions}
          </div>
        )}
      </div>
      {!collapsed && children}
    </div>
  );
}
