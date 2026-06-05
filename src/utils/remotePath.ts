/** 统一远程路径格式，便于书签比对 */
export function normalizeRemotePath(path: string): string {
  const p = path.replace(/\\/g, "/").replace(/\/+/g, "/");
  if (!p || p === "/") return "/";
  const trimmed = p.replace(/\/+$/, "");
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function findBookmarkAtPath<T extends { path: string }>(
  bookmarks: T[],
  currentPath: string,
): T | undefined {
  const norm = normalizeRemotePath(currentPath);
  return bookmarks.find((b) => normalizeRemotePath(b.path) === norm);
}
