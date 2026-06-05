import { useEffect, useRef, useState } from "react";
import { useTransferStore, formatSpeed } from "../stores/transferStore";
import { useT } from "../i18n";
import { transferDestDir, transferDestKind } from "../utils/paths";
import { CollapsibleSection } from "./ui/CollapsibleSection";

const ACTIVE_STATUSES = ["pending", "uploading", "downloading", "extracting"];

const statusKeys: Record<string, string> = {
  pending: "transfer.pending",
  uploading: "transfer.uploading",
  downloading: "transfer.downloading",
  extracting: "transfer.extracting",
  done: "transfer.done",
  error: "transfer.error",
  cancelled: "transfer.cancelled",
};

const statusColors: Record<string, string> = {
  pending: "text-fg-muted",
  uploading: "text-accent",
  downloading: "text-accent",
  extracting: "text-amber-400",
  done: "text-green-500",
  error: "text-red-400",
  cancelled: "text-fg-subtle",
};

export default function TransferQueue() {
  const t = useT();
  const tasks = useTransferStore((s) => s.tasks);
  const clearDone = useTransferStore((s) => s.clearDone);
  const cancelTask = useTransferStore((s) => s.cancelTask);
  const retryTask = useTransferStore((s) => s.retryTask);
  const [collapsed, setCollapsed] = useState(true);
  const hadActiveRef = useRef(false);

  const activeCount = tasks.filter((t) => ACTIVE_STATUSES.includes(t.status)).length;
  const doneCount = tasks.filter((t) => t.status === "done").length;

  useEffect(() => {
    if (activeCount > 0) {
      hadActiveRef.current = true;
      setCollapsed(false);
      return;
    }
    if (hadActiveRef.current) {
      hadActiveRef.current = false;
      setCollapsed(true);
      if (doneCount > 0) clearDone();
    }
  }, [activeCount, doneCount, clearDone]);

  return (
    <CollapsibleSection
      collapsed={collapsed}
      onToggle={() => setCollapsed((c) => !c)}
      title={t("transfer.title")}
      expandTitle={t("transfer.expand")}
      collapseTitle={t("transfer.collapse")}
      hiddenWhenIdle={tasks.length === 0 && collapsed}
      expandedClassName="h-40"
      meta={
        tasks.length > 0 ? (
          <span className="text-fg-faint">
            {tasks.length} {t("transfer.tasks")}
            {activeCount > 0 && (
              <span className="text-accent ml-1">
                {"\u00B7"} {activeCount} {t("transfer.active")}
              </span>
            )}
          </span>
        ) : undefined
      }
      actions={
        doneCount > 0 && !collapsed ? (
          <button type="button" onClick={() => clearDone()} className="ui-toolbar-btn text-[10px]">
            {t("transfer.clearDone")}
          </button>
        ) : undefined
      }
    >
      <div className="flex-1 scroll-y-stable min-h-0 text-xs border-t border-surface-light/40">
        {tasks.length === 0 ? (
          <div className="flex items-center justify-center h-full text-fg-faint text-[11px]">
            {t("transfer.empty")}
          </div>
        ) : (
          tasks.map((task) => {
            const active = ACTIVE_STATUSES.includes(task.status);
            const destDir = transferDestDir(task);
            const destKind = transferDestKind(task);
            const destLabelKey =
              destKind === "download"
                ? "transfer.destDownload"
                : destKind === "extract"
                ? "transfer.destExtract"
                : "transfer.destUpload";
            return (
              <div
                key={task.id}
                className="ui-transfer-row group"
              >
                <span className="shrink-0 text-fg-subtle">
                  {task.isArchive ? (
                    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                      <path d="M2.5 1.5A1.5 1.5 0 0 1 4 0h5.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12a1.5 1.5 0 0 1 .439 1.061V13.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2.5 13.5v-12z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                      <path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.5L9.5 0H4z" />
                    </svg>
                  )}
                </span>
                <span className="truncate shrink-0 max-w-[28%] font-medium text-fg" title={task.fileName}>
                  {task.fileName}
                </span>
                <span
                  className="flex-1 min-w-0 truncate text-[10px] text-fg-faint text-right font-mono"
                  title={`${t(destLabelKey)} ${destDir}`}
                >
                  {t(destLabelKey)} {destDir}
                </span>

                {task.speedBps && task.speedBps > 0 && active && (
                  <span className="text-[10px] text-fg-faint w-14 text-right tabular-nums shrink-0">
                    {formatSpeed(task.speedBps)}
                  </span>
                )}

                <div className="ui-transfer-progress-track">
                  <div
                    className={`ui-transfer-progress-fill ${
                      task.status === "error"
                        ? "ui-transfer-progress-fill-error"
                        : task.status === "done"
                        ? "ui-transfer-progress-fill-done"
                        : task.status === "cancelled"
                        ? "ui-transfer-progress-fill-cancelled"
                        : "ui-transfer-progress-fill-active"
                    }`}
                    style={{ width: `${task.progress}%` }}
                  />
                </div>

                <span className={`w-16 text-right shrink-0 text-[10px] ${statusColors[task.status]}`}>
                  {t(statusKeys[task.status] || "transfer.pending")}
                </span>

                {active && (
                  <button
                    type="button"
                    onClick={() => cancelTask(task.id)}
                    className="ui-toolbar-btn text-red-400/80 opacity-0 group-hover:opacity-100 shrink-0"
                  >
                    {t("transfer.cancel")}
                  </button>
                )}

                {task.status === "error" && task.retryInfo && (
                  <button
                    type="button"
                    onClick={() => retryTask(task.id)}
                    className="ui-toolbar-btn text-accent shrink-0"
                  >
                    {t("transfer.retry")}
                  </button>
                )}

                {task.error && !active && (
                  <span className="text-[10px] text-red-400/70 truncate max-w-[100px] shrink-0" title={task.error}>
                    {task.error}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </CollapsibleSection>
  );
}
