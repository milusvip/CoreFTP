/** detach/attach 切换窗口时跳过 terminal_close，保持 Shell 会话 */
const preserveCloseTabs = new Set<string>();

export function shouldPreserveTerminalClose(tabId: string): boolean {
  return preserveCloseTabs.has(tabId);
}

export function setPreserveTerminalClose(tabId: string, preserve: boolean): void {
  if (preserve) preserveCloseTabs.add(tabId);
  else preserveCloseTabs.delete(tabId);
}

export function setPreserveTerminalCloseAll(tabIds: string[], preserve: boolean): void {
  for (const tabId of tabIds) setPreserveTerminalClose(tabId, preserve);
}
