use std::collections::HashMap;
use std::io::{ErrorKind, Read, Write};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::engine::ssh::SshConnection;
use crate::engine::types::SiteConfig;
use crate::store::sites::SiteStore;

const TERMINAL_EVENT: &str = "terminal-output";

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalOutputPayload {
    tab_id: String,
    site_id: String,
    data: String,
    closed: bool,
}

enum TerminalCmd {
    Input(Vec<u8>),
    Resize { cols: u32, rows: u32 },
    Stop,
}

struct TerminalWorker {
    cmd_tx: Sender<TerminalCmd>,
    thread: JoinHandle<()>,
}

impl TerminalWorker {
    fn stop(self) {
        let _ = self.cmd_tx.send(TerminalCmd::Stop);
        let _ = self.thread.join();
    }
}

pub struct TerminalPool {
    workers: Mutex<HashMap<String, TerminalWorker>>,
}

impl TerminalPool {
    pub fn new() -> Self {
        TerminalPool {
            workers: Mutex::new(HashMap::new()),
        }
    }

    pub fn close(&self, tab_id: &str) {
        if let Some(worker) = self.workers.lock().unwrap().remove(tab_id) {
            worker.stop();
        }
    }

    /// 关闭某站点对应的终端标签（tabId = `term-{siteId}`）
    pub fn close_for_site(&self, site_id: &str) {
        self.close(&format!("term-{}", site_id));
    }

    fn cmd_sender(&self, tab_id: &str) -> Option<Sender<TerminalCmd>> {
        self.workers
            .lock()
            .unwrap()
            .get(tab_id)
            .map(|w| w.cmd_tx.clone())
    }
}

fn write_channel(channel: &mut ssh2::Channel, data: &[u8]) -> Result<(), ()> {
    let mut offset = 0;
    let mut idle_writes = 0u32;
    while offset < data.len() {
        match channel.write(&data[offset..]) {
            Ok(0) => {
                idle_writes += 1;
                if idle_writes > 400 || channel.eof() {
                    return Err(());
                }
                thread::sleep(Duration::from_millis(5));
            }
            Ok(n) => {
                idle_writes = 0;
                offset += n;
            }
            Err(e) if e.kind() == ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(5));
            }
            Err(_) => return Err(()),
        }
    }
    loop {
        match channel.flush() {
            Ok(()) => return Ok(()),
            Err(e) if e.kind() == ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(5));
            }
            Err(_) => return Err(()),
        }
    }
}

fn drain_commands(channel: &mut ssh2::Channel, cmd_rx: &mpsc::Receiver<TerminalCmd>) -> bool {
    while let Ok(cmd) = cmd_rx.try_recv() {
        match cmd {
            TerminalCmd::Input(data) => {
                if write_channel(channel, &data).is_err() {
                    return true;
                }
            }
            TerminalCmd::Resize { cols, rows } => {
                let _ = channel.request_pty_size(cols.max(20), rows.max(5), Some(0), Some(0));
            }
            TerminalCmd::Stop => {
                let _ = channel.close();
                return true;
            }
        }
    }
    false
}

fn open_shell_channel(
    config: &SiteConfig,
    cols: u32,
    rows: u32,
    trust_new_host: bool,
) -> Result<(ssh2::Channel, SshConnection), String> {
    // 独立 SSH 连接开 Shell，避免与 SFTP 共用 Session 导致 channel 失败或把文件连接设为非阻塞
    let ssh = SshConnection::from_config(config, trust_new_host)?;
    let channel = ssh.open_interactive_shell(cols, rows)?;
    ssh.set_session_blocking(false);
    Ok((channel, ssh))
}

fn start_terminal_worker(
    tab_id: String,
    site_id: String,
    config: SiteConfig,
    cols: u32,
    rows: u32,
    trust_new_host: bool,
    app: AppHandle,
    cmd_rx: mpsc::Receiver<TerminalCmd>,
) -> JoinHandle<()> {
    thread::spawn(move || {
        let emit_closed = || {
            let _ = app.emit(
                TERMINAL_EVENT,
                TerminalOutputPayload {
                    tab_id: tab_id.clone(),
                    site_id: site_id.clone(),
                    data: String::new(),
                    closed: true,
                },
            );
        };

        let (mut channel, _ssh) = match open_shell_channel(&config, cols, rows, trust_new_host) {
            Ok(parts) => parts,
            Err(e) => {
                let _ = app.emit(
                    TERMINAL_EVENT,
                    TerminalOutputPayload {
                        tab_id: tab_id.clone(),
                        site_id: site_id.clone(),
                        data: format!("\r\n\x1b[31m[连接失败] {}\x1b[0m\r\n", e),
                        closed: false,
                    },
                );
                emit_closed();
                return;
            }
        };

        loop {
            if drain_commands(&mut channel, &cmd_rx) {
                emit_closed();
                return;
            }

            let mut buf = [0u8; 8192];
            match channel.read(&mut buf) {
                Ok(0) => {
                    if channel.eof() {
                        emit_closed();
                        return;
                    }
                }
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).into_owned();
                    if !data.is_empty() {
                        let _ = app.emit(
                            TERMINAL_EVENT,
                            TerminalOutputPayload {
                                tab_id: tab_id.clone(),
                                site_id: site_id.clone(),
                                data,
                                closed: false,
                            },
                        );
                    }
                }
                Err(e) if e.kind() == ErrorKind::WouldBlock => {}
                Err(_) => {
                    if channel.eof() {
                        emit_closed();
                        return;
                    }
                }
            }

            thread::sleep(Duration::from_millis(12));
        }
    })
}

#[tauri::command]
pub async fn terminal_open(
    app: AppHandle,
    sites: State<'_, SiteStore>,
    pool: State<'_, Arc<TerminalPool>>,
    tab_id: String,
    site_id: String,
    cols: u32,
    rows: u32,
    trust_new_host: bool,
) -> Result<(), String> {
    if let Some(tx) = pool.cmd_sender(&tab_id) {
        let _ = tx.send(TerminalCmd::Resize {
            cols: cols.max(20),
            rows: rows.max(5),
        });
        return Ok(());
    }

    let config = sites
        .get(&site_id)
        .ok_or_else(|| "站点不存在".to_string())?;

    if !config.protocol.uses_ssh_transport() {
        return Err("仅 SFTP / SSH 站点支持终端".into());
    }

    let (cmd_tx, cmd_rx) = mpsc::channel::<TerminalCmd>();
    let thread = start_terminal_worker(
        tab_id.clone(),
        site_id.clone(),
        config,
        cols,
        rows,
        trust_new_host,
        app,
        cmd_rx,
    );

    pool.workers.lock().unwrap().insert(
        tab_id,
        TerminalWorker { cmd_tx, thread },
    );

    Ok(())
}

#[tauri::command]
pub async fn terminal_write(
    pool: State<'_, Arc<TerminalPool>>,
    tab_id: String,
    data: String,
) -> Result<(), String> {
    let tx = pool
        .cmd_sender(&tab_id)
        .ok_or_else(|| "终端未打开".to_string())?;
    tx.send(TerminalCmd::Input(data.into_bytes()))
        .map_err(|_| "终端已关闭".to_string())
}

#[tauri::command]
pub async fn terminal_resize(
    pool: State<'_, Arc<TerminalPool>>,
    tab_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    let tx = pool
        .cmd_sender(&tab_id)
        .ok_or_else(|| "终端未打开".to_string())?;
    tx.send(TerminalCmd::Resize { cols, rows })
        .map_err(|_| "终端已关闭".to_string())
}

#[tauri::command]
pub async fn terminal_close(
    pool: State<'_, Arc<TerminalPool>>,
    tab_id: String,
) -> Result<(), String> {
    pool.close(&tab_id);
    Ok(())
}

#[tauri::command]
pub fn show_terminal_window(app: AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("ssh-terminal")
        .ok_or_else(|| "SSH 终端窗口未配置".to_string())?;
    win.show()
        .map_err(|e| format!("显示终端窗口失败: {}", e))?;
    let _ = win.unminimize();
    win.set_focus()
        .map_err(|e| format!("聚焦终端窗口失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn hide_terminal_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("ssh-terminal") {
        win.hide()
            .map_err(|e| format!("隐藏终端窗口失败: {}", e))?;
    }
    Ok(())
}
