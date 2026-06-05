use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedTransferTask {
    pub id: String,
    pub file_name: String,
    pub local_path: String,
    pub remote_path: String,
    pub status: String,
    pub progress: u8,
    pub is_archive: bool,
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dest_dir: Option<String>,
}

pub fn transfers_path() -> PathBuf {
    dirs_next::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("CoreFTP")
        .join("transfers.json")
}

pub fn load_transfers() -> Vec<PersistedTransferTask> {
    let path = transfers_path();
    if !path.exists() {
        return Vec::new();
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_transfers(tasks: &[PersistedTransferTask]) -> Result<(), String> {
    let path = transfers_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    let json = serde_json::to_string_pretty(tasks)
        .map_err(|e| format!("序列化传输队列失败: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("写入传输队列失败: {}", e))?;
    Ok(())
}

pub fn clear_transfers() -> Result<(), String> {
    let path = transfers_path();
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("清除传输队列失败: {}", e))?;
    }
    Ok(())
}
