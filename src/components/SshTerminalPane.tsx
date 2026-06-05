import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import { useT } from "../i18n";
import { useTerminalStore } from "../stores/terminalStore";
import { exportTerminalBuffer } from "../utils/exportTerminalBuffer";
import { promptHostKeyTrust } from "../utils/hostKeyPrompt";
import { errorToString } from "../utils/errorMessage";
import { terminalOpenWithHostKey } from "../utils/sshInvoke";
import { shouldPreserveTerminalClose } from "../utils/terminalSessionPreserve";
import { confirmCloseTerminalTab } from "../utils/terminalCloseConfirm";
import {
  bindTerminalKeyEvents,
  copyTerminalSelection,
  pasteIntoTerminal,
} from "../utils/sshTerminalKeys";
import { DialogBtn } from "./ui/Dialog";
import { ModalBody } from "./ui/Modal";

interface SshTerminalPaneProps {
  tabId: string;
  siteId: string;
  siteName: string;
  host: string;
  isActive: boolean;
}

const FONT_MIN = 11;
const FONT_MAX = 22;
const FONT_DEFAULT = 14;

export default function SshTerminalPane({
  tabId,
  siteId,
  siteName,
  host,
  isActive,
}: SshTerminalPaneProps) {
  const t = useT();
  const closeTab = useTerminalStore((s) => s.closeTab);
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const readyRef = useRef(false);
  const closedRef = useRef(false);
  const openRef = useRef(false);
  const sessionGenRef = useRef(0);
  const [xtermReady, setXtermReady] = useState(isActive);
  const [status, setStatus] = useState<"connecting" | "ready" | "closed">("connecting");
  const [fontSize, setFontSize] = useState(FONT_DEFAULT);
  const [showFind, setShowFind] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (isActive) setXtermReady(true);
  }, [isActive]);

  const canInput = useCallback(() => readyRef.current && !closedRef.current, []);

  const resizePty = useCallback(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit || !hostRef.current) return { cols: 100, rows: 32 };
    try {
      fit.fit();
    } catch {
      /* 容器尚未布局 */
    }
    const cols = Math.max(20, term.cols);
    const rows = Math.max(8, term.rows);
    if (readyRef.current && !closedRef.current) {
      void invoke("terminal_resize", { tabId, cols, rows }).catch(() => {});
    }
    return { cols, rows };
  }, [tabId]);

  const applyFontSize = useCallback(
    (size: number) => {
      const term = termRef.current;
      if (!term) return;
      const next = Math.min(FONT_MAX, Math.max(FONT_MIN, size));
      setFontSize(next);
      term.options.fontSize = next;
      requestAnimationFrame(() => resizePty());
    },
    [resizePty],
  );

  const handleCopy = useCallback(async () => {
    const term = termRef.current;
    if (!term) return;
    await copyTerminalSelection(term);
  }, []);

  const handlePaste = useCallback(async () => {
    const term = termRef.current;
    if (!term) return;
    const ok = await pasteIntoTerminal(term, canInput);
    if (!ok && canInput()) {
      term.writeln(`\r\n\x1b[33m${t("sshTerminal.pasteEmpty")}\x1b[0m`);
    }
  }, [canInput, t]);

  const handleClear = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    term.clear();
    if (canInput()) term.input("\x0c");
  }, [canInput]);

  const handleExport = useCallback(async () => {
    const term = termRef.current;
    if (!term) return;
    const name = `${siteName.replace(/[^\w.-]+/g, "_")}-terminal.log`;
    try {
      await exportTerminalBuffer(term, name);
    } catch {
      term.writeln(`\r\n\x1b[33m${t("sshTerminal.exportFailed")}\x1b[0m`);
    }
  }, [siteName, t]);

  const handleFindNext = useCallback(() => {
    const search = searchRef.current;
    if (!search || !findQuery.trim()) return;
    search.findNext(findQuery, { caseSensitive: false });
  }, [findQuery]);

  const handleFindPrev = useCallback(() => {
    const search = searchRef.current;
    if (!search || !findQuery.trim()) return;
    search.findPrevious(findQuery, { caseSensitive: false });
  }, [findQuery]);

  const openSession = useCallback(async () => {
    const myGen = ++sessionGenRef.current;
    for (let i = 0; i < 40 && !termRef.current; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const term = termRef.current;
    if (!term) return;

    const { cols, rows } = resizePty();
    try {
      await terminalOpenWithHostKey(
        { tabId, siteId, cols, rows, trustNewHost: true },
        promptHostKeyTrust,
      );
      if (sessionGenRef.current !== myGen) return;
      openRef.current = true;
      readyRef.current = true;
      closedRef.current = false;
      term.options.disableStdin = false;
      setStatus("ready");
      if (isActive) requestAnimationFrame(() => term.focus());
    } catch (e) {
      const msg = errorToString(e) || t("sshTerminal.openFailed");
      term.writeln(`\r\n\x1b[31m[${msg}]\x1b[0m`);
      closedRef.current = true;
      readyRef.current = false;
      term.options.disableStdin = true;
      setStatus("closed");
    }
  }, [tabId, siteId, resizePty, t]);

  useEffect(() => {
    if (!xtermReady) return;
    const container = hostRef.current;
    if (!container) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: FONT_DEFAULT,
      lineHeight: 1.25,
      fontFamily: '"Cascadia Code", Consolas, "SF Mono", Menlo, monospace',
      scrollback: 12000,
      convertEol: false,
      theme: {
        background: "#0d1117",
        foreground: "#c9d1d9",
        cursor: "#58a6ff",
        cursorAccent: "#0d1117",
        selectionBackground: "#264f78",
        black: "#484f58",
        red: "#ff7b72",
        green: "#3fb950",
        yellow: "#d29922",
        blue: "#58a6ff",
        magenta: "#bc8cff",
        cyan: "#39c5cf",
        white: "#c9d1d9",
      },
    });

    const fit = new FitAddon();
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(search);
    term.open(container);

    termRef.current = term;
    fitRef.current = fit;
    searchRef.current = search;

    bindTerminalKeyEvents(term, {
      canInput,
      onToggleFind: () => setShowFind((prev) => !prev),
    });

    requestAnimationFrame(() => {
      resizePty();
      if (isActive) term.focus();
    });

    const dataSub = term.onData((data) => {
      if (!readyRef.current || closedRef.current) return;
      void invoke("terminal_write", { tabId, data }).catch(() => {
        closedRef.current = true;
        readyRef.current = false;
        term.options.disableStdin = true;
        setStatus("closed");
      });
    });

    const ro = new ResizeObserver(() => resizePty());
    ro.observe(container);
    window.addEventListener("resize", resizePty);

    return () => {
      dataSub.dispose();
      ro.disconnect();
      window.removeEventListener("resize", resizePty);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
    };
  }, [tabId, canInput, resizePty, isActive, xtermReady]);

  useEffect(() => {
    if (!xtermReady) return;

    let unlisten: (() => void) | undefined;
    let disposed = false;

    const boot = async () => {
      const un = await listen<{ tabId: string; siteId: string; data: string; closed: boolean }>(
        "terminal-output",
        (ev) => {
          if (ev.payload.tabId !== tabId) return;
          const term = termRef.current;
          if (!term) return;
          if (ev.payload.data) term.write(ev.payload.data);
          if (ev.payload.closed) {
            closedRef.current = true;
            readyRef.current = false;
            term.options.disableStdin = true;
            term.writeln(`\r\n\x1b[33m${t("sshTerminal.closed")}\x1b[0m`);
            setStatus("closed");
          }
        },
      );
      if (disposed) {
        un();
        return;
      }
      unlisten = un;
      await openSession();
    };

    void boot();

    return () => {
      disposed = true;
      sessionGenRef.current += 1;
      unlisten?.();
      readyRef.current = false;
      if (openRef.current) {
        if (!shouldPreserveTerminalClose(tabId)) {
          void invoke("terminal_close", { tabId }).catch(() => {});
        }
        openRef.current = false;
      }
    };
  }, [tabId, xtermReady, openSession, t]);

  useEffect(() => {
    if (isActive && status === "ready") termRef.current?.focus();
  }, [isActive, status]);

  const handleReconnect = () => {
    closedRef.current = false;
    readyRef.current = false;
    setStatus("connecting");
    const term = termRef.current;
    if (term) {
      term.clear();
      term.options.disableStdin = false;
    }
    void invoke("terminal_close", { tabId }).finally(() => {
      openRef.current = false;
      void openSession();
    });
  };

  if (!xtermReady) {
    return (
      <div className="flex-1 flex items-center justify-center text-fg-subtle text-sm min-h-[200px]">
        {t("sshTerminal.loading")}
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="ui-ssh-terminal-toolbar shrink-0 flex flex-wrap items-center gap-1.5 px-5 py-2 border-b border-surface-light/40">
        <span className="text-xs text-fg-subtle mr-1 truncate max-w-[200px]">
          {siteName} · {host}
        </span>
        <span className="w-px h-4 bg-surface-light/60" />
        <button type="button" className="ui-ssh-terminal-tool-btn" onClick={() => void handleCopy()}>
          {t("sshTerminal.copy")}
        </button>
        <button
          type="button"
          className="ui-ssh-terminal-tool-btn"
          onClick={() => void handlePaste()}
          disabled={status !== "ready"}
        >
          {t("sshTerminal.paste")}
        </button>
        <button
          type="button"
          className="ui-ssh-terminal-tool-btn"
          onClick={handleClear}
          disabled={status !== "ready"}
        >
          {t("sshTerminal.clear")}
        </button>
        <button type="button" className="ui-ssh-terminal-tool-btn" onClick={() => void handleExport()}>
          {t("sshTerminal.export")}
        </button>
        <span className="w-px h-4 bg-surface-light/60 mx-0.5" />
        <button
          type="button"
          className="ui-ssh-terminal-tool-btn"
          onClick={() => applyFontSize(fontSize - 1)}
          title={t("sshTerminal.fontSmaller")}
        >
          A−
        </button>
        <button
          type="button"
          className="ui-ssh-terminal-tool-btn"
          onClick={() => applyFontSize(fontSize + 1)}
          title={t("sshTerminal.fontLarger")}
        >
          A+
        </button>
        <button
          type="button"
          className={`ui-ssh-terminal-tool-btn ${showFind ? "ui-ssh-terminal-tool-btn-active" : ""}`}
          onClick={() => setShowFind((v) => !v)}
        >
          {t("sshTerminal.find")}
        </button>
        <span className="flex-1 min-w-[8px]" />
        <span className="text-[10px] text-fg-faint hidden sm:inline">{t("sshTerminal.shortcuts")}</span>
      </div>

      {showFind ? (
        <div className="shrink-0 flex items-center gap-2 px-5 py-2 border-b border-surface-light/30 bg-surface-darker/30">
          <input
            type="text"
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            placeholder={t("sshTerminal.findPlaceholder")}
            className="ui-input flex-1 py-1 text-xs font-mono"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.shiftKey ? handleFindPrev() : handleFindNext();
              }
              if (e.key === "Escape") setShowFind(false);
            }}
          />
          <DialogBtn variant="secondary" className="!py-1 !text-xs" onClick={handleFindPrev}>
            {t("sshTerminal.findPrev")}
          </DialogBtn>
          <DialogBtn variant="primary" className="!py-1 !text-xs" onClick={handleFindNext}>
            {t("sshTerminal.findNext")}
          </DialogBtn>
        </div>
      ) : null}

      <ModalBody className="!p-0 !flex-1 flex flex-col min-h-0 overflow-hidden">
        <div
          ref={hostRef}
          className="ui-ssh-terminal-host flex-1 min-h-0"
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).closest("button")) return;
            setCtxMenu(null);
            e.preventDefault();
            termRef.current?.focus();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setCtxMenu({ x: e.clientX, y: e.clientY });
            termRef.current?.focus();
          }}
        />
        <p className="shrink-0 px-5 py-2 text-[11px] text-fg-subtle border-t border-surface-light/30">
          {status === "connecting"
            ? t("sshTerminal.connecting")
            : status === "closed"
              ? t("sshTerminal.closed")
              : t("sshTerminal.hintXterm")}
        </p>
      </ModalBody>

      {ctxMenu ? (
        <>
          <div className="fixed inset-0 z-[59]" onClick={() => setCtxMenu(null)} />
          <div
            className="fixed z-[60] ui-panel py-1 min-w-[140px] shadow-xl"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
          >
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-light/50"
              onClick={() => {
                void handleCopy();
                setCtxMenu(null);
              }}
            >
              {t("sshTerminal.copy")}
            </button>
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-light/50 disabled:opacity-40"
              disabled={status !== "ready"}
              onClick={() => {
                void handlePaste();
                setCtxMenu(null);
              }}
            >
              {t("sshTerminal.paste")}
            </button>
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-light/50"
              onClick={() => {
                termRef.current?.selectAll();
                setCtxMenu(null);
              }}
            >
              {t("sshTerminal.selectAll")}
            </button>
          </div>
        </>
      ) : null}

      <div className="shrink-0 flex justify-end gap-2 px-5 py-3 border-t border-surface-light/30">
        {status === "closed" ? (
          <DialogBtn variant="primary" onClick={handleReconnect}>
            {t("sshTerminal.reconnect")}
          </DialogBtn>
        ) : null}
        <DialogBtn
          variant="secondary"
          onClick={() => {
            void (async () => {
              const ok = await confirmCloseTerminalTab(siteName);
              if (!ok) return;
              void invoke("terminal_close", { tabId }).finally(() => closeTab(tabId));
            })();
          }}
        >
          {t("sshTerminal.closeTab")}
        </DialogBtn>
      </div>
    </div>
  );
}
