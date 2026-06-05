use std::sync::Arc;
use tauri::{AppHandle, State};
use crate::commands::files::ConnectionPool;
use crate::commands::transfer::{emit_progress_for_task, pool_remote_file_exists, pool_remote_file_size, pool_upload_with_progress};
use crate::engine::cancel::CancelRegistry;
use crate::engine::types::{ExtractOptions, ExtractResult, SiteConfig};
use crate::engine::ssh::SshConnection;

/// 上传并解压（核心功能）
#[tauri::command]
pub async fn upload_and_extract(
    app: AppHandle,
    pool: State<'_, Arc<ConnectionPool>>,
    _cancel: State<'_, Arc<CancelRegistry>>,
    site_config: SiteConfig,
    local_path: String,
    remote_path: String,
    options: ExtractOptions,
    task_id: String,
) -> Result<ExtractResult, String> {
    log::info!("upload_and_extract: {} -> {}", local_path, remote_path);

    let site_id = site_config.id.clone();
    let pool = Arc::clone(&pool);
    let remote_for_extract = remote_path.clone();

    let local_size = std::fs::metadata(&local_path)
        .map_err(|e| format!("读取本地文件失败: {}", e))?
        .len();

    let skip_upload = pool_remote_file_exists(pool.as_ref(), &site_id, &remote_path)
        .ok()
        .filter(|&exists| exists)
        .and_then(|_| {
            pool_remote_file_size(pool.as_ref(), &site_id, &remote_path)
                .ok()
                .map(|remote_size| remote_size == local_size)
        })
        .unwrap_or(false);

    if skip_upload {
        log::info!(
            "远程已存在同大小压缩包，跳过上传: {} ({} bytes)",
            remote_path,
            local_size
        );
        emit_progress_for_task(&app, &task_id, local_size, local_size, 0);
    } else {
        let app_upload = app.clone();
        let task_id_upload = task_id.clone();
        tokio::task::spawn_blocking(move || {
            pool_upload_with_progress(
                pool.as_ref(),
                &site_id,
                &local_path,
                &remote_path,
                &task_id_upload,
                &app_upload,
                None,
            )
        })
        .await
        .map_err(|e| format!("上传任务异常: {}", e))??;
    }

    // Step 2: SSH 远程解压（解压成功后在 extract_archive 内统一设置权限）
    let ssh = SshConnection::from_config(&site_config, true)?;
    let result = ssh.extract_archive(
        &remote_for_extract,
        options.target_dir.as_deref(),
        options.delete_after,
        site_config.web_owner_or_default(),
        site_config.web_group_or_default(),
    )?;

    log::info!("Extract result: success={}, exit_code={}", result.success, result.exit_code);
    Ok(result)
}

/// 仅远程解压
#[tauri::command]
pub async fn extract_remote(
    site_config: SiteConfig,
    archive_path: String,
    target_dir: Option<String>,
    delete_after: bool,
) -> Result<ExtractResult, String> {
    let ssh = SshConnection::from_config(&site_config, true)?;
    let result = ssh.extract_archive(
        &archive_path,
        target_dir.as_deref(),
        delete_after,
        site_config.web_owner_or_default(),
        site_config.web_group_or_default(),
    )?;
    Ok(result)
}

/// 检查服务器解压工具
#[tauri::command]
pub async fn check_server_tools(
    host: String,
    port: u16,
    username: String,
    password: String,
) -> Result<Vec<String>, String> {
    let ssh = SshConnection::connect(&host, port, &username, &password)?;
    ssh.check_extract_tools()
}
