use std::net::TcpStream;
use std::path::PathBuf;
use std::thread;
use std::time::Duration;

use ssh2::{CheckResult, HashType, KnownHostFileKind, Session};

const HOST_KEY_UNKNOWN: &str = "HOST_KEY_UNKNOWN:";
const HOST_KEY_MISMATCH: &str = "HOST_KEY_MISMATCH:";

pub fn known_hosts_path() -> PathBuf {
    dirs_next::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("CoreFTP")
        .join("known_hosts")
}

pub fn host_port_key(host: &str, port: u16) -> String {
    if port == 22 {
        host.to_string()
    } else {
        format!("[{}]:{}", host, port)
    }
}

/// SHA256 指纹，格式 `SHA256:Base64...`（与 OpenSSH 一致）
pub fn fingerprint_sha256(session: &Session) -> Result<String, String> {
    let hash = session
        .host_key_hash(HashType::Sha256)
        .ok_or_else(|| "无法读取服务器主机公钥".to_string())?;
    Ok(format!("SHA256:{}", base64_encode(hash)))
}

fn base64_encode(data: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        if chunk.len() > 1 {
            out.push(TABLE[((n >> 6) & 63) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[(n & 63) as usize] as char);
        } else {
            out.push('=');
        }
    }
    while out.len() % 4 != 0 {
        out.push('=');
    }
    out
}

pub fn verify_host(session: &Session, host: &str, port: u16) -> Result<(), String> {
    let path = known_hosts_path();
    let host_key = host_port_key(host, port);

    let mut kh = session.known_hosts().map_err(|e| format!("known_hosts: {}", e))?;

    if path.exists() {
        kh.read_file(&path, KnownHostFileKind::OpenSSH)
            .map_err(|e| format!("读取 known_hosts 失败: {}", e))?;
    }

    let (key, key_type) = session
        .host_key()
        .ok_or_else(|| "无法读取服务器主机公钥".to_string())?;

    let fp = fingerprint_sha256(session)?;

    match kh.check(&host_key, key) {
        CheckResult::Match => Ok(()),
        CheckResult::NotFound => Err(format!("{}{}", HOST_KEY_UNKNOWN, fp)),
        CheckResult::Mismatch => Err(format!("{}{}:{}", HOST_KEY_MISMATCH, fp, fp)),
        other => Err(format!("主机密钥检查失败: {:?}", other)),
    }
}

pub fn trust_host(session: &Session, host: &str, port: u16) -> Result<(), String> {
    let path = known_hosts_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }

    let host_key = host_port_key(host, port);
    let mut kh = session.known_hosts().map_err(|e| format!("known_hosts: {}", e))?;

    if path.exists() {
        kh.read_file(&path, KnownHostFileKind::OpenSSH)
            .map_err(|e| format!("读取 known_hosts 失败: {}", e))?;
    }

    let (key, key_type) = session
        .host_key()
        .ok_or_else(|| "无法读取服务器主机公钥".to_string())?;

    kh.add(&host_key, key, &host_key, key_type.into())
        .map_err(|e| format!("保存主机密钥失败: {}", e))?;

    kh.write_file(&path, KnownHostFileKind::OpenSSH)
        .map_err(|e| format!("写入 known_hosts 失败: {}", e))?;

    log::info!("已信任主机 {} ({})", host_key, fingerprint_sha256(session)?);
    Ok(())
}

pub fn is_host_key_error(msg: &str) -> bool {
    msg.starts_with(HOST_KEY_UNKNOWN) || msg.starts_with(HOST_KEY_MISMATCH)
}

const HANDSHAKE_ATTEMPTS: u32 = 5;

fn prepare_ssh_tcp(tcp: &TcpStream) {
    tcp.set_nodelay(true).ok();
    // 握手阶段不要设 TcpStream 读写超时：在 Windows 上与 libssh2 冲突，易出现
    // Session(-13) Failed getting banner / socket disconnect
    let _ = tcp.set_read_timeout(None);
    let _ = tcp.set_write_timeout(None);
}

fn is_retriable_handshake_msg(msg: &str) -> bool {
    let lower = msg.to_lowercase();
    lower.contains("failed getting banner")
        || lower.contains("encryption keys")
        || lower.contains("kex")
        || lower.contains("banner recv")
        || lower.contains("socket disconnect")
        || lower.contains("socket recv")
        || msg.contains("Session(-13)")
        || msg.contains("Session(-43)")
        || msg.contains("Session(-8)")
        || msg.contains("Session(-5)")
        || msg.contains("Session(-2)")
        || msg.contains("Session(-9)")
        || msg.contains("Session(-30)")
}

fn try_handshake_once(addr: &str) -> Result<Session, String> {
    let tcp = TcpStream::connect(addr).map_err(|e| format!("SSH TCP 连接失败: {}", e))?;
    prepare_ssh_tcp(&tcp);

    let mut session = Session::new().map_err(|e| format!("创建 SSH 会话失败: {}", e))?;
    session.set_blocking(true);
    // 握手用 libssh2 默认（无超时），避免 banner 读取被提前打断
    session.set_timeout(0);
    session.set_tcp_stream(tcp);
    session
        .handshake()
        .map_err(|e| format!("SSH 握手失败: {}", e))?;
    session.set_timeout(120_000);
    Ok(session)
}

pub fn connect_tcp_session(host: &str, port: u16) -> Result<Session, String> {
    let addr = format!("{}:{}", host, port);
    let mut last_msg = String::from("SSH 握手失败");

    for attempt in 1..=HANDSHAKE_ATTEMPTS {
        match try_handshake_once(&addr) {
            Ok(session) => {
                if attempt > 1 {
                    log::info!("SSH 握手在第 {} 次尝试后成功 ({}:{})", attempt, host, port);
                }
                return Ok(session);
            }
            Err(msg) => {
                last_msg = msg.clone();
                if attempt < HANDSHAKE_ATTEMPTS && is_retriable_handshake_msg(&msg) {
                    let wait_ms = 350 * attempt as u64;
                    log::warn!(
                        "SSH 握手失败 ({}:{}) 第 {}/{} 次: {}，{}ms 后重试",
                        host,
                        port,
                        attempt,
                        HANDSHAKE_ATTEMPTS,
                        msg,
                        wait_ms
                    );
                    thread::sleep(Duration::from_millis(wait_ms));
                    continue;
                }
                return Err(last_msg);
            }
        }
    }

    Err(last_msg)
}

pub fn prepare_session(
    host: &str,
    port: u16,
    trust_new_host: bool,
) -> Result<Session, String> {
    let session = connect_tcp_session(host, port)?;
    match verify_host(&session, host, port) {
        Ok(()) => Ok(session),
        Err(e) if trust_new_host && e.starts_with(HOST_KEY_UNKNOWN) => {
            trust_host(&session, host, port)?;
            Ok(session)
        }
        Err(e) => Err(e),
    }
}
