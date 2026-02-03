pub mod commands;
pub mod nostr;
pub mod storage;
pub mod utils;

use commands::{account, contacts, messaging, windows_icons};
use nostr::service::NostrService;
use storage::database::Database;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::RwLock;

pub struct AppState {
    pub nostr_service: Arc<NostrService>,
    pub database: Arc<RwLock<Option<Arc<Database>>>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init());

    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_barcode_scanner::init());

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_clipboard_manager::init());

    builder
        .setup(|app| {
            let nostr_service = Arc::new(NostrService::new());

            // Initialize database
            let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");
            let db_path = app_data_dir.join("ostia.db");
            let db_url = format!("sqlite:{}?mode=rwc", db_path.display());

            // v14.0: Initialize media cache directory
            let media_cache_dir = app_data_dir.join("media_cache");
            if !media_cache_dir.exists() {
                std::fs::create_dir_all(&media_cache_dir).expect("Failed to create media cache dir");
            }
            log::info!("Media Cache Directory: {:?}", media_cache_dir);

            let nostr_service_start = nostr_service.clone();
            let cache_dir_clone = media_cache_dir.clone();
            // 开发阶段: 额外在当前工作目录生成 nostr_debug.log，方便直接从项目根目录查看
            let debug_log_path = std::env::current_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."))
                .join("nostr_debug.log");
            log::info!("Nostr debug log path: {:?}", debug_log_path);
            tauri::async_runtime::spawn(async move {
                nostr_service_start.set_cache_dir(cache_dir_clone).await;
                nostr_service_start.set_debug_log_path(debug_log_path).await;
            });

            let database: Arc<RwLock<Option<Arc<Database>>>> = Arc::new(RwLock::new(None));
            let db_clone = database.clone();
            let nostr_service_clone = nostr_service.clone();

            // Initialize database asynchronously
            tauri::async_runtime::spawn(async move {
                match Database::new(&db_url).await {
                    Ok(db) => {
                        if let Err(e) = db.initialize().await {
                            log::error!("Failed to initialize database: {}", e);
                        }
                        let db_arc = Arc::new(db);
                        // Set database in NostrService
                        nostr_service_clone.set_database(db_arc.clone()).await;
                        *db_clone.write().await = Some(db_arc.clone());

                        // Perform startup cleanup
                        let db_for_cleanup = db_arc.clone();
                        tauri::async_runtime::spawn(async move {
                            log::info!("Starting background database cleanup...");
                            match db_for_cleanup.cleanup_old_data().await {
                                Ok((deleted, messages)) => {
                                    log::info!("Cleanup finished: removed {} deleted_logs and {} stranger messages", deleted, messages);
                                    if let Err(e) = db_for_cleanup.vacuum().await {
                                        log::warn!("Failed to vacuum database: {}", e);
                                    }
                                }
                                Err(e) => log::error!("Failed to clean up database: {}", e),
                            }
                        });
                    }
                    Err(e) => {
                        log::error!("Failed to create database: {}", e);
                    }
                }
            });

            app.manage(AppState {
                nostr_service,
                database,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Account commands
            account::generate_account,
            account::import_private_key,
            account::save_private_key,
            account::load_stored_key,
            account::delete_stored_key,
            account::get_public_key,
            account::npub_to_hex,
            account::publish_identity,
            account::fetch_profile,
            account::has_master_password,
            account::save_encrypted_private_key,
            account::load_decrypted_private_key,
            account::delete_master_password,
            account::get_unlock_lockout_state,
            account::record_unlock_failure,
            account::reset_unlock_lockout,
            // Messaging commands
            messaging::send_message,
            messaging::send_image,
            messaging::send_read_receipt,
            messaging::mark_all_messages_as_read,
            messaging::send_typing,
            messaging::publish_presence,
            messaging::get_messages,
            messaging::update_message_status,
            messaging::start_message_listener,
            messaging::sync_messages,
            messaging::download_image,
            messaging::set_media_server,
            messaging::fetch_recommended_relays,
            // NIP-65 Relay commands
            messaging::query_user_relays,
            messaging::get_my_relays,
            messaging::publish_relay_list,
            messaging::check_relay_health,
            messaging::check_relays_health,
            messaging::get_recommended_relays,
            messaging::add_custom_relay,
            messaging::remove_custom_relay,
            messaging::set_relay_mode,
            messaging::get_relay_config,
            messaging::get_relay_statuses,
            messaging::query_multiple_users_relays,
            // NIP-44 Encryption commands
            messaging::encrypt_message,
            messaging::decrypt_message,
            messaging::delete_encryption_session,
            messaging::get_encryption_sessions,
            messaging::export_session_key,
            messaging::import_session_key,
            // NIP-98 HTTP authentication commands
            messaging::generate_http_auth,
            messaging::verify_http_auth,
            messaging::create_service_auth,
            // NIP-22 Message Reply commands
            messaging::create_reply,
            // NIP-16 Edit/Delete commands
            messaging::edit_message,
            messaging::delete_message,
            messaging::delete_local_message,
            messaging::clear_conversation,
            messaging::get_chat_sessions,
            // Database maintenance
            messaging::manual_cleanup,
            messaging::get_database_stats,
            messaging::export_database,
            messaging::import_database,
            messaging::search_contacts_by_message,
            // NIP-28 Group Chat commands
            messaging::create_channel,
            messaging::join_channel,
            messaging::leave_channel,
            messaging::send_channel_message,
            messaging::get_channel_messages,
            messaging::query_user_channels,
            // Contacts commands
            contacts::add_contact,
            contacts::remove_contact,
            contacts::get_contacts,
            contacts::resolve_nickname,
            contacts::block_contact,
            contacts::update_contact_remark,
            // Windows specific
            windows_icons::set_windows_icons,
            windows_icons::get_windows_theme_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
