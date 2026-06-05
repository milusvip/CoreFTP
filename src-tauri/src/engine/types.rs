use serde::{Deserialize, Serialize};

/// 连接协议
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Protocol {
    FTP,
    FTPS,
    SFTP,
    /// SSH 传输（文件浏览走 SFTP 子系统，另可开交互终端）
    SSH,
}

impl Protocol {
    pub fn uses_ssh_transport(&self) -> bool {
        matches!(self, Protocol::SFTP | Protocol::SSH)
    }
}

impl std::fmt::Display for Protocol {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Protocol::FTP => write!(f, "FTP"),
            Protocol::FTPS => write!(f, "FTPS"),
            Protocol::SFTP => write!(f, "SFTP"),
            Protocol::SSH => write!(f, "SSH"),
        }
    }
}

/// 站点分类
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteCategory {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub sort_order: i32,
}

/// 站点配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteConfig {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub protocol: Protocol,
    pub username: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,
    pub password: Option<String>,
    pub private_key: Option<String>,
    /// SSH 私钥口令（仅传输，存 keyring）
    #[serde(default)]
    pub private_key_passphrase: Option<String>,
    pub default_remote_path: Option<String>,
    /// 上传/解压后 chown 用户（默认 www）
    pub web_owner: Option<String>,
    /// 上传/解压后 chown 组（默认 www）
    pub web_group: Option<String>,
}

/// 磁盘持久化（不含密码）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteConfigStored {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub protocol: Protocol,
    pub username: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,
    pub private_key: Option<String>,
    pub default_remote_path: Option<String>,
    pub web_owner: Option<String>,
    pub web_group: Option<String>,
}

impl From<SiteConfig> for SiteConfigStored {
    fn from(s: SiteConfig) -> Self {
        SiteConfigStored {
            id: s.id,
            name: s.name,
            host: s.host,
            port: s.port,
            protocol: s.protocol,
            username: s.username,
            category_id: s.category_id,
            private_key: s.private_key,
            default_remote_path: s.default_remote_path,
            web_owner: s.web_owner,
            web_group: s.web_group,
        }
    }
}

impl From<SiteConfigStored> for SiteConfig {
    fn from(s: SiteConfigStored) -> Self {
        SiteConfig {
            id: s.id,
            name: s.name,
            host: s.host,
            port: s.port,
            protocol: s.protocol,
            username: s.username,
            category_id: s.category_id,
            password: None,
            private_key: s.private_key,
            private_key_passphrase: None,
            default_remote_path: s.default_remote_path,
            web_owner: s.web_owner,
            web_group: s.web_group,
        }
    }
}

impl SiteConfig {
    pub fn web_owner_or_default(&self) -> &str {
        self.web_owner.as_deref().filter(|s| !s.is_empty()).unwrap_or("www")
    }

    pub fn web_group_or_default(&self) -> &str {
        self.web_group.as_deref().filter(|s| !s.is_empty()).unwrap_or("www")
    }
}

/// 文件条目
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: String,
    pub permissions: Option<String>,
}

/// 传输任务状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TransferStatus {
    Pending,
    Uploading,
    Downloading,
    Extracting,
    Done,
    Error,
}

/// 解压选项
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractOptions {
    pub archive_path: String,
    pub target_dir: Option<String>,
    pub delete_after: bool,
}

/// 解压结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractResult {
    pub success: bool,
    pub archive_name: String,
    pub target_dir: String,
    pub exit_code: i32,
    pub output: String,
    pub error: Option<String>,
}

/// 命令执行结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

/// 连接状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ConnectionStatus {
    Disconnected,
    Connecting,
    Connected,
    Error(String),
}
