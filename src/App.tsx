import { useState, useCallback, useEffect, useRef } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { PhysicalPosition } from "@tauri-apps/api/dpi";
import Sidebar from "./components/Sidebar";
import FilePanel from "./components/FilePanel";
import TransferQueue from "./components/TransferQueue";
import ExtractDialog from "./components/ExtractDialog";
import OverwriteDialog from "./components/OverwriteDialog";
import SiteManagerDialog from "./components/SiteManagerDialog";
import SitesPanel from "./components/SitesPanel";
import Toast, { type ToastShowOptions, type ToastVariant } from "./components/Toast";
import GlobalDialogs from "./components/GlobalDialogs";
import SettingsDialog from "./components/SettingsDialog";
import LogPanel from "./components/LogPanel";
import SyncDialog, { type SyncOptions } from "./components/SyncDialog";
import EditSessionBar from "./components/EditSessionBar";
import TerminalDock from "./components/TerminalDock";
import TerminalWorkspace from "./components/TerminalWorkspace";
import { usesSshTransport } from "./utils/protocol";
import TitleBar from "./components/TitleBar";
import { useSiteStore } from "./stores/siteStore";
import { useTerminalStore } from "./stores/terminalStore";
import { useUploadHighlightStore } from "./stores/uploadHighlightStore";
import { useTransferStore, genTaskId, joinRemotePath, joinLocalPath, dedupeLocalPaths } from "./stores/transferStore";
import { useDialogStore } from "./stores/dialogStore";
import { useSettingsStore, listBookmarks, addBookmark, removeBookmark, type Bookmark } from "./stores/settingsStore";
import { findBookmarkAtPath } from "./utils/remotePath";
import { useI18n, useT } from "./i18n";
import {
  applyTheme,
  cacheTheme,
  normalizeAppearance,
  normalizeThemeId,
  watchSystemAppearance,
  type Appearance,
} from "./theme";
import { invoke } from "@tauri-apps/api/core";
import { remoteFullPath, localFullPath, remoteDirname, parentPath, isListableEntry, sortEntriesForDelete, dedupeEntriesByPath } from "./utils/paths";
import { physicalDropToViewport, resolveDropPanel } from "./utils/dropTarget";
import type { SiteConfig, FileEntry, ExtractOptions } from "./types";

export default function App() {
  const [showSitesPanel, setShowSitesPanel] = useState(false);
  const [showSiteManager, setShowSiteManager] = useState(false);
  const [editingSite, setEditingSite] = useState<SiteConfig | null>(null);
  const [defaultCategoryId, setDefaultCategoryId] = useState<string | undefined>();
  const [extractTarget, setExtractTarget] = useState<{ name: string; path: string; localPath: string; isRemote?: boolean } | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [localCollapsed, setLocalCollapsed] = useState(true);
  const [localSearchResults, setLocalSearchResults] = useState<FileEntry[] | null>(null);
  const [dropHighlight, setDropHighlight] = useState<"local" | "remote" | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: ToastVariant } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const openTerminal = useTerminalStore((s) => s.openTerminal);
  const openTerminalDetached = useTerminalStore((s) => s.openTerminalDetached);
  const waitForConnected = useSiteStore((s) => s.waitForConnected);
  const terminalHost = useTerminalStore((s) => s.host);
  const [remoteSearchResults, setRemoteSearchResults] = useState<FileEntry[] | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [editSession, setEditSession] = useState<{ localPath: string; remotePath: string } | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const showConfirm = useDialogStore((s) => s.showConfirm);
  const showPrompt = useDialogStore((s) => s.showPrompt);
  const initialized = useRef(false);
  const localPanelRef = useRef<HTMLDivElement>(null);
  const remotePanelRef = useRef<HTMLDivElement>(null);
  const scaleFactorRef = useRef(1);
  const localSearchGen = useRef(0);
  const remoteSearchGen = useRef(0);
  const localPathRef = useRef("");
  const handleDropToRemoteRef = useRef<(paths: string[]) => Promise<boolean>>(async () => false);
  const handleDropToLocalRef = useRef<(paths: string[]) => Promise<void>>(async () => {});
  const resolveDropTargetRef = useRef<(position: PhysicalPosition) => "local" | "remote">(() => "local");
  const showToastRef = useRef<(message: string, variant?: ToastVariant, options?: ToastShowOptions) => void>(() => {});

  const t = useT();
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);

  const sites = useSiteStore((s) => s.sites);
  const sessions = useSiteStore((s) => s.sessions);
  const activeSiteId = useSiteStore((s) => s.activeSiteId);
  const localPath = useSiteStore((s) => s.localPath);
  const localFiles = useSiteStore((s) => s.localFiles);
  const remoteFiles = useSiteStore((s) => s.remoteFiles);
  const loadSites = useSiteStore((s) => s.loadSites);
  const saveSite = useSiteStore((s) => s.saveSite);
  const refreshRemoteFiles = useSiteStore((s) => s.refreshRemoteFiles);
  const refreshLocalFiles = useSiteStore((s) => s.refreshLocalFiles);
  const setLocalPath = useSiteStore((s) => s.setLocalPath);
  const connectSite = useSiteStore((s) => s.connectSite);
  const ensureSiteConnected = useSiteStore((s) => s.ensureSiteConnected);
  const uploadPaths = useTransferStore((s) => s.uploadPaths);
  const uploadFile = useTransferStore((s) => s.uploadFile);
  const downloadFile = useTransferStore((s) => s.downloadFile);
  const downloadPaths = useTransferStore((s) => s.downloadPaths);
  const persistQueue = useTransferStore((s) => s.persistQueue);
  const restoreQueue = useTransferStore((s) => s.restoreQueue);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const saveSettings = useSettingsStore((s) => s.saveSettings);
  const settings = useSettingsStore((s) => s.settings);
  const uploadAndExtract = useTransferStore((s) => s.uploadAndExtract);
  const addTask = useTransferStore((s) => s.addTask);
  const updateTask = useTransferStore((s) => s.updateTask);
  const remoteUploadHighlights = useUploadHighlightStore((s) => s.remoteHighlights);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "info", options?: ToastShowOptions) => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      setToast({ message, variant });
      if (!options?.persist) {
        toastTimerRef.current = setTimeout(() => {
          setToast(null);
          toastTimerRef.current = null;
        }, options?.durationMs ?? 4000);
      }
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const requireConnection = useCallback(() => {
    const state = useSiteStore.getState();
    if (state.activeSiteId && state.sessions[state.activeSiteId]?.status === "connected") {
      return true;
    }
    const connected = Object.entries(state.sessions).find(([, s]) => s.status === "connected");
    if (connected) {
      const [id] = connected;
      if (state.activeSiteId !== id) {
        useSiteStore.getState().setActiveSite(id);
      }
      return true;
    }
    showToast(t("error.notConnected"), "error");
    return false;
  }, [showToast, t]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused) return;
        const { activeSiteId: id, sessions: ss, refreshRemoteFiles: refresh } = useSiteStore.getState();
        if (id && ss[id]?.status === "connected") {
          void refresh().then((ok) => {
            if (!ok) {
              const st = useSiteStore.getState().sessions[id];
              if (st?.status === "error") {
                showToast(st.error || t("error.connectionLost"), "error");
              }
            }
          });
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, [showToast, t]);

  // Initialize
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    loadSites();
    loadSettings().then(() => {
      restoreQueue();
      const def = useSettingsStore.getState().settings.defaultLocalPath;
      const pathPromise = def
        ? Promise.resolve(def)
        : invoke<string>("get_home_dir");
      pathPromise
        .then((home) => {
          setLocalPath(home);
          return invoke<FileEntry[]>("list_local_files", { pathStr: home });
        })
        .then((files) => useSiteStore.setState({ localFiles: files }))
        .catch(console.error);
    });

    getCurrentWindow()
      .scaleFactor()
      .then((f) => { scaleFactorRef.current = f; })
      .catch(console.error);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F12") {
        console.log("[CoreFTP] DevTools opened via F12 (WebView2 built-in)");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!settings.persistTransferQueue) return;
    return useTransferStore.subscribe(() => {
      persistQueue().catch(console.error);
    });
  }, [settings.persistTransferQueue, persistQueue]);

  const appearance = normalizeAppearance(settings.appearance);
  const themeId = normalizeThemeId(settings.theme);

  useEffect(() => {
    applyTheme(appearance, themeId);
    cacheTheme({ appearance, theme: themeId });
    return watchSystemAppearance(appearance, themeId, () => {});
  }, [appearance, themeId]);

  const toggleAppearance = useCallback(async () => {
    const current = normalizeAppearance(settings.appearance);
    const next: Appearance =
      current === "light" ? "dark" : current === "dark" ? "light" : appearance === "light" ? "dark" : "light";
    const updated = { ...settings, appearance: next };
    applyTheme(next, themeId);
    cacheTheme({ appearance: next, theme: themeId });
    await saveSettings(updated);
  }, [settings, appearance, themeId, saveSettings]);

  const handleDropToRemote = useCallback(async (paths: string[]) => {
    const siteId = await ensureSiteConnected(useSiteStore.getState().activeSiteId);
    if (!siteId) {
      showToast(t("error.notConnected"), "error");
      return false;
    }
    const remoteBase = useSiteStore.getState().sessions[siteId]?.currentPath || "/";
    const uniquePaths = dedupeLocalPaths(paths);
    if (uniquePaths.length === 0) return false;
    const { uploaded } = await uploadPaths(siteId, uniquePaths, remoteBase);
    if (uploaded > 0) {
      showToast(t("toast.uploadDone", { count: String(uploaded) }));
      await refreshRemoteFiles();
    }
    return true;
  }, [ensureSiteConnected, uploadPaths, refreshRemoteFiles, showToast, t]);

  const handleDropToLocal = useCallback(async (paths: string[]) => {
    if (!localPath) return;
    try {
      const count = await invoke<number>("copy_local_files", { targetDir: localPath, paths });
      if (count > 0) {
        showToast(t("toast.copyDone", { count: String(count) }));
        const files = await invoke<FileEntry[]>("list_local_files", { pathStr: localPath });
        useSiteStore.setState({ localFiles: files });
      }
    } catch (e) {
      console.error(e);
      showToast(String(e));
    }
  }, [localPath, showToast, t]);

  const resolveDropTarget = useCallback((position: PhysicalPosition): "local" | "remote" => {
    const { x, y } = physicalDropToViewport(position, scaleFactorRef.current);

    const inRect = (el: HTMLDivElement | null) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };

    if (inRect(remotePanelRef.current)) return "remote";
    if (inRect(localPanelRef.current)) return "local";

    const fromDom = resolveDropPanel(x, y);
    if (fromDom) return fromDom;

    const anyConnected = Object.values(useSiteStore.getState().sessions).some(
      (s) => s.status === "connected",
    );
    return anyConnected ? "remote" : "local";
  }, []);

  localPathRef.current = localPath;
  handleDropToRemoteRef.current = handleDropToRemote;
  handleDropToLocalRef.current = handleDropToLocal;
  resolveDropTargetRef.current = resolveDropTarget;
  showToastRef.current = showToast;

  // Tauri drag & drop — 只注册一次，避免重复监听导致同一文件上传多次
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") {
          setDropHighlight(resolveDropTargetRef.current(payload.position));
        } else if (payload.type === "leave") {
          setDropHighlight(null);
        } else if (payload.type === "drop") {
          const target = resolveDropTargetRef.current(payload.position);
          setDropHighlight(null);
          const paths = payload.paths;
          if (!paths.length) return;

          if (target === "remote") {
            void handleDropToRemoteRef.current(paths).then((ok) => {
              if (!ok && localPathRef.current) {
                void handleDropToLocalRef.current(paths).then(() => {
                  showToastRef.current(useI18n.getState().t("toast.dropFallbackLocal"), "info");
                });
              }
            });
          } else {
            void handleDropToLocalRef.current(paths);
          }
        }
      })
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch(console.error);

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const handleUploadFiles = useCallback(async (files: FileEntry[]) => {
    const siteId = await ensureSiteConnected(useSiteStore.getState().activeSiteId);
    if (!siteId) {
      showToast(t("error.notConnected"), "error");
      return;
    }
    const remoteBase = useSiteStore.getState().sessions[siteId]?.currentPath || "/";
    let uploaded = 0;
    const seen = new Set<string>();

    for (const file of files) {
      if (file.name === "..") continue;
      const key = file.path.replace(/\\/g, "/").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (file.isDir) {
        const { uploaded: n } = await uploadPaths(siteId, [file.path], remoteBase);
        uploaded += n;
      } else {
        const remotePath = remoteFullPath(file, remoteBase);
        const ok = await uploadFile(siteId, file.path, remotePath, file.name);
        if (ok) uploaded += 1;
      }
    }

    if (uploaded > 0) {
      showToast(t("toast.uploadDone", { count: String(uploaded) }));
      await refreshRemoteFiles();
    }
  }, [activeSiteId, ensureSiteConnected, uploadPaths, uploadFile, refreshRemoteFiles, showToast, t]);

  const handleDownloadFiles = useCallback(async (files: FileEntry[]) => {
    if (!localPath) return;
    const siteId = await ensureSiteConnected(useSiteStore.getState().activeSiteId);
    if (!siteId) {
      showToast(t("error.notConnected"), "error");
      return;
    }
    const remoteBase = useSiteStore.getState().sessions[siteId]?.currentPath || "/";
    const paths: string[] = [];
    let singleFiles = 0;

    for (const file of files) {
      if (file.name === "..") continue;
      const remotePath = remoteFullPath(file, remoteBase);
      if (file.isDir) {
        paths.push(remotePath);
      } else {
        const localTarget = localFullPath(file, localPath);
        const ok = await downloadFile(siteId, remotePath, localTarget, file.name);
        if (ok) singleFiles += 1;
      }
    }

    if (paths.length > 0) {
      const n = await downloadPaths(siteId, paths, localPath);
      singleFiles += n;
    }

    if (singleFiles > 0) {
      const list = await invoke<FileEntry[]>("list_local_files", { pathStr: localPath });
      useSiteStore.setState({ localFiles: list });
      showToast(t("toast.downloadDone", { count: String(singleFiles) }), "success");
    }
  }, [activeSiteId, ensureSiteConnected, localPath, downloadFile, downloadPaths, showToast, t]);

  const handleDeleteFiles = useCallback(async (files: FileEntry[], panel: "local" | "remote") => {
    const targets = sortEntriesForDelete(
      dedupeEntriesByPath(files.filter(isListableEntry)),
    );
    if (targets.length === 0) return;

    const message =
      targets.length === 1
        ? t("context.deleteConfirm", { name: targets[0].name })
        : t("context.deleteConfirmMulti", { count: String(targets.length) });

    const ok = await showConfirm({
      title: t("context.delete"),
      message,
      danger: true,
      confirmLabel: t("context.delete"),
    });
    if (!ok) return;

    for (const file of targets) {
      try {
        if (panel === "local") {
          await invoke("delete_local_file", { path: file.path });
        } else if (activeSiteId) {
          const remoteBase = sessions[activeSiteId]?.currentPath || "/";
          await invoke("delete_remote_file", {
            siteId: activeSiteId,
            remotePath: remoteFullPath(file, remoteBase),
          });
        }
      } catch (e) {
        const msg = String(e);
        if (!msg.includes("no such file") && !msg.includes("No such file")) {
          showToast(msg, "error");
        }
      }
    }

    if (panel === "local" && localPath) {
      const list = await invoke<FileEntry[]>("list_local_files", { pathStr: localPath });
      useSiteStore.setState({ localFiles: list });
    } else if (activeSiteId) {
      await refreshRemoteFiles();
    }
  }, [activeSiteId, sessions, localPath, refreshRemoteFiles, showToast, showConfirm, t]);

  const handleRemoteNewFolder = useCallback(async () => {
    if (!requireConnection() || !activeSiteId) return;
    const name = await showPrompt({
      title: t("filepanel.newFolder"),
      label: t("filepanel.newFolderPrompt"),
      mode: "folderName",
      placeholder: t("filepanel.newFolderPlaceholder"),
    });
    if (!name) return;
    const remoteBase = sessions[activeSiteId]?.currentPath || "/";
    const path = joinRemotePath(remoteBase, name);
    try {
      await invoke("remote_mkdir", { siteId: activeSiteId, path });
      await refreshRemoteFiles();
      showToast(t("toast.folderCreated"), "success");
    } catch (e) {
      showToast(String(e), "error");
    }
  }, [activeSiteId, sessions, refreshRemoteFiles, requireConnection, showToast, showPrompt, t]);

  const handleLocalNewFolder = useCallback(async () => {
    if (!localPath) return;
    const name = await showPrompt({
      title: t("filepanel.newFolder"),
      label: t("filepanel.newFolderPrompt"),
      mode: "folderName",
      placeholder: t("filepanel.newFolderPlaceholder"),
    });
    if (!name) return;
    const path = joinLocalPath(localPath, name);
    try {
      await invoke("local_mkdir", { path });
      const list = await invoke<FileEntry[]>("list_local_files", { pathStr: localPath });
      useSiteStore.setState({ localFiles: list });
      showToast(t("toast.folderCreated"), "success");
    } catch (e) {
      showToast(String(e), "error");
    }
  }, [localPath, showToast, showPrompt, t]);

  const handleLocalRename = useCallback(async (file: FileEntry, newName: string) => {
    if (!localPath || file.name === "..") return;
    const fromPath = localFullPath(file, localPath);
    const toPath = joinLocalPath(parentPath(fromPath), newName);
    try {
      await invoke("local_rename", { fromPath, toPath });
      const list = await invoke<FileEntry[]>("list_local_files", { pathStr: localPath });
      useSiteStore.setState({ localFiles: list });
      showToast(t("toast.renamed"), "success");
    } catch (e) {
      showToast(String(e), "error");
    }
  }, [localPath, showToast, t]);

  const handleRemoteRename = useCallback(async (file: FileEntry, newName: string) => {
    if (!requireConnection() || !activeSiteId || file.name === "..") return;
    const remoteBase = sessions[activeSiteId]?.currentPath || "/";
    const fromPath = remoteFullPath(file, remoteBase);
    const toPath = joinRemotePath(remoteDirname(fromPath), newName);
    try {
      await invoke("remote_rename", { siteId: activeSiteId, fromPath, toPath });
      await refreshRemoteFiles();
      showToast(t("toast.renamed"), "success");
    } catch (e) {
      showToast(String(e), "error");
    }
  }, [activeSiteId, sessions, refreshRemoteFiles, requireConnection, showToast, t]);

  const handleDeepSearch = useCallback(async (query: string) => {
    if (!localPath) return;
    const gen = ++localSearchGen.current;
    setLocalLoading(true);
    try {
      const results = await invoke<FileEntry[]>("search_local_files", { rootPath: localPath, query });
      if (gen !== localSearchGen.current) return;
      setLocalSearchResults(results);
    } catch (e) {
      if (gen !== localSearchGen.current) return;
      showToast(String(e), "error");
    } finally {
      if (gen === localSearchGen.current) {
        setLocalLoading(false);
      }
    }
  }, [localPath, showToast]);

  const handleRemoteDeepSearch = useCallback(async (query: string) => {
    if (!requireConnection() || !activeSiteId) return;
    const gen = ++remoteSearchGen.current;
    const root = sessions[activeSiteId]?.currentPath || "/";
    setRemoteLoading(true);
    try {
      const results = await invoke<FileEntry[]>("search_remote_files", {
        siteId: activeSiteId, rootPath: root, query,
      });
      if (gen !== remoteSearchGen.current) return;
      setRemoteSearchResults(results);
    } catch (e) {
      if (gen !== remoteSearchGen.current) return;
      showToast(String(e), "error");
    } finally {
      if (gen === remoteSearchGen.current) {
        setRemoteLoading(false);
      }
    }
  }, [activeSiteId, sessions, requireConnection, showToast]);

  const loadBookmarks = useCallback(async () => {
    if (!activeSiteId) return;
    try {
      setBookmarks(await listBookmarks(activeSiteId));
    } catch {
      setBookmarks([]);
    }
  }, [activeSiteId]);

  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  const handleToggleBookmark = useCallback(async () => {
    if (!activeSiteId) return;
    const path = sessions[activeSiteId]?.currentPath || "/";
    const existing = findBookmarkAtPath(bookmarks, path);
    if (existing) {
      const ok = await showConfirm({
        title: t("bookmark.remove"),
        message: t("bookmark.removeConfirm", { name: existing.label }),
        danger: true,
        confirmLabel: t("bookmark.remove"),
      });
      if (!ok) return;
      await removeBookmark(activeSiteId, existing.id);
      await loadBookmarks();
      showToast(t("bookmark.removed"), "success");
      return;
    }
    const label = await showPrompt({
      title: t("bookmark.add"),
      label: t("bookmark.label"),
      defaultValue: path.split("/").filter(Boolean).pop() || "root",
    });
    if (!label) return;
    await addBookmark(activeSiteId, label, path);
    await loadBookmarks();
    showToast(t("bookmark.saved"), "success");
  }, [activeSiteId, sessions, bookmarks, showPrompt, showConfirm, loadBookmarks, showToast, t]);

  const handleRemoveBookmark = useCallback(
    async (bookmarkId: string) => {
      if (!activeSiteId) return;
      const bm = bookmarks.find((b) => b.id === bookmarkId);
      if (!bm) return;
      const ok = await showConfirm({
        title: t("bookmark.remove"),
        message: t("bookmark.removeConfirm", { name: bm.label }),
        danger: true,
        confirmLabel: t("bookmark.remove"),
      });
      if (!ok) return;
      await removeBookmark(activeSiteId, bookmarkId);
      await loadBookmarks();
      showToast(t("bookmark.removed"), "success");
    },
    [activeSiteId, bookmarks, showConfirm, loadBookmarks, showToast, t],
  );

  const handleSync = useCallback(async (opts: SyncOptions) => {
    if (!requireConnection() || !activeSiteId || !localPath) return;
    setShowSync(false);
    const remoteBase = sessions[activeSiteId]?.currentPath || "/";
    const taskId = genTaskId();
    try {
      const result = await invoke<{ uploaded: number; downloaded: number; deleted: number; errors: string[] }>("sync_mirror", {
        options: {
          siteId: activeSiteId,
          localRoot: localPath,
          remoteRoot: remoteBase,
          direction: opts.direction,
          deleteExtra: opts.deleteExtra,
        },
        taskId,
      });
      showToast(
        t("sync.done", {
          up: String(result.uploaded),
          down: String(result.downloaded),
          deleted: String(result.deleted),
        }),
        result.errors.length ? "error" : "success",
      );
      await refreshRemoteFiles();
      if (localPath) await refreshLocalFiles(localPath);
    } catch (e) {
      showToast(String(e), "error");
    }
  }, [activeSiteId, localPath, sessions, requireConnection, refreshRemoteFiles, refreshLocalFiles, showToast, t]);

  const handleEditRemote = useCallback(async (file: FileEntry) => {
    if (!requireConnection() || !activeSiteId) return;
    const remoteBase = sessions[activeSiteId]?.currentPath || "/";
    const remotePath = remoteFullPath(file, remoteBase);
    try {
      const session = await invoke<{ localPath: string; remotePath: string }>("prepare_edit_remote", {
        siteId: activeSiteId,
        remotePath,
      });
      await invoke("open_path_with_default_app", { path: session.localPath });
      setEditSession({ localPath: session.localPath, remotePath: session.remotePath });
    } catch (e) {
      showToast(String(e), "error");
    }
  }, [activeSiteId, sessions, requireConnection, showToast]);

  const handleCommitEdit = useCallback(async () => {
    if (!editSession || !activeSiteId) return;
    try {
      await invoke("commit_edit_remote", {
        siteId: activeSiteId,
        remotePath: editSession.remotePath,
        localPath: editSession.localPath,
      });
      await invoke("cleanup_edit_session", { localPath: editSession.localPath });
      setEditSession(null);
      showToast(t("edit.saved"), "success");
      await refreshRemoteFiles();
    } catch (e) {
      showToast(String(e), "error");
    }
  }, [editSession, activeSiteId, refreshRemoteFiles, showToast, t]);

  const handleClearSearch = useCallback(() => {
    localSearchGen.current += 1;
    setLocalSearchResults(null);
    setLocalLoading(false);
  }, []);

  const handleClearRemoteSearch = useCallback(() => {
    remoteSearchGen.current += 1;
    setRemoteSearchResults(null);
    setRemoteLoading(false);
  }, []);

  useEffect(() => {
    if (!activeSiteId) return;
    if (sessions[activeSiteId]?.status === "disconnected") {
      handleClearRemoteSearch();
    }
  }, [activeSiteId, sessions, handleClearRemoteSearch]);

  const handleRefreshAll = useCallback(async () => {
    if (refreshingAll) return;
    setRefreshingAll(true);
    handleClearSearch();
    handleClearRemoteSearch();
    try {
      const tasks: Promise<void>[] = [];
      if (localPath) tasks.push(refreshLocalFiles(localPath));
      if (activeSiteId && sessions[activeSiteId]?.status === "connected") {
        tasks.push(
          (async () => {
            setRemoteLoading(true);
            try {
              const ok = await refreshRemoteFiles();
              if (!ok) {
                const st = useSiteStore.getState().sessions[activeSiteId];
                if (st?.status === "error") {
                  showToast(st.error || t("error.connectionLost"), "error");
                }
              }
            } finally {
              setRemoteLoading(false);
            }
          })(),
        );
      }
      await Promise.all(tasks);
    } catch (e) {
      console.error("Failed to refresh all:", e);
    } finally {
      setRefreshingAll(false);
    }
  }, [
    refreshingAll,
    localPath,
    activeSiteId,
    sessions,
    refreshLocalFiles,
    refreshRemoteFiles,
    handleClearSearch,
    handleClearRemoteSearch,
    showToast,
    t,
  ]);

  const handleLocalRefresh = useCallback(async () => {
    handleClearSearch();
    if (!localPath) return;
    setLocalLoading(true);
    try {
      await refreshLocalFiles(localPath);
    } finally {
      setLocalLoading(false);
    }
  }, [localPath, refreshLocalFiles, handleClearSearch]);

  const handleRemoteRefresh = useCallback(async () => {
    handleClearRemoteSearch();
    setRemoteLoading(true);
    try {
      const ok = await refreshRemoteFiles();
      if (!ok && activeSiteId && useSiteStore.getState().sessions[activeSiteId]?.status === "error") {
        const err = useSiteStore.getState().sessions[activeSiteId]?.error;
        showToast(err || t("error.connectionLost"), "error");
      }
    } finally {
      setRemoteLoading(false);
    }
  }, [activeSiteId, refreshRemoteFiles, handleClearRemoteSearch, showToast, t]);

  const handleLocalNavigate = useCallback(async (path: string) => {
    setLocalLoading(true);
    try {
      const files = await invoke<FileEntry[]>("list_local_files", { pathStr: path });
      useSiteStore.setState({ localFiles: files, localPath: path });
    } catch (e) {
      console.error("Failed to navigate:", e);
    }
    setLocalLoading(false);
  }, []);

  const handleRemoteNavigate = useCallback(async (path: string) => {
    if (!activeSiteId) return;
    setRemoteLoading(true);
    try {
      const ok = await refreshRemoteFiles(path);
      if (!ok && useSiteStore.getState().sessions[activeSiteId]?.status === "error") {
        const err = useSiteStore.getState().sessions[activeSiteId]?.error;
        showToast(err || t("error.connectionLost"), "error");
      }
    } finally {
      setRemoteLoading(false);
    }
  }, [activeSiteId, refreshRemoteFiles, showToast, t]);

  const handleExtract = useCallback((file: FileEntry) => {
    setExtractTarget({ name: file.name, path: file.path, localPath: file.path, isRemote: false });
  }, []);

  const handleRemoteExtract = useCallback((file: FileEntry) => {
    setExtractTarget({ name: file.name, path: file.path, localPath: file.path, isRemote: true });
  }, []);

  const handleConfirmExtract = useCallback((opts: ExtractOptions) => {
    if (!extractTarget || !activeSiteId) return;
    const site = sites.find((s) => s.id === activeSiteId);
    if (!site) return;

    const archiveName = extractTarget.name.split(/[\\/]/).pop() || extractTarget.name;
    const session = sessions[activeSiteId];
    const remoteBase = session?.currentPath || "/";
    const remoteArchivePath = opts.archivePath.replace(/\\/g, "/");

    if (extractTarget.isRemote) {
      const tid = genTaskId();
      addTask({
        id: tid, fileName: archiveName, localPath: "", remotePath: remoteArchivePath,
        destDir: opts.targetDir?.trim() || remoteDirname(remoteArchivePath),
        status: "extracting", progress: 50, isArchive: true,
      });
      invoke("extract_remote", {
        siteConfig: site, archivePath: remoteArchivePath,
        targetDir: opts.targetDir?.trim() || remoteDirname(remoteArchivePath),
        deleteAfter: opts.deleteAfter,
      })
        .then((r) => {
          const result = r as { success: boolean; error?: string };
          updateTask(tid, result.success ? { status: "done", progress: 100 } : { status: "error", progress: 100, error: result.error || t("error.extractFailed") });
          // 解压成功后刷新远程文件列表
          if (result.success) {
            void refreshRemoteFiles();
          }
        })
        .catch((e) => { updateTask(tid, { status: "error", progress: 0, error: String(e) }); });
    } else {
      const taskId = genTaskId();
      uploadAndExtract(site, extractTarget.localPath, remoteArchivePath, opts, taskId)
        .then(() => refreshRemoteFiles())
        .catch(() => {});
    }
    setExtractTarget(null);
  }, [extractTarget, activeSiteId, sites, sessions, uploadAndExtract, addTask, updateTask, refreshRemoteFiles, t]);

  const handleSaveSite = useCallback(async (site: SiteConfig) => {
    try {
      await saveSite(site);
      setShowSiteManager(false);
      setEditingSite(null);
      setDefaultCategoryId(undefined);
    } catch (e) {
      showToast(String(e));
    }
  }, [saveSite, showToast]);

  const handleOpenAddSite = useCallback((categoryId?: string) => {
    setEditingSite(null);
    setDefaultCategoryId(categoryId);
    setShowSiteManager(true);
  }, []);

  const handleOpenEditSite = useCallback((site: SiteConfig) => {
    setEditingSite(site);
    setDefaultCategoryId(undefined);
    setShowSiteManager(true);
    setShowSitesPanel(false);
  }, []);

  const activeSession = activeSiteId ? sessions[activeSiteId] : null;
  const activeSite = activeSiteId ? sites.find((s) => s.id === activeSiteId) : null;

  const handleOpenSshTerminal = useCallback(() => {
    if (!activeSiteId || !activeSite) return;
    if (!usesSshTransport(activeSite.protocol)) {
      showToast(t("sshTerminal.needSshSite"), "info");
      return;
    }
    if (activeSession?.status !== "connected") {
      showToast(t("error.notConnected"), "error");
      return;
    }
    openTerminal(activeSiteId);
  }, [activeSiteId, activeSite, activeSession?.status, showToast, t, openTerminal]);

  const handleOpenSshTerminalForSite = useCallback(
    async (site: SiteConfig) => {
      if (!usesSshTransport(site.protocol)) {
        showToast(t("sshTerminal.needSshSite"), "info");
        return;
      }
      useSiteStore.getState().setActiveSite(site.id);
      const session = useSiteStore.getState().sessions[site.id];
      if (session?.status !== "connected") {
        if (session?.status === "connecting") {
          const ok = await waitForConnected(site.id, 20000);
          if (!ok) {
            showToast(t("error.notConnected"), "error");
            return;
          }
        } else {
          await connectSite(site.id);
          const ok = await waitForConnected(site.id, 20000);
          if (!ok) {
            showToast(t("error.notConnected"), "error");
            return;
          }
        }
      }
      try {
        await openTerminalDetached(site.id);
      } catch {
        showToast(t("sshTerminal.detachFailed"), "error");
      }
    },
    [connectSite, waitForConnected, openTerminalDetached, showToast, t],
  );

  return (
    <div className="h-screen flex flex-col bg-app">
      <TitleBar
        appearance={appearance}
        lang={lang}
        onToggleAppearance={toggleAppearance}
        onOpenSettings={() => setShowSettings(true)}
        onOpenSites={() => setShowSitesPanel(true)}
        onSetLang={setLang}
      />

      <div className="ui-app-toolbar">
        {activeSession?.status === "connected" ? (
          <div className="ui-status-pill bg-green-500/10 text-green-400 border border-green-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span>{t("toolbar.connected")}{"\u00B7"}{sites.find((s) => s.id === activeSiteId)?.name || ""}</span>
          </div>
        ) : activeSession?.status === "connecting" ? (
          <div className="ui-status-pill bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
            {t("toolbar.connecting")}
          </div>
        ) : activeSession?.status === "error" ? (
          <div className="ui-status-pill bg-red-500/10 text-red-400 border border-red-500/20 max-w-md truncate" title={activeSession.error}>
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
            <span className="truncate">{activeSession.error || t("sidebar.error")}</span>
          </div>
        ) : (
          <div className="ui-status-pill bg-surface-light/50 text-fg-muted border border-surface-light/60">
            <span className="w-1.5 h-1.5 rounded-full bg-fg-faint" />
            {t("toolbar.disconnected")}
          </div>
        )}

        <div className="flex-1" />

        {(localPath || activeSession?.status === "connected") && (
          <button
            type="button"
            onClick={() => { void handleRefreshAll(); }}
            disabled={refreshingAll}
            className="ui-toolbar-btn disabled:opacity-50"
            title={t("toolbar.refreshAll")}
          >
            <svg
              className={`w-3.5 h-3.5 ${refreshingAll ? "animate-spin" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {t("toolbar.refreshAll")}
          </button>
        )}
      </div>

      <div className="flex-1 flex min-h-0">
        <Sidebar
          onAddSite={handleOpenAddSite}
          onEditSite={handleOpenEditSite}
          onOpenSshTerminal={(site) => void handleOpenSshTerminalForSite(site)}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex min-h-0">
            <FilePanel
              ref={localPanelRef}
              title={t("filepanel.local")}
              path={localPath}
              files={localSearchResults ?? localFiles}
              panelType="local"
              loading={localLoading}
              collapsed={localCollapsed}
              isSearchResult={localSearchResults !== null}
              isDropHighlight={dropHighlight === "local"}
              onNavigate={handleLocalNavigate}
              onRefresh={handleLocalRefresh}
              onExtract={handleExtract}
              onUploadFiles={handleUploadFiles}
              onDeleteFiles={(files) => handleDeleteFiles(files, "local")}
              onNewFolder={handleLocalNewFolder}
              onRenameFile={handleLocalRename}
              onToggleCollapse={() => setLocalCollapsed(!localCollapsed)}
              onDeepSearch={handleDeepSearch}
              onClearSearch={handleClearSearch}
            />
            <FilePanel
              ref={remotePanelRef}
              title={t("filepanel.remote")}
              path={activeSession?.status === "connected" ? (activeSession.currentPath || "/") : ""}
              files={
                activeSession?.status === "connected"
                  ? (remoteSearchResults ?? remoteFiles)
                  : []
              }
              panelType="remote"
              connectionStatus={activeSiteId ? (activeSession?.status ?? "disconnected") : "disconnected"}
              connectionError={activeSession?.status === "error" ? activeSession.error : undefined}
              loading={remoteLoading && activeSession?.status === "connected"}
              isSearchResult={remoteSearchResults !== null}
              isDropHighlight={dropHighlight === "remote"}
              onNavigate={handleRemoteNavigate}
              onRefresh={handleRemoteRefresh}
              onExtract={handleRemoteExtract}
              onDownloadFiles={handleDownloadFiles}
              onDeleteFiles={(files) => handleDeleteFiles(files, "remote")}
              onNewFolder={handleRemoteNewFolder}
              onRenameFile={handleRemoteRename}
              onDeepSearch={handleRemoteDeepSearch}
              onClearSearch={handleClearRemoteSearch}
              bookmarks={activeSession?.status === "connected" ? bookmarks : []}
              onBookmarkNavigate={activeSession?.status === "connected" ? handleRemoteNavigate : undefined}
              onBookmarkToggle={activeSession?.status === "connected" ? handleToggleBookmark : undefined}
              onBookmarkRemove={activeSession?.status === "connected" ? handleRemoveBookmark : undefined}
              isCurrentBookmarked={
                activeSession?.status === "connected" &&
                !!activeSession.currentPath &&
                !!findBookmarkAtPath(bookmarks, activeSession.currentPath)
              }
              onSync={() => setShowSync(true)}
              onOpenTerminal={
                activeSite && usesSshTransport(activeSite.protocol) && activeSession?.status === "connected"
                  ? handleOpenSshTerminal
                  : undefined
              }
              onEditFile={handleEditRemote}
              uploadHighlights={remoteUploadHighlights}
            />
          </div>
          {editSession && (
            <EditSessionBar
              fileName={editSession.remotePath.split("/").pop() || editSession.remotePath}
              onSave={() => void handleCommitEdit()}
              onCancel={() => setEditSession(null)}
            />
          )}
          <TerminalDock />
          <TransferQueue />
          <LogPanel />
        </div>
      </div>

      {extractTarget && (() => {
        const remoteBase = activeSession?.currentPath || "/";
        const fileEntry: FileEntry = {
          name: extractTarget.name,
          path: extractTarget.path,
          isDir: false,
          size: 0,
          modified: "",
        };
        const archivePath = extractTarget.isRemote
          ? remoteFullPath(fileEntry, remoteBase)
          : joinRemotePath(remoteBase, extractTarget.name);
        return (
          <ExtractDialog
            fileName={extractTarget.name}
            archivePath={archivePath}
            onConfirm={handleConfirmExtract}
            onCancel={() => setExtractTarget(null)}
          />
        );
      })()}

      <OverwriteDialog />
      <GlobalDialogs />

      {toast && (
        <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} />
      )}

      {showSitesPanel && (
        <SitesPanel
          onAddSite={handleOpenAddSite}
          onEditSite={handleOpenEditSite}
          onClose={() => setShowSitesPanel(false)}
        />
      )}

      {showSiteManager && (
        <SiteManagerDialog
          site={editingSite}
          defaultCategoryId={defaultCategoryId}
          onSave={handleSaveSite}
          onCancel={() => {
            setShowSiteManager(false);
            setEditingSite(null);
            setDefaultCategoryId(undefined);
          }}
        />
      )}

      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}

      {showSync && localPath && (
        <SyncDialog
          localPath={localPath}
          remotePath={activeSession?.currentPath || "/"}
          onConfirm={handleSync}
          onCancel={() => setShowSync(false)}
        />
      )}

      {terminalHost === "embedded" && (
        <TerminalWorkspace
          onDetachError={(message) => showToast(message, "error")}
        />
      )}
    </div>
  );
}
