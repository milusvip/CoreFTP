/** 从 Tauri invoke 抛出的各类错误中提取可读字符串 */
export function errorToString(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null) {
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    if (typeof o.data === "string") return o.data;
    if (typeof o.error === "string") return o.error;
  }
  return String(e);
}
