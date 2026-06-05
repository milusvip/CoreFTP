import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface AppSettings {
  defaultLocalPath?: string;
  connectTimeoutSecs: number;
  ftpPassive: boolean;
  ftpEncoding: string;
  persistTransferQueue: boolean;
  maxLogEntries: number;
  /** dark | light | system */
  appearance?: string;
  /** default | ocean | forest | sunset | rose | mono */
  theme?: string;
}

export interface LogEntry {
  level: string;
  message: string;
  timestamp: string;
}

export interface Bookmark {
  id: string;
  label: string;
  path: string;
}

interface SettingsStore {
  settings: AppSettings;
  logs: LogEntry[];
  loaded: boolean;
  loadSettings: () => Promise<void>;
  saveSettings: (s: AppSettings) => Promise<void>;
  refreshLogs: () => Promise<void>;
  clearLogs: () => Promise<void>;
}

const defaultSettings: AppSettings = {
  connectTimeoutSecs: 30,
  ftpPassive: true,
  ftpEncoding: "utf8",
  persistTransferQueue: true,
  maxLogEntries: 500,
  appearance: "dark",
  theme: "default",
};

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: defaultSettings,
  logs: [],
  loaded: false,

  loadSettings: async () => {
    try {
      const settings = await invoke<AppSettings>("get_settings");
      set({ settings, loaded: true });
    } catch (e) {
      console.error(e);
      set({ loaded: true });
    }
  },

  saveSettings: async (settings) => {
    await invoke("save_settings", { settings });
    set({ settings });
  },

  refreshLogs: async () => {
    const logs = await invoke<LogEntry[]>("get_app_logs");
    set({ logs });
  },

  clearLogs: async () => {
    await invoke("clear_app_logs");
    set({ logs: [] });
  },
}));

export async function listBookmarks(siteId: string): Promise<Bookmark[]> {
  return invoke<Bookmark[]>("list_bookmarks", { siteId });
}

export async function addBookmark(siteId: string, label: string, path: string): Promise<Bookmark> {
  return invoke<Bookmark>("add_bookmark", { siteId, label, path });
}

export async function removeBookmark(siteId: string, bookmarkId: string): Promise<void> {
  await invoke("remove_bookmark", { siteId, bookmarkId });
}
