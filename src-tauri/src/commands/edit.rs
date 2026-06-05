use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use serde::Serialize;
use tauri::State;
use crate::commands::files::ConnectionPool;
use crate::commands::transfer::pool_download_with_progress;
use crate::commands::transfer::pool_upload_with_progress;
use crate::engine::cancel::CancelRegistry;
use tauri::AppHandle;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditSession {
    pub session_id: String,
    pub local_path: String,
    pub remote_path: String,
}

#[tauri::command]
pub async fn prepare_edit_remote(
    app: AppHandle,
    pool: State<'_, Arc<ConnectionPool>>,
    site_id: String,
    remote_path: String,
) -> Result<EditSession, String> {
    let pool = Arc::clone(&pool);
    let session_id = uuid::Uuid::new_v4().to_string();
    let file_name = remote_path
        .replace('\\', "/")
        .split('/')
        .last()
        .unwrap_or("file")
        .to_string();
    let local_path = std::env::temp_dir()
        .join("CoreFTP")
        .join(&session_id)
        .join(&file_name);
    if let Some(parent) = local_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建临时目录失败: {}", e))?;
    }
    let local_str = local_path.to_string_lossy().to_string();
    let local_for_return = local_str.clone();
    let remote_for_dl = remote_path.clone();
    let sid = site_id.clone();
    let task_id = format!("edit_{}", session_id);

    tokio::task::spawn_blocking(move || {
        pool_download_with_progress(
            pool.as_ref(),
            &sid,
            &remote_for_dl,
            &local_str,
            &task_id,
            &app,
            None,
        )
    })
    .await
    .map_err(|e| format!("下载编辑文件失败: {}", e))??;

    Ok(EditSession {
        session_id,
        local_path: local_for_return,
        remote_path,
    })
}

#[tauri::command]
pub async fn commit_edit_remote(
    app: AppHandle,
    pool: State<'_, Arc<ConnectionPool>>,
    site_id: String,
    remote_path: String,
    local_path: String,
) -> Result<(), String> {
    let pool = Arc::clone(&pool);
    let task_id = format!("commit_{}", uuid::Uuid::new_v4());
    tokio::task::spawn_blocking(move || {
        pool_upload_with_progress(
            pool.as_ref(),
            &site_id,
            &local_path,
            &remote_path,
            &task_id,
            &app,
            None,
        )
    })
    .await
    .map_err(|e| format!("上传编辑文件失败: {}", e))??;
    Ok(())
}

#[tauri::command]
pub fn open_path_with_default_app(path: String) -> Result<(), String> {
    open::that(&path).map_err(|e| format!("打开文件失败: {}", e))
}

#[tauri::command]
pub fn cleanup_edit_session(local_path: String) -> Result<(), String> {
    let p = PathBuf::from(&local_path);
    if let Some(parent) = p.parent() {
        if parent.to_string_lossy().contains("CoreFTP") {
            let _ = fs::remove_dir_all(parent);
        }
    }
    Ok(())
}
