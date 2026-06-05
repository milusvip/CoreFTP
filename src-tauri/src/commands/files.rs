use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::State;
use tokio::task::JoinHandle;
use tokio::time::timeout;
use crate::engine::types::{FileEntry, Protocol, SiteConfig};
use crate::engine::ftp::{FtpConnection, FtpConnectOptions};
use crate::engine::sftp::SftpConnection;
use crate::store::logs::{app_error, app_info, AppLog};
use crate::store::settings::SettingsStore;

const KEEPALIVE_INTERVAL_SECS: u64 = 25;

/// 活跃的 FTP/SFTP 连接池（按站点 ID 存储）
pub struct ConnectionPool {
    pub ftp_connections: Mutex<HashMap<String, Arc<Mutex<FtpConnection>>>>,
    pub sftp_connections: Mutex<HashMap<String, Arc<Mutex<SftpConnection>>>>,
    keepalive_tasks: Mutex<HashMap<String, JoinHandle<()>>>,
}

impl ConnectionPool {
    pub fn new() -> Self {
        ConnectionPool {
            ftp_connections: Mutex::new(HashMap::new()),
            sftp_connections: Mutex::new(HashMap::new()),
            keepalive_tasks: Mutex::new(HashMap::new()),
        }
    }

    pub fn get_sftp(&self, site_id: &str) -> Option<Arc<Mutex<SftpConnection>>> {
        self.sftp_connections
            .lock()
            .unwrap()
            .get(site_id)
            .cloned()
    }

    pub fn get_ftp(&self, site_id: &str) -> Option<Arc<Mutex<FtpConnection>>> {
        self.ftp_connections
            .lock()
            .unwrap()
            .get(site_id)
            .cloned()
    }

    pub fn take_sftp(&self, site_id: &str) -> Option<Arc<Mutex<SftpConnection>>> {
        self.sftp_connections.lock().unwrap().remove(site_id)
    }

    pub fn take_ftp(&self, site_id: &str) -> Option<Arc<Mutex<FtpConnection>>> {
        self.ftp_connections.lock().unwrap().remove(site_id)
    }

    fn stop_keepalive(&self, site_id: &str) {
        if let Some(handle) = self.keepalive_tasks.lock().unwrap().remove(site_id) {
            handle.abort();
        }
    }

    pub fn drop_connection(&self, site_id: &str) {
        self.stop_keepalive(site_id);
        if let Some(ftp) = self.take_ftp(site_id) {
            if let Ok(mut conn) = ftp.lock() {
                let _ = conn.disconnect();
            }
        }
        if let Some(sftp) = self.take_sftp(site_id) {
            if let Ok(conn) = sftp.lock() {
                let _ = conn.disconnect_session();
            }
        }
    }

    /// 连接池里是否仍有该站点的活跃连接
    pub fn has_connection(&self, site_id: &str) -> bool {
        self.get_sftp(site_id).is_some() || self.get_ftp(site_id).is_some()
    }

    /// 发送 NOOP/keepalive；仅用于后台保活，不作为「是否可传输」的唯一依据
    pub fn ping_connection(&self, site_id: &str) -> bool {
        if let Some(conn) = self.get_sftp(site_id) {
            return conn
                .lock()
                .ok()
                .map(|c| c.ping().is_ok())
                .unwrap_or(false);
        }
        if let Some(conn) = self.get_ftp(site_id) {
            return conn
                .lock()
                .ok()
                .map(|mut c| c.noop().is_ok())
                .unwrap_or(false);
        }
        false
    }

    fn start_keepalive(self: &Arc<Self>, site_id: String, protocol: Protocol) {
        self.stop_keepalive(&site_id);
        let pool = Arc::clone(self);
        let site_id_for_task = site_id.clone();
        let is_sftp = protocol.uses_ssh_transport();
        let handle = tokio::spawn(async move {
            let mut ticker = tokio::time::interval(Duration::from_secs(KEEPALIVE_INTERVAL_SECS));
            ticker.tick().await;
            loop {
                ticker.tick().await;
                let pool = Arc::clone(&pool);
                let site_id = site_id_for_task.clone();
                let pool_for_ping = Arc::clone(&pool);
                let _ = tokio::task::spawn_blocking(move || {
                    if is_sftp {
                        if let Some(conn) = pool_for_ping.get_sftp(&site_id) {
                            if let Ok(c) = conn.try_lock() {
                                let _ = c.ping();
                            }
                        }
                    } else if let Some(conn) = pool_for_ping.get_ftp(&site_id) {
                        if let Ok(mut c) = conn.try_lock() {
                            let _ = c.noop();
                        }
                    }
                })
                .await;
            }
        });
        self.keepalive_tasks
            .lock()
            .unwrap()
            .insert(site_id, handle);
    }
}

fn is_stale_connection_error(msg: &str) -> bool {
    let lower = msg.to_lowercase();
    lower.contains("连接已断开")
        || lower.contains("broken pipe")
        || lower.contains("connection reset")
        || lower.contains("connection aborted")
        || lower.contains("connection refused")
        || lower.contains("forcibly closed")
        || lower.contains("not connected")
        || lower.contains("eof")
        || lower.contains("session terminated")
        || lower.contains("socket is not connected")
}

#[tauri::command]
pub async fn connect_server(
    pool: State<'_, Arc<ConnectionPool>>,
    settings: State<'_, SettingsStore>,
    log_store: State<'_, AppLog>,
    config: SiteConfig,
    trust_new_host: bool,
) -> Result<String, String> {
    let site_id = config.id.clone();
    let protocol = config.protocol.clone();
    let app_settings = settings.get();
    let timeout_secs = app_settings.connect_timeout_secs.max(5) as u64;
    app_info(
        &log_store,
        format!("连接站点 {} ({})", config.name, config.host),
    );

    pool.as_ref().drop_connection(&site_id);

    match config.protocol {
        Protocol::FTP | Protocol::FTPS => {
            let ftp_opts = FtpConnectOptions {
                passive: app_settings.ftp_passive,
                encoding: app_settings.ftp_encoding.clone(),
            };
            let handle = tokio::task::spawn_blocking(move || {
                FtpConnection::connect(&config, &ftp_opts)
            });

            let ftp_result = match timeout(Duration::from_secs(timeout_secs), handle).await {
                Ok(Ok(Ok(conn))) => conn,
                Ok(Ok(Err(e))) => {
                    app_error(&log_store, format!("FTP 连接失败: {}", e));
                    return Err(e);
                }
                Ok(Err(join_err)) => {
                    log::error!("FTP task panicked: {}", join_err);
                    return Err(format!("连接任务异常: {}", join_err));
                }
                Err(_) => {
                    log::error!("FTP connect timed out");
                    return Err("连接超时，请检查服务器地址和端口是否正确".into());
                }
            };

            let mut ftp_map = pool.as_ref().ftp_connections.lock().unwrap();
            ftp_map.insert(site_id.clone(), Arc::new(Mutex::new(ftp_result)));
            log::info!("FTP connection stored for site: {}", site_id);
            pool.start_keepalive(site_id.clone(), protocol);
            Ok(site_id)
        }
        Protocol::SFTP | Protocol::SSH => {
            let trust_new_host = trust_new_host;
            let handle = tokio::task::spawn_blocking(move || {
                // 刚断开旧连接时稍等，避免服务端尚未释放会话
                std::thread::sleep(std::time::Duration::from_millis(250));
                let conn = SftpConnection::connect_for_site(&config, trust_new_host)?;
                Ok::<_, String>(conn)
            });

            let sftp_result = match timeout(Duration::from_secs(timeout_secs), handle).await {
                Ok(Ok(Ok(conn))) => conn,
                Ok(Ok(Err(e))) => {
                    log::error!("SFTP connect failed: {}", e);
                    return Err(e);
                }
                Ok(Err(join_err)) => {
                    log::error!("SFTP task panicked: {}", join_err);
                    return Err(format!("连接任务异常: {}", join_err));
                }
                Err(_) => {
                    log::error!("SFTP connect timed out");
                    return Err("连接超时，请检查服务器地址和端口是否正确".into());
                }
            };

            let mut sftp_map = pool.as_ref().sftp_connections.lock().unwrap();
            sftp_map.insert(site_id.clone(), Arc::new(Mutex::new(sftp_result)));
            log::info!("SFTP connection stored for site: {}", site_id);
            pool.start_keepalive(site_id.clone(), protocol);
            Ok(site_id)
        }
    }
}

#[tauri::command]
pub async fn list_remote_files(
    pool: State<'_, Arc<ConnectionPool>>,
    settings: State<'_, SettingsStore>,
    site_id: String,
    path: String,
) -> Result<Vec<FileEntry>, String> {
    let connect_secs = settings.get().connect_timeout_secs.max(5) as u64;
    let timeout_secs = connect_secs.max(60);
    let pool = Arc::clone(&pool);
    let pool_for_cleanup = Arc::clone(&pool);
    let site_id_for_task = site_id.clone();

    let result = timeout(
        Duration::from_secs(timeout_secs),
        tokio::task::spawn_blocking(move || {
            if let Some(conn) = pool.get_sftp(&site_id_for_task) {
                return conn.lock().unwrap().list_dir(&path);
            }
            if let Some(conn) = pool.get_ftp(&site_id_for_task) {
                return conn.lock().unwrap().list_dir(&path);
            }
            Err("未连接到服务器，请先连接".into())
        }),
    )
    .await;

    match result {
        Ok(Ok(Ok(files))) => Ok(files),
        Ok(Ok(Err(e))) => {
            if is_stale_connection_error(&e) {
                pool_for_cleanup.drop_connection(&site_id);
                Err(format!("连接已断开: {}", e))
            } else {
                Err(e)
            }
        }
        Ok(Err(join_err)) => Err(format!("读取目录任务异常: {}", join_err)),
        Err(_) => {
            pool_for_cleanup.drop_connection(&site_id);
            Err("连接超时，可能已断开，请重新连接".into())
        }
    }
}

#[tauri::command]
pub async fn check_server_connection(
    pool: State<'_, Arc<ConnectionPool>>,
    site_id: String,
) -> Result<bool, String> {
    let pool = Arc::clone(&pool);
    tokio::task::spawn_blocking(move || pool.has_connection(&site_id))
        .await
        .map_err(|e| format!("检测连接异常: {}", e))
}

#[tauri::command]
pub async fn disconnect_server(
    pool: State<'_, Arc<ConnectionPool>>,
    terminal_pool: State<'_, Arc<crate::commands::terminal::TerminalPool>>,
    site_id: String,
) -> Result<(), String> {
    terminal_pool.close_for_site(&site_id);
    pool.as_ref().drop_connection(&site_id);
    Ok(())
}

/// 获取用户主目录
#[tauri::command]
pub fn get_home_dir() -> Result<String, String> {
    Ok(dirs_next::home_dir()
        .and_then(|p| p.to_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "C:\\".into()))
}

/// 递归搜索本地文件
#[tauri::command]
pub fn search_local_files(root_path: String, query: String) -> Result<Vec<FileEntry>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let q = query.to_lowercase();
    let root = Path::new(&root_path);
    if !root.exists() {
        return Err("路径不存在".into());
    }

    let mut results = Vec::new();
    let mut dirs = vec![root.to_path_buf()];

    while let Some(dir) = dirs.pop() {
        if results.len() >= 200 {
            break; // limit results
        }
        let rd = match std::fs::read_dir(&dir) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for entry in rd {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }

            let file_path = entry.path();
            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };

            if metadata.is_dir() {
                dirs.push(file_path.clone());
            }

            if name.to_lowercase().contains(&q) {
                let modified = metadata
                    .modified()
                    .ok()
                    .map(|t| {
                        let secs = t
                            .duration_since(std::time::UNIX_EPOCH)
                            .ok()
                            .map(|d| d.as_secs())
                            .unwrap_or(0);
                        use chrono::DateTime;
                        DateTime::from_timestamp(secs as i64, 0)
                            .map(|dt| dt.format("%Y-%m-%d %H:%M").to_string())
                            .unwrap_or_default()
                    })
                    .unwrap_or_default();

                results.push(FileEntry {
                    name,
                    path: file_path.to_string_lossy().to_string(),
                    is_dir: metadata.is_dir(),
                    size: metadata.len(),
                    modified,
                    permissions: None,
                });
            }
        }
    }

    Ok(results)
}

/// 列出本地文件系统目录
#[tauri::command]
pub fn list_local_files(path_str: String) -> Result<Vec<FileEntry>, String> {
    let path = Path::new(&path_str);
    if !path.exists() {
        return Err(format!("路径不存在: {}", path_str));
    }
    if !path.is_dir() {
        return Err(format!("不是目录: {}", path_str));
    }

    let mut entries = Vec::new();

    if let Some(parent) = path.parent() {
        if let Some(parent_str) = parent.to_str() {
            entries.push(FileEntry {
                name: "..".into(),
                path: parent_str.to_string(),
                is_dir: true,
                size: 0,
                modified: String::new(),
                permissions: None,
            });
        }
    }

    let mut dirs = Vec::new();
    let mut files = Vec::new();

    let rd = std::fs::read_dir(path).map_err(|e| format!("读取目录失败: {}", e))?;
    for entry in rd {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let name = entry.file_name().to_string_lossy().to_string();
        let file_path = entry.path();

        if name.starts_with('.') {
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let modified = metadata
            .modified()
            .ok()
            .map(|t| {
                let secs = t
                    .duration_since(std::time::UNIX_EPOCH)
                    .ok()
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                use chrono::DateTime;
                DateTime::from_timestamp(secs as i64, 0)
                    .map(|dt| dt.format("%Y-%m-%d %H:%M").to_string())
                    .unwrap_or_default()
            })
            .unwrap_or_default();

        let fe = FileEntry {
            name,
            path: file_path.to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
            size: metadata.len(),
            modified,
            permissions: None,
        };

        if metadata.is_dir() {
            dirs.push(fe);
        } else {
            files.push(fe);
        }
    }

    dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    entries.extend(dirs);
    entries.extend(files);

    Ok(entries)
}

#[tauri::command]
pub async fn search_remote_files(
    pool: State<'_, Arc<ConnectionPool>>,
    site_id: String,
    root_path: String,
    query: String,
) -> Result<Vec<FileEntry>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let pool = Arc::clone(&pool);
    let root = root_path;
    let q = query;
    tokio::task::spawn_blocking(move || {
        crate::engine::remote_ops::pool_search_remote(pool.as_ref(), &site_id, &root, &q, 200)
    })
    .await
    .map_err(|e| format!("搜索任务异常: {}", e))?
}

#[tauri::command]
pub fn local_mkdir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(Path::new(&path)).map_err(|e| format!("创建目录失败: {}", e))
}

#[tauri::command]
pub fn local_rename(from_path: String, to_path: String) -> Result<(), String> {
    std::fs::rename(Path::new(&from_path), Path::new(&to_path))
        .map_err(|e| format!("重命名失败: {}", e))
}
