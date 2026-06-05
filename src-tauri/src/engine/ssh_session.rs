use std::path::Path;

use ssh2::Session;

use crate::engine::known_hosts::prepare_session;
use crate::engine::types::SiteConfig;

pub fn authenticate_session(session: &Session, config: &SiteConfig) -> Result<(), String> {
    if config.private_key.as_deref().filter(|k| !k.is_empty()).is_some() {
        let key_path = config.private_key.as_deref().unwrap();
        let key = Path::new(key_path);
        if !key.exists() {
            return Err(format!(
                "SSH 密钥文件不存在: {}。请在站点设置中填写正确的私钥路径",
                key_path
            ));
        }
        let passphrase = config
            .private_key_passphrase
            .as_deref()
            .filter(|p| !p.is_empty());
        let result = session.userauth_pubkey_file(&config.username, None, key, passphrase);
        match result {
            Ok(()) => log::info!("SSH 密钥认证成功 (pubkey_file)"),
            Err(e) => {
                log::warn!("SSH pubkey_file 认证失败 ({}), 尝试 SSH Agent...", e);
                session.userauth_agent(&config.username).map_err(|agent_err| {
                    format!(
                        "SSH 密钥认证失败（密钥文件 + SSH Agent 均失败）\n\
                         文件认证: {}\n\
                         Agent 认证: {}\n\
                         提示：请确认密钥文件是 PEM 格式，或将密钥加载到 SSH Agent (ssh-add)",
                        e, agent_err
                    )
                })?;
                log::info!("SSH Agent 认证成功");
            }
        }
    } else {
        session
            .userauth_password(&config.username, config.password.as_deref().unwrap_or(""))
            .map_err(|e| format!("SSH 密码认证失败: {}", e))?;
    }

    if !session.authenticated() {
        return Err("SSH 认证未通过".into());
    }

    session.set_keepalive(true, 30);
    Ok(())
}

pub fn connect_authenticated_session(
    config: &SiteConfig,
    trust_new_host: bool,
) -> Result<Session, String> {
    let session = prepare_session(&config.host, config.port, trust_new_host)?;
    authenticate_session(&session, config)?;
    Ok(session)
}
