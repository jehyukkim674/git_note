mod git_core;
mod vault;
mod auth;
mod sync;
mod update;
mod config;
mod commands;

use std::sync::Mutex;
use tauri::Manager;
use config::{AppConfig, AppState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .setup(|app| {
            let config_dir = app
                .path()
                .app_config_dir()
                .expect("resolve app config dir");
            let data_dir = app.path().app_data_dir().expect("resolve app data dir");
            let config_path = config_dir.join("config.json");
            let cfg = AppConfig::load(&config_path);
            app.manage(AppState {
                config_path,
                default_vault: data_dir.join("vault"),
                config: Mutex::new(cfg),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::ensure_vault,
            commands::list_tree,
            commands::read_note,
            commands::write_note,
            commands::delete_note,
            commands::rename_note,
            commands::export_html,
            commands::create_folder,
            commands::backlinks,
            commands::search_notes,
            commands::save_asset,
            commands::set_github_client_id,
            commands::github_start_device_flow,
            commands::github_poll,
            commands::github_logged_in,
            commands::github_logout,
            commands::set_author,
            commands::connect_repo,
            commands::sync_pull,
            commands::sync_push,
            commands::check_update_github,
            commands::clone_repo,
            commands::changed_paths
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
