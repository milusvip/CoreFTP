use tauri::State;
use crate::store::logs::AppLog;
use crate::store::settings::{AppSettings, SettingsStore};
use crate::store::transfers::{self, PersistedTransferTask};
use crate::store::logs::{LogEntry};

#[tauri::command]
pub fn get_settings(store: State<'_, SettingsStore>) -> AppSettings {
    store.get()
}

#[tauri::command]
pub fn save_settings(store: State<'_, SettingsStore>, settings: AppSettings, log: State<'_, AppLog>) -> Result<(), String> {
    log.set_max(settings.max_log_entries);
    store.save(settings)
}

#[tauri::command]
pub fn get_app_logs(log: State<'_, AppLog>) -> Vec<LogEntry> {
    log.list()
}

#[tauri::command]
pub fn clear_app_logs(log: State<'_, AppLog>) -> Result<(), String> {
    log.clear();
    Ok(())
}

#[tauri::command]
pub fn load_persisted_transfers() -> Vec<PersistedTransferTask> {
    transfers::load_transfers()
}

#[tauri::command]
pub fn save_persisted_transfers(tasks: Vec<PersistedTransferTask>) -> Result<(), String> {
    transfers::save_transfers(&tasks)
}

#[tauri::command]
pub fn clear_persisted_transfers() -> Result<(), String> {
    transfers::clear_transfers()
}
