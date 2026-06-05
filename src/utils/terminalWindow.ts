import { invoke } from "@tauri-apps/api/core";

export const TERMINAL_WINDOW_LABEL = "ssh-terminal";

export async function focusTerminalWindow(): Promise<void> {
  await invoke("show_terminal_window");
}

export async function openTerminalWindow(): Promise<void> {
  await invoke("show_terminal_window");
}

export async function closeTerminalWindow(): Promise<void> {
  await invoke("hide_terminal_window");
}
