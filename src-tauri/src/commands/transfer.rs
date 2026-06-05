use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use crate::commands::files::ConnectionPool;
use crate::engine::cancel::CancelRegistry;
use crate::engine::permissions::try_apply_web_permissions;
use crate::store::sites::SiteStore;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferProgressPayload {
    pub task_id: String,
    pub transferred: u64,
    pub total: u64,
    pub speed_bps: u64,
}

struct ProgressTracker {
    last_time: Instant,
    last_bytes: u64,
}

fn emit_progress(app: &AppHandle, task_id: &str, transferred: u64, total: u64, speed_bps: u64) {
    let _ = app.emit(
        "transfer-progress",
        TransferProgressPayload {
            task_id: task_id.to_string(),
            transferred,
            total,
            speed_bps,
        },
    );
}

pub fn emit_progress_for_task(app: &AppHandle, task_id: &str, transferred: u64, total: u64, speed_bps: u64) {
    emit_progress(app, task_id, transferred, total, speed_bps);
}

fn progress_callback(
    app: &AppHandle,
    task_id: &str,
    cancel: Option<Arc<CancelRegistry>>,
) -> impl FnMut(u64, u64) {
    let app = app.clone();
    let task_id = task_id.to_string();
    let tracker = Arc::new(Mutex::new(ProgressTracker {
        last_time: Instant::now(),
        last_bytes: 0,
    }));
    move |transferred, total| {
        if let Some(reg) = &cancel {
            if reg.is_cancelled(&task_id) {
                return;
            }
        }
        let mut st = tracker.lock().unwrap();
        let now = Instant::now();
        let elapsed = now.duration_since(st.last_time).as_secs_f64();
        let speed = if elapsed >= 0.25 {
            let delta = transferred.saturating_sub(st.last_bytes);
            let bps = (delta as f64 / elapsed) as u64;
            st.last_time = now;
            st.last_bytes = transferred;
            bps
        } else {
            0
        };
        emit_progress(&app, &task_id, transferred, total, speed);
    }
}

fn is_cancelled(cancel: Option<&Arc<CancelRegistry>>, task_id: &str) -> bool {
    cancel.map(|r| r.is_cancelled(task_id)).unwrap_or(false)
}

fn join_remote(base: &str, name: &str) -> String {
    let base = base.trim_end_matches('/');
    if base.is_empty() {
        format!("/{}", name)
    } else {
        format!("{}/{}", base, name)
    }
}

fn collect_upload_items(local_path: &str, remote_base: &str) -> Result<Vec<(String, String)>, String> {
    let path = Path::new(local_path);
    if !path.exists() {
        return Err(format!("路径不存在: {}", local_path));
    }

    let mut items = Vec::new();
    if path.is_file() {
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| "无效文件名".to_string())?;
        items.push((local_path.to_string(), join_remote(remote_base, name)));
        return Ok(items);
    }

    if !path.is_dir() {
        return Err(format!("无法上传: {}", local_path));
    }

    let dir_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "无效目录名".to_string())?;
    let remote_root = join_remote(remote_base, dir_name);
    let base_dir = path
        .canonicalize()
        .map_err(|e| format!("读取目录失败: {}", e))?;
    collect_dir_files(&base_dir, &base_dir, &remote_root, &mut items)?;
    Ok(items)
}

fn collect_dir_files(
    root: &Path,
    current: &Path,
    remote_base: &str,
    items: &mut Vec<(String, String)>,
) -> Result<(), String> {
    for entry in std::fs::read_dir(current).map_err(|e| format!("读取目录失败: {}", e))? {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let file_path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }

        if file_path.is_dir() {
            collect_dir_files(root, &file_path, remote_base, items)?;
        } else if file_path.is_file() {
            let rel = file_path
                .strip_prefix(root)
                .map_err(|e| format!("路径解析失败: {}", e))?;
            let rel_str = rel.to_string_lossy().replace('\\', "/");
            let remote = if rel_str.is_empty() {
                remote_base.to_string()
            } else {
                join_remote(remote_base, &rel_str)
            };
            items.push((file_path.to_string_lossy().to_string(), remote));
        }
    }
    Ok(())
}

pub fn pool_upload_with_progress(
    pool: &ConnectionPool,
    site_id: &str,
    local_path: &str,
    remote_path: &str,
    task_id: &str,
    app: &AppHandle,
    cancel: Option<Arc<CancelRegistry>>,
) -> Result<(), String> {
    let mut on_progress = progress_callback(app, task_id, cancel.clone());
    let tid = task_id.to_string();
    let check = || is_cancelled(cancel.as_ref(), &tid);

    if let Some(conn) = pool.get_sftp(site_id) {
        return conn.lock().unwrap().upload_file_with_progress(
            local_path,
            remote_path,
            |t, tot| on_progress(t, tot),
            &check,
        );
    }

    if let Some(conn) = pool.get_ftp(site_id) {
        return conn.lock().unwrap().upload_file_with_progress(
            local_path,
            remote_path,
            |t, tot| on_progress(t, tot),
            &check,
        );
    }

    Err("未连接到服务器，请先连接".into())
}

pub fn pool_download_with_progress(
    pool: &ConnectionPool,
    site_id: &str,
    remote_path: &str,
    local_path: &str,
    task_id: &str,
    app: &AppHandle,
    cancel: Option<Arc<CancelRegistry>>,
) -> Result<(), String> {
    let mut on_progress = progress_callback(app, task_id, cancel.clone());
    let tid = task_id.to_string();
    let check = || is_cancelled(cancel.as_ref(), &tid);

    if let Some(parent) = Path::new(local_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建本地目录失败: {}", e))?;
    }

    if let Some(conn) = pool.get_sftp(site_id) {
        return conn.lock().unwrap().download_file_with_progress(
            remote_path,
            local_path,
            |t, tot| on_progress(t, tot),
            &check,
        );
    }

    if let Some(conn) = pool.get_ftp(site_id) {
        return conn.lock().unwrap().download_file_with_progress(
            remote_path,
            local_path,
            |t, tot| on_progress(t, tot),
            &check,
        );
    }

    Err("未连接到服务器，请先连接".into())
}

pub fn pool_create_dir(pool: &ConnectionPool, site_id: &str, path: &str) -> Result<(), String> {
    if let Some(conn) = pool.get_sftp(site_id) {
        return conn.lock().unwrap().create_dir(path);
    }
    if let Some(conn) = pool.get_ftp(site_id) {
        return conn.lock().unwrap().create_dir(path);
    }
    Err("未连接到服务器，请先连接".into())
}

pub fn pool_rename_remote(
    pool: &ConnectionPool,
    site_id: &str,
    from: &str,
    to: &str,
) -> Result<(), String> {
    if let Some(conn) = pool.get_sftp(site_id) {
        return conn.lock().unwrap().rename(from, to);
    }
    if let Some(conn) = pool.get_ftp(site_id) {
        return conn.lock().unwrap().rename(from, to);
    }
    Err("未连接到服务器，请先连接".into())
}

pub fn pool_remote_file_exists(pool: &ConnectionPool, site_id: &str, remote_path: &str) -> Result<bool, String> {
    if let Some(conn) = pool.get_sftp(site_id) {
        return conn.lock().unwrap().file_exists(remote_path);
    }
    if let Some(conn) = pool.get_ftp(site_id) {
        return conn.lock().unwrap().file_exists(remote_path);
    }
    Err("未连接到服务器，请先连接".into())
}

pub fn pool_remote_file_size(pool: &ConnectionPool, site_id: &str, remote_path: &str) -> Result<u64, String> {
    if let Some(conn) = pool.get_sftp(site_id) {
        return conn.lock().unwrap().remote_file_size(remote_path);
    }
    if let Some(conn) = pool.get_ftp(site_id) {
        return conn.lock().unwrap().remote_file_size(remote_path);
    }
    Err("未连接到服务器，请先连接".into())
}

pub fn pool_delete_remote_file(pool: &ConnectionPool, site_id: &str, remote_path: &str) -> Result<(), String> {
    crate::engine::remote_ops::pool_delete_path(pool, site_id, remote_path)
}

#[tauri::command]
pub fn local_file_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

#[tauri::command]
pub fn path_is_dir(path: String) -> bool {
    Path::new(&path).is_dir()
}

#[tauri::command]
pub async fn remote_file_exists(
    pool: State<'_, Arc<ConnectionPool>>,
    site_id: String,
    remote_path: String,
) -> Result<bool, String> {
    pool_remote_file_exists(pool.as_ref(), &site_id, &remote_path)
}

#[tauri::command]
pub fn cancel_transfer(cancel: State<'_, Arc<CancelRegistry>>, task_id: String) {
    cancel.request_cancel(&task_id);
}

#[tauri::command]
pub async fn remote_mkdir(
    pool: State<'_, Arc<ConnectionPool>>,
    site_id: String,
    path: String,
) -> Result<(), String> {
    let pool = Arc::clone(&pool);
    let path = path.replace('\\', "/");
    tokio::task::spawn_blocking(move || pool_create_dir(pool.as_ref(), &site_id, &path))
        .await
        .map_err(|e| format!("创建目录任务异常: {}", e))?
}

#[tauri::command]
pub async fn remote_rename(
    pool: State<'_, Arc<ConnectionPool>>,
    site_id: String,
    from_path: String,
    to_path: String,
) -> Result<(), String> {
    let pool = Arc::clone(&pool);
    let from_path = from_path.replace('\\', "/");
    let to_path = to_path.replace('\\', "/");
    tokio::task::spawn_blocking(move || pool_rename_remote(pool.as_ref(), &site_id, &from_path, &to_path))
        .await
        .map_err(|e| format!("重命名任务异常: {}", e))?
}

#[tauri::command]
pub async fn upload_transfer_file(
    app: AppHandle,
    pool: State<'_, Arc<ConnectionPool>>,
    store: State<'_, SiteStore>,
    cancel: State<'_, Arc<CancelRegistry>>,
    site_id: String,
    local_path: String,
    remote_path: String,
    task_id: String,
) -> Result<(), String> {
    let pool = Arc::clone(&pool);
    let cancel = Arc::clone(&cancel);
    let site_config = store.get(&site_id);
    let remote_for_perm = remote_path.clone();
    tokio::task::spawn_blocking(move || {
        pool_upload_with_progress(
            pool.as_ref(),
            &site_id,
            &local_path,
            &remote_path,
            &task_id,
            &app,
            Some(cancel),
        )?;
        if let Some(cfg) = site_config {
            try_apply_web_permissions(&cfg, &remote_for_perm, false);
        }
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("上传任务异常: {}", e))??;
    Ok(())
}

#[tauri::command]
pub async fn upload_transfer_paths(
    app: AppHandle,
    pool: State<'_, Arc<ConnectionPool>>,
    store: State<'_, SiteStore>,
    cancel: State<'_, Arc<CancelRegistry>>,
    site_id: String,
    local_paths: Vec<String>,
    remote_base: String,
    task_id: String,
) -> Result<u32, String> {
    let items = {
        let mut all = Vec::new();
        for local_path in &local_paths {
            all.extend(collect_upload_items(local_path, &remote_base)?);
        }
        all
    };

    let total_files = items.len() as u32;
    let pool = Arc::clone(&pool);
    let cancel = Arc::clone(&cancel);
    let site_config = store.get(&site_id);
    let remote_base_perm = remote_base.clone();
    tokio::task::spawn_blocking(move || {
        for (local_path, remote_path) in items {
            if cancel.is_cancelled(&task_id) {
                return Err("传输已取消".into());
            }
            pool_upload_with_progress(
                pool.as_ref(),
                &site_id,
                &local_path,
                &remote_path,
                &task_id,
                &app,
                Some(Arc::clone(&cancel)),
            )?;
        }
        if let Some(cfg) = site_config {
            try_apply_web_permissions(&cfg, &remote_base_perm, true);
        }
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("上传任务异常: {}", e))??;

    Ok(total_files)
}

#[tauri::command]
pub async fn download_transfer_file(
    app: AppHandle,
    pool: State<'_, Arc<ConnectionPool>>,
    cancel: State<'_, Arc<CancelRegistry>>,
    site_id: String,
    remote_path: String,
    local_path: String,
    task_id: String,
) -> Result<(), String> {
    let pool = Arc::clone(&pool);
    let cancel = Arc::clone(&cancel);
    tokio::task::spawn_blocking(move || {
        pool_download_with_progress(
            pool.as_ref(),
            &site_id,
            &remote_path,
            &local_path,
            &task_id,
            &app,
            Some(cancel),
        )
    })
    .await
    .map_err(|e| format!("下载任务异常: {}", e))??;
    Ok(())
}

#[tauri::command]
pub async fn delete_remote_file(
    pool: State<'_, Arc<ConnectionPool>>,
    site_id: String,
    remote_path: String,
) -> Result<(), String> {
    let pool = Arc::clone(&pool);
    tokio::task::spawn_blocking(move || pool_delete_remote_file(pool.as_ref(), &site_id, &remote_path))
        .await
        .map_err(|e| format!("删除任务异常: {}", e))??;
    Ok(())
}

#[tauri::command]
pub fn delete_local_file(path: String) -> Result<(), String> {
    crate::engine::remote_ops::local_delete_path(&path)
}

#[tauri::command]
pub async fn download_transfer_paths(
    app: AppHandle,
    pool: State<'_, Arc<ConnectionPool>>,
    cancel: State<'_, Arc<CancelRegistry>>,
    site_id: String,
    remote_paths: Vec<String>,
    local_base: String,
    task_id: String,
) -> Result<u32, String> {
    let mut all_items: Vec<(String, String)> = Vec::new();
    for remote_path in &remote_paths {
        let mut items = Vec::new();
        pool_collect_download_items(pool.as_ref(), &site_id, remote_path, &local_base, &mut items)?;
        all_items.extend(items);
    }
    let total = all_items.len() as u32;
    let pool = Arc::clone(&pool);
    let cancel = Arc::clone(&cancel);
    tokio::task::spawn_blocking(move || {
        for (remote_path, local_path) in all_items {
            if cancel.is_cancelled(&task_id) {
                return Err("传输已取消".into());
            }
            pool_download_with_progress(
                pool.as_ref(),
                &site_id,
                &remote_path,
                &local_path,
                &task_id,
                &app,
                Some(Arc::clone(&cancel)),
            )?;
        }
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("下载任务异常: {}", e))??;
    Ok(total)
}

fn pool_collect_download_items(
    pool: &ConnectionPool,
    site_id: &str,
    remote_path: &str,
    local_base: &str,
    items: &mut Vec<(String, String)>,
) -> Result<(), String> {
    let collected = crate::engine::remote_ops::pool_collect_download_items(
        pool,
        site_id,
        remote_path,
        local_base,
    )?;
    items.extend(collected);
    Ok(())
}

#[tauri::command]
pub fn copy_local_files(target_dir: String, paths: Vec<String>) -> Result<u32, String> {
    let target = PathBuf::from(&target_dir);
    if !target.is_dir() {
        return Err("目标不是目录".into());
    }

    let mut count = 0u32;
    for src in paths {
        let src_path = Path::new(&src);
        if !src_path.exists() {
            continue;
        }
        if src_path.is_file() {
            let name = src_path
                .file_name()
                .ok_or_else(|| format!("无效路径: {}", src))?;
            let dest = target.join(name);
            std::fs::copy(src_path, &dest).map_err(|e| format!("复制失败: {}", e))?;
            count += 1;
        } else if src_path.is_dir() {
            count += copy_dir_recursive(src_path, &target.join(src_path.file_name().unwrap()))?;
        }
    }
    Ok(count)
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<u32, String> {
    std::fs::create_dir_all(dest).map_err(|e| format!("创建目录失败: {}", e))?;
    let mut count = 0u32;
    for entry in std::fs::read_dir(src).map_err(|e| format!("读取目录失败: {}", e))? {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let file_type = entry.file_type().map_err(|e| format!("读取类型失败: {}", e))?;
        let target = dest.join(entry.file_name());
        if file_type.is_dir() {
            count += copy_dir_recursive(&entry.path(), &target)?;
        } else if file_type.is_file() {
            std::fs::copy(entry.path(), &target).map_err(|e| format!("复制失败: {}", e))?;
            count += 1;
        }
    }
    Ok(count)
}
