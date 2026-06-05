import { emit, listen } from "@tauri-apps/api/event";
import { useTerminalStore, type TerminalHost, type TerminalTab } from "../stores/terminalStore";

const SYNC_EVENT = "terminal-state-sync";

export interface PersistedTerminalState {
  visible: boolean;
  expanded: boolean;
  tabs: TerminalTab[];
  activeTabId: string | null;
  fullscreen: boolean;
  host: TerminalHost;
}

let applyingRemote = false;

function snapshot(state: {
  visible: boolean;
  expanded: boolean;
  tabs: TerminalTab[];
  activeTabId: string | null;
  fullscreen: boolean;
  host: TerminalHost;
}): PersistedTerminalState {
  return {
    visible: state.visible,
    expanded: state.expanded,
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    fullscreen: state.fullscreen,
    host: state.host,
  };
}

export function initTerminalStoreSync(): () => void {
  let unlisten: (() => void) | undefined;

  void listen<PersistedTerminalState>(SYNC_EVENT, (event) => {
    applyingRemote = true;
    useTerminalStore.setState(event.payload);
    applyingRemote = false;
  }).then((fn) => {
    unlisten = fn;
  });

  const unsub = useTerminalStore.subscribe((state) => {
    if (applyingRemote) return;
    void emit(SYNC_EVENT, snapshot(state));
  });

  return () => {
    unsub();
    unlisten?.();
  };
}

export function broadcastTerminalState(): void {
  const state = useTerminalStore.getState();
  void emit(SYNC_EVENT, snapshot(state));
}
