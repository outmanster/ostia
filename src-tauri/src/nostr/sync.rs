use nostr_sdk::prelude::*;
use std::sync::Arc;
use tokio::sync::RwLock;
use url::Url;

use crate::storage::database::{Database, MessageRecord};

/// Manages offline message synchronization
pub struct MessageSyncManager {
    last_sync_time: Arc<RwLock<Timestamp>>,
    db: Arc<RwLock<Option<Arc<Database>>>>,
}

impl MessageSyncManager {
    pub fn new() -> Self {
        Self {
            last_sync_time: Arc::new(RwLock::new(Timestamp::from(0))),
            db: Arc::new(RwLock::new(None)),
        }
    }

    /// Set the database reference
    pub fn set_database(&self, db: Arc<Database>) {
        let db_lock = self.db.clone();
        let self_clone = Arc::new(MessageSyncManager {
            last_sync_time: self.last_sync_time.clone(),
            db: self.db.clone(),
        });
        tokio::spawn(async move {
            *db_lock.write().await = Some(db);
            let _ = self_clone.restore_sync_time().await;
        });
    }

    /// Get the last sync time
    pub async fn get_last_sync_time(&self) -> Timestamp {
        *self.last_sync_time.read().await
    }

    /// Update sync time to now
    pub async fn update_sync_time(&self) {
        *self.last_sync_time.write().await = Timestamp::now();
    }

    /// Set specific sync time
    pub async fn set_sync_time(&self, timestamp: Timestamp) {
        *self.last_sync_time.write().await = timestamp;
    }

    /// Persist sync time to database cache
    pub async fn persist_sync_time(&self) -> Result<(), String> {
        let db_guard = self.db.read().await;
        let db = db_guard.as_ref().ok_or("Database not initialized")?;

        let timestamp = self.get_last_sync_time().await.as_u64();
        db.set_cache("last_sync_time", &timestamp.to_string(), None).await?;

        log::debug!("Persisted sync time: {}", timestamp);
        Ok(())
    }

    /// Restore sync time from database cache
    pub async fn restore_sync_time(&self) -> Result<(), String> {
        let db_guard = self.db.read().await;
        let db = db_guard.as_ref().ok_or("Database not initialized")?;

        if let Some(ts_str) = db.get_cache("last_sync_time").await? {
            if let Ok(ts) = ts_str.parse::<u64>() {
                let timestamp = Timestamp::from(ts);
                *self.last_sync_time.write().await = timestamp;
                log::info!("Restored sync time: {}", ts);
            }
        }

        Ok(())
    }

    /// Sync offline messages from relays
    /// This queries for Gift Wrap events since the last sync time
    /// Enhanced with retry logic and timeout handling
    pub async fn sync_offline_messages(
        &self,
        client: &Client,
        handle: Option<&tauri::AppHandle>,
    ) -> Result<Vec<MessageRecord>, String> {
        let last_sync = self.get_last_sync_time().await;
        let since = if last_sync.as_u64() == 0 {
            let one_day_ago = Timestamp::from(Timestamp::now().as_u64() - 24 * 60 * 60);
            log::info!("No previous sync time, performing initial sync from: {}", one_day_ago.as_u64());
            one_day_ago
        } else {
            // Add 5 second buffer to avoid missing messages due to timing issues
            let buffered_since = Timestamp::from(last_sync.as_u64().saturating_sub(5));
            log::info!("Syncing messages since last sync timestamp: {} (buffered: {})", last_sync.as_u64(), buffered_since.as_u64());
            buffered_since
        };

        let signer = client.signer().await.map_err(|e| e.to_string())?;
        let pubkey = signer.get_public_key().await.map_err(|e| e.to_string())?;
        let my_npub = pubkey.to_bech32().unwrap_or_else(|_| pubkey.to_hex());
        let my_pubkey_hex = pubkey.to_hex();

        let filter = Filter::new()
            .kind(Kind::GiftWrap)
            .since(since);

        // Fetch events from relays with timeout and retry
        let events = match tokio::time::timeout(
            std::time::Duration::from_secs(15),
            client.fetch_events(vec![filter.clone()], std::time::Duration::from_secs(10))
        ).await {
            Ok(Ok(events)) => {
                log::info!("Fetched {} gift wrap events from relays", events.len());
                events
            }
            Ok(Err(e)) => {
                log::warn!("Failed to fetch events (first attempt): {}", e);
                // Retry once
                log::info!("Retrying event fetch...");
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                client.fetch_events(vec![filter.clone()], std::time::Duration::from_secs(10))
                    .await
                    .map_err(|e| format!("Failed to fetch events after retry: {}", e))?
            }
            Err(_) => {
                return Err("Sync timeout after 15 seconds".to_string());
            }
        };

        let mut new_messages = Vec::new();
        let db_guard = self.db.read().await;
        let db = db_guard.as_ref().ok_or("Database not initialized")?;

        for event in events {
            let is_for_me = event.tags.iter().any(|t| {
                let parts = t.as_slice();
                parts.get(0).map(|v| v.as_str()) == Some("p")
                    && parts.get(1).map(|v| v.as_str()) == Some(my_pubkey_hex.as_str())
            });
            if !is_for_me {
                continue;
            }

            match client.unwrap_gift_wrap(&event).await {
                Ok(unwrapped) => {
                    let msg_id = event.id.to_hex();

                    // Check for duplicates
                    if db.message_exists(&msg_id).await? {
                        log::debug!("Sync (v12.4): Skipping existing message: {}", msg_id);
                        continue;
                    }
                    if db.deleted_event_exists(&msg_id).await? {
                        log::debug!("Sync (v12.4): Skipping deleted message: {}", msg_id);
                        continue;
                    }

                    let sender_pubkey = unwrapped.rumor.pubkey.to_bech32().unwrap_or_else(|_| unwrapped.rumor.pubkey.to_hex());

                    // Whitelist check v9: Use real sender (Rumor) not ephemeral sealer
                    if sender_pubkey != my_npub && db.get_contact(&sender_pubkey).await?.is_none() {
                        log::info!("Whitelist (v9): Dropping sync message from unknown sender {}", sender_pubkey);
                        continue;
                    }
                    log::info!("Whitelist (v9): Allowed sync message from contact {}", sender_pubkey);

                    let sender_pubkey = unwrapped.rumor.pubkey.to_bech32().unwrap_or_else(|_| unwrapped.rumor.pubkey.to_hex());
                    let content = unwrapped.rumor.content.trim();
                    let timestamp = unwrapped.rumor.created_at.as_u64() as i64;

                    // Content validation
                    if content.is_empty() {
                        log::debug!("Sync (v10): DROPPED - Empty content. sender={}, event_id={}", sender_pubkey, msg_id);
                        continue;
                    }
                    if content.len() > 65536 {
                        log::warn!("Sync (v10): DROPPED - Content too large ({} bytes). sender={}, event_id={}", content.len(), sender_pubkey, msg_id);
                        continue;
                    }

                    if content.starts_with("{") {
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(content) {
                            let version = val.get("v").and_then(|v| v.as_i64()).unwrap_or(1);
                            if version == 1 {
                                if let Some(t) = val.get("type").and_then(|v| v.as_str()) {
                                    if t == "typing" {
                                        log::info!("Sync (v11): Skipping typing control message during sync from {}", sender_pubkey);
                                        continue;
                                    } else if t == "read_receipt" {
                                        if let Some(id) = val.get("messageId").and_then(|v| v.as_str()) {
                                            let _ = db.update_message_status(id, "read").await;
                                        } else if let Some(ids) = val.get("messageIds").and_then(|v| v.as_array()) {
                                            for idv in ids {
                                                if let Some(id) = idv.as_str() {
                                                    let _ = db.update_message_status(id, "read").await;
                                                }
                                            }
                                        }
                                        log::info!("Sync (v11): Processed read_receipt control message during sync from {}", sender_pubkey);
                                        continue;
                                    } else if t == "presence" {
                                        log::info!("Sync (v11): Skipping presence control message during sync from {}", sender_pubkey);
                                        continue;
                                    }
                                }
                            }
                        }
                    }

                    // v13: Detect image messages and extract media_url with detailed logging
                    // Format: "📷 Image: URL#key=xxx&nonce=xxx"
                    let (message_type, media_url) = if content.starts_with("📷 Image: ") {
                        let url_part = content.trim_start_matches("📷 Image: ");
                        log::info!("Sync (v13) - Image message detected");
                        log::info!("Sync (v13) - Original content: '{}'", content);
                        log::info!("Sync (v13) - Extracted url_part: '{}'", url_part);
                        log::info!("Sync (v13) - url_part length: {}", url_part.len());
                        log::info!("Sync (v13) - url_part contains '#': {}", url_part.contains('#'));
                        if url_part.contains('#') {
                            let parts: Vec<&str> = url_part.split('#').collect();
                            log::info!("Sync (v13) - split parts: {:?}", parts);
                            if parts.len() > 1 {
                                log::info!("Sync (v13) - fragment part: '{}'", parts[1]);
                            }
                        }
                        ("image".to_string(), Some(url_part.to_string()))
                    } else {
                        // Fallback: Check if content is a raw image URL
                        if let Ok(url) = Url::parse(content) {
                            let path = url.path().to_lowercase();
                            if path.ends_with(".png") || path.ends_with(".jpg") || path.ends_with(".jpeg") || path.ends_with(".gif") || path.ends_with(".webp") {
                                    log::info!("Sync (v13): detected raw image URL: {}", content);
                                    ("image".to_string(), Some(content.to_string()))
                            } else {
                                ("text".to_string(), None)
                            }
                        } else {
                            ("text".to_string(), None)
                        }
                    };

                    let record = MessageRecord {
                        id: msg_id,
                        sender: sender_pubkey.clone(),
                        receiver: my_npub.clone(),
                        content: content.to_string(),
                        timestamp,
                        status: "received".to_string(),
                        message_type: message_type.clone(),
                        media_url: media_url.clone(),
                    };

                    log::info!("Sync (v13) - Saving message record - type: {}, media_url: {:?}", message_type, media_url);
                    if let Some(ref url) = media_url {
                        log::info!("Sync (v13) - media_url FULL: '{}'", url);
                    }

                    // Save to database
                    match db.save_message(&record).await {
                        Ok(is_new) => {
                            if is_new {
                                log::info!("Synced new message from {}", sender_pubkey);
                                // Emit event to frontend for real-time update
                                if let Some(h) = handle {
                                    use tauri::Emitter;
                                    // Use a json object to include metadata
                                    let payload = serde_json::json!({
                                        "message": record,
                                        "metadata": {
                                            "is_sync": true
                                        }
                                    });
                                    if let Err(e) = h.emit("new-message", &payload) {
                                        log::error!("Failed to emit new-message event during sync: {}", e);
                                    }
                                }
                                new_messages.push(record);
                            } else {
                                log::debug!("Duplicate message during sync, skipping: {}", record.id);
                            }
                        }
                        Err(e) => {
                            log::error!("Failed to save synced message: {}", e);
                            continue;
                        }
                    }
                }
                Err(e) => {
                    log::debug!("Unwrap (v7): skipping non-gift-wrap or failed decryption: {}", e);
                }
            }
        }

        // Update sync time after successful sync
        if !new_messages.is_empty() {
            self.update_sync_time().await;
            self.persist_sync_time().await?;
        }

        log::info!("Successfully synced {} new messages", new_messages.len());
        Ok(new_messages)
    }
}

impl Default for MessageSyncManager {
    fn default() -> Self {
        Self::new()
    }
}
