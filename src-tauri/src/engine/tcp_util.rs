use std::net::TcpStream;
use std::time::Duration;

/// 为 FTP/SFTP 数据连接设置读写超时，避免死连接上 list/传输无限阻塞
pub fn configure_data_socket_timeouts(tcp: &TcpStream, secs: u64) -> Result<(), String> {
    let timeout = Duration::from_secs(secs.max(10));
    tcp.set_read_timeout(Some(timeout))
        .map_err(|e| format!("设置读取超时失败: {}", e))?;
    tcp.set_write_timeout(Some(timeout))
        .map_err(|e| format!("设置写入超时失败: {}", e))?;
    Ok(())
}
