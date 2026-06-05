/** 连接协议 */
export type Protocol = "FTP" | "FTPS" | "SFTP" | "SSH";

/** 站点分类 */
export interface SiteCategory {
  id: string;
  name: string;
  /** 排序权重，越小越靠前 */
  sortOrder: number;
}

/** 站点配置 */
export interface SiteConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: Protocol;
  username: string;
  /** 所属分类 id，空为未分类 */
  categoryId?: string;
  /** 密码（仅用于新建/编辑时传输，存储时加密） */
  password?: string;
  /** SSH 私钥路径（SFTP 可选） */
  privateKey?: string;
  /** SSH 私钥口令（仅存 keyring） */
  privateKeyPassphrase?: string;
  /** 默认远程路径 */
  defaultRemotePath?: string;
  /** 上传/解压后 chown 用户（默认 www） */
  webOwner?: string;
  /** 上传/解压后 chown 组（默认 www） */
  webGroup?: string;
}

/** 传输任务可重试信息 */
export interface TransferRetryInfo {
  kind: "upload" | "download";
  siteId: string;
  localPath: string;
  remotePath: string;
}

/** 文件条目 */
export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: string;
  permissions?: string;
}

/** 传输状态 */
export type TransferStatus = "pending" | "uploading" | "downloading" | "extracting" | "done" | "error" | "cancelled";

/** 传输任务 */
export interface TransferTask {
  id: string;
  fileName: string;
  localPath: string;
  remotePath: string;
  status: TransferStatus;
  progress: number; // 0-100
  isArchive: boolean;
  error?: string;
  speedBps?: number;
  retryInfo?: TransferRetryInfo;
  /** 解压或批量传输时的目标目录 */
  destDir?: string;
}

/** 解压选项 */
export interface ExtractOptions {
  /** 压缩包远程路径 */
  archivePath: string;
  /** 解压目标目录（默认同目录） */
  targetDir?: string;
  /** 解压后删除压缩包 */
  deleteAfter: boolean;
}

/** 解压结果 */
export interface ExtractResult {
  success: boolean;
  archiveName: string;
  targetDir: string;
  exitCode: number;
  output: string;
  error?: string;
}

/** 连接状态 */
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

/** 站点连接会话 */
export interface SiteSession {
  siteId: string;
  status: ConnectionStatus;
  currentPath: string;
  error?: string;
}
