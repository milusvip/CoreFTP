import { invoke } from "@tauri-apps/api/core";
import { errorToString } from "./errorMessage";

const HOST_KEY_UNKNOWN = "HOST_KEY_UNKNOWN:";
const HOST_KEY_MISMATCH = "HOST_KEY_MISMATCH:";

export type HostKeyPromptKind = "unknown" | "mismatch";

export interface HostKeyPrompt {
  kind: HostKeyPromptKind;
  fingerprint: string;
}

export function parseHostKeyError(message: string): HostKeyPrompt | null {
  if (message.startsWith(HOST_KEY_UNKNOWN)) {
    return { kind: "unknown", fingerprint: message.slice(HOST_KEY_UNKNOWN.length) };
  }
  if (message.startsWith(HOST_KEY_MISMATCH)) {
    const rest = message.slice(HOST_KEY_MISMATCH.length);
    const fp = rest.split(":")[0] ?? rest;
    return { kind: "mismatch", fingerprint: fp };
  }
  return null;
}

export function isHostKeyError(message: string): boolean {
  return parseHostKeyError(message) !== null;
}

type InvokeArgs = Record<string, unknown>;

/**
 * 调用带 trustNewHost 的 Tauri 命令；遇未知主机密钥时由 onPrompt 决定是否信任。
 */
export async function invokeWithHostKeyTrust<T>(
  command: string,
  args: InvokeArgs,
  onPrompt: (prompt: HostKeyPrompt) => Promise<boolean>,
): Promise<T> {
  try {
    return await invoke<T>(command, { ...args, trustNewHost: false });
  } catch (e) {
    const msg = errorToString(e);
    const prompt = parseHostKeyError(msg);
    if (!prompt) throw e;
    const trust = await onPrompt(prompt);
    if (!trust) throw e;
    return await invoke<T>(command, { ...args, trustNewHost: true });
  }
}
