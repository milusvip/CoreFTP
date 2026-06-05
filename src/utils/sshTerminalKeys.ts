import type { Terminal } from "@xterm/xterm";
import { normalizePasteForPty, readClipboardText, writeClipboardText } from "./sshTerminalClipboard";

export interface TerminalKeyBindingsOptions {
  canInput: () => boolean;
  onToggleFind?: () => void;
}

/** 粘贴到终端（经 onData 发往 SSH） */
export async function pasteIntoTerminal(term: Terminal, canInput: () => boolean): Promise<boolean> {
  if (!canInput()) return false;
  const raw = await readClipboardText();
  if (!raw) return false;
  const data = normalizePasteForPty(raw);
  term.input(data);
  return true;
}

/** 复制当前选区 */
export async function copyTerminalSelection(term: Terminal): Promise<boolean> {
  const text = term.getSelection();
  if (!text) return false;
  return writeClipboardText(text);
}

/**
 * 绑定常用终端快捷键（Windows / Linux 习惯）
 * - Ctrl+V / Ctrl+Shift+V / Shift+Insert：粘贴
 * - Ctrl+C：有选区则复制，否则中断 (SIGINT)
 * - Ctrl+Shift+C / Ctrl+Insert：复制选区
 * - Ctrl+A：全选
 * - Ctrl+L：清屏（本地 + 向服务器发送 form feed）
 */
export function bindTerminalKeyEvents(
  term: Terminal,
  options: TerminalKeyBindingsOptions,
): void {
  term.attachCustomKeyEventHandler((event) => {
    if (event.type !== "keydown") return true;
    const e = event;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key;

    if (mod && (key === "v" || key === "V")) {
      e.preventDefault();
      void pasteIntoTerminal(term, options.canInput);
      return false;
    }

    if (e.shiftKey && key === "Insert" && !mod) {
      e.preventDefault();
      void pasteIntoTerminal(term, options.canInput);
      return false;
    }

    if (mod && key === "a") {
      e.preventDefault();
      term.selectAll();
      return false;
    }

    if (mod && key === "l") {
      e.preventDefault();
      term.clear();
      if (options.canInput()) {
        term.input("\x0c");
      }
      return false;
    }

    if (mod && key === "f") {
      e.preventDefault();
      options.onToggleFind?.();
      return false;
    }

    const copyChord =
      (mod && e.shiftKey && (key === "c" || key === "C")) || (mod && key === "Insert" && !e.shiftKey);

    if (copyChord && term.hasSelection()) {
      e.preventDefault();
      void copyTerminalSelection(term);
      return false;
    }

    if (mod && (key === "c" || key === "C") && !e.shiftKey) {
      e.preventDefault();
      if (term.hasSelection()) {
        void copyTerminalSelection(term);
      } else if (options.canInput()) {
        term.input("\x03");
      }
      return false;
    }

    return true;
  });
}
