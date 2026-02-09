use serde::{Deserialize, Serialize};
use tauri::{command, State, Emitter};

#[command]
pub async fn delete_local_message(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db_guard = state.database.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    
    // v14.0: Check if message has media to delete from cache
    if let Ok(Some(msg)) = db.get_message_by_id(&id).await {
        if let Some(media_url) = msg.media_url {
            log::info!("Deleting local cache for message {}: {}", id, media_url);
            state.nostr_service.delete_image_cache(&media_url).await;
        }
    }

    db.delete_message(&id).await
}

#[command]
pub async fn clear_conversation(state: State<'_, AppState>, contact_npub: String) -> Result<(), String> {
    let db_guard = state.database.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    if let Some(my_npub) = state.nostr_service.get_public_key() {
        db.delete_conversation(&contact_npub, &my_npub).await
    } else {
        Err("Failed to get public key".to_string())
    }
}

#[command]
pub async fn export_database(state: State<'_, AppState>, path: String) -> Result<(), String> {
    log::info!("Command: export_database called, path: {}", path);
    let db_guard = state.database.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    db.export_to_file(&path).await
}

#[command]
pub async fn import_database(state: State<'_, AppState>, path: String) -> Result<(), String> {
    log::info!("Command: import_database called, path: {}", path);
    let db_guard = state.database.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;
    db.import_from_file(&path).await
}

use nostr_sdk::ToBech32;

use crate::nostr::nip65::{RelayHealthResult, RelayListEntry};
use crate::storage::database::{MessageRecord, ChatSession};
use crate::storage::secure::get_stored_key;
use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub sender: String,
    pub receiver: String,
    pub content: String,
    pub timestamp: i64,
    pub status: String,
    #[serde(rename = "messageType", default = "default_message_type")]
    pub message_type: String,
    #[serde(rename = "mediaUrl")]
    pub media_url: Option<String>,
}

fn default_message_type() -> String {
    "text".to_string()
}

impl From<MessageRecord> for Message {
    fn from(record: MessageRecord) -> Self {
        Message {
            id: record.id,
            sender: record.sender,
            receiver: record.receiver,
            content: record.content,
            timestamp: record.timestamp,
            status: record.status,
            message_type: record.message_type,
            media_url: record.media_url,
        }
    }
}

impl From<&Message> for MessageRecord {
    fn from(msg: &Message) -> Self {
        MessageRecord {
            id: msg.id.clone(),
            sender: msg.sender.clone(),
            receiver: msg.receiver.clone(),
            content: msg.content.clone(),
            timestamp: msg.timestamp,
            status: msg.status.clone(),
            message_type: msg.message_type.clone(),
            media_url: msg.media_url.clone(),
        }
    }
}

/// Send a private message to a contact
#[command]
pub async fn send_message(
    state: State<'_, AppState>,
    handle: tauri::AppHandle,
    receiver: String,
    content: String,
) -> Result<String, String> {
    log::info!("Command: send_message called for receiver {}", receiver);
    // Get the stored key and public key
    let key = match get_stored_key() {
        Some(k) => k,
        None => {
            log::error!("Command: send_message FAILED - Private key not found in memory!");
            return Err("未找到私钥".to_string());
        }
    };

    // Ensure Nostr service is initialized
    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    // Get sender's public key
    let my_npub = state
        .nostr_service
        .get_public_key()
        .ok_or_else(|| "Failed to get public key".to_string())?;

    // Send the message via Nostr
    let event_id = state
        .nostr_service
        .send_private_message(&receiver, &content)
        .await
        .map_err(|e| format!("Failed to send message: {}", e))?;

    let event_id_str = event_id.to_string();

    // Save to local database
    let db_guard = state.database.read().await;
    if let Some(ref db) = *db_guard {
        let message_record = MessageRecord {
            id: event_id_str.clone(),
            sender: my_npub.clone(),
            receiver: receiver.clone(),
            content: content.clone(),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64,
            status: "sent".to_string(),
            message_type: "text".to_string(),
            media_url: None,
        };

        if let Err(e) = db.save_message(&message_record).await {
            log::warn!("Failed to save message to database: {}", e);
        } else {
            // v9: Emit event so UI updates immediately for sent messages
            let payload = serde_json::json!({
                "message": message_record,
                "metadata": {
                    "is_sync": false
                }
            });
            let _ = handle.emit("new-message", &payload);
            log::info!("Messaging (v9): Emitted sent event for {}", event_id_str);
        }
    }

    Ok(event_id_str)
}

#[command]
pub async fn mark_all_messages_as_read(
    state: State<'_, AppState>,
    handle: tauri::AppHandle,
    contact_npub: String,
) -> Result<(), String> {
    let my_npub = state
        .nostr_service
        .get_public_key()
        .ok_or_else(|| "获取本地公钥失败".to_string())?;

    let db_guard = state.database.read().await;
    let ids = if let Some(ref db) = *db_guard {
        db.mark_all_messages_read(&contact_npub, &my_npub).await?
    } else {
        return Err("Database not initialized".to_string());
    };

    if ids.is_empty() {
        return Ok(());
    }

    // Emit read-receipt events for frontend updates
    for id in &ids {
         let payload = serde_json::json!({
             "messageId": id,
             "from": my_npub
         });
         let _ = handle.emit("read-receipt", &payload);
    }

    // Attempt to send read receipt to network (best effort)
    // We limit to the last 50 IDs to avoid creating a huge event
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;
    
    // We don't want to fail the whole command if network fails, so we wrap this
    let _ = async {
        state.nostr_service.initialize(&key).await.map_err(|e| e.to_string())?;
        
        let ids_to_send: Vec<String> = ids.iter().rev().take(50).cloned().collect();
        let content = serde_json::json!({
            "v": 1,
            "type": "read_receipt",
            "messageIds": ids_to_send,
        }).to_string();

        state.nostr_service.send_private_message(&contact_npub, &content).await.map_err(|e| e.to_string())?;
        Ok::<(), String>(())
    }.await;

    Ok(())
}

#[command]
pub async fn send_read_receipt(
    state: State<'_, AppState>,
    handle: tauri::AppHandle,
    receiver: String,
    message_ids: Vec<String>,
) -> Result<(), String> {
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;
    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("初始化 Nostr 服务失败: {}", e))?;

    let my_npub = state
        .nostr_service
        .get_public_key()
        .ok_or_else(|| "获取本地公钥失败".to_string())?;

    // 1. 先更新本地数据库状态 (优先保证本地已读状态正确，即使网络失败)
    let db_guard = state.database.read().await;
    if let Some(ref db) = *db_guard {
        for id in &message_ids {
            let _ = db.update_message_status(id, "read").await;
            let payload = serde_json::json!({
                "messageId": id,
                "from": my_npub
            });
            let _ = handle.emit("read-receipt", &payload);
        }
    }

    let content = serde_json::json!({
        "v": 1,
        "type": "read_receipt",
        "messageIds": message_ids,
    })
    .to_string();

    // 2. 尝试发送已读回执 (如果失败仅记录日志，不返回错误，以免阻塞前端刷新UI)
    if let Err(e) = state
        .nostr_service
        .send_private_message(&receiver, &content)
        .await
    {
        log::warn!("发送已读回执失败: {}", e);
    }

    Ok(())
}

#[command]
pub async fn send_typing(
    state: State<'_, AppState>,
    receiver: String,
    typing: bool,
) -> Result<(), String> {
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;
    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("初始化 Nostr 服务失败: {}", e))?;

    let content = serde_json::json!({
        "v": 1,
        "type": "typing",
        "typing": typing,
    })
    .to_string();

    state
        .nostr_service
        .send_private_message(&receiver, &content)
        .await
        .map_err(|e| format!("发送正在输入状态失败: {}", e))?;
    Ok(())
}

#[command]
pub async fn publish_presence(
    state: State<'_, AppState>,
    online: bool,
) -> Result<(), String> {
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;
    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("初始化 Nostr 服务失败: {}", e))?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let content = serde_json::json!({
        "v": 1,
        "type": "presence",
        "online": online,
        "lastSeen": now,
    })
    .to_string();

    let db_guard = state.database.read().await;
    if let Some(ref db) = *db_guard {
        if let Some(my_npub) = state.nostr_service.get_public_key() {
            if let Ok(sessions) = db.get_chat_sessions(&my_npub).await {
                for s in sessions {
                    if s.contact.blocked {
                        continue;
                    }
                    let _ = state
                        .nostr_service
                        .send_private_message(&s.contact.npub, &content)
                        .await;
                }
                return Ok(());
            }
        }
        if let Ok(contacts) = db.get_contacts().await {
            for c in contacts {
                if c.blocked {
                    continue;
                }
                let _ = state
                    .nostr_service
                    .send_private_message(&c.npub, &content)
                    .await;
            }
        }
    }
    Ok(())
}

/// Send an image message (encrypt, upload, and send as URL)
#[command]
pub async fn send_image(
    state: State<'_, AppState>,
    handle: tauri::AppHandle,
    receiver: String,
    image_data: Vec<u8>,
    filename: String,
) -> Result<(String, String, String), String> {
    // Get the stored key
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    // Ensure Nostr service is initialized
    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    // Get sender's public key
    let my_npub = state
        .nostr_service
        .get_public_key()
        .ok_or_else(|| "Failed to get public key".to_string())?;

    // Upload image (compress -> encrypt -> upload)
    log::info!("Uploading image: {}", filename);
    let (media_url, _key_hex, _nonce_hex) = state
        .nostr_service
        .upload_image(&image_data, &filename)
        .await
        .map_err(|e| format!("Failed to upload image: {}", e))?;

    log::info!("Image uploaded to: {}", media_url);
    log::debug!("send_image - media_url FULL: '{}'", media_url);
    log::debug!("send_image - media_url length: {}", media_url.len());
    log::debug!("send_image - media_url contains '#': {}", media_url.contains('#'));

    // Send message with media URL
    let content = format!("📷 Image: {}", media_url);
    log::debug!("send_image - content (for NIP-17): '{}'", content);
    let event_id = state
        .nostr_service
        .send_private_message(&receiver, &content)
        .await
        .map_err(|e| format!("Failed to send message: {}", e))?;

    let event_id_str = event_id.to_string();

    // Save to local database with media URL
    let db_guard = state.database.read().await;
    if let Some(ref db) = *db_guard {
        let message_record = MessageRecord {
            id: event_id_str.clone(),
            sender: my_npub.clone(),
            receiver: receiver.clone(),
            content: content.clone(),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64,
            status: "sent".to_string(),
            message_type: "image".to_string(),
            media_url: Some(media_url.clone()),
        };

        log::debug!("send_image - message_record.media_url before save: {:?}", message_record.media_url);
        log::debug!("send_image - message_record.media_url FULL before save: '{}'", message_record.media_url.clone().unwrap_or_default());

        if let Err(e) = db.save_message(&message_record).await {
            log::warn!("Failed to save image message to database: {}", e);
        } else {
            // v9: Emit event so UI updates immediately for sent images
            let payload = serde_json::json!({
                "message": message_record,
                "metadata": {
                    "is_sync": false
                }
            });
            let _ = handle.emit("new-message", &payload);
            log::info!("Messaging (v9): Emitted sent image event for {}", event_id_str);
        }
    }

    Ok((event_id_str, content, media_url))
}

/// Get messages for a conversation with a contact
#[command]
pub async fn get_messages(
    state: State<'_, AppState>,
    contact: String,
    limit: u32,
    offset: u32,
) -> Result<Vec<Message>, String> {
    // Get the stored key
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    // Ensure Nostr service is initialized
    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    // Get my public key
    let my_npub = state
        .nostr_service
        .get_public_key()
        .ok_or_else(|| "Failed to get public key".to_string())?;

    // Try to get messages from local database first
    let db_guard = state.database.read().await;
    if let Some(ref db) = *db_guard {
        match db
            .get_messages(&contact, &my_npub, limit as i64, offset as i64)
            .await
        {
            Ok(records) if !records.is_empty() => {
                // Debug log for image messages - v13: Add detailed fragment tracing
                for record in &records {
                    if record.message_type == "image" {
                        log::info!("Command get_messages (v13) - id: {}, media_url from db: {:?}", record.id, record.media_url);
                        if let Some(ref url) = record.media_url {
                            log::info!("Command get_messages (v13) - FULL media_url string: '{}'", url);
                            log::info!("Command get_messages (v13) - media_url length: {}", url.len());
                            log::info!("Command get_messages (v13) - contains '#': {}", url.contains('#'));
                            if url.contains('#') {
                                let parts: Vec<&str> = url.split('#').collect();
                                log::info!("Command get_messages (v13) - split parts: {:?}", parts);
                                if parts.len() > 1 {
                                    log::info!("Command get_messages (v13) - fragment part: '{}'", parts[1]);
                                }
                            }
                        }
                    }
                }
                let messages: Vec<Message> = records.into_iter().map(Message::from).collect();
                // Debug log after conversion - v13
                for msg in &messages {
                    if msg.message_type == "image" {
                        log::info!("Command get_messages (v13) - id: {}, media_url after conversion: {:?}", msg.id, msg.media_url);
                        if let Some(ref url) = msg.media_url {
                            log::info!("Command get_messages (v13) - FULL media_url string: '{}'", url);
                            log::info!("Command get_messages (v13) - media_url length: {}", url.len());
                            log::info!("Command get_messages (v13) - contains '#': {}", url.contains('#'));
                            if url.contains('#') {
                                let parts: Vec<&str> = url.split('#').collect();
                                log::info!("Command get_messages (v13) - split parts: {:?}", parts);
                                if parts.len() > 1 {
                                    log::info!("Command get_messages (v13) - fragment part: '{}'", parts[1]);
                                }
                            }
                        }
                    }
                }
                return Ok(messages);
            }
            Ok(_) => {
                // Database is empty, try fetching from network
            }
            Err(e) => {
                log::warn!("Failed to get messages from database: {}", e);
            }
        }
    }
    drop(db_guard);

    // If database is empty, return empty list. Synchronizing should be done via the sync command.
    Ok(Vec::new())
}

/// Search for contacts that have messages matching the query
#[command]
pub async fn search_contacts_by_message(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<String>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    
    let db_guard = state.database.read().await;
    if let Some(ref db) = *db_guard {
        db.search_contacts_by_message(&query).await
    } else {
        Err("数据库未就绪".to_string())
    }
}

/// Update the status of a message
#[command]
pub async fn update_message_status(
    state: State<'_, AppState>,
    message_id: String,
    status: String,
) -> Result<(), String> {
    let db_guard = state.database.read().await;
    if let Some(ref db) = *db_guard {
        db.update_message_status(&message_id, &status).await?;
    }
    Ok(())
}

/// Start listening for new messages from relays
#[command]
pub async fn start_message_listener(
    state: State<'_, AppState>,
    window: tauri::Window,
) -> Result<(), String> {
    // Check if listener is already started by calling the service's check method
    // The service itself has the listener_started flag, so we just call it
    // and it will return immediately if already started

    log::info!("Command: start_message_listener called");

    // Get the stored key
    let key = match get_stored_key() {
        Some(k) => k,
        None => {
            log::error!("Command: start_message_listener FAILED - Private key not found in memory!");
            return Err("未找到私钥".to_string());
        }
    };

    // Ensure Nostr service is initialized
    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    // Start the message listener (service will check if already started)
    state
        .nostr_service
        .start_message_listener(window)
        .await
        .map_err(|e| format!("Failed to start message listener: {}", e))?;

    log::info!("Message listener started successfully");

    Ok(())
}

/// Sync offline messages from relays
#[command]
pub async fn sync_messages(
    state: State<'_, AppState>,
    handle: tauri::AppHandle,
) -> Result<usize, String> {
    log::info!("Command: sync_messages called");
    // Get the stored key
    let key = match get_stored_key() {
        Some(k) => k,
        None => {
            log::error!("Command: sync_messages FAILED - Private key not found in memory!");
            return Err("未找到私钥".to_string());
        }
    };

    // Ensure Nostr service is initialized
    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    // Get my public key
    let my_npub = state
        .nostr_service
        .get_public_key()
        .ok_or_else(|| "Failed to get public key".to_string())?;

    // Get last sync time from cache
    let db_guard = state.database.read().await;
    let last_sync: Option<i64> = if let Some(ref db) = *db_guard {
        db.get_cache("last_sync_time")
            .await
            .ok()
            .flatten()
            .and_then(|s| s.parse().ok())
    } else {
        None
    };
    drop(db_guard);

    log::info!(
        "Starting offline sync for {} since {:?}",
        my_npub,
        last_sync
    );

    // Sync offline messages using the sync manager
    let sync_count = state
        .nostr_service
        .sync_offline_messages(Some(&handle))
        .await
        .map_err(|e| format!("Failed to sync offline messages: {}", e))?;

    log::info!(
        "Synced {} messages for {}",
        sync_count,
        my_npub
    );

    Ok(sync_count)
}

/// Download and decrypt an image from URL
#[command]
pub async fn download_image(
    state: State<'_, AppState>,
    full_url: String,
) -> Result<Vec<u8>, String> {
    log::info!("Command download_image called with URL: {}", full_url);

    // Get the stored key
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    // Ensure Nostr service is initialized
    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    // Download the image
    let image_data = state
        .nostr_service
        .download_image(&full_url)
        .await
        .map_err(|e| format!("Failed to download image: {}", e))?;

    Ok(image_data)
}

/// Query a user's relay list (NIP-65)
#[command]
pub async fn query_user_relays(
    state: State<'_, AppState>,
    pubkey: String,
) -> Result<Vec<RelayListEntry>, String> {
    // Get the stored key
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    // Ensure Nostr service is initialized
    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    // Query user relays
    let relays = state
        .nostr_service
        .query_user_relays(&pubkey)
        .await
        .map_err(|e| format!("Failed to query user relays: {}", e))?;

    Ok(relays)
}

/// Get current user's relay list
#[command]
pub async fn get_my_relays(
    state: State<'_, AppState>,
) -> Result<Vec<RelayListEntry>, String> {
    // Get the stored key
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    // Ensure Nostr service is initialized
    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    // Get my relays
    let relays = state
        .nostr_service
        .get_my_relays()
        .await
        .map_err(|e| format!("Failed to get my relays: {}", e))?;

    Ok(relays)
}

/// Publish relay list (NIP-65)
#[command]
pub async fn publish_relay_list(
    state: State<'_, AppState>,
    relays: Vec<RelayListEntry>,
) -> Result<String, String> {
    // Get the stored key
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    // Ensure Nostr service is initialized
    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    // Publish relay list
    let event_id = state
        .nostr_service
        .publish_relay_list(relays)
        .await
        .map_err(|e| format!("Failed to publish relay list: {}", e))?;

    Ok(event_id)
}

/// Check relay health
#[command]
pub async fn check_relay_health(
    state: State<'_, AppState>,
    relay_url: String,
) -> Result<RelayHealthResult, String> {
    // Get the stored key
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    // Ensure Nostr service is initialized
    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    // Check relay health
    let result = state
        .nostr_service
        .check_relay_health(&relay_url)
        .await
        .map_err(|e| format!("Failed to check relay health: {}", e))?;

    Ok(result)
}

/// Check health of multiple relays
#[command]
pub async fn check_relays_health(
    state: State<'_, AppState>,
    relay_urls: Vec<String>,
) -> Result<Vec<RelayHealthResult>, String> {
    // Get the stored key
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    // Ensure Nostr service is initialized
    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    // Check relays health
    let results = state
        .nostr_service
        .check_relays_health(relay_urls)
        .await
        .map_err(|e| format!("Failed to check relays health: {}", e))?;

    Ok(results)
}

/// Get recommended relays
#[command]
pub async fn get_recommended_relays(
    state: State<'_, AppState>,
) -> Result<Vec<RelayListEntry>, String> {
    // Get recommended relays (synchronous, no need to initialize)
    let relays = state.nostr_service.get_recommended_relays();
    Ok(relays)
}

/// Add custom relay
#[command]
pub async fn add_custom_relay(
    state: State<'_, AppState>,
    relay_url: String,
) -> Result<(), String> {
    // Get the stored key
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    // Ensure Nostr service is initialized
    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    // Add relay
    state
        .nostr_service
        .add_custom_relay(relay_url)
        .await
        .map_err(|e| format!("Failed to add custom relay: {}", e))?;

    Ok(())
}

/// Remove custom relay
#[command]
pub async fn remove_custom_relay(
    state: State<'_, AppState>,
    relay_url: String,
) -> Result<(), String> {
    // Get the stored key
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    // Ensure Nostr service is initialized
    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    // Remove relay
    state
        .nostr_service
        .remove_custom_relay(&relay_url)
        .await
        .map_err(|e| format!("Failed to remove custom relay: {}", e))?;

    Ok(())
}

/// Set relay mode (hybrid or exclusive)
#[command]
pub async fn set_relay_mode(
    state: State<'_, AppState>,
    mode: String,
) -> Result<(), String> {
    // Get the stored key
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    // Ensure Nostr service is initialized
    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    // Set mode
    state
        .nostr_service
        .set_relay_mode(&mode)
        .await
        .map_err(|e| format!("Failed to set relay mode: {}", e))?;

    Ok(())
}

/// Get current relay configuration
#[command]
pub async fn get_relay_config(
    state: State<'_, AppState>,
) -> Result<(String, Vec<String>, Vec<String>, String, String), String> {
    // Get the stored key
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    // Ensure Nostr service is initialized
    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    // Get config
    let config = state
        .nostr_service
        .get_relay_config()
        .await
        .map_err(|e| format!("Failed to get relay config: {}", e))?;

    Ok(config)
}

/// Get relay statuses
#[command]
pub async fn get_relay_statuses(
    state: State<'_, AppState>,
) -> Result<Vec<(String, String)>, String> {
    // Get the stored key
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    // Ensure Nostr service is initialized
    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    // Get statuses
    let statuses = state
        .nostr_service
        .get_relay_statuses()
        .await
        .map_err(|e| format!("Failed to get relay statuses: {}", e))?;

    Ok(statuses)
}

/// Query multiple users' relay lists and merge them
#[command]
pub async fn query_multiple_users_relays(
    state: State<'_, AppState>,
    pubkeys: Vec<String>,
) -> Result<Vec<RelayListEntry>, String> {
    // Get the stored key
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    // Ensure Nostr service is initialized
    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    // Convert Vec<String> to Vec<&str>
    let pubkey_refs: Vec<&str> = pubkeys.iter().map(|s| s.as_str()).collect();

    // Query user relays
    let relays = state
        .nostr_service
        .query_multiple_users_relays(&pubkey_refs)
        .await
        .map_err(|e| format!("Failed to query multiple users' relays: {}", e))?;

    Ok(relays)
}

/// Encrypt a message using NIP-44
#[command]
pub async fn encrypt_message(
    state: State<'_, AppState>,
    plaintext: String,
    their_pubkey: String,
) -> Result<(String, String, String), String> {
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    let encrypted = state
        .nostr_service
        .encrypt_message(&plaintext, &their_pubkey)
        .await
        .map_err(|e| format!("Failed to encrypt message: {}", e))?;

    Ok((encrypted.ciphertext, encrypted.nonce, encrypted.pubkey))
}

/// Decrypt a message using NIP-44
#[command]
pub async fn decrypt_message(
    state: State<'_, AppState>,
    ciphertext: String,
    nonce: String,
    pubkey: String,
    timestamp: u64,
) -> Result<String, String> {
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    let encrypted = crate::nostr::encryption::EncryptedMessage {
        ciphertext,
        nonce,
        pubkey,
        timestamp,
    };

    let plaintext = state
        .nostr_service
        .decrypt_message(&encrypted)
        .await
        .map_err(|e| format!("Failed to decrypt message: {}", e))?;

    Ok(plaintext)
}

/// Delete NIP-44 encryption session
#[command]
pub async fn delete_encryption_session(
    state: State<'_, AppState>,
    their_pubkey: String,
) -> Result<(), String> {
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    state
        .nostr_service
        .delete_encryption_session(&their_pubkey)
        .await
        .map_err(|e| format!("Failed to delete encryption session: {}", e))?;

    Ok(())
}

/// Set Custom Media Server
#[command]
pub async fn set_media_server(
    state: State<'_, AppState>,
    url: String,
    token: Option<String>,
) -> Result<(), String> {
    state.nostr_service.set_media_server(url, token).await
        .map_err(|e| format!("Failed to set media server: {}", e))?;
    Ok(())
}

/// Fetch additional recommended relays from GitHub (dynamic updates)
#[command]
pub async fn fetch_recommended_relays() -> Result<Vec<RelayListEntry>, String> {
    // This doesn't require initialization or keys
    let additional = crate::nostr::service::NostrService::fetch_additional_relays().await?;
    Ok(additional)
}

/// Get all active NIP-44 encryption sessions
#[command]
pub async fn get_encryption_sessions(
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    let sessions = state.nostr_service.get_encryption_sessions().await;
    Ok(sessions)
}

/// Export NIP-44 session key for backup
#[command]
pub async fn export_session_key(
    state: State<'_, AppState>,
    their_pubkey: String,
) -> Result<String, String> {
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    let key_hex = state
        .nostr_service
        .export_session_key(&their_pubkey)
        .await
        .map_err(|e| format!("Failed to export session key: {}", e))?;

    Ok(key_hex)
}

/// Import NIP-44 session key for recovery
#[command]
pub async fn import_session_key(
    state: State<'_, AppState>,
    their_pubkey: String,
    key_hex: String,
) -> Result<(), String> {
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    state
        .nostr_service
        .import_session_key(&their_pubkey, &key_hex)
        .await
        .map_err(|e| format!("Failed to import session key: {}", e))?;

    Ok(())
}

/// Generate HTTP authentication header (NIP-98)
#[command]
pub async fn generate_http_auth(
    state: State<'_, AppState>,
    url: String,
    method: String,
    payload: Option<String>,
) -> Result<String, String> {
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    let header = state
        .nostr_service
        .generate_http_auth(&url, &method, payload.as_deref())
        .await
        .map_err(|e| format!("Failed to generate auth header: {}", e))?;

    Ok(header)
}

/// Verify HTTP authentication header (NIP-98)
#[command]
pub fn verify_http_auth(
    state: State<'_, AppState>,
    header: String,
    expected_url: String,
    expected_method: String,
) -> Result<bool, String> {
    let valid = state
        .nostr_service
        .verify_http_auth(&header, &expected_url, &expected_method)
        .map_err(|e| format!("Failed to verify auth header: {}", e))?;

    Ok(valid)
}

/// Create service authentication (NIP-98)
#[command]
pub async fn create_service_auth(
    state: State<'_, AppState>,
    service_url: String,
    challenge: String,
) -> Result<String, String> {
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    let header = state
        .nostr_service
        .create_service_auth(&service_url, &challenge)
        .await
        .map_err(|e| format!("Failed to create service auth: {}", e))?;

    Ok(header)
}

// ==================== NIP-22: Message Reply ====================

/// Create a reply to a message (NIP-22)
#[command]
pub async fn create_reply(
    state: State<'_, AppState>,
    content: String,
    replied_event_id: String,
) -> Result<String, String> {
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    let event_id = state
        .nostr_service
        .create_reply(&content, &replied_event_id)
        .await
        .map_err(|e| format!("Failed to create reply: {}", e))?;

    Ok(event_id.to_hex())
}

// ==================== NIP-16: Edit/Delete ====================

/// Edit a message (NIP-16)
#[command]
pub async fn edit_message(
    state: State<'_, AppState>,
    message_id: String,
    new_content: String,
) -> Result<String, String> {
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    let event_id = state
        .nostr_service
        .edit_message(&message_id, &new_content)
        .await
        .map_err(|e| format!("Failed to edit message: {}", e))?;

    Ok(event_id.to_hex())
}

/// Delete a message (NIP-16)
#[command]
pub async fn delete_message(
    state: State<'_, AppState>,
    message_id: String,
) -> Result<(), String> {
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    state
        .nostr_service
        .delete_message(&message_id)
        .await
        .map_err(|e| format!("Failed to delete message: {}", e))?;

    Ok(())
}

// ==================== NIP-28: Group Chat ====================

/// Create a channel (NIP-28)
#[command]
pub async fn create_channel(
    state: State<'_, AppState>,
    name: String,
    about: String,
) -> Result<String, String> {
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    let event_id = state
        .nostr_service
        .create_channel(&name, &about)
        .await
        .map_err(|e| format!("Failed to create channel: {}", e))?;

    Ok(event_id.to_hex())
}

/// Join a channel (NIP-28)
#[command]
pub async fn join_channel(
    state: State<'_, AppState>,
    channel_id: String,
) -> Result<(), String> {
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    state
        .nostr_service
        .join_channel(&channel_id)
        .await
        .map_err(|e| format!("Failed to join channel: {}", e))?;

    Ok(())
}

/// Leave a channel (NIP-28)
#[command]
pub async fn leave_channel(
    state: State<'_, AppState>,
    channel_id: String,
) -> Result<(), String> {
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    state
        .nostr_service
        .leave_channel(&channel_id)
        .await
        .map_err(|e| format!("Failed to leave channel: {}", e))?;

    Ok(())
}

/// Send message to channel (NIP-28)
#[command]
pub async fn send_channel_message(
    state: State<'_, AppState>,
    channel_id: String,
    content: String,
) -> Result<String, String> {
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    let event_id = state
        .nostr_service
        .send_channel_message(&channel_id, &content)
        .await
        .map_err(|e| format!("Failed to send channel message: {}", e))?;

    Ok(event_id.to_hex())
}

/// Get channel messages (NIP-28)
#[command]
pub async fn get_channel_messages(
    state: State<'_, AppState>,
    channel_id: String,
) -> Result<Vec<Message>, String> {
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    let events = state
        .nostr_service
        .get_channel_messages(&channel_id)
        .await
        .map_err(|e| format!("Failed to get channel messages: {}", e))?;

    // Convert events to Message format
    let messages: Vec<Message> = events
        .into_iter()
        .map(|event| Message {
            id: event.id.to_hex(),
            sender: event.pubkey.to_bech32().unwrap_or_else(|_| event.pubkey.to_hex()),
            receiver: "".to_string(), // Not applicable for channels
            content: event.content.to_string(),
            timestamp: event.created_at.as_u64() as i64,
            status: "delivered".to_string(),
            message_type: "text".to_string(),
            media_url: None,
        })
        .collect();

    Ok(messages)
}

/// Query user's channels (NIP-28)
#[command]
pub async fn query_user_channels(
    state: State<'_, AppState>,
) -> Result<Vec<Message>, String> {
    let key = get_stored_key().ok_or_else(|| "未找到私钥".to_string())?;

    state
        .nostr_service
        .initialize(&key)
        .await
        .map_err(|e| format!("Failed to initialize Nostr service: {}", e))?;

    let events = state
        .nostr_service
        .query_user_channels()
        .await
        .map_err(|e| format!("Failed to query user channels: {}", e))?;

    // Convert events to Message format
    let messages: Vec<Message> = events
        .into_iter()
        .map(|event| Message {
            id: event.id.to_hex(),
            sender: event.pubkey.to_bech32().unwrap_or_else(|_| event.pubkey.to_hex()),
            receiver: "".to_string(),
            content: event.content.to_string(),
            timestamp: event.created_at.as_u64() as i64,
            status: "delivered".to_string(),
            message_type: "text".to_string(),
            media_url: None,
        })
        .collect();

    Ok(messages)
}

#[command]
pub async fn get_chat_sessions(
    state: State<'_, AppState>,
) -> Result<Vec<ChatSession>, String> {
    let db_guard = state.database.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let my_npub = state
        .nostr_service
        .get_public_key()
        .ok_or_else(|| "Failed to get public key".to_string())?;

    db.get_chat_sessions(&my_npub).await
}

/// 手动清理本地数据库 - 支持多种清理模式
#[command]
pub async fn manual_cleanup(
    state: State<'_, AppState>,
    mode: String, // "all", "old", "stranger", "vacuum"
) -> Result<(u64, u64, String), String> {
    let db_guard = state.database.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    match mode.as_str() {
        "all" => {
            // 清理所有旧数据 + 真空压缩
            let old_messages = db.cleanup_all_old_messages().await?;
            let (deleted, stranger_messages) = db.cleanup_old_data().await?;
            db.vacuum().await?;
            let total_messages = old_messages + stranger_messages;
            let msg = format!(
                "清理完成: 删除 {} 条删除记录, {} 条旧消息, {} 条陌生人消息, 数据库已压缩",
                deleted, old_messages, stranger_messages
            );
            Ok((deleted, total_messages, msg))
        }
        "old" => {
            // 仅清理 7 天前的旧消息 (包括联系人)
            let deleted_count = db.cleanup_all_old_messages().await?;
            let msg = format!("清理完成: 删除 {} 条 7 天前的旧消息", deleted_count);
            Ok((0, deleted_count, msg))
        }
        "stranger" => {
            // 仅清理陌生人消息 (7 天前)
            let (deleted, messages) = db.cleanup_old_data().await?;
            let msg = format!("清理完成: 删除 {} 条删除记录, {} 条陌生人消息", deleted, messages);
            Ok((deleted, messages, msg))
        }
        "vacuum" => {
            // 仅压缩数据库
            db.vacuum().await?;
            let msg = "数据库压缩完成".to_string();
            Ok((0, 0, msg))
        }
        _ => {
            Err("无效的清理模式: all(全部清理), old(旧消息), stranger(陌生人), vacuum(压缩)".to_string())
        }
    }
}

/// 获取数据库统计信息
#[command]
pub async fn get_database_stats(
    state: State<'_, AppState>,
) -> Result<(u64, u64, u64, u64), String> {
    let db_guard = state.database.read().await;
    let db = db_guard.as_ref().ok_or("Database not initialized")?;

    let (total_messages, total_contacts, deleted_events, oldest_timestamp) = db.get_stats().await?;

    let days_oldest = match oldest_timestamp {
        Some(ts) => {
            let days: i64 = (chrono::Utc::now().timestamp() - ts) / (24 * 60 * 60);
            days.max(0) as u64
        }
        None => 0,
    };

    Ok((total_messages, total_contacts, deleted_events, days_oldest))
}
