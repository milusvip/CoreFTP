use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::engine::types::{SiteCategory, SiteConfig, SiteConfigStored};
use crate::store::credentials;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SitesDataFile {
    #[serde(default)]
    categories: Vec<SiteCategory>,
    sites: Vec<SiteConfigStored>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum SitesFileRaw {
    Legacy(Vec<SiteConfigStored>),
    Modern(SitesDataFile),
}

/// 站点存储（JSON 持久化 + keyring 保存密码）
pub struct SiteStore {
    categories: Mutex<Vec<SiteCategory>>,
    sites: Mutex<Vec<SiteConfig>>,
    path: PathBuf,
}

impl SiteStore {
    pub fn new() -> Self {
        let path = dirs_next::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("CoreFTP")
            .join("sites.json");

        let store = SiteStore {
            categories: Mutex::new(Vec::new()),
            sites: Mutex::new(Vec::new()),
            path,
        };
        store.load_from_disk();
        store
    }

    fn load_from_disk(&self) {
        if !self.path.exists() {
            return;
        }
        let data = match fs::read_to_string(&self.path) {
            Ok(s) => s,
            Err(e) => {
                log::error!("读取站点配置失败: {}", e);
                return;
            }
        };
        let parsed: SitesFileRaw = match serde_json::from_str(&data) {
            Ok(v) => v,
            Err(e) => {
                log::error!("解析站点配置失败: {}", e);
                return;
            }
        };

        let (categories, stored_sites) = match parsed {
            SitesFileRaw::Legacy(sites) => (Vec::new(), sites),
            SitesFileRaw::Modern(data) => (data.categories, data.sites),
        };

        let sites: Vec<SiteConfig> = stored_sites.into_iter().map(SiteConfig::from).collect();
        *self.categories.lock().unwrap() = categories;
        *self.sites.lock().unwrap() = sites;
        log::info!(
            "已加载 {} 个分类、{} 个站点",
            self.categories.lock().unwrap().len(),
            self.sites.lock().unwrap().len()
        );
    }

    fn save_to_disk(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {}", e))?;
        }
        let sites = self.sites.lock().unwrap();
        let categories = self.categories.lock().unwrap();
        let file = SitesDataFile {
            categories: categories.clone(),
            sites: sites.iter().cloned().map(SiteConfigStored::from).collect(),
        };
        let json = serde_json::to_string_pretty(&file)
            .map_err(|e| format!("序列化站点失败: {}", e))?;
        fs::write(&self.path, json).map_err(|e| format!("写入站点配置失败: {}", e))?;
        Ok(())
    }

    fn fill_secrets(site: &mut SiteConfig) {
        if site.password.as_ref().map(|p| p.is_empty()).unwrap_or(true) {
            site.password = credentials::load_password(&site.id);
        }
        if site
            .private_key_passphrase
            .as_ref()
            .map(|p| p.is_empty())
            .unwrap_or(true)
        {
            site.private_key_passphrase = credentials::load_key_passphrase(&site.id);
        }
    }

    fn persist_secrets(site: &SiteConfig) -> Result<(), String> {
        Self::persist_password(&site.id, &site.password)?;
        match &site.private_key_passphrase {
            Some(pw) if pw.is_empty() => credentials::delete_key_passphrase(&site.id),
            Some(pw) => credentials::save_key_passphrase(&site.id, pw),
            None => Ok(()),
        }
    }

    pub fn list_categories(&self) -> Vec<SiteCategory> {
        let mut categories = self.categories.lock().unwrap().clone();
        categories.sort_by(|a, b| a.sort_order.cmp(&b.sort_order).then(a.name.cmp(&b.name)));
        categories
    }

    pub fn save_category(&self, mut category: SiteCategory) -> Result<SiteCategory, String> {
        let mut categories = self.categories.lock().unwrap();
        if category.id.is_empty() {
            category.id = uuid::Uuid::new_v4().to_string();
        }
        if category.sort_order == 0 && !categories.iter().any(|c| c.id == category.id) {
            category.sort_order = categories
                .iter()
                .map(|c| c.sort_order)
                .max()
                .unwrap_or(0)
                + 1;
        }
        if let Some(pos) = categories.iter().position(|c| c.id == category.id) {
            categories[pos] = category.clone();
        } else {
            categories.push(category.clone());
        }
        drop(categories);
        self.save_to_disk()?;
        Ok(category)
    }

    pub fn delete_category(&self, id: &str) -> Result<bool, String> {
        let mut categories = self.categories.lock().unwrap();
        let len = categories.len();
        categories.retain(|c| c.id != id);
        let removed = categories.len() < len;
        drop(categories);

        if removed {
            let mut sites = self.sites.lock().unwrap();
            for site in sites.iter_mut() {
                if site.category_id.as_deref() == Some(id) {
                    site.category_id = None;
                }
            }
            drop(sites);
            self.save_to_disk()?;
        }
        Ok(removed)
    }

    pub fn list(&self) -> Vec<SiteConfig> {
        let mut sites = self.sites.lock().unwrap().clone();
        for s in &mut sites {
            Self::fill_secrets(s);
        }
        sites
    }

    pub fn get(&self, id: &str) -> Option<SiteConfig> {
        let mut site = self.sites.lock().unwrap().iter().find(|s| s.id == id).cloned()?;
        Self::fill_secrets(&mut site);
        Some(site)
    }

    fn persist_password(site_id: &str, password: &Option<String>) -> Result<(), String> {
        match password {
            Some(pw) if pw.is_empty() => credentials::delete_password(site_id),
            Some(pw) => credentials::save_password(site_id, pw),
            None => Ok(()),
        }
    }

    pub fn add(&self, mut site: SiteConfig) -> Result<(), String> {
        if site.id.is_empty() {
            site.id = uuid::Uuid::new_v4().to_string();
        }
        if site.category_id.as_deref().is_some_and(|s| s.is_empty()) {
            site.category_id = None;
        }
        Self::persist_secrets(&site)?;
        site.password = None;
        site.private_key_passphrase = None;
        self.sites.lock().unwrap().push(site);
        self.save_to_disk()
    }

    pub fn update(&self, mut site: SiteConfig) -> Result<(), String> {
        let mut sites = self.sites.lock().unwrap();
        let Some(pos) = sites.iter().position(|s| s.id == site.id) else {
            return Err("站点不存在".into());
        };
        if site.category_id.as_deref().is_some_and(|s| s.is_empty()) {
            site.category_id = None;
        }
        Self::persist_secrets(&site)?;
        site.password = None;
        site.private_key_passphrase = None;
        sites[pos] = site;
        drop(sites);
        self.save_to_disk()?;
        Ok(())
    }

    pub fn delete(&self, id: &str) -> bool {
        let mut sites = self.sites.lock().unwrap();
        let len = sites.len();
        sites.retain(|s| s.id != id);
        let removed = sites.len() < len;
        drop(sites);
        if removed {
            let _ = credentials::delete_password(id);
            let _ = credentials::delete_key_passphrase(id);
            let _ = self.save_to_disk();
        }
        removed
    }
}
