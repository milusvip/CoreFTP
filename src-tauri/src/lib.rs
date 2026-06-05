mod commands;
mod engine;
mod store;

use std::sync::Arc;
use commands::files::ConnectionPool;
use commands::{sites, files, extract, transfer, settings, bookmarks, sync, edit, terminal};
use engine::cancel::CancelRegistry;
use store::sites::SiteStore;
use store::settings::SettingsStore;
use store::bookmarks::BookmarkStore;
use store::logs::AppLog;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_millis()
        .init();
    log::info!("CoreFTP starting...");

    let settings_store = SettingsStore::new();
    let max_log = settings_store.get().max_log_entries;
    let app_log = AppLog::new(max_log);

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(SiteStore::new())
        .manage(settings_store)
        .manage(BookmarkStore::new())
        .manage(app_log)
        .manage(Arc::new(ConnectionPool::new()))
        .manage(Arc::new(terminal::TerminalPool::new()))
        .manage(Arc::new(CancelRegistry::new()))
        .invoke_handler(tauri::generate_handler![
            sites::list_sites,
            sites::list_categories,
            sites::save_category,
            sites::delete_category,
            sites::get_site,
            sites::save_site,
            sites::delete_site,
            files::connect_server,
            files::check_server_connection,
            files::disconnect_server,
            files::list_remote_files,
            files::list_local_files,
            files::search_local_files,
            files::search_remote_files,
            files::get_home_dir,
            files::local_mkdir,
            files::local_rename,
            extract::upload_and_extract,
            extract::extract_remote,
            extract::check_server_tools,
            transfer::local_file_exists,
            transfer::path_is_dir,
            transfer::remote_file_exists,
            transfer::upload_transfer_file,
            transfer::upload_transfer_paths,
            transfer::download_transfer_file,
            transfer::download_transfer_paths,
            transfer::delete_remote_file,
            transfer::delete_local_file,
            transfer::copy_local_files,
            transfer::cancel_transfer,
            transfer::remote_mkdir,
            transfer::remote_rename,
            settings::get_settings,
            settings::save_settings,
            settings::get_app_logs,
            settings::clear_app_logs,
            settings::load_persisted_transfers,
            settings::save_persisted_transfers,
            settings::clear_persisted_transfers,
            settings::open_external_url,
            bookmarks::list_bookmarks,
            bookmarks::add_bookmark,
            bookmarks::remove_bookmark,
            sync::sync_mirror,
            edit::prepare_edit_remote,
            edit::commit_edit_remote,
            edit::open_path_with_default_app,
            edit::cleanup_edit_session,
            terminal::terminal_open,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_close,
            terminal::show_terminal_window,
            terminal::hide_terminal_window,
        ])
        .run(tauri::generate_context!())
        .expect("启动 CoreFTP 失败");
}
