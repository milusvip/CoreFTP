import { getCurrentWindow } from "@tauri-apps/api/window";
import { useT } from "../i18n";
import { useTerminalStore } from "../stores/terminalStore";
import { closeTerminalWindow } from "../utils/terminalWindow";
import { confirmCloseTerminalWindow } from "../utils/terminalCloseConfirm";

function startWindowDrag(e: React.MouseEvent) {
  if (e.button !== 0) return;
  void getCurrentWindow().startDragging();
}

export default function TerminalTitleBar() {
  const t = useT();
  const attachToMain = useTerminalStore((s) => s.attachToMain);
  const closeWorkspace = useTerminalStore((s) => s.closeWorkspace);

  const handleClose = async () => {
    const ok = await confirmCloseTerminalWindow();
    if (!ok) return;
    closeWorkspace();
    void closeTerminalWindow();
  };

  const handleAttach = () => {
    void attachToMain();
  };

  return (
    <header className="h-9 bg-surface flex items-center gap-2 border-b border-surface-light/80 shrink-0">
      <div className="titlebar-no-drag flex items-center gap-2 shrink-0 pl-3">
        <button
          type="button"
          onClick={handleClose}
          className="titlebar-traffic titlebar-traffic-close group"
          aria-label={t("sshTerminal.closeWindow")}
        >
          <span className="titlebar-traffic-icon" aria-hidden>
            &#x2715;
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            void getCurrentWindow().minimize();
          }}
          className="titlebar-traffic titlebar-traffic-minimize group"
          aria-label="Minimize"
        >
          <span className="titlebar-traffic-icon" aria-hidden>
            &#x2212;
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            void getCurrentWindow().toggleMaximize();
          }}
          className="titlebar-traffic titlebar-traffic-maximize group"
          aria-label="Maximize"
        >
          <span className="titlebar-traffic-icon titlebar-traffic-icon-max" aria-hidden>
            &#x25FB;
          </span>
        </button>
      </div>

      <div
        className="titlebar-drag flex-1 min-w-8 flex items-center px-1"
        data-tauri-drag-region
        onMouseDown={startWindowDrag}
      >
        <span className="text-sm font-medium text-fg truncate">{t("sshTerminal.title")}</span>
        <span className="text-xs text-fg-faint ml-2 hidden sm:inline">{t("sshTerminal.detachedHint")}</span>
      </div>

      <div className="titlebar-no-drag flex items-center gap-2 pr-3 shrink-0">
        <button type="button" className="ui-ssh-terminal-tool-btn" onClick={handleAttach}>
          {t("sshTerminal.attach")}
        </button>
      </div>
    </header>
  );
}
