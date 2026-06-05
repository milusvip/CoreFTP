use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use suppaftp::types::{FileType, Mode};
use suppaftp::{FtpStream, NativeTlsConnector, NativeTlsFtpStream};
use native_tls::TlsConnector;
use crate::engine::types::{FileEntry, SiteConfig, Protocol};

enum FtpConn {
    Plain(FtpStream),
    Tls(NativeTlsFtpStream),
}

pub struct FtpConnection {
    stream: FtpConn,
    encoding: String,
}

pub struct FtpConnectOptions {
    pub passive: bool,
    pub encoding: String,
}

impl Default for FtpConnectOptions {
    fn default() -> Self {
        FtpConnectOptions {
            passive: true,
            encoding: "utf8".into(),
        }
    }
}

impl FtpConnection {
    pub fn connect(config: &SiteConfig, opts: &FtpConnectOptions) -> Result<Self, String> {
        let addr = format!("{}:{}", config.host, config.port);
        log::info!("FTP connecting to: {} ({})", addr, config.protocol);

        let stream = match config.protocol {
            Protocol::FTP => {
                let s = FtpStream::connect(addr.as_str())
                    .map_err(|e| format!("连接 {} 失败: {}", addr, e))?;
                FtpConn::Plain(s)
            }
            Protocol::FTPS => {
                let connector = NativeTlsConnector::from(
                    TlsConnector::builder()
                        .danger_accept_invalid_certs(true)
                        .build()
                        .map_err(|e| format!("TLS 初始化失败: {}", e))?,
                );
                let s = NativeTlsFtpStream::connect(addr.as_str())
                    .map_err(|e| format!("连接 {} 失败: {}", addr, e))?;
                let s = s
                    .into_secure(connector, &config.host)
                    .map_err(|e| format!("FTPS 握手失败: {}", e))?;
                FtpConn::Tls(s)
            }
            _ => return Err("不支持的协议".into()),
        };

        let mut conn = FtpConnection {
            stream,
            encoding: opts.encoding.clone(),
        };
        let password = config.password.clone().unwrap_or_default();
        conn.login(&config.username, &password)?;
        conn.set_binary()?;
        if opts.passive {
            conn.set_passive_mode()?;
        } else {
            conn.set_active_mode()?;
        }
        Ok(conn)
    }

    fn set_passive_mode(&mut self) -> Result<(), String> {
        match &mut self.stream {
            FtpConn::Plain(s) => s.set_mode(Mode::Passive),
            FtpConn::Tls(s) => s.set_mode(Mode::Passive),
        }
        Ok(())
    }

    fn set_active_mode(&mut self) -> Result<(), String> {
        match &mut self.stream {
            FtpConn::Plain(s) => s.set_mode(Mode::Active),
            FtpConn::Tls(s) => s.set_mode(Mode::Active),
        }
        Ok(())
    }

    fn login(&mut self, user: &str, pass: &str) -> Result<(), String> {
        match &mut self.stream {
            FtpConn::Plain(s) => s.login(user, pass).map_err(|e| format!("登录失败: {}", e)),
            FtpConn::Tls(s) => s.login(user, pass).map_err(|e| format!("登录失败: {}", e)),
        }
    }

    fn set_binary(&mut self) -> Result<(), String> {
        match &mut self.stream {
            FtpConn::Plain(s) => s
                .transfer_type(FileType::Binary)
                .map_err(|e| format!("设置传输模式失败: {}", e)),
            FtpConn::Tls(s) => s
                .transfer_type(FileType::Binary)
                .map_err(|e| format!("设置传输模式失败: {}", e)),
        }
    }

    pub fn list_dir(&mut self, path: &str) -> Result<Vec<FileEntry>, String> {
        let base = path.replace('\\', "/").trim_end_matches('/').to_string();
        let items = match &mut self.stream {
            FtpConn::Plain(s) => s.list(Some(path)).map_err(|e| format!("列出目录失败: {}", e))?,
            FtpConn::Tls(s) => s.list(Some(path)).map_err(|e| format!("列出目录失败: {}", e))?,
        };

        let mut entries: Vec<FileEntry> = items
            .iter()
            .filter_map(|line| parse_ftp_listing(line, &base))
            .collect();

        let parent = if base.is_empty() {
            "/".to_string()
        } else {
            Path::new(&base)
                .parent()
                .and_then(|p| p.to_str())
                .filter(|s| !s.is_empty())
                .unwrap_or("/")
                .to_string()
        };
        entries.insert(
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

        Ok(entries)
    }

    pub fn upload_file_with_progress<F>(
        &mut self,
        local_path: &str,
        remote_path: &str,
        mut on_progress: F,
        should_cancel: impl Fn() -> bool,
    ) -> Result<(), String>
    where
        F: FnMut(u64, u64),
    {
        if let Some(parent) = Path::new(remote_path).parent() {
            if let Some(p) = parent.to_str() {
                let _ = self.create_dir(p);
            }
        }

        let total = std::fs::metadata(local_path)
            .map_err(|e| format!("读取本地文件信息失败: {}", e))?
            .len();
        let mut file = std::fs::File::open(local_path)
            .map_err(|e| format!("打开本地文件失败: {}", e))?;

        match &mut self.stream {
            FtpConn::Plain(s) => {
                let mut remote = s
                    .put_with_stream(remote_path)
                    .map_err(|e| format!("上传失败: {}", e))?;
                transfer_loop(&mut file, &mut remote, total, &mut on_progress, &should_cancel)?;
                s.finalize_put_stream(remote)
                    .map_err(|e| format!("完成上传失败: {}", e))?;
            }
            FtpConn::Tls(s) => {
                let mut remote = s
                    .put_with_stream(remote_path)
                    .map_err(|e| format!("上传失败: {}", e))?;
                transfer_loop(&mut file, &mut remote, total, &mut on_progress, &should_cancel)?;
                s.finalize_put_stream(remote)
                    .map_err(|e| format!("完成上传失败: {}", e))?;
            }
        }
        on_progress(total, total);
        Ok(())
    }

    pub fn download_file_with_progress<F>(
        &mut self,
        remote_path: &str,
        local_path: &str,
        mut on_progress: F,
        should_cancel: impl Fn() -> bool,
    ) -> Result<(), String>
    where
        F: FnMut(u64, u64),
    {
        let total = match &mut self.stream {
            FtpConn::Plain(s) => s.size(remote_path).unwrap_or(0) as u64,
            FtpConn::Tls(s) => s.size(remote_path).unwrap_or(0) as u64,
        };

        let mut file = std::fs::File::create(local_path)
            .map_err(|e| format!("创建本地文件失败: {}", e))?;

        match &mut self.stream {
            FtpConn::Plain(s) => {
                let mut data = s
                    .retr_as_buffer(remote_path)
                    .map_err(|e| format!("下载失败: {}", e))?;
                download_loop(&mut data, &mut file, total, &mut on_progress, &should_cancel)?;
            }
            FtpConn::Tls(s) => {
                let mut data = s
                    .retr_as_buffer(remote_path)
                    .map_err(|e| format!("下载失败: {}", e))?;
                download_loop(&mut data, &mut file, total, &mut on_progress, &should_cancel)?;
            }
        }
        Ok(())
    }

    pub fn file_exists(&mut self, remote_path: &str) -> Result<bool, String> {
        Ok(match &mut self.stream {
            FtpConn::Plain(s) => s.size(remote_path).is_ok(),
            FtpConn::Tls(s) => s.size(remote_path).is_ok(),
        })
    }

    pub fn remote_file_size(&mut self, remote_path: &str) -> Result<u64, String> {
        let size = match &mut self.stream {
            FtpConn::Plain(s) => s.size(remote_path),
            FtpConn::Tls(s) => s.size(remote_path),
        }
        .map_err(|e| format!("获取远程文件大小失败: {}", e))?;
        Ok(size as u64)
    }

    pub fn delete_file(&mut self, path: &str) -> Result<(), String> {
        match &mut self.stream {
            FtpConn::Plain(s) => s.rm(path).map_err(|e| format!("删除失败: {}", e)),
            FtpConn::Tls(s) => s.rm(path).map_err(|e| format!("删除失败: {}", e)),
        }
    }

    fn rmdir(&mut self, path: &str) -> Result<(), String> {
        match &mut self.stream {
            FtpConn::Plain(s) => s.rmdir(path).map_err(|e| format!("删除目录失败: {}", e)),
            FtpConn::Tls(s) => s.rmdir(path).map_err(|e| format!("删除目录失败: {}", e)),
        }
    }

    pub fn delete_path_recursive(&mut self, path: &str) -> Result<(), String> {
        let entries = match self.list_dir(path) {
            Ok(e) => e,
            Err(_) => return self.delete_file(path),
        };
        let has_children = entries.iter().any(|e| e.name != "..");
        if has_children {
            for entry in entries {
                if entry.name == ".." {
                    continue;
                }
                self.delete_path_recursive(&entry.path)?;
            }
        }
        self.rmdir(path)
    }

    pub fn collect_download_items(
        &mut self,
        remote_path: &str,
        local_base: &str,
        items: &mut Vec<(String, String)>,
    ) -> Result<(), String> {
        let entries = match self.list_dir(remote_path) {
            Ok(e) if !e.is_empty() || remote_path.ends_with('/') => e,
            Ok(_) => {
                let name = Path::new(remote_path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("file");
                let local = PathBuf::from(local_base).join(name);
                items.push((remote_path.to_string(), local.to_string_lossy().to_string()));
                return Ok(());
            }
            Err(_) => {
                let name = Path::new(remote_path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("file");
                let local = PathBuf::from(local_base).join(name);
                items.push((remote_path.to_string(), local.to_string_lossy().to_string()));
                return Ok(());
            }
        };

        let name = Path::new(remote_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("download");
        let local_root = PathBuf::from(local_base).join(name);
        std::fs::create_dir_all(&local_root).ok();
        self.walk_download(remote_path, &local_root, items, 10_000)?;
        Ok(())
    }

    fn walk_download(
        &mut self,
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
        &mut self,
        remote_path: &str,
        paths: &mut Vec<String>,
        max: usize,
    ) -> Result<(), String> {
        match self.list_dir(remote_path) {
            Ok(entries) if entries.iter().any(|e| e.name != "..") => {
                self.walk_remote_file_paths(remote_path, paths, max)
            }
            Ok(_) => Ok(()),
            Err(_) => {
                paths.push(remote_path.to_string());
                Ok(())
            }
        }
    }

    fn walk_remote_file_paths(
        &mut self,
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
        &mut self,
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

    pub fn create_dir(&mut self, path: &str) -> Result<(), String> {
        match &mut self.stream {
            FtpConn::Plain(s) => s.mkdir(path).map_err(|e| format!("创建目录失败: {}", e)),
            FtpConn::Tls(s) => s.mkdir(path).map_err(|e| format!("创建目录失败: {}", e)),
        }
    }

    pub fn rename(&mut self, from: &str, to: &str) -> Result<(), String> {
        match &mut self.stream {
            FtpConn::Plain(s) => s.rename(from, to).map_err(|e| format!("重命名失败: {}", e)),
            FtpConn::Tls(s) => s.rename(from, to).map_err(|e| format!("重命名失败: {}", e)),
        }
    }

    pub fn noop(&mut self) -> Result<(), String> {
        match &mut self.stream {
            FtpConn::Plain(s) => s.noop().map_err(|e| format!("连接已断开: {}", e)),
            FtpConn::Tls(s) => s.noop().map_err(|e| format!("连接已断开: {}", e)),
        }
    }

    pub fn disconnect(&mut self) -> Result<(), String> {
        match &mut self.stream {
            FtpConn::Plain(s) => s.quit().map_err(|e| format!("断开失败: {}", e)),
            FtpConn::Tls(s) => s.quit().map_err(|e| format!("断开失败: {}", e)),
        }
    }
}

fn transfer_loop<R: Read, W: Write, F: FnMut(u64, u64)>(
    file: &mut R,
    remote: &mut W,
    total: u64,
    on_progress: &mut F,
    should_cancel: &impl Fn() -> bool,
) -> Result<(), String> {
    let mut transferred: u64 = 0;
    let mut buf = [0u8; 262144]; // 256KB 缓冲区（原 64KB）
    let progress_interval = if total > 10_485_760 { 10 } else { 2 };
    let mut chunk_count = 0u32;
    loop {
        if should_cancel() {
            return Err("传输已取消".into());
        }
        let n = file
            .read(&mut buf)
            .map_err(|e| format!("读取文件失败: {}", e))?;
        if n == 0 {
            break;
        }
        remote
            .write_all(&buf[..n])
            .map_err(|e| format!("写入远程文件失败: {}", e))?;
        transferred += n as u64;
        chunk_count += 1;
        if chunk_count >= progress_interval {
            on_progress(transferred, total);
            chunk_count = 0;
        }
    }
    Ok(())
}

fn download_loop<R: Read, W: Write, F: FnMut(u64, u64)>(
    data: &mut R,
    file: &mut W,
    total: u64,
    on_progress: &mut F,
    should_cancel: &impl Fn() -> bool,
) -> Result<(), String> {
    let mut transferred: u64 = 0;
    let mut buf = [0u8; 262144]; // 256KB 缓冲区（原 64KB）
    let progress_interval = if total > 10_485_760 { 10 } else { 2 };
    let mut chunk_count = 0u32;
    loop {
        if should_cancel() {
            return Err("传输已取消".into());
        }
        let n = data
            .read(&mut buf)
            .map_err(|e| format!("读取远程文件失败: {}", e))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n])
            .map_err(|e| format!("写入本地文件失败: {}", e))?;
        transferred += n as u64;
        chunk_count += 1;
        if chunk_count >= progress_interval {
            let denom = if total > 0 { total } else { transferred.max(1) };
            on_progress(transferred, denom);
            chunk_count = 0;
        }
    }
    let denom = if total > 0 { total } else { transferred.max(1) };
    on_progress(transferred, denom);
    Ok(())
}

fn join_remote_path(base: &str, name: &str) -> String {
    let base = base.trim_end_matches('/');
    if base.is_empty() {
        format!("/{}", name)
    } else {
        format!("{}/{}", base, name)
    }
}

fn parse_ftp_listing(line: &str, base: &str) -> Option<FileEntry> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }

    let is_dir = line.starts_with('d');
    let is_link = line.starts_with('l');
    let parts: Vec<&str> = line.split_whitespace().collect();

    let (name, size, modified, permissions) = if parts.len() < 9 {
        (line.to_string(), 0u64, String::new(), None)
    } else {
        (
            parts[8..].join(" "),
            parts.get(4).and_then(|s| s.parse().ok()).unwrap_or(0),
            parts[5..8].join(" "),
            Some(parts[0].to_string()),
        )
    };

    if name == "." || name == ".." {
        return None;
    }

    Some(FileEntry {
        name: name.clone(),
        path: join_remote_path(base, &name),
        is_dir: is_dir || is_link,
        size,
        modified,
        permissions,
    })
}
