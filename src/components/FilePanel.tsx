import { useState, useRef, useCallback, useEffect, forwardRef, type RefObject } from "react";
import { useT } from "../i18n";
import { useDialogStore } from "../stores/dialogStore";
import ContextMenu, { type ContextMenuItem } from "./ui/ContextMenu";
import BookmarkControls from "./BookmarkControls";
import { parentPath, isListableEntry } from "../utils/paths";
import type { ConnectionStatus, FileEntry } from "../types";
import type { Bookmark } from "../stores/settingsStore";
import { getArchiveExt, isArchiveFileName as isArchive } from "../utils/archives";
import { activeFilePanelRef, setActiveFilePanel } from "../utils/activeFilePanel";

export type FilePanelType = "local" | "remote";

interface FilePanelProps {
  title: string;
  path: string;
  files: FileEntry[];
  panelType: FilePanelType;
  loading?: boolean;
  collapsed?: boolean;
  isSearchResult?: boolean;
  isDropHighlight?: boolean;
  onNavigate: (path: string) => void;
  onUploadFiles?: (files: FileEntry[]) => void;
  onDownloadFiles?: (files: FileEntry[]) => void;
  onDeleteFiles?: (files: FileEntry[]) => void;
  onRenameFile?: (file: FileEntry, newName: string) => void;
  onNewFolder?: () => void;
  onExtract?: (file: FileEntry) => void;
  onRefresh?: () => void | Promise<void>;
  onToggleCollapse?: () => void;
  onDeepSearch?: (query: string) => void;
  onClearSearch?: () => void;
  bookmarks?: Bookmark[];
  onBookmarkNavigate?: (path: string) => void;
  onBookmarkToggle?: () => void;
  onBookmarkRemove?: (id: string) => void;
  isCurrentBookmarked?: boolean;
  onSync?: () => void;
  onOpenTerminal?: () => void;
  onEditFile?: (file: FileEntry) => void;
  /** 远程面板：当前选中站点的连接状态 */
  connectionStatus?: ConnectionStatus;
  connectionError?: string;
  /** 刚上传的远程文件 path → 排序权重 */
  uploadHighlights?: Record<string, number>;
}

function Breadcrumbs({ path, onNavigate }: { path: string; onNavigate: (p: string) => void }) {
  if (!path || path === "/") {
    return <span className="text-fg-faint text-xs">/</span>;
  }
  const normal = path.replace(/\\/g, "/");
  const parts = normal.split("/").filter(Boolean);
  if (parts.length === 0) return <span className="text-fg-faint text-xs">/</span>;

  const segs: { label: string; fullPath: string }[] = [];
  const isAbsolute = normal.startsWith("/") || normal.includes(":");

  if (isAbsolute && normal.startsWith("/")) {
    let acc = "";
    for (const p of parts) {
      acc += "/" + p;
      segs.push({ label: p, fullPath: acc });
    }
  } else if (isAbsolute && normal.includes(":")) {
    let acc = parts[0] + ":\\";
    for (let i = 1; i < parts.length; i++) {
      segs.push({ label: parts[i], fullPath: acc + parts.slice(1, i + 1).join("\\") });
    }
  } else {
    let acc = parts[0];
    segs.push({ label: parts[0], fullPath: acc });
    for (let i = 1; i < parts.length; i++) {
      acc += "/" + parts[i];
      segs.push({ label: parts[i], fullPath: acc });
    }
  }

  return (
    <div className="flex items-center gap-0 overflow-x-auto min-w-0 flex-1">
      {segs.map((seg, i) => (
        <span key={i} className="flex items-center whitespace-nowrap">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(seg.fullPath);
            }}
            className={`px-1 py-0.5 rounded text-xs hover:bg-surface-light/80 ${
              i === segs.length - 1 ? "text-fg-muted" : "text-fg-subtle hover:text-fg-muted"
            }`}
          >
            {seg.label}
          </button>
          {i < segs.length - 1 && <span className="text-surface-light text-xs mx-0.5">/</span>}
        </span>
      ))}
    </div>
  );
}

function MarqueeOverlay({
  listRef,
  marquee,
}: {
  listRef: RefObject<HTMLDivElement | null>;
  marquee: { x1: number; y1: number; x2: number; y2: number };
}) {
  const el = listRef.current;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const left = Math.min(marquee.x1, marquee.x2) - r.left + el.scrollLeft;
  const top = Math.min(marquee.y1, marquee.y2) - r.top + el.scrollTop;
  const width = Math.abs(marquee.x2 - marquee.x1);
  const height = Math.abs(marquee.y2 - marquee.y1);
  return (
    <div
      className="absolute z-20 border border-accent bg-accent/15 pointer-events-none rounded-sm"
      style={{ left, top, width, height }}
    />
  );
}

function rectsOverlap(a: DOMRect, b: { left: number; top: number; right: number; bottom: number }): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + " " + units[i];
}

function FileIcon({ file, panelType }: { file: FileEntry; panelType: FilePanelType }) {
  if (file.name === "..") {
    return <span className="text-fg-muted text-xs w-4 text-center">&#x21B0;</span>;
  }
  if (file.isDir) {
    const dirColor = panelType === "local" ? "file-dir-local" : "file-dir-remote";
    return (
      <svg className={`w-4 h-4 ${dirColor} flex-shrink-0`} viewBox="0 0 16 16" fill="currentColor">
        <path d="M1.5 2.5a1 1 0 0 1 1-1h3.672a1 1 0 0 1 .707.293l.828.828A1 1 0 0 0 8.414 3H13.5a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V2.5z" />
      </svg>
    );
  }
  if (isArchive(file.name)) {
    return (
      <svg className="file-archive-icon" viewBox="0 0 16 16" fill="currentColor">
        <path d="M2.5 1.5A1.5 1.5 0 0 1 4 0h5.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12a1.5 1.5 0 0 1 .439 1.061V13.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2.5 13.5v-12z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 text-fg-subtle flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4.5L9.5 0H4z" />
    </svg>
  );
}

const FilePanel = forwardRef<HTMLDivElement, FilePanelProps>(function FilePanel(
  {
    title, path, files, panelType, loading, collapsed, isSearchResult, isDropHighlight,
    onNavigate, onUploadFiles, onDownloadFiles, onDeleteFiles, onRenameFile, onNewFolder,
    onExtract, onRefresh, onToggleCollapse, onDeepSearch, onClearSearch,
    bookmarks, onBookmarkNavigate, onBookmarkToggle, onBookmarkRemove, isCurrentBookmarked,
    onSync, onOpenTerminal, onEditFile, connectionStatus, connectionError, uploadHighlights,
  },
  ref,
) {
  const t = useT();
  const showPrompt = useDialogStore((s) => s.showPrompt);

  const isRemoteOffline =
    panelType === "remote" && connectionStatus !== undefined && connectionStatus !== "connected";

  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[]; header?: string } | null>(null);
  const [search, setSearch] = useState("");
  const [editingPath, setEditingPath] = useState(false);
  const [editPathVal, setEditPathVal] = useState("");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    setSearch("");
    try {
      await Promise.resolve(onRefresh());
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh, refreshing]);

  const historyRef = useRef({ history: [] as string[], idx: -1 });
  const pathInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dragSelectRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
    captured: boolean;
    additive: boolean;
    clickedPath: string | null;
    anchor: Set<string>;
  } | null>(null);
  const [, setHistoryTick] = useState(0);

  const navigateWithHistory = useCallback(
    (newPath: string) => {
      const h = historyRef.current;
      const newHistory = h.history.slice(0, h.idx + 1);
      newHistory.push(newPath);
      if (newHistory.length > 50) newHistory.shift();
      h.history = newHistory;
      h.idx = newHistory.length - 1;
      setHistoryTick((n) => n + 1);
      onNavigate(newPath);
      setSearch("");
      setSelectedPaths(new Set());
    },
    [onNavigate],
  );

  const openFileEntry = useCallback(
    (file: FileEntry) => {
      if (file.name === "..") {
        navigateWithHistory(file.path);
        return;
      }
      if (file.isDir) {
        navigateWithHistory(file.path);
      }
    },
    [navigateWithHistory],
  );

  const startPathEdit = useCallback(() => {
    setEditPathVal(path);
    setEditingPath(true);
  }, [path]);

  useEffect(() => {
    if (!editingPath) return;
    const id = requestAnimationFrame(() => {
      const el = pathInputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [editingPath]);

  const canGoBack = historyRef.current.idx > 0;
  const canGoForward = historyRef.current.idx < historyRef.current.history.length - 1;

  const goBack = useCallback(() => {
    const h = historyRef.current;
    if (h.idx > 0) {
      h.idx--;
      setHistoryTick((n) => n + 1);
      onNavigate(h.history[h.idx]);
    }
  }, [onNavigate]);

  const goForward = useCallback(() => {
    const h = historyRef.current;
    if (h.idx < h.history.length - 1) {
      h.idx++;
      setHistoryTick((n) => n + 1);
      onNavigate(h.history[h.idx]);
    }
  }, [onNavigate]);

  const getSelectedEntries = useCallback(
    () => files.filter((f) => selectedPaths.has(f.path) && isListableEntry(f)),
    [files, selectedPaths],
  );

  const resolveMenuTargets = (file: FileEntry | null): FileEntry[] => {
    if (!file) return getSelectedEntries();
    if (file.name === "..") return [];
    if (selectedPaths.has(file.path)) return getSelectedEntries();
    return [file];
  };

  const copyPaths = (targets: FileEntry[]) => {
    const text = targets.map((f) => f.path).join("\n");
    void navigator.clipboard.writeText(text);
  };

  const labelCount = (base: string, count: number) =>
    count > 1 ? `${base} (${count})` : base;

  const askRename = async (file: FileEntry) => {
    if (!onRenameFile) return;
    const newName = await showPrompt({
      title: t("context.rename"),
      label: t("context.renamePrompt"),
      defaultValue: file.name,
      confirmLabel: t("dialog.confirm"),
    });
    if (newName && newName !== file.name) onRenameFile(file, newName);
  };

  const buildContextMenu = (targets: FileEntry[]): ContextMenuItem[] => {
    if (targets.length === 0) return [];

    const multi = targets.length > 1;
    const single = targets.length === 1 ? targets[0] : null;
    const items: ContextMenuItem[] = [];

    if (single?.name === "..") {
      items.push({
        id: "parent",
        label: t("context.openParent"),
        onClick: () => openFileEntry(single),
      });
      return items;
    }

    if (!multi && single?.isDir) {
      items.push({
        id: "open",
        label: t("context.open"),
        onClick: () => navigateWithHistory(single.path),
      });
    }

    if (panelType === "local" && onUploadFiles) {
      const hidePlainUpload =
        !multi && single && !single.isDir && isArchive(single.name) && !!onExtract;
      if (!hidePlainUpload) {
        items.push({
          id: "upload",
          label: labelCount(t("context.upload"), targets.length),
          onClick: () => onUploadFiles(targets),
        });
      }
    }
    if (panelType === "remote" && onDownloadFiles) {
      items.push({
        id: "download",
        label: labelCount(t("context.download"), targets.length),
        onClick: () => onDownloadFiles(targets),
      });
    }

    if (!multi && single) {
      if (panelType === "local" && !single.isDir && isArchive(single.name) && onExtract) {
        items.push({
          id: "extract",
          label: t("context.uploadExtract"),
          accent: true,
          separatorBefore: items.length > 0,
          onClick: () => onExtract(single),
        });
      }
      if (panelType === "remote" && !single.isDir && isArchive(single.name) && onExtract) {
        items.push({
          id: "extract-remote",
          label: t("extract.remoteOnly"),
          accent: true,
          separatorBefore: items.length > 0,
          onClick: () => onExtract(single),
        });
      }
      if (onRenameFile) {
        items.push({
          id: "rename",
          label: t("context.rename"),
          separatorBefore: items.length > 0,
          onClick: () => askRename(single),
        });
      }
      if (panelType === "remote" && onEditFile && !single.isDir) {
        items.push({
          id: "edit",
          label: t("context.editRemote"),
          separatorBefore: items.length > 0,
          onClick: () => onEditFile(single),
        });
      }
    }

    items.push({
      id: "copy-paths",
      label: labelCount(t("context.copyPaths"), targets.length),
      separatorBefore: items.length > 0,
      onClick: () => copyPaths(targets),
    });

    if (onDeleteFiles) {
      items.push({
        id: "delete",
        label: labelCount(t("context.delete"), targets.length),
        danger: true,
        separatorBefore: true,
        onClick: () => onDeleteFiles(targets),
      });
    }

    return items;
  };

  const filtered = search.trim()
    ? files.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    : files;

  const displayFiles = (() => {
    if (!uploadHighlights || Object.keys(uploadHighlights).length === 0) return filtered;
    const norm = (p: string) => p.replace(/\\/g, "/");
    const parent = filtered.find((f) => f.name === "..");
    const rest = filtered.filter(isListableEntry);
    const highlighted = rest
      .filter((f) => uploadHighlights[norm(f.path)] !== undefined)
      .sort((a, b) => (uploadHighlights[norm(b.path)] ?? 0) - (uploadHighlights[norm(a.path)] ?? 0));
    const others = rest.filter((f) => uploadHighlights[norm(f.path)] === undefined);
    return parent ? [parent, ...highlighted, ...others] : [...highlighted, ...others];
  })();

  const selectAllFiles = useCallback(() => {
    const selectable = filtered.filter(isListableEntry);
    if (selectable.length === 0) return;
    setSelectedPaths(new Set(selectable.map((f) => f.path)));
  }, [filtered]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "a" || !(e.ctrlKey || e.metaKey)) return;
      if (activeFilePanelRef.current !== panelType) return;
      if (collapsed || loading) return;
      if (panelType === "remote" && isRemoteOffline) return;

      const ae = document.activeElement;
      if (ae instanceof HTMLInputElement || ae instanceof HTMLTextAreaElement) return;
      if (ae?.closest('[role="dialog"], .xterm, .ui-ssh-terminal-host')) return;

      e.preventDefault();
      selectAllFiles();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panelType, collapsed, loading, isRemoteOffline, selectAllFiles]);

  const markPanelActive = useCallback(() => {
    setActiveFilePanel(panelType);
  }, [panelType]);

  const buildPanelMenu = (): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    const selected = getSelectedEntries();

    if (selected.length > 0) {
      items.push(...buildContextMenu(selected));
    }

    if (onRefresh) {
      items.push({
        id: "refresh",
        label: t("filepanel.refresh"),
        separatorBefore: items.length > 0,
        onClick: () => { void handleRefresh(); },
      });
    }
    if (onNewFolder) {
      items.push({
        id: "mkdir",
        label: t("filepanel.newFolder"),
        separatorBefore: items.length > 0,
        onClick: onNewFolder,
      });
    }
    const selectable = filtered.filter(isListableEntry);
    if (selectable.length > 0) {
      items.push({
        id: "select-all",
        label: t("context.selectAll"),
        separatorBefore: items.length > 0,
        onClick: () => selectAllFiles(),
      });
    }
    if (selectedPaths.size > 0) {
      items.push({
        id: "clear-selection",
        label: t("context.clearSelection"),
        onClick: () => setSelectedPaths(new Set()),
      });
    }
    if (panelType === "remote" && onOpenTerminal) {
      items.push({
        id: "ssh-terminal",
        label: t("filepanel.sshTerminal"),
        separatorBefore: items.length > 0,
        onClick: onOpenTerminal,
      });
    }
    if (panelType === "remote" && onSync) {
      items.push({
        id: "sync",
        label: t("sync.title"),
        separatorBefore: true,
        onClick: onSync,
      });
    }
    return items;
  };

  const openMenu = (e: React.MouseEvent, file: FileEntry | null) => {
    e.preventDefault();
    e.stopPropagation();

    if (file && isListableEntry(file) && !selectedPaths.has(file.path)) {
      setSelectedPaths(new Set([file.path]));
    }

    const targets = file
      ? isListableEntry(file) && !selectedPaths.has(file.path)
        ? [file]
        : resolveMenuTargets(file)
      : getSelectedEntries();

    const items = targets.length > 0 ? buildContextMenu(targets) : buildPanelMenu();
    if (items.length === 0) return;

    const header =
      targets.length > 1
        ? t("context.selected", { count: String(targets.length) })
        : targets.length === 1
        ? targets[0].name
        : undefined;

    setMenu({ x: e.clientX, y: e.clientY, items, header });
  };

  const applyClickSelection = useCallback((file: FileEntry, additive: boolean) => {
    if (file.name === ".." || file.name === ".") return;
    setSelectedPaths((prev) => {
      const next = new Set(additive ? prev : []);
      if (next.has(file.path)) next.delete(file.path);
      else next.add(file.path);
      return next;
    });
  }, []);

  const applyMarqueeSelection = useCallback(
    (x1: number, y1: number, x2: number, y2: number, anchor: Set<string>) => {
      const list = listRef.current;
      if (!list) return;
      const box = {
        left: Math.min(x1, x2),
        top: Math.min(y1, y2),
        right: Math.max(x1, x2),
        bottom: Math.max(y1, y2),
      };
      const next = new Set(anchor);
      list.querySelectorAll<HTMLTableRowElement>("tr[data-file-path]").forEach((tr) => {
        if (tr.dataset.fileName === ".." || tr.dataset.fileName === ".") return;
        const path = tr.dataset.filePath;
        if (!path) return;
        if (rectsOverlap(tr.getBoundingClientRect(), box)) next.add(path);
      });
      setSelectedPaths(next);
    },
    [],
  );

  const handleListPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (loading || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, input, select, a")) return;

    markPanelActive();

    const row = (e.target as HTMLElement).closest<HTMLTableRowElement>("tr[data-file-path]");
    const clickedPath = row?.dataset.filePath ?? null;
    const additive = e.ctrlKey || e.metaKey;

    dragSelectRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      captured: false,
      additive,
      clickedPath,
      anchor: additive ? new Set(selectedPaths) : new Set(),
    };
  };

  const handleListPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragSelectRef.current;
    if (!d || e.pointerId !== d.pointerId) return;

    const dx = Math.abs(e.clientX - d.startX);
    const dy = Math.abs(e.clientY - d.startY);
    if (!d.moved && dx + dy < 4) return;

    if (!d.captured) {
      d.captured = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }

    d.moved = true;
    setMarquee({ x1: d.startX, y1: d.startY, x2: e.clientX, y2: e.clientY });
    applyMarqueeSelection(d.startX, d.startY, e.clientX, e.clientY, d.anchor);
  };

  const finishListPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragSelectRef.current;
    if (!d || e.pointerId !== d.pointerId) return;

    if (!d.moved) {
      if (d.clickedPath) {
        const file = filtered.find((f) => f.path === d.clickedPath);
        if (file) {
          if (file.name === ".." || file.name === ".") {
            openFileEntry(file);
          } else {
            applyClickSelection(file, d.additive);
          }
        }
      } else if (!d.additive) {
        setSelectedPaths(new Set());
      }
    }

    setMarquee(null);
    dragSelectRef.current = null;
    if (d.captured && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  if (collapsed) {
    return (
      <div
        ref={ref}
        data-panel={panelType}
        className="flex flex-col min-w-[36px] border-r border-surface-light/80"
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex-1 flex flex-col items-center justify-center gap-2 py-4 text-fg-subtle hover:text-accent hover:bg-surface-alt/50 transition-colors"
          title={`${title} - ${t("filepanel.expand")}`}
        >
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 12V4l5 4-5 4z" />
          </svg>
          <span className="text-[10px] font-medium max-w-[4rem] truncate">{title}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      data-panel={panelType}
      className={`flex-1 flex flex-col min-w-0 border-r border-surface-light/80 last:border-r-0 relative ${
        isDropHighlight ? "ring-2 ring-inset ring-accent/50 bg-accent/5" : ""
      }`}
      onPointerDown={markPanelActive}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest("tr")) return;
        openMenu(e, null);
      }}
    >
      {isDropHighlight && (
        <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center bg-accent/10">
          <span className="text-xs font-medium text-accent bg-surface-darker/95 px-4 py-2 rounded-lg border border-accent/30 shadow-lg">
            {panelType === "remote" ? t("error.dropRemote") : t("error.dropLocal")}
          </span>
        </div>
      )}

      {/* Toolbar: fixed 2-row height so local/remote headers align */}
      <div className="ui-file-panel-chrome">
        <div className="h-9 flex items-center gap-2 px-2 border-b border-surface-light/30">
          <div className="file-panel-nav shrink-0">
            <button type="button" onClick={goBack} disabled={!canGoBack} className="ui-icon-btn" title={t("filepanel.back")}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button type="button" onClick={goForward} disabled={!canGoForward} className="ui-icon-btn" title={t("filepanel.forward")}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => { if (path) navigateWithHistory(parentPath(path)); }}
              className="ui-icon-btn"
              title={t("filepanel.up")}
              disabled={!path || path === "/"}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>

          <span className="file-panel-badge">{title}</span>

          <div className="flex-1 min-w-0" />

          <div className="flex items-center gap-1.5 shrink-0">
            {panelType === "remote" && onBookmarkToggle && onBookmarkNavigate && onBookmarkRemove && (
              <BookmarkControls
                bookmarks={bookmarks ?? []}
                currentPath={path}
                isBookmarked={!!isCurrentBookmarked}
                onToggle={onBookmarkToggle}
                onNavigate={onBookmarkNavigate}
                onRemove={onBookmarkRemove}
              />
            )}
            <div className="file-panel-nav shrink-0 flex items-center">
            {onNewFolder && (
              <button
                type="button"
                onClick={onNewFolder}
                className="ui-icon-btn text-accent hover:text-accent hover:bg-accent/10 shrink-0"
                title={t("filepanel.newFolder")}
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" />
                  <path d="M12 11v6M9 14h6" />
                </svg>
              </button>
            )}
            {panelType === "remote" && onOpenTerminal && (
              <button
                type="button"
                onClick={onOpenTerminal}
                className="ui-toolbar-btn text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 font-medium shrink-0"
                title={t("filepanel.sshTerminal")}
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
                <span>{t("filepanel.sshTerminalShort")}</span>
              </button>
            )}
            {onRefresh && (
              <button
                type="button"
                onClick={() => { void handleRefresh(); }}
                disabled={refreshing}
                className="ui-icon-btn disabled:opacity-50"
                title={t("filepanel.refresh")}
              >
                <svg
                  className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M23 4v6h-6M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </button>
            )}
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="ui-icon-btn text-fg-subtle"
                title={t("filepanel.collapse")}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                  <path d="M10 12V4l-5 4 5 4z" />
                </svg>
              </button>
            )}
            </div>
          </div>
        </div>

        <div className="h-9 flex items-center gap-2 px-2">
          <div
            className={`file-panel-path ${
              editingPath ? "ring-1 ring-accent/40" : "cursor-text hover:border-surface-hover"
            }`}
            onClick={editingPath ? undefined : startPathEdit}
            title={editingPath ? undefined : t("filepanel.editPath")}
            role={editingPath ? undefined : "button"}
            tabIndex={editingPath ? undefined : 0}
            onKeyDown={
              editingPath
                ? undefined
                : (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      startPathEdit();
                    }
                  }
            }
          >
            {editingPath ? (
              <input
                ref={pathInputRef}
                type="text"
                value={editPathVal}
                onChange={(e) => setEditPathVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && editPathVal.trim()) {
                    setEditingPath(false);
                    navigateWithHistory(editPathVal.trim());
                  } else if (e.key === "Escape") setEditingPath(false);
                }}
                onBlur={() => setEditingPath(false)}
                onFocus={(e) => e.target.select()}
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.select();
                }}
                className="ui-input w-full py-1 text-xs"
              />
            ) : isRemoteOffline ? (
              <span className="text-xs text-fg-subtle truncate">
                {connectionStatus === "connecting"
                  ? t("filepanel.connecting")
                  : connectionStatus === "error"
                    ? t("sidebar.error")
                    : t("filepanel.notConnected")}
              </span>
            ) : (
              <>
                <Breadcrumbs path={path} onNavigate={navigateWithHistory} />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    startPathEdit();
                  }}
                  className="ui-icon-btn shrink-0 ml-auto"
                  title={t("filepanel.editPath")}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              </>
            )}
          </div>

          <div className="file-panel-search">
            <div className="file-panel-search-box">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && search.trim() && onDeepSearch) {
                    onDeepSearch(search.trim());
                  }
                }}
                placeholder={t("filepanel.search")}
                className="file-panel-search-input"
              />
              {search && onDeepSearch && (
                <button
                  type="button"
                  onClick={() => onDeepSearch(search.trim())}
                  className="file-panel-search-deep"
                  title={t("filepanel.deepSearch")}
                >
                  {t("filepanel.deepSearchShort")}
                </button>
              )}
              {search && (
                <button
                  type="button"
                  onClick={() => { setSearch(""); onClearSearch?.(); }}
                  className="file-panel-search-clear"
                >
                  &#x2715;
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {isSearchResult && (
        <div className="px-3 py-1 text-[10px] text-amber-400/90 bg-amber-400/5 border-b border-amber-400/10">
          {t("filepanel.searchResults")}
        </div>
      )}

      <div
        ref={listRef}
        className={`flex-1 scroll-y-stable min-h-0 text-sm relative outline-none ${marquee ? "select-none" : ""}`}
        tabIndex={-1}
        onPointerDown={handleListPointerDown}
        onPointerMove={handleListPointerMove}
        onPointerUp={finishListPointer}
        onPointerCancel={finishListPointer}
      >
        {marquee && (
          <MarqueeOverlay listRef={listRef} marquee={marquee} />
        )}
        {isRemoteOffline ? (
          <div className="ui-empty-state">
            <div
              className={`ui-empty-state-icon ${
                connectionStatus === "connecting"
                  ? "border-yellow-500/25 bg-yellow-500/10"
                  : connectionStatus === "error"
                    ? "border-red-500/25 bg-red-500/10"
                    : ""
              }`}
            >
              {connectionStatus === "connecting" ? (
                <div className="w-5 h-5 border-2 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin" />
              ) : (
                <svg
                  className={`w-6 h-6 ${
                    connectionStatus === "error" ? "text-red-400/80" : "text-fg-faint"
                  }`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"
                  />
                  <path strokeLinecap="round" d="M12 8v4M12 16h.01" />
                </svg>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-fg-muted">
                {connectionStatus === "connecting"
                  ? t("filepanel.connecting")
                  : connectionStatus === "error"
                    ? t("filepanel.connectionError")
                    : t("filepanel.notConnected")}
              </p>
              <p className="text-xs text-fg-faint mt-1.5 leading-relaxed max-w-[280px]">
                {connectionStatus === "error"
                  ? (connectionError || t("filepanel.connectionErrorHint"))
                  : connectionStatus === "connecting"
                    ? t("filepanel.connectingHint")
                    : t("filepanel.notConnectedHint")}
              </p>
            </div>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-fg-faint">
            <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            <span className="text-xs">{t("filepanel.loading")}</span>
          </div>
        ) : (
          <table className="ui-file-table">
            <colgroup>
              <col />
              <col style={{ width: 72 }} />
              <col style={{ width: 148 }} />
            </colgroup>
            <thead className="ui-file-thead sticky top-0 z-[1]">
              <tr>
                <th>{t("filepanel.name")}</th>
                <th>{t("filepanel.size")}</th>
                <th>{t("filepanel.modified")}</th>
              </tr>
            </thead>
            <tbody>
              {displayFiles.map((file) => {
                const isZip = isArchive(file.name) && !file.isDir;
                const normPath = file.path.replace(/\\/g, "/");
                const isUploadHighlight = uploadHighlights?.[normPath] !== undefined;
                const selected = selectedPaths.has(file.path);
                const dirColor = panelType === "local" ? "file-dir-local" : "file-dir-remote";
                const rowTextClass = file.isDir
                  ? dirColor
                  : isZip
                    ? "file-archive"
                    : "text-fg";
                return (
                  <tr
                    key={file.path}
                    data-file-path={file.path}
                    data-file-name={file.name}
                    className={`ui-file-row ${rowTextClass} ${
                      selected ? "ui-file-row-selected" : "ui-file-row-idle"
                    } ${isUploadHighlight ? "ui-upload-highlight-row" : ""}`}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (file.name === ".." || file.isDir) {
                        openFileEntry(file);
                      } else if (isArchive(file.name) && onExtract) {
                        onExtract(file);
                      }
                    }}
                    onContextMenu={(e) => openMenu(e, file)}
                  >
                    <td>
                      <div className="flex items-center gap-2 min-w-0">
                        {isUploadHighlight && (
                          <span className="ui-upload-highlight-dot shrink-0" aria-hidden title="" />
                        )}
                        <FileIcon file={file} panelType={panelType} />
                        <span className="truncate">{file.name}</span>
                        {isZip && (
                          <span className="file-archive-badge">
                            {getArchiveExt(file.name)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="text-fg-subtle tabular-nums truncate">{formatSize(file.size)}</td>
                    <td className="text-fg-subtle truncate tabular-nums">{file.modified || "-"}</td>
                  </tr>
                );
              })}
              {displayFiles.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center text-fg-faint py-16 text-xs">
                    {search ? t("filepanel.noMatch", { q: search }) : t("filepanel.emptyDir")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          header={menu.header}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
});

export default FilePanel;
