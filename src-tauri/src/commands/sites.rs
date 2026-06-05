use tauri::State;

use crate::engine::types::{SiteCategory, SiteConfig};
use crate::store::sites::SiteStore;

#[tauri::command]
pub async fn list_sites(store: State<'_, SiteStore>) -> Result<Vec<SiteConfig>, String> {
    Ok(store.list())
}

#[tauri::command]
pub async fn list_categories(store: State<'_, SiteStore>) -> Result<Vec<SiteCategory>, String> {
    Ok(store.list_categories())
}

#[tauri::command]
pub async fn save_category(
    store: State<'_, SiteStore>,
    category: SiteCategory,
) -> Result<SiteCategory, String> {
    store.save_category(category)
}

#[tauri::command]
pub async fn delete_category(store: State<'_, SiteStore>, id: String) -> Result<bool, String> {
    store.delete_category(&id)
}

#[tauri::command]
pub async fn get_site(store: State<'_, SiteStore>, id: String) -> Result<Option<SiteConfig>, String> {
    Ok(store.get(&id))
}

#[tauri::command]
pub async fn save_site(store: State<'_, SiteStore>, site: SiteConfig) -> Result<(), String> {
    let exists_in_memory = store.get(&site.id).is_some();
    if exists_in_memory {
        store.update(site)
    } else {
        store.add(site)
    }
}

#[tauri::command]
pub async fn delete_site(store: State<'_, SiteStore>, id: String) -> Result<bool, String> {
    Ok(store.delete(&id))
}
