use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bookmark {
    pub id: String,
    pub label: String,
    pub path: String,
}

pub struct BookmarkStore {
    by_site: Mutex<HashMap<String, Vec<Bookmark>>>,
    path: PathBuf,
}

impl BookmarkStore {
    pub fn new() -> Self {
        let path = dirs_next::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("CoreFTP")
            .join("bookmarks.json");
        let store = BookmarkStore {
            by_site: Mutex::new(HashMap::new()),
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
            if let Ok(map) = serde_json::from_str::<HashMap<String, Vec<Bookmark>>>(&data) {
                *self.by_site.lock().unwrap() = map;
            }
        }
    }

    fn save_to_disk(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {}", e))?;
        }
        let map = self.by_site.lock().unwrap().clone();
        let json = serde_json::to_string_pretty(&map)
            .map_err(|e| format!("序列化书签失败: {}", e))?;
        fs::write(&self.path, json).map_err(|e| format!("写入书签失败: {}", e))?;
        Ok(())
    }

    pub fn list(&self, site_id: &str) -> Vec<Bookmark> {
        self.by_site
            .lock()
            .unwrap()
            .get(site_id)
            .cloned()
            .unwrap_or_default()
    }

    pub fn add(&self, site_id: &str, label: String, path: String) -> Result<Bookmark, String> {
        let bm = Bookmark {
            id: uuid::Uuid::new_v4().to_string(),
            label,
            path,
        };
        let mut map = self.by_site.lock().unwrap();
        map.entry(site_id.to_string()).or_default().push(bm.clone());
        drop(map);
        self.save_to_disk()?;
        Ok(bm)
    }

    pub fn remove(&self, site_id: &str, bookmark_id: &str) -> Result<bool, String> {
        let mut map = self.by_site.lock().unwrap();
        let Some(list) = map.get_mut(site_id) else {
            return Ok(false);
        };
        let len = list.len();
        list.retain(|b| b.id != bookmark_id);
        let removed = list.len() < len;
        drop(map);
        if removed {
            self.save_to_disk()?;
        }
        Ok(removed)
    }
}
