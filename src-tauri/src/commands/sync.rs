use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use serde::Deserialize;
use tauri::State;
use crate::commands::files::ConnectionPool;
use crate::commands::transfer::{pool_upload_with_progress, pool_remote_file_exists, pool_delete_remote_file};
use crate::engine::remote_ops::{self, local_delete_path};
use crate::commands::transfer::pool_download_with_progress;
use crate::engine::cancel::CancelRegistry;
use tauri::AppHandle;

const SYNC_MAX_FILES: usize = 50_000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncMirrorOptions {
    pub site_id: String,
    pub local_root: String,
    pub remote_root: String,
    /// upload | download
    pub direction: String,
    pub delete_extra: bool,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncMirrorResult {
    pub uploaded: u32,
    pub downloaded: u32,
    pub deleted: u32,
    pub errors: Vec<String>,
}

fn normalize_root(path: &str) -> String {
    let p = path.replace('\\', "/");
    if p == "/" {
        return p;
    }
    p.trim_end_matches('/').to_string()
}

fn relative_under_root(root: &str, full: &str) -> Option<String> {
    let root = normalize_root(root);
    let full = full.replace('\\', "/");
    if root == "/" {
        return Some(full.trim_start_matches('/').to_string());
    }
    if full == root {
        return Some(String::new());
    }
    let prefix = format!("{}/", root);
    if full.starts_with(&prefix) {
        return Some(full[prefix.len()..].to_string());
    }
    None
}

fn local_files_recursive(root: &Path) -> Result<Vec<(String, u64)>, String> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        if out.len() >= SYNC_MAX_FILES {
            break;
        }
        for entry in std::fs::read_dir(&dir).map_err(|e| format!("读取目录失败: {}", e))? {
            let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            let p = entry.path();
            if p.is_dir() {
                stack.push(p);
            } else if p.is_file() {
                let meta = entry.metadata().map_err(|e| format!("读取文件信息失败: {}", e))?;
                out.push((p.to_string_lossy().to_string(), meta.len()));
            }
        }
    }
    Ok(out)
}

fn local_relative_file_set(local_root: &str) -> Result<HashSet<String>, String> {
    let root_path = Path::new(local_root);
    if !root_path.exists() {
        return Ok(HashSet::new());
    }
    let files = local_files_recursive(root_path)?;
    let mut set = HashSet::new();
    for (full, _) in files {
        let rel = PathBuf::from(&full)
            .strip_prefix(root_path)
            .map_err(|_| format!("路径解析失败: {}", full))?
            .to_string_lossy()
            .replace('\\', "/");
        set.insert(rel);
    }
    Ok(set)
}

fn delete_extra_on_remote(
    pool: &ConnectionPool,
    site_id: &str,
    local_root: &str,
    remote_root: &str,
    task_id: &str,
    cancel: &CancelRegistry,
    result: &mut SyncMirrorResult,
) {
    let local_set = match local_relative_file_set(local_root) {
        Ok(s) => s,
        Err(e) => {
            result.errors.push(e);
            return;
        }
    };
    let remote_paths = match remote_ops::pool_collect_remote_file_paths(
        pool,
        site_id,
        remote_root,
        SYNC_MAX_FILES,
    ) {
        Ok(p) => p,
        Err(e) => {
            result.errors.push(e);
            return;
        }
    };

    let mut to_delete: Vec<String> = remote_paths
        .into_iter()
        .filter(|remote_path| {
            relative_under_root(remote_root, remote_path)
                .map(|rel| !local_set.contains(&rel))
                .unwrap_or(false)
        })
        .collect();
    to_delete.sort_by_key(|p| std::cmp::Reverse(p.len()));

    for remote_path in to_delete {
        if cancel.is_cancelled(task_id) {
            break;
        }
        match pool_delete_remote_file(pool, site_id, &remote_path) {
            Ok(()) => result.deleted += 1,
            Err(e) => result.errors.push(format!("删除远程 {}: {}", remote_path, e)),
        }
    }
}

fn delete_extra_on_local(
    pool: &ConnectionPool,
    site_id: &str,
    local_root: &str,
    remote_root: &str,
    task_id: &str,
    cancel: &CancelRegistry,
    result: &mut SyncMirrorResult,
) {
    let expected_locals: HashSet<String> = match remote_ops::pool_collect_download_items(
        pool,
        site_id,
        remote_root,
        local_root,
    ) {
        Ok(items) => items.into_iter().map(|(_, local)| local).collect(),
        Err(e) => {
            result.errors.push(e);
            return;
        }
    };

    let root_path = Path::new(local_root);
    if !root_path.exists() {
        return;
    }
    let local_files = match local_files_recursive(root_path) {
        Ok(f) => f,
        Err(e) => {
            result.errors.push(e);
            return;
        }
    };

    let mut to_delete: Vec<String> = local_files
        .into_iter()
        .map(|(full, _)| full)
        .filter(|full| !expected_locals.contains(full))
        .collect();
    to_delete.sort_by_key(|p| std::cmp::Reverse(p.len()));

    for local_path in to_delete {
        if cancel.is_cancelled(task_id) {
            break;
        }
        match local_delete_path(&local_path) {
            Ok(()) => result.deleted += 1,
            Err(e) => result.errors.push(format!("删除本地 {}: {}", local_path, e)),
        }
    }
}

#[tauri::command]
pub async fn sync_mirror(
    app: AppHandle,
    pool: State<'_, Arc<ConnectionPool>>,
    cancel: State<'_, Arc<CancelRegistry>>,
    options: SyncMirrorOptions,
    task_id: String,
) -> Result<SyncMirrorResult, String> {
    let pool = Arc::clone(&pool);
    let cancel = Arc::clone(&cancel);
    let direction = options.direction.clone();
    let site_id = options.site_id.clone();
    let local_root = options.local_root.clone();
    let remote_root = options.remote_root.clone();
    let delete_extra = options.delete_extra;

    tokio::task::spawn_blocking(move || {
        let mut result = SyncMirrorResult {
            uploaded: 0,
            downloaded: 0,
            deleted: 0,
            errors: Vec::new(),
        };

        if direction == "upload" {
            let local_root_path = Path::new(&local_root);
            if !local_root_path.exists() {
                return Err("本地路径不存在".into());
            }
            let files = local_files_recursive(local_root_path)?;
            for (local_path, _size) in files {
                if cancel.is_cancelled(&task_id) {
                    break;
                }
                let rel = PathBuf::from(&local_path)
                    .strip_prefix(local_root_path)
                    .map_err(|_| format!("路径解析失败: {}", local_path))?
                    .to_string_lossy()
                    .replace('\\', "/");
                let remote_path = if rel.is_empty() {
                    remote_root.clone()
                } else {
                    format!(
                        "{}/{}",
                        remote_root.trim_end_matches('/'),
                        rel.trim_start_matches('/')
                    )
                };
                let exists = pool_remote_file_exists(pool.as_ref(), &site_id, &remote_path).unwrap_or(false);
                if !exists {
                    match pool_upload_with_progress(
                        pool.as_ref(),
                        &site_id,
                        &local_path,
                        &remote_path,
                        &task_id,
                        &app,
                        Some(cancel.clone()),
                    ) {
                        Ok(()) => result.uploaded += 1,
                        Err(e) => result.errors.push(e),
                    }
                }
            }
            if delete_extra {
                delete_extra_on_remote(
                    pool.as_ref(),
                    &site_id,
                    &local_root,
                    &remote_root,
                    &task_id,
                    cancel.as_ref(),
                    &mut result,
                );
            }
        } else if direction == "download" {
            let items =
                remote_ops::pool_collect_download_items(pool.as_ref(), &site_id, &remote_root, &local_root)?;
            for (remote_path, local_path) in items {
                if cancel.is_cancelled(&task_id) {
                    break;
                }
                let lp = Path::new(&local_path);
                if !lp.exists() {
                    match pool_download_with_progress(
                        pool.as_ref(),
                        &site_id,
                        &remote_path,
                        &local_path,
                        &task_id,
                        &app,
                        Some(cancel.clone()),
                    ) {
                        Ok(()) => result.downloaded += 1,
                        Err(e) => result.errors.push(e),
                    }
                }
            }
            if delete_extra {
                delete_extra_on_local(
                    pool.as_ref(),
                    &site_id,
                    &local_root,
                    &remote_root,
                    &task_id,
                    cancel.as_ref(),
                    &mut result,
                );
            }
        } else {
            return Err("direction 必须是 upload 或 download".into());
        }

        Ok(result)
    })
    .await
    .map_err(|e| format!("同步任务异常: {}", e))?
}
