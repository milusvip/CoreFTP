use tauri::State;
use crate::store::bookmarks::{Bookmark, BookmarkStore};

#[tauri::command]
pub fn list_bookmarks(store: State<'_, BookmarkStore>, site_id: String) -> Vec<Bookmark> {
    store.list(&site_id)
}

#[tauri::command]
pub fn add_bookmark(
    store: State<'_, BookmarkStore>,
    site_id: String,
    label: String,
    path: String,
) -> Result<Bookmark, String> {
    store.add(&site_id, label, path)
}

#[tauri::command]
pub fn remove_bookmark(
    store: State<'_, BookmarkStore>,
    site_id: String,
    bookmark_id: String,
) -> Result<bool, String> {
    store.remove(&site_id, &bookmark_id)
}
