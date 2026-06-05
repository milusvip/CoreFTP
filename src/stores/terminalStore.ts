import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { setPreserveTerminalCloseAll } from "../utils/terminalSessionPreserve";
import { closeTerminalWindow, focusTerminalWindow, openTerminalWindow } from "../utils/terminalWindow";
import { broadcastTerminalState } from "../utils/terminalStoreSync";

export interface TerminalTab {
  tabId: string;
  siteId: string;
}

export type TerminalHost = "embedded" | "detached";

interface TerminalStore {
  visible: boolean;
  expanded: boolean;
  tabs: TerminalTab[];
  activeTabId: string | null;
  fullscreen: boolean;
  host: TerminalHost;
  attachingToMain: boolean;

  openTerminal: (siteId: string) => void;
  /** 直接以独立窗口打开（不经过主窗口内嵌终端） */
  openTerminalDetached: (siteId: string) => Promise<void>;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  closeWorkspace: () => void;
  minimizeWorkspace: () => void;
  expandWorkspace: () => void;
  toggleFullscreen: () => void;
  detachToWindow: () => Promise<void>;
  attachToMain: () => Promise<void>;
}

function makeTabId(siteId: string): string {
  return `term-${siteId}`;
}

function tabIds(tabs: TerminalTab[]): string[] {
  return tabs.map((t) => t.tabId);
}

async function maybeCloseDetachedWindow(): Promise<void> {
  const { host, tabs } = useTerminalStore.getState();
  if (host === "detached" && tabs.length === 0) {
    await closeTerminalWindow();
  }
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  visible: false,
  expanded: true,
  tabs: [],
  activeTabId: null,
  fullscreen: false,
  host: "embedded",
  attachingToMain: false,

  openTerminal: (siteId) => {
    const tabId = makeTabId(siteId);
    const existing = get().tabs.find((t) => t.siteId === siteId);
    if (existing) {
      set({ visible: true, expanded: true, activeTabId: existing.tabId });
    } else {
      set((state) => ({
        visible: true,
        expanded: true,
        tabs: [...state.tabs, { tabId, siteId }],
        activeTabId: tabId,
      }));
    }
    if (get().host === "detached") {
      void focusTerminalWindow();
    }
  },

  openTerminalDetached: async (siteId) => {
    const tabId = makeTabId(siteId);
    const existing = get().tabs.find((t) => t.siteId === siteId);
    const tabs = existing
      ? get().tabs
      : [...get().tabs, { tabId, siteId }];

    set({
      visible: true,
      expanded: false,
      fullscreen: false,
      host: "detached",
      tabs,
      activeTabId: existing?.tabId ?? tabId,
    });
    broadcastTerminalState();

    const ids = tabIds(tabs);
    setPreserveTerminalCloseAll(ids, true);
    try {
      await openTerminalWindow();
      await focusTerminalWindow();
    } catch {
      setPreserveTerminalCloseAll(ids, false);
      set({ host: "embedded", expanded: true });
      throw new Error("detach failed");
    } finally {
      window.setTimeout(() => setPreserveTerminalCloseAll(ids, false), 300);
    }
  },

  closeTab: (tabId) => {
    set((state) => {
      const tabs = state.tabs.filter((t) => t.tabId !== tabId);
      const activeTabId =
        state.activeTabId === tabId ? (tabs[tabs.length - 1]?.tabId ?? null) : state.activeTabId;
      return {
        tabs,
        activeTabId,
        visible: tabs.length > 0 ? state.visible : false,
        expanded: tabs.length > 0 ? state.expanded : true,
        host: tabs.length > 0 ? state.host : "embedded",
        fullscreen: tabs.length > 0 ? state.fullscreen : false,
      };
    });
    void maybeCloseDetachedWindow();
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  closeWorkspace: () => {
    for (const tab of get().tabs) {
      void invoke("terminal_close", { tabId: tab.tabId }).catch(() => {});
    }
    const wasDetached = get().host === "detached";
    set({
      visible: false,
      expanded: true,
      tabs: [],
      activeTabId: null,
      fullscreen: false,
      host: "embedded",
    });
    if (wasDetached) {
      void closeTerminalWindow();
    }
  },

  minimizeWorkspace: () => set({ expanded: false, fullscreen: false }),

  expandWorkspace: () => {
    if (get().host === "detached") {
      void focusTerminalWindow();
      return;
    }
    set({ expanded: true });
  },

  toggleFullscreen: () => {
    if (get().host === "detached") {
      void getCurrentWindow().toggleMaximize();
      return;
    }
    set((s) => ({ fullscreen: !s.fullscreen }));
  },

  detachToWindow: async () => {
    const { tabs, host } = get();
    if (tabs.length === 0) return;
    if (host === "detached") {
      await focusTerminalWindow();
      return;
    }

    setPreserveTerminalCloseAll(tabIds(tabs), true);
    set({ host: "detached", expanded: true, fullscreen: false });
    broadcastTerminalState();

    try {
      await openTerminalWindow();
    } catch {
      setPreserveTerminalCloseAll(tabIds(tabs), false);
      set({ host: "embedded" });
      throw new Error("detach failed");
    } finally {
      window.setTimeout(() => setPreserveTerminalCloseAll(tabIds(tabs), false), 300);
    }
  },

  attachToMain: async () => {
    const { tabs } = get();
    if (tabs.length === 0) return;

    setPreserveTerminalCloseAll(tabIds(tabs), true);
    set({ attachingToMain: true, host: "embedded", expanded: false, fullscreen: false });
    broadcastTerminalState();

    await closeTerminalWindow();
    set({ attachingToMain: false });

    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const mainWin = await WebviewWindow.getByLabel("main");
      await mainWin?.show();
      await mainWin?.setFocus();
    } catch {
      /* ignore */
    }

    window.setTimeout(() => setPreserveTerminalCloseAll(tabIds(tabs), false), 300);
  },
}));
