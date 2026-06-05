import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useT } from "../i18n";
import TerminalTitleBar from "./TerminalTitleBar";
import TerminalWorkspace from "./TerminalWorkspace";
import { useSiteStore } from "../stores/siteStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useTerminalStore } from "../stores/terminalStore";
import { closeTerminalWindow } from "../utils/terminalWindow";
import { confirmCloseTerminalWindow } from "../utils/terminalCloseConfirm";
import GlobalDialogs from "./GlobalDialogs";
import {
  applyTheme,
  cacheTheme,
  normalizeAppearance,
  normalizeThemeId,
  watchSystemAppearance,
} from "../theme";

export default function TerminalWindowApp() {
  const t = useT();
  const initialized = useRef(false);
  const loadSites = useSiteStore((s) => s.loadSites);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const settings = useSettingsStore((s) => s.settings);
  const visible = useTerminalStore((s) => s.visible);
  const tabs = useTerminalStore((s) => s.tabs);
  const closeWorkspace = useTerminalStore((s) => s.closeWorkspace);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void loadSites();
    void loadSettings();
  }, [loadSites, loadSettings]);

  const appearance = normalizeAppearance(settings.appearance);
  const themeId = normalizeThemeId(settings.theme);

  useEffect(() => {
    applyTheme(appearance, themeId);
    cacheTheme({ appearance, theme: themeId });
    return watchSystemAppearance(appearance, themeId, () => {});
  }, [appearance, themeId]);

  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void win
      .onCloseRequested(async (event) => {
        if (useTerminalStore.getState().attachingToMain) return;
        event.preventDefault();
        const ok = await confirmCloseTerminalWindow();
        if (!ok) return;
        closeWorkspace();
        void closeTerminalWindow();
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, [closeWorkspace]);

  const hasSession = visible && tabs.length > 0;

  return (
    <div className="h-screen flex flex-col bg-app overflow-hidden">
      <GlobalDialogs />
      <TerminalTitleBar />
      {hasSession ? (
        <TerminalWorkspace mode="detached" />
      ) : (
        <div className="flex-1 flex items-center justify-center text-fg-subtle text-sm px-6 text-center">
          {t("sshTerminal.waitingForSession")}
        </div>
      )}
    </div>
  );
}
