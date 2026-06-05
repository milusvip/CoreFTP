use std::path::{Path, PathBuf};
use crate::commands::files::ConnectionPool;
use crate::engine::types::FileEntry;

pub fn pool_delete_path(pool: &ConnectionPool, site_id: &str, path: &str) -> Result<(), String> {
    if let Some(conn) = pool.get_sftp(site_id) {
        return conn.lock().unwrap().delete_path_recursive(path);
    }
    if let Some(conn) = pool.get_ftp(site_id) {
        return conn.lock().unwrap().delete_path_recursive(path);
    }
    Err("未连接到服务器，请先连接".into())
}

pub fn pool_collect_download_items(
    pool: &ConnectionPool,
    site_id: &str,
    remote_path: &str,
    local_base: &str,
) -> Result<Vec<(String, String)>, String> {
    let mut items = Vec::new();
    if let Some(conn) = pool.get_sftp(site_id) {
        conn.lock().unwrap().collect_download_items(remote_path, local_base, &mut items)?;
        return Ok(items);
    }
    if let Some(conn) = pool.get_ftp(site_id) {
        conn.lock().unwrap().collect_download_items(remote_path, local_base, &mut items)?;
        return Ok(items);
    }
    Err("未连接到服务器，请先连接".into())
}

pub fn pool_collect_remote_file_paths(
    pool: &ConnectionPool,
    site_id: &str,
    remote_root: &str,
    max: usize,
) -> Result<Vec<String>, String> {
    let mut paths = Vec::new();
    if let Some(conn) = pool.get_sftp(site_id) {
        conn.lock()
            .unwrap()
            .collect_remote_file_paths(remote_root, &mut paths, max)?;
        return Ok(paths);
    }
    if let Some(conn) = pool.get_ftp(site_id) {
        conn.lock()
            .unwrap()
            .collect_remote_file_paths(remote_root, &mut paths, max)?;
        return Ok(paths);
    }
    Err("未连接到服务器，请先连接".into())
}

pub fn pool_search_remote(
    pool: &ConnectionPool,
    site_id: &str,
    root: &str,
    query: &str,
    max: usize,
) -> Result<Vec<FileEntry>, String> {
    let mut results = Vec::new();
    if let Some(conn) = pool.get_sftp(site_id) {
        conn.lock().unwrap().search_recursive(root, query, max, &mut results)?;
        return Ok(results);
    }
    if let Some(conn) = pool.get_ftp(site_id) {
        conn.lock().unwrap().search_recursive(root, query, max, &mut results)?;
        return Ok(results);
    }
    Err("未连接到服务器，请先连接".into())
}

pub fn local_delete_path(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    if !p.exists() {
        return Err(format!("路径不存在: {}", path));
    }
    if p.is_dir() {
        std::fs::remove_dir_all(p).map_err(|e| format!("删除目录失败: {}", e))
    } else {
        std::fs::remove_file(p).map_err(|e| format!("删除文件失败: {}", e))
    }
}

pub fn join_local_path(base: &str, name: &str) -> PathBuf {
    PathBuf::from(base).join(name)
}
