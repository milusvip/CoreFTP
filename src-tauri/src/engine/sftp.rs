use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::Path;
use ssh2::{FileStat, Session, Sftp};
use crate::engine::permissions::WEB_MODE;
use crate::engine::ssh_session::connect_authenticated_session;
use crate::engine::tcp_util::configure_data_socket_timeouts;
use crate::engine::types::{FileEntry, SiteConfig};

const DATA_SOCKET_TIMEOUT_SECS: u64 = 60;

/// SFTP 连接（基于 ssh2）
pub struct SftpConnection {
    session: Session,
    sftp: Sftp,
}

impl SftpConnection {
    pub fn from_authenticated_session(session: Session) -> Result<Self, String> {
        session.set_keepalive(true, 30);
        let sftp = session
            .sftp()
            .map_err(|e| format!("SFTP 初始化失败: {}", e))?;
        Ok(SftpConnection { session, sftp })
    }

    pub fn connect_for_site(config: &SiteConfig, trust_new_host: bool) -> Result<Self, String> {
        let session = connect_authenticated_session(config, trust_new_host)?;
        Self::from_authenticated_session(session)
    }

    pub fn connect(host: &str, port: u16, username: &str, password: &str) -> Result<Self, String> {
        let config = SiteConfig {
            id: String::new(),
            name: String::new(),
            host: host.to_string(),
            port,
            protocol: crate::engine::types::Protocol::SFTP,
            username: username.to_string(),
            password: Some(password.to_string()),
            private_key: None,
            private_key_passphrase: None,
            default_remote_path: None,
            web_owner: None,
            web_group: None,
            category_id: None,
        };
        Self::connect_for_site(&config, true)
    }

    /// 通过密钥连接 SFTP
    pub fn connect_with_key(
        host: &str,
        port: u16,
        username: &str,
        private_key_path: &str,
        passphrase: Option<&str>,
    ) -> Result<Self, String> {
        let config = SiteConfig {
            id: String::new(),
            name: String::new(),
            host: host.to_string(),
            port,
            protocol: crate::engine::types::Protocol::SFTP,
            username: username.to_string(),
            password: None,
            private_key: Some(private_key_path.to_string()),
            private_key_passphrase: passphrase.map(|s| s.to_string()),
            default_remote_path: None,
            web_owner: None,
            web_group: None,
            category_id: None,
        };
        Self::connect_for_site(&config, true)
    }

    pub fn open_interactive_shell(&mut self, cols: u32, rows: u32) -> Result<ssh2::Channel, String> {
        let mut channel = self
            .session
            .channel_session()
            .map_err(|e| format!("创建 SSH Shell 通道失败: {}", e))?;

        channel
            .request_pty("xterm-256color", None, Some((cols.max(20), rows.max(5), 0, 0)))
            .map_err(|e| format!("请求 PTY 失败: {}", e))?;

        channel
            .shell()
            .map_err(|e| format!("启动 Shell 失败: {}", e))?;

        Ok(channel)
    }

    /// 列出目录
    pub fn list_dir(&self, path: &str) -> Result<Vec<FileEntry>, String> {
        let entries = self.sftp.readdir(Path::new(path))
            .map_err(|e| format!("读取目录失败: {}", e))?;

        let files: Vec<FileEntry> = entries
            .iter()
            .filter_map(|(path, stat)| {
                let name = path.file_name()?.to_str()?.to_string();
                if name == "." || name == ".." {
                    return None;
                }
                let modified = stat.mtime
                    .map(|t| {
                        use chrono::{DateTime, Utc};
                        let dt = DateTime::from_timestamp(t as i64, 0)?;
                        Some(dt.format("%Y-%m-%d %H:%M").to_string())
                    })
                    .flatten()
                    .unwrap_or_default();

                Some(FileEntry {
                    name,
                    path: path.to_str()?.to_string(),
                    is_dir: stat.is_dir(),
                    size: stat.size.unwrap_or(0),
                    modified,
                    permissions: None,
                })
            })
            .collect();

        let base = path.replace('\\', "/");
        let parent = if base.is_empty() || base == "/" {
            "/".to_string()
        } else {
            Path::new(&base)
                .parent()
                .and_then(|p| p.to_str())
                .filter(|s| !s.is_empty())
                .unwrap_or("/")
                .to_string()
        };
        let mut out = files;
        out.insert(
            0,
            FileEntry {
                name: "..".into(),
                path: parent,
                is_dir: true,
                size: 0,
                modified: String::new(),
                permissions: None,
            },
        );
        Ok(out)
    }

    pub fn upload_file_with_progress<F>(
        &self,
        local_path: &str,
        remote_path: &str,
        mut on_progress: F,
        should_cancel: impl Fn() -> bool,
    ) -> Result<(), String>
    where
        F: FnMut(u64, u64),
    {
        let total = std::fs::metadata(local_path)
            .map_err(|e| format!("读取本地文件信息失败: {}", e))?
            .len();

        let mut local_file = std::fs::File::open(local_path)
            .map_err(|e| format!("打开本地文件失败: {}", e))?;

        if let Some(parent) = Path::new(remote_path).parent() {
            let _ = self.sftp.mkdir(parent, WEB_MODE as i32);
        }

        let mut remote_file = self
            .sftp
            .create(Path::new(remote_path))
            .map_err(|e| format!("创建远程文件失败: {}", e))?;

        let mut transferred: u64 = 0;
        // 大文件（>100MB）用 1MB 缓冲区，小文件用 256KB — 减少 SFTP 往返次数
        let buf_size: usize = if total > 50_000_000 { 1_048_576 } else { 262_144 };
        let mut buf = vec![0u8; buf_size];
        let progress_interval = if total > 10_485_760 { 20 } else { 2 };
        let mut chunk_count = 0u32;
        loop {
            if should_cancel() {
                return Err("传输已取消".into());
            }
            let n = local_file
                .read(&mut buf)
                .map_err(|e| format!("读取本地文件失败: {}", e))?;
            if n == 0 {
                break;
            }
            remote_file
                .write_all(&buf[..n])
                .map_err(|e| format!("写入远程文件失败: {}", e))?;
            transferred += n as u64;
            chunk_count += 1;
            if chunk_count >= progress_interval {
                on_progress(transferred, total);
                chunk_count = 0;
            }
        }

        remote_file
            .close()
            .map_err(|e| format!("关闭远程文件失败: {}", e))?;

        let _ = self.sftp.setstat(
            Path::new(remote_path),
            FileStat {
                size: None,
                uid: None,
                gid: None,
                perm: Some(WEB_MODE),
                atime: None,
                mtime: None,
            },
        );

        on_progress(total, total);
        Ok(())
    }

    pub fn download_file_with_progress<F>(
        &self,
        remote_path: &str,
        local_path: &str,
        mut on_progress: F,
        should_cancel: impl Fn() -> bool,
    ) -> Result<(), String>
    where
        F: FnMut(u64, u64),
    {
        let stat = self
            .sftp
            .stat(Path::new(remote_path))
            .map_err(|e| format!("获取远程文件信息失败: {}", e))?;
        let total = stat.size.unwrap_or(0);

        let mut remote_file = self
            .sftp
            .open(Path::new(remote_path))
            .map_err(|e| format!("打开远程文件失败: {}", e))?;

        let mut local_file = std::fs::File::create(local_path)
            .map_err(|e| format!("创建本地文件失败: {}", e))?;

        let mut transferred: u64 = 0;
        let mut buf = [0u8; 262144]; // 256KB 缓冲区
        let progress_interval = if total > 10_485_760 { 10 } else { 2 };
        let mut chunk_count = 0u32;
        loop {
            if should_cancel() {
                return Err("传输已取消".into());
            }
            let n = remote_file
                .read(&mut buf)
                .map_err(|e| format!("读取远程文件失败: {}", e))?;
            if n == 0 {
                break;
            }
            std::io::Write::write_all(&mut local_file, &buf[..n])
                .map_err(|e| format!("写入本地文件失败: {}", e))?;
            transferred += n as u64;
            chunk_count += 1;
            if chunk_count >= progress_interval {
                let denom = if total > 0 { total } else { transferred.max(1) };
                on_progress(transferred, denom);
                chunk_count = 0;
            }
        }

        // 最终确保显示 100%
        on_progress(transferred, if total > 0 { total } else { transferred.max(1) });

        Ok(())
    }

    pub fn rename(&self, from: &str, to: &str) -> Result<(), String> {
        self.sftp
            .rename(Path::new(from), Path::new(to), None)
            .map_err(|e| format!("重命名失败: {}", e))?;
        Ok(())
    }

    pub fn file_exists(&self, remote_path: &str) -> Result<bool, String> {
        match self.sftp.stat(Path::new(remote_path)) {
            Ok(stat) => Ok(!stat.is_dir()),
            Err(_) => Ok(false),
        }
    }

    pub fn remote_file_size(&self, remote_path: &str) -> Result<u64, String> {
        let stat = self
            .sftp
            .stat(Path::new(remote_path))
            .map_err(|e| format!("获取远程文件信息失败: {}", e))?;
        if stat.is_dir() {
            return Err("路径是目录".into());
        }
        Ok(stat.size.unwrap_or(0) as u64)
    }

    /// 删除文件
    pub fn delete_file(&self, path: &str) -> Result<(), String> {
        self.sftp.unlink(Path::new(path))
            .map_err(|e| format!("删除文件失败: {}", e))?;
        Ok(())
    }

    pub fn delete_path_recursive(&self, path: &str) -> Result<(), String> {
        let path_ref = Path::new(path);
        let stat = match self.sftp.stat(path_ref) {
            Ok(s) => s,
            Err(e) => {
                let msg = format!("{}", e);
                if msg.contains("no such file") || msg.contains("No such file") {
                    return Ok(());
                }
                return Err(format!("获取路径信息失败: {}", e));
            }
        };
        if stat.is_dir() {
            for (child, _) in self
                .sftp
                .readdir(path_ref)
                .map_err(|e| format!("读取目录失败: {}", e))?
            {
                let name = child
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("");
                if name == "." || name == ".." {
                    continue;
                }
                let child_str = child.to_str().ok_or("无效子路径")?;
                self.delete_path_recursive(child_str)?;
            }
            self.sftp
                .rmdir(path_ref)
                .map_err(|e| format!("删除目录失败: {}", e))?;
        } else {
            self.sftp
                .unlink(path_ref)
                .map_err(|e| format!("删除文件失败: {}", e))?;
        }
        Ok(())
    }

    pub fn collect_download_items(
        &self,
        remote_path: &str,
        local_base: &str,
        items: &mut Vec<(String, String)>,
    ) -> Result<(), String> {
        use std::path::PathBuf;
        let stat = self
            .sftp
            .stat(Path::new(remote_path))
            .map_err(|e| format!("获取远程路径失败: {}", e))?;
        if stat.is_dir() {
            let name = Path::new(remote_path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("download");
            let local_root = PathBuf::from(local_base).join(name);
            std::fs::create_dir_all(&local_root).ok();
            self.walk_download(remote_path, &local_root, items, 10_000)?;
        } else {
            let name = Path::new(remote_path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("file");
            let local = PathBuf::from(local_base).join(name);
            items.push((remote_path.to_string(), local.to_string_lossy().to_string()));
        }
        Ok(())
    }

    fn walk_download(
        &self,
        remote_dir: &str,
        local_dir: &Path,
        items: &mut Vec<(String, String)>,
        max: usize,
    ) -> Result<(), String> {
        if items.len() >= max {
            return Ok(());
        }
        let entries = self.list_dir(remote_dir)?;
        for entry in entries {
            if entry.name == ".." {
                continue;
            }
            if entry.is_dir {
                let sub = local_dir.join(&entry.name);
                std::fs::create_dir_all(&sub).ok();
                self.walk_download(&entry.path, &sub, items, max)?;
            } else {
                items.push((
                    entry.path.clone(),
                    local_dir.join(&entry.name).to_string_lossy().to_string(),
                ));
                if items.len() >= max {
                    return Ok(());
                }
            }
        }
        Ok(())
    }

    /// 递归收集远程文件路径（仅文件，不含目录）
    pub fn collect_remote_file_paths(
        &self,
        remote_path: &str,
        paths: &mut Vec<String>,
        max: usize,
    ) -> Result<(), String> {
        let stat = self
            .sftp
            .stat(Path::new(remote_path))
            .map_err(|e| format!("获取远程路径失败: {}", e))?;
        if stat.is_dir() {
            self.walk_remote_file_paths(remote_path, paths, max)?;
        } else {
            paths.push(remote_path.to_string());
        }
        Ok(())
    }

    fn walk_remote_file_paths(
        &self,
        remote_dir: &str,
        paths: &mut Vec<String>,
        max: usize,
    ) -> Result<(), String> {
        if paths.len() >= max {
            return Ok(());
        }
        let entries = self.list_dir(remote_dir)?;
        for entry in entries {
            if entry.name == ".." {
                continue;
            }
            if entry.is_dir {
                self.walk_remote_file_paths(&entry.path, paths, max)?;
            } else {
                paths.push(entry.path.clone());
                if paths.len() >= max {
                    return Ok(());
                }
            }
        }
        Ok(())
    }

    pub fn search_recursive(
        &self,
        root: &str,
        query: &str,
        max: usize,
        results: &mut Vec<FileEntry>,
    ) -> Result<(), String> {
        let q = query.to_lowercase();
        let mut stack = vec![root.to_string()];
        while let Some(dir) = stack.pop() {
            if results.len() >= max {
                break;
            }
            let entries = match self.list_dir(&dir) {
                Ok(e) => e,
                Err(_) => continue,
            };
            for entry in entries {
                if results.len() >= max {
                    break;
                }
                if entry.name == ".." {
                    continue;
                }
                if entry.name.to_lowercase().contains(&q) {
                    results.push(entry.clone());
                }
                if entry.is_dir {
                    stack.push(entry.path.clone());
                }
            }
        }
        Ok(())
    }

    /// 创建目录
    pub fn create_dir(&self, path: &str) -> Result<(), String> {
        self.sftp.mkdir(Path::new(path), WEB_MODE as i32)
            .map_err(|e| format!("创建目录失败: {}", e))?;
        Ok(())
    }

    /// 发送 SSH keepalive，用于维持空闲连接
    pub fn ping(&self) -> Result<(), String> {
        self.session
            .keepalive_send()
            .map(|_| ())
            .map_err(|e| format!("连接已断开: {}", e))
    }

    pub fn set_session_blocking(&self, blocking: bool) {
        self.session.set_blocking(blocking);
    }

    /// 断开连接
    pub fn disconnect(&self) -> Result<(), String> {
        self.disconnect_session()
    }

    /// 发送 SSH 断开并关闭传输层，便于服务端尽快释放会话
    pub fn disconnect_session(&self) -> Result<(), String> {
        use ssh2::DisconnectCode;
        let _ = self.session.set_blocking(true);
        let _ = self.session.disconnect(
            Some(DisconnectCode::ByApplication),
            "CoreFTP disconnect",
            None,
        );
        Ok(())
    }
}

fn connect_tcp(addr: &str) -> Result<TcpStream, String> {
    let tcp = TcpStream::connect(addr).map_err(|e| format!("TCP 连接失败: {}", e))?;
    tcp.set_nodelay(true).ok();
    configure_data_socket_timeouts(&tcp, DATA_SOCKET_TIMEOUT_SECS)?;
    Ok(tcp)
}
