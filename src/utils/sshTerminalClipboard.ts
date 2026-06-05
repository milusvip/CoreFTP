import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";

/** 将剪贴板文本转为 PTY 可接受的换行；多行时使用 bracketed paste */
export function normalizePasteForPty(text: string): string {
  const hasLineBreak = /[\r\n]/.test(text);
  if (hasLineBreak) {
    const inner = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    return `\x1b[200~${inner}\x1b[201~`;
  }
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n/g, "\r");
}

export async function readClipboardText(): Promise<string> {
  try {
    return await readText();
  } catch {
    try {
      if (navigator.clipboard?.readText) {
        return await navigator.clipboard.readText();
      }
    } catch {
      /* WebView 回退 */
    }
  }
  return "";
}

export async function writeClipboardText(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    await writeText(text);
    return true;
  } catch {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}
