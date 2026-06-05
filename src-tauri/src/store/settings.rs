use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub default_local_path: Option<String>,
    pub connect_timeout_secs: u16,
    pub ftp_passive: bool,
    /// utf8 | gbk
    pub ftp_encoding: String,
    pub persist_transfer_queue: bool,
    pub max_log_entries: usize,
    /// dark | light | system
    #[serde(default = "default_appearance")]
    pub appearance: String,
    /// default | ocean | forest | sunset | rose | mono
    #[serde(default = "default_theme")]
    pub theme: String,
}

fn default_appearance() -> String {
    "dark".into()
}

fn default_theme() -> String {
    "default".into()
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            default_local_path: None,
            connect_timeout_secs: 30,
            ftp_passive: true,
            ftp_encoding: "utf8".into(),
            persist_transfer_queue: true,
            max_log_entries: 500,
            appearance: default_appearance(),
            theme: default_theme(),
        }
    }
}

pub struct SettingsStore {
    settings: Mutex<AppSettings>,
    path: PathBuf,
}

impl SettingsStore {
    pub fn new() -> Self {
        let path = dirs_next::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("CoreFTP")
            .join("settings.json");
        let store = SettingsStore {
            settings: Mutex::new(AppSettings::default()),
            path,
        };
        store.load_from_disk();
        store
    }

    fn load_from_disk(&self) {
        if !self.path.exists() {
            return;
        }
        if let Ok(data) = fs::read_to_string(&self.path) {
            if let Ok(s) = serde_json::from_str::<AppSettings>(&data) {
                *self.settings.lock().unwrap() = s;
            }
        }
    }

    pub fn get(&self) -> AppSettings {
        self.settings.lock().unwrap().clone()
    }

    pub fn save(&self, settings: AppSettings) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {}", e))?;
        }
        let json = serde_json::to_string_pretty(&settings)
            .map_err(|e| format!("序列化设置失败: {}", e))?;
        fs::write(&self.path, json).map_err(|e| format!("写入设置失败: {}", e))?;
        *self.settings.lock().unwrap() = settings;
        Ok(())
    }
}
