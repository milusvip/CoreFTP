import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { connectServerWithHostKey } from "../utils/sshInvoke";
import { promptHostKeyTrust } from "../utils/hostKeyPrompt";
import { usesSshTransport } from "../utils/protocol";
import type { SiteConfig, SiteCategory, SiteSession, ConnectionStatus, FileEntry } from "../types";

function isConnectionLostError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    msg.includes("未连接到服务器") ||
    msg.includes("连接已断开") ||
    msg.includes("连接超时") ||
    lower.includes("connection reset") ||
    lower.includes("connection aborted") ||
    lower.includes("connection refused") ||
    lower.includes("broken pipe") ||
    lower.includes("forcibly closed") ||
    lower.includes("session terminated") ||
    lower.includes("socket is not connected")
  );
}

interface SiteStore {
  sites: SiteConfig[];
  categories: SiteCategory[];
  sessions: Record<string, SiteSession>;
  activeSiteId: string | null;
  localPath: string;
  localFiles: FileEntry[];
  remoteFiles: FileEntry[];

  loadSites: () => Promise<void>;
  saveSite: (site: SiteConfig) => Promise<void>;
  deleteSite: (id: string) => Promise<void>;
  saveCategory: (category: SiteCategory) => Promise<SiteCategory>;
  deleteCategory: (id: string) => Promise<void>;
  setActiveSite: (id: string | null) => void;
  connectSite: (id: string, options?: { force?: boolean }) => Promise<void>;
  disconnectSite: (id: string) => Promise<void>;
  /** 确保站点可传输：校验后端连接池，必要时重连；可自动切换到已连接站点 */
  ensureSiteConnected: (preferredId?: string | null) => Promise<string | null>;
  refreshRemoteFiles: (path?: string) => Promise<boolean>;
  refreshLocalFiles: (path?: string) => Promise<void>;
  setLocalPath: (path: string) => void;
  setRemotePath: (path: string) => void;
  /** 等待站点连接完成（最多 timeoutMs 毫秒） */
  waitForConnected: (id: string, timeoutMs?: number) => Promise<boolean>;
}

/** 界面显示已连接但连接池无条目时，强制重连 */
async function ensureBackendConnection(siteId: string): Promise<boolean> {
  const session = useSiteStore.getState().sessions[siteId];
  if (!session) return false;
  if (session.status === "connecting") {
    return useSiteStore.getState().waitForConnected(siteId, 20000);
  }
  if (session.status !== "connected") return false;

  try {
    const inPool = await invoke<boolean>("check_server_connection", { siteId });
    if (inPool) return true;
  } catch {
    /* 检测失败则尝试重连 */
  }

  await useSiteStore.getState().connectSite(siteId, { force: true });
  return useSiteStore.getState().waitForConnected(siteId, 20000);
}

async function listRemoteOnce(siteId: string, path: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>("list_remote_files", { siteId, path });
}

export const useSiteStore = create<SiteStore>((set, get) => ({
  sites: [],
  categories: [],
  sessions: {},
  activeSiteId: null,
  localPath: "",
  localFiles: [],
  remoteFiles: [],

  loadSites: async () => {
    try {
      const [sites, categories] = await Promise.all([
        invoke<SiteConfig[]>("list_sites"),
        invoke<SiteCategory[]>("list_categories"),
      ]);
      set({ sites, categories });
    } catch (e) {
      console.error("Failed to load sites:", e);
    }
  },

  saveSite: async (site) => {
    await invoke("save_site", { site });
    const [sites, categories] = await Promise.all([
      invoke<SiteConfig[]>("list_sites"),
      invoke<SiteCategory[]>("list_categories"),
    ]);
    set({ sites, categories });
  },

  deleteSite: async (id) => {
    try {
      await invoke("delete_site", { id });
      set((state) => ({
        sites: state.sites.filter((s) => s.id !== id),
        activeSiteId: state.activeSiteId === id ? null : state.activeSiteId,
      }));
    } catch (e) {
      console.error("Failed to delete site:", e);
    }
  },

  saveCategory: async (category) => {
    const saved = await invoke<SiteCategory>("save_category", { category });
    set((state) => {
      const exists = state.categories.some((c) => c.id === saved.id);
      const categories = exists
        ? state.categories.map((c) => (c.id === saved.id ? saved : c))
        : [...state.categories, saved];
      return { categories };
    });
    return saved;
  },

  deleteCategory: async (id) => {
    await invoke("delete_category", { id });
    set((state) => ({
      categories: state.categories.filter((c) => c.id !== id),
      sites: state.sites.map((s) =>
        s.categoryId === id ? { ...s, categoryId: undefined } : s,
      ),
    }));
  },

  setActiveSite: (id) => {
    const state = get();
    if (id === state.activeSiteId) return;

    // 如果新站点已连接且有会话，刷新远程文件；否则清空
    const session = id ? state.sessions[id] : null;
    if (session?.status === "connected" && session.currentPath) {
      set({ activeSiteId: id });
      // 异步加载文件，不阻塞状态更新
      invoke<FileEntry[]>("list_remote_files", {
        siteId: id,
        path: session.currentPath,
      })
        .then((files) => {
          const current = get();
          // 只在 activeSiteId 未变时更新
          if (get().activeSiteId === id) {
            set({ remoteFiles: files });
          }
        })
        .catch(() => set({ remoteFiles: [] }));
    } else {
      set({ activeSiteId: id, remoteFiles: [] });
    }
  },

  connectSite: async (id, options) => {
    const site = get().sites.find((s) => s.id === id);
    if (!site) return;

    const force = options?.force ?? false;
    const existing = get().sessions[id];
    if (!force && (existing?.status === "connected" || existing?.status === "connecting")) {
      return;
    }

    if (force && existing?.status === "connected") {
      try {
        await invoke("disconnect_server", { siteId: id });
      } catch {
        /* ignore */
      }
    }

    set((state) => ({
      activeSiteId: id,
      sessions: {
        ...state.sessions,
        [id]: { siteId: id, status: "connecting", currentPath: site.defaultRemotePath || "/" },
      },
    }));

    try {
      if (usesSshTransport(site.protocol)) {
        await connectServerWithHostKey(site, promptHostKeyTrust);
      } else {
        await invoke("connect_server", { config: site, trustNewHost: true });
      }
      const session = { siteId: id, status: "connected" as ConnectionStatus, currentPath: site.defaultRemotePath || "/" };
      set((state) => ({
        activeSiteId: id,
        sessions: { ...state.sessions, [id]: session },
      }));
      // Refresh remote files
      try {
        const files = await invoke<FileEntry[]>("list_remote_files", {
          siteId: id,
          path: site.defaultRemotePath || "/",
        });
        set({ remoteFiles: files });
      } catch (e) {
        console.error("Failed to list remote files:", e);
        set({ remoteFiles: [] });
      }
    } catch (e) {
      const errMsg = typeof e === "string" ? e : "连接失败";
      set((state) => ({
        sessions: {
          ...state.sessions,
          [id]: { siteId: id, status: "error", currentPath: "/", error: errMsg },
        },
      }));
    }
  },

  ensureSiteConnected: async (preferredId) => {
    const tryConnect = async (siteId: string, force: boolean) => {
      await get().connectSite(siteId, { force });
      return get().waitForConnected(siteId, 20000);
    };

    const pick = async (siteId: string, session: SiteSession | undefined) => {
      if (!session) return null;

      if (session.status === "connected") {
        if (get().activeSiteId !== siteId) {
          set({ activeSiteId: siteId });
        }
        return siteId;
      }

      if (session.status === "connecting") {
        const ok = await get().waitForConnected(siteId, 20000);
        if (ok) {
          set({ activeSiteId: siteId });
          return siteId;
        }
        return null;
      }

      if (await tryConnect(siteId, false)) {
        set({ activeSiteId: siteId });
        return siteId;
      }
      return null;
    };

    const state = get();
    const candidate = preferredId ?? state.activeSiteId;

    if (candidate) {
      const picked = await pick(candidate, state.sessions[candidate]);
      if (picked) return picked;
    }

    for (const [siteId, session] of Object.entries(state.sessions)) {
      if (siteId === candidate) continue;
      const picked = await pick(siteId, session);
      if (picked) {
        if (get().activeSiteId === picked) {
          void get().refreshRemoteFiles();
        }
        return picked;
      }
    }

    return null;
  },

  disconnectSite: async (id) => {
    set((state) => ({
      sessions: {
        ...state.sessions,
        [id]: { siteId: id, status: "disconnected", currentPath: "/" },
      },
      remoteFiles: state.activeSiteId === id ? [] : state.remoteFiles,
    }));
    try {
      await invoke("disconnect_server", { siteId: id });
    } catch (e) {
      console.error("Failed to disconnect:", e);
    }
  },

  refreshRemoteFiles: async (path) => {
    const { activeSiteId: id } = get();
    if (!id) return false;

    const session = get().sessions[id];
    if (session?.status !== "connected" && session?.status !== "connecting") {
      return false;
    }

    if (!(await ensureBackendConnection(id))) {
      return false;
    }

    const targetPath = path || get().sessions[id]?.currentPath || "/";

    const applyListError = (msg: string) => {
      if (!isConnectionLostError(msg)) return false;
      set((state) => ({
        remoteFiles: state.activeSiteId === id ? [] : state.remoteFiles,
        sessions: {
          ...state.sessions,
          [id]: {
            siteId: id,
            status: "error" as ConnectionStatus,
            currentPath: "/",
            error: msg.includes("连接已断开") || msg.includes("连接超时")
              ? msg
              : "连接已断开，请重新连接",
          },
        },
      }));
      void invoke("disconnect_server", { siteId: id }).catch(() => {});
      return true;
    };

    try {
      const files = await listRemoteOnce(id, targetPath);
      set((state) => ({
        remoteFiles: files,
        sessions: {
          ...state.sessions,
          [id]: { ...state.sessions[id], currentPath: targetPath, status: "connected" },
        },
      }));
      return true;
    } catch (e) {
      const msg = typeof e === "string" ? e : String(e);
      console.error("Failed to refresh remote files:", e);

      if (isConnectionLostError(msg)) {
        if (await ensureBackendConnection(id)) {
          try {
            const files = await listRemoteOnce(id, targetPath);
            set((state) => ({
              remoteFiles: files,
              sessions: {
                ...state.sessions,
                [id]: { ...state.sessions[id], currentPath: targetPath, status: "connected" },
              },
            }));
            return true;
          } catch (retryErr) {
            const retryMsg = typeof retryErr === "string" ? retryErr : String(retryErr);
            if (applyListError(retryMsg)) return false;
          }
        } else if (applyListError(msg)) {
          return false;
        }
      }
      return false;
    }
  },

  refreshLocalFiles: async (path) => {
    const targetPath = path || get().localPath;
    if (!targetPath) return;
    try {
      const files = await invoke<FileEntry[]>("list_local_files", {
        pathStr: targetPath,
      });
      set((state) => ({
        localFiles: files,
        localPath: targetPath,
      }));
    } catch (e) {
      console.error("Failed to list local files:", e);
    }
  },

  setLocalPath: (path) => set({ localPath: path }),
  setRemotePath: (path) => {
    const id = get().activeSiteId;
    if (!id) return;
    set((state) => ({
      sessions: {
        ...state.sessions,
        [id]: { ...state.sessions[id], currentPath: path },
      },
    }));
  },

  waitForConnected: (id, timeoutMs = 15000) => {
    return new Promise((resolve) => {
      const existing = get().sessions[id]?.status;
      if (existing === "connected") { resolve(true); return; }
      if (existing === "error") { resolve(false); return; }
      const timer = setTimeout(() => { unsub(); resolve(false); }, timeoutMs);
      const unsub = useSiteStore.subscribe((state) => {
        const s = state.sessions[id]?.status;
        if (s === "connected") { clearTimeout(timer); unsub(); resolve(true); }
        else if (s === "error") { clearTimeout(timer); unsub(); resolve(false); }
      });
    });
  },
}));
