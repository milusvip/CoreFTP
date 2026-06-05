export type ToastVariant = "info" | "error" | "success";

export interface ToastShowOptions {
  /** 为 true 时不自动关闭，需点击 × */
  persist?: boolean;
  /** 自动关闭毫秒数（默认 4000，仅 persist 为 false 时生效） */
  durationMs?: number;
}

interface ToastProps {
  message: string;
  variant?: ToastVariant;
  onClose: () => void;
}

const styles: Record<ToastVariant, string> = {
  info: "bg-surface border-surface-light text-fg",
  error: "bg-[#2a1a1a] border-red-500/40 text-red-300",
  success: "bg-[#1a2a1f] border-green-500/30 text-green-300",
};

export default function Toast({ message, variant = "error", onClose }: ToastProps) {
  return (
    <div
      className={`fixed bottom-44 right-4 z-[55] max-w-sm min-w-[200px] border text-xs px-4 py-2.5 rounded-lg shadow-xl flex items-start gap-2 animate-scale-in ${styles[variant]}`}
      role="status"
    >
      <span className="flex-1 leading-relaxed">{message}</span>
      <button type="button" onClick={onClose} className="opacity-60 hover:opacity-100 shrink-0 mt-0.5" aria-label="Close">
        &#x2715;
      </button>
    </div>
  );
}
