use std::sync::Mutex;
use chrono::Local;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub level: String,
    pub message: String,
    pub timestamp: String,
}

pub struct AppLog {
    entries: Mutex<Vec<LogEntry>>,
    max: Mutex<usize>,
}

impl AppLog {
    pub fn new(max: usize) -> Self {
        AppLog {
            entries: Mutex::new(Vec::new()),
            max: Mutex::new(max),
        }
    }

    pub fn set_max(&self, max: usize) {
        *self.max.lock().unwrap() = max;
        let mut v = self.entries.lock().unwrap();
        while v.len() > max {
            v.remove(0);
        }
    }

    pub fn push(&self, level: &str, message: impl Into<String>) {
        let max = *self.max.lock().unwrap();
        let mut v = self.entries.lock().unwrap();
        v.push(LogEntry {
            level: level.to_string(),
            message: message.into(),
            timestamp: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        });
        while v.len() > max {
            v.remove(0);
        }
    }

    pub fn list(&self) -> Vec<LogEntry> {
        self.entries.lock().unwrap().clone()
    }

    pub fn clear(&self) {
        self.entries.lock().unwrap().clear();
    }
}

pub fn app_info(log: &AppLog, msg: impl Into<String>) {
    let s = msg.into();
    log::info!("{}", s);
    log.push("info", s);
}

pub fn app_warn(log: &AppLog, msg: impl Into<String>) {
    let s = msg.into();
    log::warn!("{}", s);
    log.push("warn", s);
}

pub fn app_error(log: &AppLog, msg: impl Into<String>) {
    let s = msg.into();
    log::error!("{}", s);
    log.push("error", s);
}
