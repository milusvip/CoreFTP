const ARCHIVE_RE = /\.(zip|tar\.gz|tar\.bz2|tar\.xz|rar|7z)$/i;

export function isArchiveFileName(name: string): boolean {
  return ARCHIVE_RE.test(name);
}

export function getArchiveExt(name: string): string {
  const m = name.match(/\.(zip|tar\.gz|tar\.bz2|tar\.xz|rar|7z)$/i);
  return m ? m[1].toUpperCase() : "";
}
