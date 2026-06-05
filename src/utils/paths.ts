import type { FileEntry } from "../types";
import { joinRemotePath, joinLocalPath } from "../stores/transferStore";

/** 列表中可选择的项（排除 . 与 ..） */
export function isListableEntry(file: FileEntry): boolean {
  return file.name !== ".." && file.name !== ".";
}

/** 批量删除顺序：先文件、后目录；同类型按路径深度从深到浅 */
export function sortEntriesForDelete(targets: FileEntry[]): FileEntry[] {
  const depth = (p: string) => p.replace(/\\/g, "/").split("/").filter(Boolean).length;
  return [...targets].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? 1 : -1;
    return depth(b.path) - depth(a.path);
  });
}

export function dedupeEntriesByPath(targets: FileEntry[]): FileEntry[] {
  const seen = new Set<string>();
  const out: FileEntry[] = [];
  for (const f of targets) {
    const key = f.path.replace(/\\/g, "/");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

export function remoteFullPath(file: FileEntry, remoteBase: string): string {
  const p = file.path.replace(/\\/g, "/").trim();
  if (!p) return joinRemotePath(remoteBase, file.name);
  if (p.startsWith("/") || /^[A-Za-z]:\//.test(p)) {
    return p;
  }
  const base = remoteBase.replace(/\/$/, "") || "";
  const rel = p.replace(/^\.\//, "");
  return base ? `${base}/${rel}` : `/${rel}`;
}

export function localFullPath(file: FileEntry, localBase: string): string {
  if (file.path.includes(":") || file.path.startsWith("/") || file.path.startsWith("\\")) {
    return file.path;
  }
  return joinLocalPath(localBase, file.name);
}

/** 上一级目录路径 */
export function parentPath(path: string): string {
  if (!path || path === "—") return path;
  const win = path.includes("\\");
  const sep = win ? "\\" : "/";
  const parts = path.split(win ? /[/\\]/ : "/").filter(Boolean);
  if (parts.length <= 1) {
    if (/^[A-Za-z]:/.test(path)) return `${parts[0]}${sep}`;
    return sep === "/" ? "/" : path;
  }
  parts.pop();
  if (/^[A-Za-z]:/.test(path)) {
    return `${parts[0]}${sep}${parts.slice(1).join(sep)}`;
  }
  return sep + parts.join(sep);
}

/** 远程路径的父目录（用作默认解压目标） */
export function remoteDirname(path: string): string {
  const p = path.replace(/\\/g, "/");
  const idx = p.lastIndexOf("/");
  if (idx <= 0) return "/";
  return p.slice(0, idx) || "/";
}

export type TransferDestKind = "upload" | "download" | "extract";

/** 传输任务的目标目录 */
export function transferDestDir(task: {
  fileName: string;
  localPath: string;
  remotePath: string;
  status: string;
  isArchive?: boolean;
  destDir?: string;
  retryInfo?: { kind: "upload" | "download" };
}): string {
  if (task.destDir?.trim()) return task.destDir.trim();

  const downloading =
    task.status === "downloading" || task.retryInfo?.kind === "download";

  if (downloading) {
    if (/^\d+ items$/.test(task.fileName)) return task.localPath;
    return parentPath(task.localPath) || task.localPath;
  }

  if (task.fileName.endsWith("/")) {
    return task.remotePath.replace(/\/+$/, "") || "/";
  }

  if (task.remotePath) {
    return remoteDirname(task.remotePath);
  }

  return parentPath(task.localPath) || task.localPath;
}

export function transferDestKind(task: {
  fileName: string;
  localPath: string;
  status: string;
  isArchive?: boolean;
  retryInfo?: { kind: "upload" | "download" };
}): TransferDestKind {
  if (task.status === "extracting") return "extract";
  if (task.isArchive && task.status !== "downloading" && task.retryInfo?.kind !== "download") {
    return "extract";
  }
  if (task.status === "downloading" || task.retryInfo?.kind === "download") return "download";
  return "upload";
}
