import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { Terminal } from "@xterm/xterm";

export async function exportTerminalBuffer(term: Terminal, defaultName: string): Promise<boolean> {
  const buffer = term.buffer.active;
  const lines: string[] = [];
  for (let i = 0; i < buffer.length; i++) {
    const line = buffer.getLine(i);
    lines.push(line?.translateToString(true) ?? "");
  }
  const content = lines.join("\n").trimEnd() + "\n";

  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: "Log", extensions: ["log", "txt"] }],
  });
  if (!path) return false;

  await writeTextFile(path, content);
  return true;
}
