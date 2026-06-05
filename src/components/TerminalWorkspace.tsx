import { lazy, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirmCloseTerminalTab } from "../utils/terminalCloseConfirm";
import { useT } from "../i18n";
import { useSiteStore } from "../stores/siteStore";
import { useTerminalStore } from "../stores/terminalStore";
import { Modal, ModalBackdrop, ModalPanel, ModalHeader } from "./ui/Modal";

const SshTerminalPane = lazy(() => import("./SshTerminalPane"));

interface TerminalWorkspaceProps {
  mode?: "embedded" | "detached";
  onDetachError?: (message: string) => void;
}

function TerminalWorkspaceBody({ onDetachError }: Pick<TerminalWorkspaceProps, "onDetachError">) {
  const t = useT();
  const sites = useSiteStore((s) => s.sites);
  const tabs = useTerminalStore((s) => s.tabs);
  const activeTabId = useTerminalStore((s) => s.activeTabId);
  const setActiveTab = useTerminalStore((s) => s.setActiveTab);
  const closeTab = useTerminalStore((s) => s.closeTab);
  const toggleFullscreen = useTerminalStore((s) => s.toggleFullscreen);
  const minimizeWorkspace = useTerminalStore((s) => s.minimizeWorkspace);
  const host = useTerminalStore((s) => s.host);
  const fullscreen = useTerminalStore((s) => s.fullscreen);

  return (
    <>
      <div className="shrink-0 flex items-center gap-1 px-3 py-1.5 border-b border-surface-light/40 overflow-x-auto">
        {tabs.map((tab) => {
          const site = sites.find((s) => s.id === tab.siteId);
          const label = site?.name ?? tab.siteId;
          const active = tab.tabId === activeTabId;
          return (
            <div key={tab.tabId} className="flex items-center shrink-0">
              <button
                type="button"
                className={`ui-ssh-terminal-tab ${active ? "ui-ssh-terminal-tab-active" : ""}`}
                onClick={() => setActiveTab(tab.tabId)}
              >
                {label}
              </button>
              <button
                type="button"
                className="ui-ssh-terminal-tab-close"
                aria-label={t("sshTerminal.closeTab")}
                onClick={() => {
                  void (async () => {
                    const ok = await confirmCloseTerminalTab(label);
                    if (!ok) return;
                    void invoke("terminal_close", { tabId: tab.tabId }).finally(() =>
                      closeTab(tab.tabId),
                    );
                  })();
                }}
              >
                ×
              </button>
            </div>
          );
        })}
        <span className="flex-1 min-w-2" />
        {host === "embedded" ? (
          <>
            <button type="button" className="ui-ssh-terminal-tool-btn" onClick={minimizeWorkspace}>
              {t("sshTerminal.minimize")}
            </button>
            <button
              type="button"
              className="ui-ssh-terminal-tool-btn"
              onClick={() => {
                void useTerminalStore
                  .getState()
                  .detachToWindow()
                  .catch(() => onDetachError?.(t("sshTerminal.detachFailed")));
              }}
            >
              {t("sshTerminal.detach")}
            </button>
          </>
        ) : null}
        <button type="button" className="ui-ssh-terminal-tool-btn" onClick={toggleFullscreen}>
          {host === "detached"
            ? t("sshTerminal.maximize")
            : fullscreen
              ? t("sshTerminal.exitFullscreen")
              : t("sshTerminal.fullscreen")}
        </button>
      </div>

      <div className="flex-1 min-h-0 relative">
        {tabs.map((tab) => {
          const site = sites.find((s) => s.id === tab.siteId);
          if (!site) return null;
          const isActive = tab.tabId === activeTabId;
          return (
            <div
              key={tab.tabId}
              className={`absolute inset-0 flex flex-col ${isActive ? "" : "hidden"}`}
            >
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center text-fg-subtle text-sm">
                    {t("sshTerminal.loading")}
                  </div>
                }
              >
                <SshTerminalPane
                  tabId={tab.tabId}
                  siteId={tab.siteId}
                  siteName={site.name}
                  host={`${site.host}:${site.port}`}
                  isActive={isActive}
                />
              </Suspense>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default function TerminalWorkspace({ mode = "embedded", onDetachError }: TerminalWorkspaceProps) {
  const t = useT();
  const tabs = useTerminalStore((s) => s.tabs);
  const expanded = useTerminalStore((s) => s.expanded);
  const fullscreen = useTerminalStore((s) => s.fullscreen);
  const minimizeWorkspace = useTerminalStore((s) => s.minimizeWorkspace);
  const isDetached = mode === "detached";

  if (tabs.length === 0) return null;

  const body = <TerminalWorkspaceBody onDetachError={onDetachError} />;

  if (isDetached) {
    return (
      <div className="ui-ssh-terminal-detached-panel flex flex-col flex-1 min-h-0">
        {body}
      </div>
    );
  }

  const panelClass = fullscreen
    ? "ui-ssh-terminal-panel ui-ssh-terminal-fullscreen !w-[calc(100vw-16px)] !max-w-none !h-[calc(100vh-24px)]"
    : "ui-ssh-terminal-panel !w-[min(1080px,calc(100vw-40px))] !max-w-[calc(100vw-24px)] !h-[min(780px,calc(100vh-56px))]";

  const shellClass = expanded
    ? "fixed inset-0 z-[58] flex items-center justify-center p-6"
    : "ui-terminal-session-host";

  return (
    <div className={shellClass} aria-hidden={!expanded}>
      {expanded ? <ModalBackdrop zIndex={58} /> : null}
      <div
        className={`relative flex flex-col shrink-0 ${expanded ? "animate-scale-in z-[59]" : "ui-terminal-session-host-inner"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <ModalPanel size="xl" className={`${panelClass} flex flex-col ${expanded ? "" : "!border-0 !shadow-none"}`}>
          {expanded ? (
            <ModalHeader
              title={t("sshTerminal.title")}
              subtitle={t("sshTerminal.workspaceSubtitle", { count: String(tabs.length) })}
              onClose={minimizeWorkspace}
            />
          ) : null}
          {body}
        </ModalPanel>
      </div>
    </div>
  );
}
