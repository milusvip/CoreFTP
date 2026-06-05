import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import { useTransferStore } from "../stores/transferStore";
import { useSiteStore } from "../stores/siteStore";
import { useT } from "../i18n";
import { CollapsibleSection } from "./ui/CollapsibleSection";

const ACTIVE_TRANSFER = ["pending", "uploading", "downloading", "extracting"];

export default function LogPanel() {
  const t = useT();
  const logs = useSettingsStore((s) => s.logs);
  const refreshLogs = useSettingsStore((s) => s.refreshLogs);
  const clearLogs = useSettingsStore((s) => s.clearLogs);
  const tasks = useTransferStore((s) => s.tasks);
  const activeSiteId = useSiteStore((s) => s.activeSiteId);
  const sessions = useSiteStore((s) => s.sessions);

  const [collapsed, setCollapsed] = useState(true);
  const hadActivityRef = useRef(false);

  const activeTransfers = tasks.filter((t) => ACTIVE_TRANSFER.includes(t.status)).length;
  const isConnecting = activeSiteId ? sessions[activeSiteId]?.status === "connecting" : false;
  const busy = activeTransfers > 0 || isConnecting;

  useEffect(() => {
    refreshLogs();
    const id = setInterval(refreshLogs, 2000);
    return () => clearInterval(id);
  }, [refreshLogs]);

  useEffect(() => {
    if (busy) {
      hadActivityRef.current = true;
      setCollapsed(false);
      return;
    }
    if (hadActivityRef.current) {
      hadActivityRef.current = false;
      setCollapsed(true);
    }
  }, [busy]);

  return (
    <CollapsibleSection
      collapsed={collapsed}
      onToggle={() => setCollapsed((c) => !c)}
      title={t("log.title")}
      expandTitle={t("log.expand")}
      collapseTitle={t("log.collapse")}
      hiddenWhenIdle={logs.length === 0 && collapsed}
      expandedClassName="h-28"
      barClassName="h-7"
      meta={logs.length > 0 ? <span className="text-fg-faint">{logs.length}</span> : undefined}
      actions={
        !collapsed ? (
          <>
            <button type="button" onClick={() => refreshLogs()} className="ui-toolbar-btn text-[10px]">
              {t("filepanel.refresh")}
            </button>
            <button type="button" onClick={() => clearLogs()} className="ui-toolbar-btn text-[10px]">
              {t("log.clear")}
            </button>
          </>
        ) : undefined
      }
    >
      <div className="flex-1 scroll-y-stable min-h-0 font-mono text-[10px] px-3 py-1 space-y-0.5 border-t border-surface-light/40 bg-app">
        {logs.length === 0 ? (
          <div className="text-fg-faint text-center py-3">{t("log.empty")}</div>
        ) : (
          logs.slice(-80).map((e, i) => (
            <div key={i} className="flex gap-2 text-fg-subtle leading-relaxed">
              <span className="text-fg-faint shrink-0 tabular-nums">{e.timestamp}</span>
              <span
                className={
                  e.level === "error"
                    ? "text-red-400"
                    : e.level === "warn"
                    ? "text-yellow-500"
                    : "text-fg-muted"
                }
              >
                [{e.level}]
              </span>
              <span className="text-fg-muted break-all">{e.message}</span>
            </div>
          ))
        )}
      </div>
    </CollapsibleSection>
  );
}
