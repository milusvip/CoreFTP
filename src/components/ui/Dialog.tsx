import type { ButtonHTMLAttributes, ReactNode } from "react";

export type DialogBtnVariant = "primary" | "secondary" | "danger" | "ghost";

const BTN_CLASS: Record<DialogBtnVariant, string> = {
  primary: "ui-dialog-btn ui-dialog-btn-primary",
  secondary: "ui-dialog-btn ui-dialog-btn-secondary",
  danger: "ui-dialog-btn ui-dialog-btn-danger",
  ghost: "ui-dialog-btn ui-dialog-btn-ghost",
};

export function DialogMessage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`ui-dialog-message ${className}`.trim()}>{children}</p>;
}

export function DialogHint({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`ui-dialog-hint ${className}`.trim()}>{children}</p>;
}

export function DialogCodeBlock({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`ui-dialog-code-block ${className}`.trim()}>{children}</div>;
}

export function DialogLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <label className={`ui-dialog-label ${className}`.trim()}>{children}</label>;
}

export function DialogFooterBar({
  children,
  className = "",
  align = "end",
}: {
  children: ReactNode;
  className?: string;
  align?: "end" | "between" | "center";
}) {
  const alignClass =
    align === "between" ? "justify-between" : align === "center" ? "justify-center" : "justify-end";
  return (
    <div className={`ui-dialog-footer flex items-center gap-2.5 flex-wrap ${alignClass} ${className}`.trim()}>
      {children}
    </div>
  );
}

export function DialogBtn({
  variant = "secondary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: DialogBtnVariant }) {
  return (
    <button type="button" className={`${BTN_CLASS[variant]} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}

export function DialogCancelLink({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`ui-dialog-cancel-link ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}

export function DialogActionList({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-col gap-2 ${className}`.trim()}>{children}</div>;
}

export function DialogActionCard({
  label,
  description,
  danger = false,
  onClick,
  icon,
  trailing,
}: {
  label: string;
  description?: string;
  danger?: boolean;
  onClick: () => void;
  icon?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`ui-action-card group ${danger ? "ui-action-card-danger" : "ui-action-card-default"}`}
      onClick={onClick}
    >
      <span
        className={`ui-action-card-icon ${danger ? "ui-action-card-icon-danger" : "ui-action-card-icon-default"}`}
      >
        {icon ?? <span className="w-2 h-2 rounded-full bg-current opacity-60" />}
      </span>
      <span className="flex-1 min-w-0 text-left">
        <span className="block text-[13px] font-medium text-fg">{label}</span>
        {description ? (
          <span className="block text-[11px] text-fg-subtle mt-0.5 leading-snug">{description}</span>
        ) : null}
      </span>
      {trailing}
    </button>
  );
}
