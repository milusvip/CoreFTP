use std::io::Read;
use std::path::Path;

use ssh2::Session;

use crate::engine::ssh_session::connect_authenticated_session;
use crate::engine::types::{CommandResult, ExtractResult, SiteConfig};

/// SSH 连接，用于远程执行解压命令
pub struct SshConnection {
    session: Session,
}

impl SshConnection {
    /// 从站点配置连接 SSH（含主机密钥校验）
    pub fn from_config(config: &SiteConfig, trust_new_host: bool) -> Result<Self, String> {
        let session = connect_authenticated_session(config, trust_new_host)?;
        Ok(SshConnection { session })
    }

    pub fn connect(host: &str, port: u16, username: &str, password: &str) -> Result<Self, String> {
        let config = SiteConfig {
            id: String::new(),
            name: String::new(),
            host: host.to_string(),
            port,
            protocol: crate::engine::types::Protocol::SSH,
            username: username.to_string(),
            password: Some(password.to_string()),
            private_key: None,
            private_key_passphrase: None,
            default_remote_path: None,
            web_owner: None,
            web_group: None,
            category_id: None,
        };
        Self::from_config(&config, true)
    }

    /// 执行远程命令
    pub fn exec_command(&self, command: &str) -> Result<CommandResult, String> {
        let mut channel = self.session.channel_session()
            .map_err(|e| format!("创建 SSH channel 失败: {}", e))?;

        channel.exec(command)
            .map_err(|e| format!("执行命令失败: {}", e))?;

        let mut stdout = String::new();
        let mut stderr = String::new();

        channel.read_to_string(&mut stdout)
            .map_err(|e| format!("读取命令输出失败: {}", e))?;

        // Read stderr via stderr()
        let mut stderr_stream = channel.stderr();
        stderr_stream.read_to_string(&mut stderr)
            .ok();

        channel.wait_close()
            .map_err(|e| format!("等待命令完成失败: {}", e))?;

        let exit_code = channel.exit_status()
            .unwrap_or(-1);

        Ok(CommandResult {
            exit_code,
            stdout,
            stderr,
        })
    }

    /// 根据扩展名获取解压命令（使用压缩包完整路径，避免 cd 后找不到文件）
    fn get_extract_command(archive_path: &str, target_dir: &str) -> String {
        let archive = shell_escape(archive_path);
        let target = shell_escape(target_dir);
        let path_lower = archive_path.to_lowercase();

        let extract_part = if path_lower.ends_with(".zip") {
            format!("unzip -o {} -d {}", archive, target)
        } else if path_lower.ends_with(".tar.gz") || path_lower.ends_with(".tgz") {
            format!("tar -xzf {} -C {}", archive, target)
        } else if path_lower.ends_with(".tar.bz2") {
            format!("tar -xjf {} -C {}", archive, target)
        } else if path_lower.ends_with(".tar.xz") {
            format!("tar -xJf {} -C {}", archive, target)
        } else if path_lower.ends_with(".rar") {
            format!("unrar x -o+ {} {}", archive, target)
        } else if path_lower.ends_with(".7z") {
            format!("7z x -y -o{} {}", target, archive)
        } else {
            format!("unzip -o {} -d {}", archive, target)
        };

        format!("mkdir -p {} && {}", target, extract_part)
    }

    /// 远程解压压缩包
    pub fn extract_archive(
        &self,
        archive_path: &str,
        target_dir: Option<&str>,
        delete_after: bool,
        web_owner: &str,
        web_group: &str,
    ) -> Result<ExtractResult, String> {
        let archive_path = archive_path.replace('\\', "/");
        let path = Path::new(&archive_path);
        let filename = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("archive");

        let default_target = path
            .parent()
            .and_then(|p| p.to_str())
            .filter(|s| !s.is_empty())
            .unwrap_or("/");
        let target = target_dir
            .filter(|t| !t.trim().is_empty())
            .unwrap_or(default_target)
            .replace('\\', "/");

        log::info!(
            "extract_archive: archive={}, target={}, delete_after={}",
            archive_path,
            target,
            delete_after
        );

        // 确认压缩包存在
        let check_cmd = format!(
            "test -f {} || test -r {}",
            shell_escape(&archive_path),
            shell_escape(&archive_path)
        );
        let check = self.exec_command(&check_cmd)?;
        if check.exit_code != 0 {
            return Ok(ExtractResult {
                success: false,
                archive_name: filename.to_string(),
                target_dir: target.clone(),
                exit_code: check.exit_code,
                output: check.stdout,
                error: Some(format!(
                    "远程压缩包不存在: {} ({})",
                    archive_path,
                    check.stderr.trim()
                )),
            });
        }

        let extract_cmd = Self::get_extract_command(&archive_path, &target);
        log::info!("extract command: {}", extract_cmd);
        let result = self.exec_command(&extract_cmd)?;

        // 解压成功后设置属主/组 + 755
        if result.exit_code == 0 {
            if let Err(e) = self.apply_web_permissions(&target, web_owner, web_group, true) {
                log::warn!("解压后设置权限失败 [{}]: {}", target, e);
            }
            if !delete_after {
                if let Err(e) = self.apply_web_permissions(&archive_path, web_owner, web_group, false) {
                    log::warn!("压缩包设置权限失败 [{}]: {}", archive_path, e);
                }
            }
        }

        // 如果解压成功且需要删除压缩包
        if result.exit_code == 0 && delete_after {
            let delete_cmd = format!("rm -f {}", shell_escape(&archive_path));
            let _ = self.exec_command(&delete_cmd);
        }

        Ok(ExtractResult {
            success: result.exit_code == 0,
            archive_name: filename.to_string(),
            target_dir: target.to_string(),
            exit_code: result.exit_code,
            output: result.stdout,
            error: if result.exit_code != 0 {
                Some(result.stderr)
            } else {
                None
            },
        })
    }

    /// 设置属主/组，目录/文件 chmod 755
    pub fn apply_web_permissions(
        &self,
        path: &str,
        owner: &str,
        group: &str,
        recursive: bool,
    ) -> Result<(), String> {
        use crate::engine::permissions::WEB_MODE;

        let p = shell_escape(path);
        let r = if recursive { "-R" } else { "" };
        let mode = format!("{:o}", WEB_MODE);

        let owner_e = shell_escape(owner);
        let group_e = shell_escape(group);
        let direct = format!(
            "chown {r} {owner_e}:{group_e} {p} && chmod {r} {mode} {p}",
            r = r,
            owner_e = owner_e,
            group_e = group_e,
            p = p,
            mode = mode,
        );

        let result = self.exec_command(&direct)?;
        if result.exit_code == 0 {
            return Ok(());
        }

        // 非 root 时尝试 sudo（宝塔等环境常见）
        let sudo = format!(
            "sudo chown {r} {owner_e}:{group_e} {p} && sudo chmod {r} {mode} {p}",
            r = r,
            owner_e = owner_e,
            group_e = group_e,
            p = p,
            mode = mode,
        );
        let sudo_result = self.exec_command(&sudo)?;
        if sudo_result.exit_code == 0 {
            return Ok(());
        }

        Err(format!(
            "chown/chmod 失败: {}",
            if !sudo_result.stderr.trim().is_empty() {
                sudo_result.stderr
            } else {
                result.stderr
            }
        ))
    }

    /// 检查服务器上是否安装了所需的解压工具
    pub fn check_extract_tools(&self) -> Result<Vec<String>, String> {
        let tools = ["unzip", "tar", "unrar", "7z"];
        let mut available = Vec::new();

        for tool in &tools {
            let cmd = format!("which {} 2>/dev/null || command -v {} 2>/dev/null", tool, tool);
            let result = self.exec_command(&cmd)?;
            if result.exit_code == 0 && !result.stdout.trim().is_empty() {
                available.push(tool.to_string());
            }
        }

        Ok(available)
    }

    /// 设置会话阻塞模式（`blocking = false` 时 read/write 不长时间阻塞，供交互终端使用）
    pub fn set_session_blocking(&self, blocking: bool) {
        self.session.set_blocking(blocking);
    }

    /// 打开交互式 Shell（PTY）
    pub fn open_interactive_shell(&self, cols: u32, rows: u32) -> Result<ssh2::Channel, String> {
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

    /// 断开连接
    pub fn disconnect(&self) -> Result<(), String> {
        // Session drop 时自动关闭
        Ok(())
    }
}

/// 简单的 shell 参数转义
fn shell_escape(s: &str) -> String {
    // Wrap in single quotes and escape single quotes inside
    let escaped = s.replace('\'', "'\\''");
    format!("'{}'", escaped)
}
