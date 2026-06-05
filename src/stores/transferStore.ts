import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { TransferTask, ExtractOptions, SiteConfig, TransferRetryInfo, TransferStatus } from "../types";
import { remoteDirname } from "../utils/paths";
import { markRemoteArchiveUpload } from "./uploadHighlightStore";

export type OverwriteAction = "overwrite" | "skip" | "overwriteAll" | "skipAll" | "cancel";

export interface OverwriteDialogState {
  fileName: string;
  targetLabel: string;
}

interface TransferProgressPayload {
  taskId: string;
  transferred: number;
  total: number;
  speedBps: number;
}

interface TransferStore {
  tasks: TransferTask[];
  overwriteDialog: OverwriteDialogState | null;
  overwriteAll: boolean;
  skipAll: boolean;
  _overwriteResolver: ((action: OverwriteAction) => void) | null;

  addTask: (task: TransferTask) => void;
  updateTask: (id: string, updates: Partial<TransferTask>) => void;
  removeTask: (id: string) => void;
  clearDone: () => void;
  cancelTask: (taskId: string) => void;
  retryTask: (taskId: string) => Promise<void>;

  promptOverwrite: (fileName: string, targetLabel: string) => Promise<OverwriteAction>;
  resolveOverwrite: (action: OverwriteAction) => void;
  resetOverwriteFlags: () => void;

  uploadFile: (
    siteId: string,
    localPath: string,
    remotePath: string,
    fileName?: string,
  ) => Promise<boolean>;

  uploadPaths: (
    siteId: string,
    localPaths: string[],
    remoteBase: string,
  ) => Promise<{ uploaded: number; cancelled: boolean }>;

  downloadFile: (
    siteId: string,
    remotePath: string,
    localPath: string,
    fileName?: string,
  ) => Promise<boolean>;

  downloadPaths: (
    siteId: string,
    remotePaths: string[],
    localBase: string,
  ) => Promise<number>;

  persistQueue: () => Promise<void>;
  restoreQueue: () => Promise<void>;

  uploadAndExtract: (
    siteConfig: SiteConfig,
    localPath: string,
    remotePath: string,
    options: ExtractOptions,
    taskId: string,
  ) => Promise<void>;
}

let taskCounter = 0;
let progressListenerInit = false;

export function genTaskId(): string {
  return `task_${Date.now()}_${++taskCounter}`;
}

export function joinRemotePath(base: string, name: string): string {
  const b = base.replace(/\/$/, "") || "";
  const fileName = name.replace(/\\/g, "/").split("/").pop() || name;
  return b ? `${b}/${fileName}` : `/${fileName}`;
}

export function joinLocalPath(base: string, name: string): string {
  const fileName = name.replace(/\\/g, "/").split("/").pop() || name;
  const sep = base.includes("\\") ? "\\" : "/";
  const trimmed = base.replace(/[/\\]+$/, "");
  return `${trimmed}${sep}${fileName}`;
}

function initProgressListener(updateTask: TransferStore["updateTask"], get: () => TransferStore) {
  if (progressListenerInit) return;
  progressListenerInit = true;
  listen<TransferProgressPayload>("transfer-progress", (event) => {
    const { taskId, transferred, total, speedBps } = event.payload;
    const progress = total > 0 ? Math.min(100, Math.round((transferred / total) * 100)) : 0;
    const task = get().tasks.find((t) => t.id === taskId);
    const updates: Partial<TransferTask> = { progress, speedBps };
    if (task?.isArchive && task.status === "uploading" && progress >= 100) {
      updates.status = "extracting";
    }
    updateTask(taskId, updates);
  }).catch(console.error);
}

function formatSpeed(bps: number): string {
  if (bps <= 0) return "";
  if (bps < 1024) return `${bps} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / 1024 / 1024).toFixed(1)} MB/s`;
}

export { formatSpeed };

const ACTIVE_UPLOAD_STATUSES: TransferStatus[] = ["pending", "uploading"];

function normLocalPath(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

export function dedupeLocalPaths(localPaths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of localPaths) {
    const key = normLocalPath(p);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function findActiveUpload(
  tasks: TransferTask[],
  localPath: string,
  remotePath: string,
): TransferTask | undefined {
  const localKey = normLocalPath(localPath);
  return tasks.find(
    (t) =>
      ACTIVE_UPLOAD_STATUSES.includes(t.status) &&
      normLocalPath(t.localPath) === localKey &&
      t.remotePath.replace(/\\/g, "/") === remotePath.replace(/\\/g, "/"),
  );
}

async function shouldUpload(
  get: () => TransferStore,
  siteId: string,
  remotePath: string,
  fileName: string,
  targetLabel: string,
): Promise<boolean> {
  const state = get();
  if (state.skipAll) return false;
  if (state.overwriteAll) return true;

  let exists = false;
  try {
    exists = await invoke<boolean>("remote_file_exists", { siteId, remotePath });
  } catch {
    return true;
  }

  if (!exists) return true;

  const action = await get().promptOverwrite(fileName, targetLabel);
  if (action === "cancel") return false;
  if (action === "skip" || action === "skipAll") return false;
  return true;
}

async function shouldDownload(
  get: () => TransferStore,
  localPath: string,
  fileName: string,
  targetLabel: string,
): Promise<boolean> {
  const state = get();
  if (state.skipAll) return false;
  if (state.overwriteAll) return true;

  let exists = false;
  try {
    exists = await invoke<boolean>("local_file_exists", { path: localPath });
  } catch {
    return true;
  }

  if (!exists) return true;

  const action = await get().promptOverwrite(fileName, targetLabel);
  if (action === "cancel") return false;
  if (action === "skip" || action === "skipAll") return false;
  return true;
}

export const useTransferStore = create<TransferStore>((set, get) => {
  const store: TransferStore = {
    tasks: [],
    overwriteDialog: null,
    overwriteAll: false,
    skipAll: false,
    _overwriteResolver: null,

    addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),

    updateTask: (id, updates) =>
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      })),

    removeTask: (id) =>
      set((state) => ({
        tasks: state.tasks.filter((t) => t.id !== id),
      })),

    clearDone: () =>
      set((state) => ({
        tasks: state.tasks.filter(
          (t) => t.status !== "done" && t.status !== "error" && t.status !== "cancelled",
        ),
      })),

    cancelTask: (taskId) => {
      invoke("cancel_transfer", { taskId }).catch(console.error);
      get().updateTask(taskId, { status: "cancelled", error: "已取消" });
    },

    retryTask: async (taskId) => {
      const task = get().tasks.find((t) => t.id === taskId);
      if (!task?.retryInfo) return;
      const info = task.retryInfo;
      get().updateTask(taskId, {
        status: info.kind === "upload" ? "uploading" : "downloading",
        progress: 0,
        error: undefined,
        speedBps: 0,
      });
      try {
        if (info.kind === "upload") {
          await invoke("upload_transfer_file", {
            siteId: info.siteId,
            localPath: info.localPath,
            remotePath: info.remotePath,
            taskId,
          });
        } else {
          await invoke("download_transfer_file", {
            siteId: info.siteId,
            remotePath: info.remotePath,
            localPath: info.localPath,
            taskId,
          });
        }
        get().updateTask(taskId, { status: "done", progress: 100 });
      } catch (e) {
        const errMsg = typeof e === "string" ? e : String(e);
        get().updateTask(taskId, {
          status: errMsg.includes("取消") ? "cancelled" : "error",
          error: errMsg,
        });
      }
    },

    promptOverwrite: (fileName, targetLabel) =>
      new Promise((resolve) => {
        set({
          overwriteDialog: { fileName, targetLabel },
          _overwriteResolver: resolve,
        });
      }),

    resolveOverwrite: (action) => {
      const resolver = get()._overwriteResolver;
      if (action === "overwriteAll") {
        set({ overwriteAll: true, overwriteDialog: null, _overwriteResolver: null });
      } else if (action === "skipAll") {
        set({ skipAll: true, overwriteDialog: null, _overwriteResolver: null });
      } else {
        set({ overwriteDialog: null, _overwriteResolver: null });
      }
      resolver?.(action);
    },

    resetOverwriteFlags: () => set({ overwriteAll: false, skipAll: false }),

    uploadFile: async (siteId, localPath, remotePath, fileName) => {
      const name = fileName || localPath.split(/[\\/]/).pop() || localPath;
      if (findActiveUpload(get().tasks, localPath, remotePath)) {
        return false;
      }
      const ok = await shouldUpload(get, siteId, remotePath, name, remotePath);
      if (!ok) return false;

      const taskId = genTaskId();
      const retryInfo: TransferRetryInfo = { kind: "upload", siteId, localPath, remotePath };
      get().addTask({
        id: taskId,
        fileName: name,
        localPath,
        remotePath,
        status: "uploading",
        progress: 0,
        isArchive: false,
        retryInfo,
      });

      try {
        await invoke("upload_transfer_file", {
          siteId,
          localPath,
          remotePath,
          taskId,
        });
        const t = get().tasks.find((x) => x.id === taskId);
        if (t?.status === "cancelled") return false;
        get().updateTask(taskId, { status: "done", progress: 100 });
        markRemoteArchiveUpload(remotePath, name);
        return true;
      } catch (e) {
        const errMsg = typeof e === "string" ? e : String(e);
        if (errMsg.includes("取消")) {
          get().updateTask(taskId, { status: "cancelled", error: errMsg });
        } else {
          get().updateTask(taskId, { status: "error", progress: 0, error: errMsg });
        }
        return false;
      }
    },

    uploadPaths: async (siteId, localPaths, remoteBase) => {
      get().resetOverwriteFlags();
      let uploaded = 0;
      let cancelled = false;

      for (const localPath of dedupeLocalPaths(localPaths)) {
        const name = localPath.split(/[\\/]/).pop() || localPath;
        const isDir = await invoke<boolean>("path_is_dir", { path: localPath });

        if (isDir) {
          const taskId = genTaskId();
          get().addTask({
            id: taskId,
            fileName: `${name}/`,
            localPath,
            remotePath: joinRemotePath(remoteBase, name),
            status: "uploading",
            progress: 0,
            isArchive: false,
          });
          try {
            const count = await invoke<number>("upload_transfer_paths", {
              siteId,
              localPaths: [localPath],
              remoteBase: joinRemotePath(remoteBase, name),
              taskId,
            });
            get().updateTask(taskId, { status: "done", progress: 100 });
            uploaded += count;
          } catch (e) {
            const errMsg = typeof e === "string" ? e : String(e);
            get().updateTask(taskId, { status: "error", progress: 0, error: errMsg });
          }
          continue;
        }

        const remotePath = joinRemotePath(remoteBase, name);
        if (findActiveUpload(get().tasks, localPath, remotePath)) {
          continue;
        }
        const ok = await shouldUpload(get, siteId, remotePath, name, remoteBase);
        if (!ok) {
          if (get().skipAll) continue;
          cancelled = true;
          break;
        }

        const taskId = genTaskId();
        const retryInfo: TransferRetryInfo = { kind: "upload", siteId, localPath, remotePath };
        get().addTask({
          id: taskId,
          fileName: name,
          localPath,
          remotePath,
          status: "uploading",
          progress: 0,
          isArchive: false,
          retryInfo,
        });

        try {
          await invoke("upload_transfer_file", {
            siteId,
            localPath,
            remotePath,
            taskId,
          });
          const t = get().tasks.find((x) => x.id === taskId);
          if (t?.status === "cancelled") {
            cancelled = true;
            break;
          }
          get().updateTask(taskId, { status: "done", progress: 100 });
          uploaded += 1;
          markRemoteArchiveUpload(remotePath, name);
        } catch (e) {
          const errMsg = typeof e === "string" ? e : String(e);
          if (errMsg.includes("取消")) {
            get().updateTask(taskId, { status: "cancelled", error: errMsg });
            cancelled = true;
            break;
          }
          get().updateTask(taskId, { status: "error", progress: 0, error: errMsg, retryInfo });
        }
      }

      return { uploaded, cancelled };
    },

    downloadFile: async (siteId, remotePath, localPath, fileName) => {
      const name = fileName || remotePath.split("/").pop() || remotePath;
      const ok = await shouldDownload(get, localPath, name, localPath);
      if (!ok) return false;

      const taskId = genTaskId();
      const retryInfo: TransferRetryInfo = { kind: "download", siteId, localPath, remotePath };
      get().addTask({
        id: taskId,
        fileName: name,
        localPath,
        remotePath,
        status: "downloading",
        progress: 0,
        isArchive: false,
        retryInfo,
      });

      try {
        await invoke("download_transfer_file", {
          siteId,
          remotePath,
          localPath,
          taskId,
        });
        const t = get().tasks.find((x) => x.id === taskId);
        if (t?.status === "cancelled") return false;
        get().updateTask(taskId, { status: "done", progress: 100 });
        return true;
      } catch (e) {
        const errMsg = typeof e === "string" ? e : String(e);
        if (errMsg.includes("取消")) {
          get().updateTask(taskId, { status: "cancelled", error: errMsg });
        } else {
          get().updateTask(taskId, { status: "error", progress: 0, error: errMsg, retryInfo });
        }
        return false;
      }
    },

    downloadPaths: async (siteId, remotePaths, localBase) => {
      const taskId = genTaskId();
      const label = remotePaths.length === 1
        ? remotePaths[0].split("/").pop() || "download"
        : `${remotePaths.length} items`;
      get().addTask({
        id: taskId,
        fileName: label,
        localPath: localBase,
        remotePath: remotePaths[0] || "",
        destDir: localBase,
        status: "downloading",
        progress: 0,
        isArchive: false,
      });
      try {
        const count = await invoke<number>("download_transfer_paths", {
          siteId,
          remotePaths,
          localBase,
          taskId,
        });
        get().updateTask(taskId, { status: "done", progress: 100 });
        return count;
      } catch (e) {
        const errMsg = typeof e === "string" ? e : String(e);
        get().updateTask(taskId, { status: "error", progress: 0, error: errMsg });
        return 0;
      }
    },

    persistQueue: async () => {
      const tasks = get().tasks.map((t) => ({
        id: t.id,
        fileName: t.fileName,
        localPath: t.localPath,
        remotePath: t.remotePath,
        status: t.status,
        progress: t.progress,
        isArchive: t.isArchive,
        error: t.error,
        destDir: t.destDir,
      }));
      await invoke("save_persisted_transfers", { tasks });
    },

    restoreQueue: async () => {
      try {
        const tasks = await invoke<
          Array<{
            id: string;
            fileName: string;
            localPath: string;
            remotePath: string;
            status: string;
            progress: number;
            isArchive: boolean;
            error?: string;
            destDir?: string;
          }>
        >("load_persisted_transfers");
        if (tasks.length > 0) {
          set({
            tasks: tasks.map((t) => ({
              ...t,
              status: t.status as TransferTask["status"],
              speedBps: 0,
            })),
          });
        }
      } catch {
        /* ignore */
      }
    },

    uploadAndExtract: async (siteConfig, localPath, remotePath, options, taskId) => {
      const fileName = localPath.split(/[\\/]/).pop() || localPath;
      const active = get().tasks.some(
        (t) =>
          t.id !== taskId &&
          t.isArchive &&
          t.remotePath === remotePath &&
          (t.status === "uploading" || t.status === "extracting" || t.status === "pending"),
      );
      if (active) return;

      get().addTask({
        id: taskId,
        fileName,
        localPath,
        remotePath,
        destDir: options.targetDir?.trim() || remoteDirname(remotePath),
        status: "uploading",
        progress: 0,
        isArchive: true,
      });

      try {
        const result = await invoke<{
          success: boolean;
          archiveName: string;
          targetDir: string;
          exitCode: number;
          output: string;
          error?: string;
        }>("upload_and_extract", {
          siteConfig,
          localPath,
          remotePath,
          options,
          taskId,
        });

        if (result.success) {
          get().updateTask(taskId, { status: "done", progress: 100, destDir: result.targetDir });
          if (!options.deleteAfter) {
            markRemoteArchiveUpload(remotePath, fileName);
          }
        } else {
          get().updateTask(taskId, {
            status: "error",
            progress: 100,
            error: result.error || `退出码: ${result.exitCode}`,
          });
        }
      } catch (e) {
        const errMsg = typeof e === "string" ? e : String(e);
        get().updateTask(taskId, { status: "error", progress: 0, error: errMsg });
      }
    },
  };

  initProgressListener(store.updateTask, get);
  return store;
});
