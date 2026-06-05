export type FolderNameError = "empty" | "reserved" | "invalidChars" | "looksLikeFile";

/** 校验新建文件夹名称（不允许路径分隔符、保留名、像文件名的扩展名） */
export function validateFolderName(name: string): FolderNameError | null {
  const trimmed = name.trim();
  if (!trimmed) return "empty";
  if (trimmed === "." || trimmed === "..") return "reserved";
  if (/[\\/<>:"|?*\x00-\x1f]/.test(trimmed)) return "invalidChars";
  if (/[.\s]$/.test(trimmed)) return "invalidChars";

  // 例如 notes.txt、archive.zip —— 应使用上传，而非新建文件夹
  if (/\.[^./\\]+$/.test(trimmed) && !trimmed.startsWith(".")) {
    return "looksLikeFile";
  }

  return null;
}

export function normalizeFolderName(name: string): string {
  return name.trim();
}
