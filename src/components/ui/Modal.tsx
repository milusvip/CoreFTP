import type { ReactNode } from "react";

export type ModalSize = "sm" | "md" | "lg" | "xl";

const MODAL_WIDTH: Record<ModalSize, string> = {
  sm: "w-[480px]",
  md: "w-[560px]",
  lg: "w-[680px]",
  xl: "w-[880px]",
};

interface ModalProps {
  children: ReactNode;
  onClose?: () => void;
  zIndex?: number;
  dismissOnBackdrop?: boolean;
}

export function ModalBackdrop({ onClose, zIndex = 50 }: { onClose?: () => void; zIndex?: number }) {
  return (
    <div
      className="ui-dialog-backdrop fixed inset-0 animate-fade-in"
      style={{ zIndex }}
      onClick={onClose}
      aria-hidden
    />
  );
}

export function Modal({
  children,
  onClose,
  zIndex = 50,
  dismissOnBackdrop = true,
}: ModalProps) {
  return (
    <div className="fixed inset-0 flex items-center justify-center p-6" style={{ zIndex }}>
      {dismissOnBackdrop && onClose ? <ModalBackdrop onClose={onClose} zIndex={zIndex} /> : null}
      {!dismissOnBackdrop ? (
        <div className="ui-dialog-backdrop fixed inset-0" style={{ zIndex }} aria-hidden />
      ) : null}
      <div className="relative animate-scale-in shrink-0" style={{ zIndex: zIndex + 1 }}>
        {children}
      </div>
    </div>
  );
}

export function ModalPanel({
  children,
  className = "",
  size = "md",
  width,
}: {
  children: ReactNode;
  className?: string;
  size?: ModalSize;
  width?: string;
}) {
  const widthClass = width ?? MODAL_WIDTH[size];
  return (
    <div
      className={`ui-panel ui-dialog-premium overflow-hidden shrink-0 ${widthClass} max-w-none ${className}`}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
    >
      <div className="ui-dialog-premium-accent" aria-hidden />
      {children}
    </div>
  );
}

export function ModalBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`ui-dialog-body ${className}`.trim()}>{children}</div>;
}

export function ModalHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onClose?: () => void;
}) {
  return (
    <div className="ui-dialog-header">
      <div className="min-w-0 flex-1">
        <h2 className="ui-dialog-title">{title}</h2>
        {subtitle ? <p className="ui-dialog-subtitle">{subtitle}</p> : null}
      </div>
      {onClose ? (
        <button type="button" onClick={onClose} className="ui-dialog-close" aria-label="Close">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
