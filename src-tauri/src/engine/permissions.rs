use crate::engine::ssh::SshConnection;
use crate::engine::types::SiteConfig;

/// 网站目录常用属主/属组
pub const WEB_OWNER: &str = "www";
pub const WEB_GROUP: &str = "www";
/// 目录与文件权限（用户要求统一 755）
pub const WEB_MODE: u32 = 0o755;

/// 通过 SSH 将路径设为站点配置的属主/组且 chmod 755（失败仅记日志，不阻断上传/解压）
pub fn try_apply_web_permissions(config: &SiteConfig, path: &str, recursive: bool) {
    let path = path.replace('\\', "/");
    let owner = config.web_owner_or_default();
    let group = config.web_group_or_default();
    match SshConnection::from_config(config, true) {
        Ok(ssh) => {
            if let Err(e) = ssh.apply_web_permissions(&path, owner, group, recursive) {
                log::warn!("设置 www:755 失败 [{}]: {}", path, e);
            } else {
                log::info!(
                    "已设置 {}:{} 755{}{}",
                    owner,
                    group,
                    if recursive { " (递归)" } else { "" },
                    path
                );
            }
        }
        Err(e) => {
            log::warn!("无法 SSH 设置 www:755 [{}]: {}", path, e);
        }
    }
}
