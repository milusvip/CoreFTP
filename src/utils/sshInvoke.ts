import { invoke } from "@tauri-apps/api/core";
import type { HostKeyPrompt } from "./sshHostKey";
import { invokeWithHostKeyTrust } from "./sshHostKey";

export async function connectServerWithHostKey(
  config: unknown,
  onPrompt: (prompt: HostKeyPrompt) => Promise<boolean>,
): Promise<string> {
  return invokeWithHostKeyTrust<string>("connect_server", { config }, onPrompt);
}

export async function terminalOpenWithHostKey(
  args: {
    tabId: string;
    siteId: string;
    cols: number;
    rows: number;
    /** 站点已在文件面板连接成功时可传 true，跳过重复的主机密钥提示 */
    trustNewHost?: boolean;
  },
  onPrompt: (prompt: HostKeyPrompt) => Promise<boolean>,
): Promise<void> {
  const { trustNewHost, ...rest } = args;
  if (trustNewHost) {
    return invoke<void>("terminal_open", { ...rest, trustNewHost: true });
  }
  return invokeWithHostKeyTrust<void>("terminal_open", rest, onPrompt);
}
