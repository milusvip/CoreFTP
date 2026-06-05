import { useT } from "../i18n";
import { useSiteStore } from "../stores/siteStore";
import { useTerminalStore } from "../stores/terminalStore";
import { DialogBtn } from "./ui/Dialog";
import { confirmCloseAllTerminals } from "../utils/terminalCloseConfirm";

export default function TerminalDock() {
  const t = useT();
  const sites = useSiteStore((s) => s.sites);
  const tabs = useTerminalStore((s) => s.tabs);
  const expanded = useTerminalStore((s) => s.expanded);
  const host = useTerminalStore((s) => s.host);
  const expandWorkspace = useTerminalStore((s) => s.expandWorkspace);
  const closeWorkspace = useTerminalStore((s) => s.closeWorkspace);

  if (tabs.length === 0) return null;
  if (host === "embedded" && expanded) return null;

  const siteNames = tabs
    .map((tab) => sites.find((s) => s.id === tab.siteId)?.name ?? tab.siteId)
    .join(" · ");

  const label =
    host === "detached"
      ? t("sshTerminal.dockDetached", { count: String(tabs.length) })
      : t("sshTerminal.dockRunning", { count: String(tabs.length) });

  return (
    <div className="ui-terminal-dock" role="status" aria-live="polite">
      <button
        type="button"
        className="ui-terminal-dock-main"
        onClick={() => expandWorkspace()}
        title={t("sshTerminal.dockExpand")}
      >
        <span className="ui-terminal-dock-dot" aria-hidden />
        <span className="ui-terminal-dock-label">{label}</span>
        {siteNames ? (
          <span className="ui-terminal-dock-sites truncate">{siteNames}</span>
        ) : null}
      </button>

      <div className="flex items-center gap-2 shrink-0">
        <DialogBtn
          variant="primary"
          className="!py-1.5 !px-3.5 !text-xs"
          onClick={() => expandWorkspace()}
        >
          {t("sshTerminal.dockExpand")}
        </DialogBtn>
        <DialogBtn
          variant="secondary"
          className="!py-1.5 !px-3 !text-xs"
          onClick={() => {
            void (async () => {
              const ok = await confirmCloseAllTerminals(tabs.length);
              if (ok) closeWorkspace();
            })();
          }}
        >
          {t("sshTerminal.dockCloseAll")}
        </DialogBtn>
      </div>
    </div>
  );
}
