use nostr_sdk::prelude::*;
use url::Url;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{Duration, Instant};
use std::collections::HashMap;
use std::path::PathBuf;
use std::fs::OpenOptions;
use std::io::Write;
use tokio::sync::RwLock;
use tauri::Window;

use crate::nostr::relay::RelayManager;
use crate::nostr::sync::MessageSyncManager;
use crate::nostr::media::MediaUploader;
use crate::nostr::nip65::{Nip65Manager, RelayHealthResult, RelayListEntry, is_public_relay_url};
use crate::nostr::encryption::{Nip44Encryption, EncryptedMessage};
use crate::nostr::auth::HttpAuthManager;
use crate::storage::database::{Database, MessageRecord};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileData {
    pub name: Option<String>,
    pub display_name: Option<String>,
    pub about: Option<String>,
    pub picture: Option<String>,
    pub banner: Option<String>,
    pub nip05: Option<String>,
    pub website: Option<String>,
}

struct RateLimiter {
    // sender_npub -> Vec of timestamps for last messages
    messages: Arc<RwLock<HashMap<String, Vec<Instant>>>>,
}

impl RateLimiter {
    fn new() -> Self {
        Self {
            messages: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    async fn check_and_update(&self, sender: &str) -> bool {
        let now = Instant::now();
        let mut map = self.messages.write().await;
        let timestamps = map.entry(sender.to_string()).or_insert_with(|| Vec::new());

        // Keep only timestamps from the last 10 seconds
        timestamps.retain(|&t| now.duration_since(t) < Duration::from_secs(10));

        // If more than 20 messages in 10 seconds, rate limit (increased from 5 to 20)
        if timestamps.len() >= 20 {
            return false;
        }

        timestamps.push(now);
        true
    }
}

pub struct NostrService {
    client: Arc<RwLock<Option<Client>>>,
    keys: Arc<RwLock<Option<Keys>>>,
    relay_manager: Arc<RwLock<RelayManager>>,
    db: Arc<RwLock<Option<Arc<Database>>>>,
    sync_manager: Arc<MessageSyncManager>,
    rate_limiter: Arc<RateLimiter>,
    media_uploader: Arc<RwLock<MediaUploader>>,
    nip65_manager: Arc<RwLock<Nip65Manager>>,
    encryption_manager: Arc<Nip44Encryption>,
    auth_manager: Arc<HttpAuthManager>,
    listener_started: Arc<RwLock<bool>>,  // 防止重复启动监听器
    debug_log_path: Arc<RwLock<Option<PathBuf>>>,
}

async fn write_debug_log_inner(path_arc: &Arc<RwLock<Option<PathBuf>>>, message: &str) -> Result<(), ()> {
    let path_opt = {
        let guard = path_arc.read().await;
        guard.clone()
    };

    let path = match path_opt {
        Some(p) => p,
        None => return Err(()),
    };

    let mut file = match OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        Ok(f) => f,
        Err(_) => return Err(()),
    };

    if let Err(_) = writeln!(file, "{}", message) {
        return Err(());
    }

    Ok(())
}

impl NostrService {
    pub fn new() -> Self {
        Self {
            client: Arc::new(RwLock::new(None)),
            keys: Arc::new(RwLock::new(None)),
            relay_manager: Arc::new(RwLock::new(RelayManager::new())),
            db: Arc::new(RwLock::new(None)),
            sync_manager: Arc::new(MessageSyncManager::new()),
            rate_limiter: Arc::new(RateLimiter::new()),
            media_uploader: Arc::new(RwLock::new(MediaUploader::new())),
            nip65_manager: Arc::new(RwLock::new(Nip65Manager::new())),
            encryption_manager: Arc::new(Nip44Encryption::new()),
            auth_manager: Arc::new(HttpAuthManager::new()),
            listener_started: Arc::new(RwLock::new(false)),
            debug_log_path: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn set_debug_log_path(&self, path: PathBuf) {
        {
            let mut guard = self.debug_log_path.write().await;
            *guard = Some(path);
        }
        let _ = write_debug_log_inner(&self.debug_log_path, "==== Nostr debug log started ====").await;
    }

    async fn write_debug_log(&self, message: &str) {
        let _ = write_debug_log_inner(&self.debug_log_path, message).await;
    }

    pub async fn set_database(&self, db: Arc<Database>) {
        *self.db.write().await = Some(db.clone());
        // Also set database in sync manager and encryption manager
        self.sync_manager.set_database(db.clone());
        self.encryption_manager.set_database(db).await;

        // Load persisted relay configuration
        if let Err(e) = self.load_relay_config().await {
            log::error!("Failed to load relay config: {}", e);
        }
    }

    pub async fn initialize(&self, secret_key: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // Idempotency check (v12.4): Don't re-initialize if the key is the same
        {
            let keys_guard = self.keys.read().await;
            if let Some(existing_keys) = keys_guard.as_ref() {
                if let Ok(existing_nsec) = existing_keys.secret_key().to_bech32() {
                    if existing_nsec == secret_key {
                        log::debug!("Initialize (v12.4): Already initialized with same key, skipping.");
                        return Ok(());
                    }
                }
            }
        }

        log::info!("Initialize (v12.4): Starting full service initialization...");
        let keys = match Keys::parse(secret_key) {
            Ok(k) => k,
            Err(e) => {
                log::error!("Initialize (v12.1): Failed to parse keys: {}", e);
                return Err(e.into());
            }
        };

        // Create client
        let client = Client::new(keys.clone());

        // Add default relays
        let relay_manager = self.relay_manager.read().await;
        let active_relays = relay_manager.get_active_relays();
        log::info!("Initialize (v12.1): Found {} active relays in manager", active_relays.len());
        
        for relay in active_relays {
            let transport_url = relay.clone();
            log::info!("Initialize (v12.1): Adding relay: {} (original: {})", transport_url, relay);
            match client.add_relay(transport_url.clone()).await {
                Ok(_) => log::info!("Initialize (v12.1): Added relay: {}", transport_url),
                Err(e) => log::error!("Initialize (v12.1): FAILED to add relay {}: {}", transport_url, e),
            }
        }

        // Connect with timeout and health check
        log::info!("Initialize (v12.1): Attempting to connect to relays...");

        // Use timeout to prevent hanging
        let connect_result = tokio::time::timeout(
            Duration::from_secs(15),
            client.connect()
        ).await;

        match connect_result {
            Ok(_) => {
                log::info!("Initialize (v12.1): Connect call finished.");

                // Verify connection health
                let healthy = self.verify_relay_connections(&client).await;
                if healthy {
                    log::info!("Initialize (v12.1): All relays connected and healthy");
                } else {
                    log::warn!("Initialize (v12.1): Some relays failed health check, starting background recovery");
                    // Start background health monitor
                    self.start_relay_health_monitor(client.clone());
                }
            }
            Err(_) => {
                log::error!("Initialize (v12.1): Connection timeout after 15 seconds");
                // Continue anyway - some relays might have connected
                // The health monitor will handle recovery
                self.start_relay_health_monitor(client.clone());
            }
        }

        *self.keys.write().await = Some(keys);
        *self.client.write().await = Some(client.clone());

        // Set client in nip65 manager
        let mut nip65_guard = self.nip65_manager.write().await;
        nip65_guard.set_client(client);

        log::info!("Initialize (v12.1): Service initialized successfully.");
        Ok(())
    }

    pub async fn is_initialized(&self) -> bool {
        self.client.read().await.is_some()
    }

    /// Get the public key (npub) of the current user
    /// Returns None if the service is not initialized
    pub fn get_public_key(&self) -> Option<String> {
        // Use try_read to avoid blocking
        if let Ok(keys_guard) = self.keys.try_read() {
            if let Some(keys) = keys_guard.as_ref() {
                return keys.public_key().to_bech32().ok();
            }
        }
        None
    }

    /// Async version of get_public_key
    pub async fn get_public_key_async(&self) -> Option<String> {
        let keys_guard = self.keys.read().await;
        if let Some(keys) = keys_guard.as_ref() {
            return keys.public_key().to_bech32().ok();
        }
        None
    }

    pub async fn send_private_message(
        &self,
        receiver_pubkey: &str,
        content: &str,
    ) -> Result<EventId, Box<dyn std::error::Error + Send + Sync>> {
        self.write_debug_log(&format!("send_private_message: to={} content_len={}", receiver_pubkey, content.len())).await;

        let client_guard = self.client.read().await;
        let client = client_guard.as_ref().ok_or("Client not initialized")?;

        let event = self.create_private_message_with_encryption(content, receiver_pubkey).await?;
        let event_id = event.id;
        let event_id_hex = event_id.to_hex();

        // NIP-65 Relay Discovery: Try to find where the recipient is listening
        log::info!("Relay Discovery (v5): Discovering relays for recipient: {}", receiver_pubkey);
        let nip65_guard = self.nip65_manager.read().await;
        let mut target_relays: Vec<String> = Vec::new();
        // Increase timeout to 10s for better reliability
        if let Ok(relays) = nip65_guard.query_user_relays(receiver_pubkey, Some(Duration::from_secs(10))).await {
            // v6: Use ALL relays (read & write) to maximize reachability
            // Even if a relay is marked as 'write' only, the user might still be reachable there for DMs
            target_relays = relays.into_iter()
                .map(|r| r.url)
                .collect();

            if !target_relays.is_empty() {
                log::info!("Relay Discovery (v6): Found {} recipient relays: {:?}", target_relays.len(), target_relays);
                for url in &target_relays {
                    let _ = client.add_relay(url.clone()).await;
                }
                // Connect to the new relays with timeout
                let connect_result = tokio::time::timeout(
                    Duration::from_secs(15),
                    client.connect()
                ).await;

                if connect_result.is_err() {
                    log::warn!("Relay Discovery (v7): Connection timeout, checking individual statuses");
                }
                
                // Verify connection to target relays
                let mut connected_count = 0;
                for url in &target_relays {
                    if let Ok(relay) = client.relay(url).await {
                        if relay.is_connected() {
                            connected_count += 1;
                        } else {
                            // Try one forced connection attempt for this specific relay
                            log::info!("Relay Discovery (v7): Force connecting to {}", url);
                            let _ = relay.connect(Some(Duration::from_secs(5))).await;
                            if relay.is_connected() {
                                connected_count += 1;
                            }
                        }
                    }
                }
                log::info!("Relay Discovery (v7): Connected to {}/{} target relays", connected_count, target_relays.len());
                
            } else {
                log::warn!("Relay Discovery (v7): No relays found for recipient (empty list)");
            }
        } else {
            log::warn!("Relay Discovery (v7): Failed to query recipient relays (timeout or error)");
        }

        log::info!("Messaging (v10): Sending NIP-17 message to {}", receiver_pubkey);

        // Verify at least one relay is connected before sending
        let relays = client.relays().await;
        if relays.is_empty() {
            log::error!("Messaging (v10): No relays connected, attempting emergency reconnect...");
            // Try to reconnect with backoff
            if let Err(e) = self.reconnect_with_backoff().await {
                log::error!("Messaging (v10): Emergency reconnect failed: {}", e);
                return Err("No relay connections available".into());
            }
        }

        let send_event = || async {
            if !target_relays.is_empty() {
                let mut success_count = 0;
                for url in &target_relays {
                    match client.send_event_to([url], event.clone()).await {
                        Ok(_) => {
                            success_count += 1;
                        }
                        Err(e) => {
                            log::warn!("Messaging (v11): Failed to publish to {}: {}", url, e);
                        }
                    }
                }
                if success_count > 0 {
                    Ok(())
                } else {
                    match client.send_event(event.clone()).await {
                        Ok(_) => Ok(()),
                        Err(e) => Err::<(), Box<dyn std::error::Error + Send + Sync>>(e.into()),
                    }
                }
            } else {
                client.send_event(event.clone()).await?;
                Ok(())
            }
        };

        let send_result = tokio::time::timeout(
            Duration::from_secs(20),
            send_event()
        ).await;

        match send_result {
            Ok(Ok(())) => {
                log::info!("Messaging (v10): Message sent successfully, event_id: {}", event_id_hex);
                self.write_debug_log(&format!("send_private_message: success event_id={}", event_id_hex)).await;
                let verify_relays = client.relays().await;
                if verify_relays.len() == 1 {
                    let verify_client = client.clone();
                    let verify_event = event.clone();
                    let verify_event_id = event_id;
                    let verify_event_id_hex = event_id_hex.clone();
                    let verify_target_relays = target_relays.clone();
                    tauri::async_runtime::spawn(async move {
                        let verify_filter = Filter::new().id(verify_event_id).limit(1);
                        let mut confirmed = false;
                        for attempt in 0..2 {
                            match verify_client.fetch_events(vec![verify_filter.clone()], Duration::from_secs(5)).await {
                                Ok(events) => {
                                    if events.iter().any(|ev| ev.id == verify_event_id) {
                                        confirmed = true;
                                        break;
                                    }
                                }
                                Err(e) => {
                                    log::warn!("Messaging (v10): Verify fetch failed: {}", e);
                                }
                            }
                            if attempt == 0 {
                                tokio::time::sleep(Duration::from_millis(600)).await;
                            }
                        }
                        if !confirmed {
                            log::warn!("Messaging (v10): Relay did not confirm event {}, retrying send", verify_event_id_hex);
                            let mut success_count = 0;
                            if !verify_target_relays.is_empty() {
                                for url in &verify_target_relays {
                                    match verify_client.send_event_to([url], verify_event.clone()).await {
                                        Ok(_) => {
                                            success_count += 1;
                                        }
                                        Err(e) => {
                                            log::warn!("Messaging (v10): Retry publish to {} failed: {}", url, e);
                                        }
                                    }
                                }
                            }
                            if success_count == 0 {
                                if let Err(e) = verify_client.send_event(verify_event.clone()).await {
                                    log::warn!("Messaging (v10): Retry broadcast failed: {}", e);
                                }
                            }
                        }
                    });
                }
                Ok(event_id)
            }
            Ok(Err(e)) => {
                log::error!("Messaging (v10): Failed to send message: {}", e);
                log::info!("Messaging (v10): Retrying with reconnection...");
                self.reconnect_with_backoff().await?;
                let retry_result = tokio::time::timeout(
                    Duration::from_secs(20),
                    send_event()
                ).await?;
                if retry_result.is_ok() {
                    self.write_debug_log(&format!("send_private_message: retry success event_id={}", event_id_hex)).await;
                    Ok(event_id)
                } else {
                    Err(retry_result.err().unwrap())
                }
            }
            Err(_) => {
                log::error!("Messaging (v10): Message send timeout after 20 seconds");
                self.write_debug_log("send_private_message: timeout after 20 seconds").await;
                // Even if timeout, the message *might* have been accepted by some relays.
                // But we can't be sure. We return error so UI allows retry.
                Err("Message send timeout".into())
            }
        }
    }


    pub async fn fetch_profile(
        &self,
        npub: &str,
    ) -> Result<Option<ProfileData>, Box<dyn std::error::Error + Send + Sync>> {
        let client_guard = self.client.read().await;
        let client = match client_guard.as_ref() {
            Some(c) => c,
            None => return Ok(None), // Client not initialized, return None
        };

        let pubkey = PublicKey::parse(npub)?;

        // Create filter for Kind 0 (Metadata) events
        let filter = Filter::new()
            .kind(Kind::Metadata)
            .author(pubkey)
            .limit(1);

        let events = client.fetch_events(vec![filter], Duration::from_secs(5)).await?;

        if let Some(event) = events.into_iter().next() {
            // Parse the metadata JSON from content
            if let Ok(metadata) = serde_json::from_str::<serde_json::Value>(&event.content) {
                return Ok(Some(ProfileData {
                    name: metadata.get("name").and_then(|v| v.as_str()).map(String::from),
                    display_name: metadata.get("display_name").and_then(|v| v.as_str()).map(String::from),
                    about: metadata.get("about").and_then(|v| v.as_str()).map(String::from),
                    picture: metadata.get("picture").and_then(|v| v.as_str()).map(String::from),
                    banner: metadata.get("banner").and_then(|v| v.as_str()).map(String::from),
                    nip05: metadata.get("nip05").and_then(|v| v.as_str()).map(String::from),
                    website: metadata.get("website").and_then(|v| v.as_str()).map(String::from),
                }));
            }
        }

        Ok(None)
    }

    pub async fn subscribe_contact_metadata(
        &self,
        npub: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let client_guard = self.client.read().await;
        let client = match client_guard.as_ref() {
            Some(c) => c,
            None => return Ok(()),
        };

        let pubkey = PublicKey::parse(npub)?;
        let filter = Filter::new()
            .kind(Kind::Metadata)
            .author(pubkey)
            .limit(1);

        let _ = client.subscribe(vec![filter], None).await;
        Ok(())
    }

    /// Publish metadata (Kind 0)
    pub async fn set_metadata(
        &self,
        profile: ProfileData,
    ) -> Result<EventId, Box<dyn std::error::Error + Send + Sync>> {
        let client_guard = self.client.read().await;
        let client = client_guard.as_ref().ok_or("Client not initialized")?;

        let mut metadata = Metadata::new()
            .name(profile.name.unwrap_or_default())
            .display_name(profile.display_name.unwrap_or_default())
            .about(profile.about.unwrap_or_default())
            .nip05(profile.nip05.unwrap_or_default());

        if let Some(picture_url) = profile.picture {
            if let Ok(url) = Url::parse(&picture_url) {
                metadata = metadata.picture(url);
            }
        }

        let event_id = client.set_metadata(&metadata).await?;
        Ok(*event_id)
    }

    pub fn generate_keys() -> Result<(String, String), Box<dyn std::error::Error + Send + Sync>> {
        let keys = Keys::generate();
        let nsec = keys.secret_key().to_bech32()?;
        let npub = keys.public_key().to_bech32()?;
        Ok((nsec, npub))
    }

    /// Start listening for incoming NIP-17 private messages
    /// This runs in the background and emits events to the frontend
    pub async fn start_message_listener(&self, window: Window) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // 检查是否已经启动
        {
            let mut started = self.listener_started.write().await;
            if *started {
                log::info!("Message listener already started, skipping");
                return Ok(());
            }
            *started = true;
        }

        log::info!("Starting message listener for NIP-17 Gift Wrap messages...");

        let client_guard = self.client.read().await;
        let client = client_guard.as_ref().ok_or("Client not initialized")?.clone();
        drop(client_guard);

        let db_arc = self.db.clone();
        let rate_limiter = self.rate_limiter.clone();
        let debug_log_path = self.debug_log_path.clone();
        let encryption_manager = self.encryption_manager.clone();
        let keys_arc = self.keys.clone();

        // 获取当前用户的公钥
        let signer = client.signer().await?;
        let my_pubkey = signer.get_public_key().await?;
        let my_npub = my_pubkey.to_bech32().unwrap_or_else(|_| my_pubkey.to_hex());
        let my_pubkey_hex = my_pubkey.to_hex();

        log::info!("Subscribing to Gift Wrap events for pubkey: {}", my_npub);
        self.subscribe_message_listener(&client).await;
        self.start_relay_health_monitor(client.clone());

        let resubscribe_client = client.clone();
        tauri::async_runtime::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(60));
            loop {
                interval.tick().await;
                let filter = Filter::new().kind(Kind::GiftWrap);
                let _ = resubscribe_client.subscribe(vec![filter], None).await;
            }
        });

        // 启动后台任务监听通知
        tauri::async_runtime::spawn(async move {
            log::info!("Message listener background task started");

            let mut notifications = client.notifications();

            while let Ok(notification) = notifications.recv().await {
                match notification {
                    RelayPoolNotification::Event { event, .. } => {
                        if event.kind == Kind::Metadata {
                            let author_npub = event.pubkey.to_bech32()
                                .unwrap_or_else(|_| event.pubkey.to_hex());
                            if let Ok(metadata) = serde_json::from_str::<serde_json::Value>(&event.content) {
                                let name = metadata.get("name").and_then(|v| v.as_str());
                                let display_name = metadata.get("display_name").and_then(|v| v.as_str());
                                let picture = metadata.get("picture").and_then(|v| v.as_str());
                                if let Some(db) = db_arc.read().await.as_ref() {
                                    let _ = db.update_contact_profile(
                                        &author_npub,
                                        name,
                                        display_name,
                                        picture,
                                    ).await;
                                }
                                use tauri::Emitter;
                                let payload = serde_json::json!({ "npub": author_npub });
                                let _ = window.emit("contacts-updated", &payload);
                            }
                            continue;
                        }
                        if event.kind != Kind::GiftWrap {
                            continue;
                        }

                        let event_id = event.id.to_hex();
                        let _ = write_debug_log_inner(&debug_log_path, &format!("listener: received gift_wrap event_id={}", event_id)).await;

                        log::debug!("Listener: Received Gift Wrap event: {}", event_id);

                        let is_for_me = event.tags.iter().any(|t| {
                            let parts = t.as_slice();
                            parts.get(0).map(|v| v.as_str()) == Some("p")
                                && parts.get(1).map(|v| v.as_str()) == Some(my_pubkey_hex.as_str())
                        });
                        if !is_for_me {
                            continue;
                        }

                        // 解密消息
                        let keys_guard = keys_arc.read().await;
                        let keys = match keys_guard.as_ref() {
                            Some(k) => k,
                            None => {
                                log::error!("Listener: Keys not initialized");
                                continue;
                            }
                        };
                        match encryption_manager.unwrap_private_message(&event, keys).await {
                            Ok(unwrapped) => {
                                let sender_pubkey = unwrapped.pubkey.to_bech32()
                                    .unwrap_or_else(|_| unwrapped.pubkey.to_hex());
                                let content = unwrapped.content.trim();
                                let timestamp = unwrapped.created_at.as_u64() as i64;

                                let _ = write_debug_log_inner(&debug_log_path, &format!("listener: unwrapped from={} content_len={}", sender_pubkey, content.len())).await;

                                // 检查数据库
                                let db_guard = db_arc.read().await;
                                let db = match db_guard.as_ref() {
                                    Some(d) => d,
                                    None => {
                                        log::error!("Listener: Database not initialized");
                                        continue;
                                    }
                                };

                                // 检查是否已存在或已删除
                                if let Ok(true) = db.message_exists(&event_id).await {
                                    log::debug!("Listener: Message already exists, skipping: {}", event_id);
                                    continue;
                                }
                                if let Ok(true) = db.deleted_event_exists(&event_id).await {
                                    log::debug!("Listener: Message was deleted, skipping: {}", event_id);
                                    continue;
                                }

                                // 白名单检查: 只接受来自联系人的消息
                                if sender_pubkey != my_npub {
                                    if let Ok(None) = db.get_contact(&sender_pubkey).await {
                                        log::warn!("Whitelist: Dropping message from unknown sender: {}", sender_pubkey);
                                        let _ = write_debug_log_inner(&debug_log_path, &format!("listener: DROPPED - not in contacts sender={}", sender_pubkey)).await;
                                        continue;
                                    }
                                }

                                // 内容验证
                                if content.is_empty() {
                                    log::debug!("Listener: Empty content, skipping");
                                    continue;
                                }
                                if content.len() > 65536 {
                                    log::warn!("Listener: Content too large ({} bytes), skipping", content.len());
                                    continue;
                                }

                                // 处理控制消息 (typing, read_receipt, presence)
                                if content.starts_with("{") {
                                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(content) {
                                        if val.get("v").and_then(|v| v.as_i64()).unwrap_or(1) == 1 {
                                            if let Some(msg_type) = val.get("type").and_then(|v| v.as_str()) {
                                                match msg_type {
                                                    "typing" => {
                                                        // 发送 typing 事件到前端
                                                        if let Some(typing) = val.get("typing").and_then(|v| v.as_bool()) {
                                                            use tauri::Emitter;
                                                            let payload = serde_json::json!({
                                                                "from": sender_pubkey,
                                                                "typing": typing
                                                            });
                                                            let _ = window.emit("typing", &payload);
                                                            log::debug!("Listener: Emitted typing event from {}", sender_pubkey);
                                                        }
                                                        continue;
                                                    }
                                                    "read_receipt" => {
                                                        // 处理已读回执
                                                        if let Some(ids) = val.get("messageIds").and_then(|v| v.as_array()) {
                                                            for id_val in ids {
                                                                if let Some(id) = id_val.as_str() {
                                                                    let _ = db.update_message_status(id, "read").await;
                                                                    use tauri::Emitter;
                                                                    let payload = serde_json::json!({
                                                                        "messageId": id,
                                                                        "from": sender_pubkey
                                                                    });
                                                                    let _ = window.emit("read-receipt", &payload);
                                                                }
                                                            }
                                                        }
                                                        log::debug!("Listener: Processed read receipt from {}", sender_pubkey);
                                                        continue;
                                                    }
                                                    "presence" => {
                                                        // 发送 presence 事件到前端
                                                        if let Some(online) = val.get("online").and_then(|v| v.as_bool()) {
                                                            use tauri::Emitter;
                                                            let last_seen = val.get("lastSeen").and_then(|v| v.as_i64()).unwrap_or(0);
                                                            let payload = serde_json::json!({
                                                                "from": sender_pubkey,
                                                                "online": online,
                                                                "lastSeen": last_seen
                                                            });
                                                            let _ = window.emit("presence", &payload);
                                                            log::debug!("Listener: Emitted presence event from {}", sender_pubkey);
                                                        }
                                                        continue;
                                                    }
                                                    _ => {
                                                        // 未知控制消息类型,当作普通消息处理
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }

                                // 速率限制检查
                                if !rate_limiter.check_and_update(&sender_pubkey).await {
                                    log::warn!("Rate limit exceeded for sender: {}", sender_pubkey);
                                    let _ = write_debug_log_inner(&debug_log_path, &format!("listener: RATE_LIMITED sender={}", sender_pubkey)).await;
                                    continue;
                                }

                                // 检测图片消息
                                let (message_type, media_url) = if content.starts_with("📷 Image: ") {
                                    let url_part = content.trim_start_matches("📷 Image: ");
                                    log::info!("Listener: Image message detected from {}", sender_pubkey);
                                    ("image".to_string(), Some(url_part.to_string()))
                                } else {
                                    // 检测原始图片 URL
                                    if let Ok(url) = Url::parse(content) {
                                        let path = url.path().to_lowercase();
                                        if path.ends_with(".png") || path.ends_with(".jpg") ||
                                           path.ends_with(".jpeg") || path.ends_with(".gif") ||
                                           path.ends_with(".webp") {
                                            log::info!("Listener: Raw image URL detected from {}", sender_pubkey);
                                            ("image".to_string(), Some(content.to_string()))
                                        } else {
                                            ("text".to_string(), None)
                                        }
                                    } else {
                                        ("text".to_string(), None)
                                    }
                                };

                                // 创建消息记录
                                let message_record = MessageRecord {
                                    id: event_id.clone(),
                                    sender: sender_pubkey.clone(),
                                    receiver: my_npub.clone(),
                                    content: content.to_string(),
                                    timestamp,
                                    status: "received".to_string(),
                                    message_type: message_type.clone(),
                                    media_url: media_url.clone(),
                                };

                                // 保存到数据库
                                match db.save_message(&message_record).await {
                                    Ok(is_new) => {
                                        if is_new {
                                            log::info!("Listener: New message saved from {}, type: {}", sender_pubkey, message_type);
                                            let _ = write_debug_log_inner(&debug_log_path, &format!("listener: SAVED event_id={} from={} type={}", event_id, sender_pubkey, message_type)).await;

                                            // 发送到前端
                                            use tauri::Emitter;
                                            let payload = serde_json::json!({
                                                "message": message_record,
                                                "metadata": {
                                                    "is_sync": false
                                                }
                                            });

                                            if let Err(e) = window.emit("new-message", &payload) {
                                                log::error!("Listener: Failed to emit new-message event: {}", e);
                                            } else {
                                                log::info!("Listener: Emitted new-message event to frontend");
                                                let _ = write_debug_log_inner(&debug_log_path, &format!("listener: EMITTED to frontend event_id={}", event_id)).await;
                                            }
                                        } else {
                                            log::debug!("Listener: Duplicate message, skipping emit");
                                        }
                                    }
                                    Err(e) => {
                                        log::error!("Listener: Failed to save message: {}", e);
                                        let _ = write_debug_log_inner(&debug_log_path, &format!("listener: SAVE_FAILED event_id={} error={}", event_id, e)).await;
                                    }
                                }
                            }
                            Err(e) => {
                                log::debug!("Listener: Failed to unwrap gift wrap (might not be for us): {}", e);
                                let _ = write_debug_log_inner(&debug_log_path, &format!("listener: UNWRAP_FAILED event_id={} error={}", event_id, e)).await;
                            }
                        }
                    }
                    RelayPoolNotification::Message { message, .. } => {
                        log::trace!("Listener: Received relay message: {:?}", message);
                    }

                    _ => {
                        // Other notification types
                    }
                }
            }

            log::warn!("Message listener background task ended");
        });

        log::info!("Message listener started successfully");
        Ok(())
    }

    /// Sync offline messages from relays
    /// Returns the number of new messages synced
    pub async fn sync_offline_messages(
        &self,
        handle: Option<&tauri::AppHandle>,
    ) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
        let client_guard = self.client.read().await;
        let client = client_guard.as_ref().ok_or("Client not initialized")?;
        let messages = self.sync_manager.sync_offline_messages(client, handle).await?;
        Ok(messages.len())
    }

    /// Restore sync time from database on startup
    pub async fn restore_sync_time(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.sync_manager.restore_sync_time().await?;
        Ok(())
    }

    /// Save current relay configuration to database
    pub async fn save_relay_config(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let db_guard = self.db.read().await;
        if let Some(ref db) = *db_guard {
            let relay_guard = self.relay_manager.read().await;

            // Save custom relays as JSON array
            // v14.0: 10.0.2.2 is now ALLOWED for emulator testing
            let custom_relays = relay_guard.get_custom_relays();
            let filtered_relays: Vec<String> = custom_relays
                .into_iter()
                .filter(|url| is_public_relay_url(url))
                .collect();
            let relays_json = serde_json::to_string(&filtered_relays)?;
            db.set_cache("relay_custom_list", &relays_json, None).await?;

            // Save mode
            let mode = match relay_guard.get_mode() {
                crate::nostr::relay::RelayMode::Hybrid => "hybrid",
                crate::nostr::relay::RelayMode::Exclusive => "exclusive",
            };
            db.set_cache("relay_mode", mode, None).await?;

            // Save Media Server
            // v14.0: 10.0.2.2 is now ALLOWED for emulator testing
            let media_uploader = self.media_uploader.read().await;
            let media_url = media_uploader.get_blossom_server().unwrap_or_default();
            let filtered_media_url = if is_public_relay_url(&media_url) {
                media_url
            } else {
                String::new()
            };
            db.set_cache("relay_media_server", &filtered_media_url, None).await?;

            // Save Media Server Token
            let media_token = media_uploader.get_blossom_token().unwrap_or_default();
            db.set_cache("relay_media_server_token", &media_token, None).await?;

            log::info!("Saved relay configuration: mode={}, custom_count={}, media_server={}, media_token_set={}", mode, filtered_relays.len(), filtered_media_url, !media_token.is_empty());
        }
        Ok(())
    }



    /// Load relay configuration from database
    pub async fn load_relay_config(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let db_guard = self.db.read().await;
        if let Some(ref db) = *db_guard {
            // Load custom relays - filter out 10.0.2.2 addresses
            if let Some(relays_json) = db.get_cache("relay_custom_list").await? {
                if let Ok(custom_relays) = serde_json::from_str::<Vec<String>>(&relays_json) {
                    let mut relay_guard = self.relay_manager.write().await;
                    for url in custom_relays {
                        // Filter out 10.0.2.2 addresses during load
                        if is_public_relay_url(&url) {
                            relay_guard.add_relay(url);
                        } else {
                            log::warn!("Startup: Skipping private relay address from database: {}", url);
                        }
                    }
                }
            }

            // Load mode
            if let Some(mode_str) = db.get_cache("relay_mode").await? {
                let mut relay_guard = self.relay_manager.write().await;
                let mode = match mode_str.as_str() {
                    "hybrid" => crate::nostr::relay::RelayMode::Hybrid,
                    "exclusive" => crate::nostr::relay::RelayMode::Exclusive,
                    _ => crate::nostr::relay::RelayMode::Hybrid,
                };
                relay_guard.set_mode(mode);
            }

            // Load Media Server
            if let Some(media_url) = db.get_cache("relay_media_server").await? {
                if !media_url.is_empty() {
                    // Filter out invalid addresses (10.0.2.2 is now ALLOWED)
                    if !is_public_relay_url(&media_url) {
                        log::warn!("Startup: Clearing private media server address: {}", media_url);
                        let _ = db.delete_cache("relay_media_server").await;
                    } else {
                        // JUNK DATA CLEANUP (v3): If it's a known generic relay, clear it.
                        let lower_url = media_url.to_lowercase();
                        let is_junk = lower_url.contains("damus.io") ||
                                 lower_url.contains("nos.lol") ||
                                 lower_url.contains("nostr.band") ||
                                 lower_url.contains("nostr.wine") ||
                                 lower_url.contains("snort.social");

                        if is_junk {
                            log::warn!("Startup (v3): Clearing invalid media server set to generic relay: {}", media_url);
                            let _ = db.delete_cache("relay_media_server").await;
                        } else {
                            log::info!("Startup (v3): Loading media server: {}", media_url);
                            let mut uploader = self.media_uploader.write().await;
                            uploader.set_blossom_server(media_url);
                            
                            // Load Media Server Token
                            if let Some(token) = db.get_cache("relay_media_server_token").await? {
                                if !token.is_empty() {
                                    uploader.set_blossom_token(token);
                                }
                            }
                        }
                    }
                }
            }

            log::info!("Startup: Loaded configuration from database");
        }
        Ok(())
    }

    /// Upload an image (compress, encrypt, and upload to server)
    pub async fn upload_image(
        &self,
        image_data: &[u8],
        filename: &str,
    ) -> Result<(String, String, String), Box<dyn std::error::Error + Send + Sync>> {
        let keys_guard = self.keys.read().await;
        let uploader_guard = self.media_uploader.read().await;
        
        // Pass the keys as an optional signer to enable NIP-98 authentication
        let (url, key_hex, nonce_hex) = uploader_guard.upload_image(
            image_data, 
            filename, 
            keys_guard.as_ref()
        ).await?;
        
        Ok((url, key_hex, nonce_hex))
    }

    pub async fn download_image(&self, full_url: &str) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
        let uploader_guard = self.media_uploader.read().await;
        // Don't hold the lock across the potentially long download if possible? 
        // Actually download logic is inside. That's fine.
        let data = uploader_guard.download_image(full_url).await?;
        Ok(data)
    }

    pub async fn delete_image_cache(&self, full_url: &str) {
        let uploader_guard = self.media_uploader.read().await;
        uploader_guard.delete_from_cache(full_url);
    }
    
    pub async fn set_cache_dir(&self, path: std::path::PathBuf) {
        let mut uploader_guard = self.media_uploader.write().await;
        uploader_guard.set_cache_dir(path);
    }

    /// Encrypt a message using NIP-44
    pub async fn encrypt_message(
        &self,
        plaintext: &str,
        their_pubkey: &str,
    ) -> Result<EncryptedMessage, Box<dyn std::error::Error + Send + Sync>> {
        let keys_guard = self.keys.read().await;
        let keys = keys_guard.as_ref().ok_or("Keys not initialized")?;
        let encrypted = self.encryption_manager.encrypt(plaintext, their_pubkey, keys).await?;
        Ok(encrypted)
    }

    /// Decrypt a message using NIP-44
    pub async fn decrypt_message(
        &self,
        encrypted: &EncryptedMessage,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let keys_guard = self.keys.read().await;
        let keys = keys_guard.as_ref().ok_or("Keys not initialized")?;
        let plaintext = self.encryption_manager.decrypt(encrypted, keys).await?;
        Ok(plaintext)
    }

    /// Create a private message using NIP-44 + NIP-17 Gift Wrap
    pub async fn create_private_message_with_encryption(
        &self,
        content: &str,
        receiver_pubkey: &str,
    ) -> Result<Event, Box<dyn std::error::Error + Send + Sync>> {
        let keys_guard = self.keys.read().await;
        let keys = keys_guard.as_ref().ok_or("Keys not initialized")?;

        let event = self.encryption_manager.create_private_message(content, receiver_pubkey, keys).await?;
        Ok(event)
    }

    /// Unwrap a private message using NIP-44
    pub async fn unwrap_private_message(
        &self,
        event: &Event,
    ) -> Result<UnsignedEvent, Box<dyn std::error::Error + Send + Sync>> {
        let keys_guard = self.keys.read().await;
        let keys = keys_guard.as_ref().ok_or("Keys not initialized")?;

        // Quietly skip if not a gift wrap (Kind 1059)
        if event.kind != Kind::GiftWrap {
            return Err("Not Gift Wrap event".into());
        }

        let rumor = self.encryption_manager.unwrap_private_message(event, keys).await?;
        Ok(rumor)
    }

    async fn build_message_listener_filters(&self) -> Vec<Filter> {
        let mut filters = vec![Filter::new().kind(Kind::GiftWrap)];
        if let Some(db) = self.db.read().await.as_ref() {
            if let Ok(contacts) = db.get_contacts().await {
                let authors: Vec<PublicKey> = contacts
                    .into_iter()
                    .filter_map(|c| PublicKey::parse(&c.npub).ok())
                    .collect();
                if !authors.is_empty() {
                    let metadata_filter = Filter::new()
                        .kind(Kind::Metadata)
                        .authors(authors)
                        .limit(1);
                    filters.push(metadata_filter);
                }
            }
        }
        filters
    }

    async fn subscribe_message_listener(&self, client: &Client) {
        let filters = self.build_message_listener_filters().await;
        let _ = client.subscribe(filters, None).await;
    }

    /// Delete NIP-44 session for a user
    pub async fn delete_encryption_session(&self, their_pubkey: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.encryption_manager.delete_session(their_pubkey).await?;
        Ok(())
    }

    /// Get all active NIP-44 sessions
    pub async fn get_encryption_sessions(&self) -> Vec<String> {
        self.encryption_manager.get_sessions().await
    }

    /// Export NIP-44 session key for backup
    pub async fn export_session_key(&self, their_pubkey: &str) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let key = self.encryption_manager.export_session(their_pubkey).await?;
        Ok(key)
    }

    /// Import NIP-44 session key for recovery
    pub async fn import_session_key(
        &self,
        their_pubkey: &str,
        key_hex: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.encryption_manager.import_session(their_pubkey, key_hex).await?;
        Ok(())
    }

    /// Query a user's relay list (NIP-65)
    pub async fn query_user_relays(
        &self,
        pubkey: &str,
    ) -> Result<Vec<RelayListEntry>, Box<dyn std::error::Error + Send + Sync>> {
        let nip65_guard = self.nip65_manager.read().await;
        let relays = nip65_guard.query_user_relays(pubkey, None).await?;
        Ok(relays)
    }

    /// Query multiple users' relay lists and merge them
    pub async fn query_multiple_users_relays(
        &self,
        pubkeys: &[&str],
    ) -> Result<Vec<RelayListEntry>, Box<dyn std::error::Error + Send + Sync>> {
        let nip65_guard = self.nip65_manager.read().await;
        let relays = nip65_guard.query_multiple_users_relays(pubkeys, None).await?;
        Ok(relays)
    }

    /// Get current user's relay list
    pub async fn get_my_relays(&self) -> Result<Vec<RelayListEntry>, Box<dyn std::error::Error + Send + Sync>> {
        let nip65_guard = self.nip65_manager.read().await;
        let relays = nip65_guard.get_my_relays().await?;
        Ok(relays)
    }

    /// Publish relay list (NIP-65)
    pub async fn publish_relay_list(
        &self,
        relays: Vec<RelayListEntry>,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let nip65_guard = self.nip65_manager.read().await;
        let event_id = nip65_guard.publish_relay_list(&relays).await?;
        Ok(event_id.to_hex())
    }

    /// Check relay health
    pub async fn check_relay_health(&self, relay_url: &str) -> Result<RelayHealthResult, Box<dyn std::error::Error + Send + Sync>> {
        let nip65_guard = self.nip65_manager.read().await;
        let result = nip65_guard.check_relay_health(relay_url).await;
        Ok(result)
    }

    /// Check health of multiple relays
    pub async fn check_relays_health(
        &self,
        relay_urls: Vec<String>,
    ) -> Result<Vec<RelayHealthResult>, Box<dyn std::error::Error + Send + Sync>> {
        let nip65_guard = self.nip65_manager.read().await;
        let results = nip65_guard.check_relays_health(&relay_urls).await;
        Ok(results)
    }

    /// Get recommended relays (default list)
    pub fn get_recommended_relays(&self) -> Vec<RelayListEntry> {
        let manager = Nip65Manager::new();
        manager.get_recommended_relays()
    }

    /// Fetch additional recommended relays from GitHub
    /// This provides dynamic updates without blocking startup
    pub async fn fetch_additional_relays() -> Result<Vec<RelayListEntry>, String> {
        use reqwest::Client;

        let client = Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .map_err(|e| e.to_string())?;

        // Try to fetch from GitHub Gist or API
        // If fails, return empty list (graceful degradation)
        let urls = [
            "https://raw.githubusercontent.com/ostia/relays/main/recommended.json",
            "https://gist.githubusercontent.com/ostia/relays/raw/recommended.json",
        ];

        for url in &urls {
            match client.get(*url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    if let Ok(text) = resp.text().await {
                        if let Ok(relays) = serde_json::from_str::<Vec<RelayListEntry>>(&text) {
                            log::info!("Fetched {} additional relays from {}", relays.len(), url);
                            return Ok(relays);
                        }
                    }
                }
                _ => continue,
            }
        }

        // Return empty list if all fetches fail
        log::info!("Could not fetch additional relays, using defaults only");
        Ok(vec![])
    }

    /// Set media server (Blossom) URL and Token
    pub async fn set_media_server(&self, url: String, token: Option<String>) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // Validate URL format
        if !url.starts_with("http://") && !url.starts_with("https://") {
            return Err("Media server URL must start with http:// or https://".into());
        }

        // Filter out private addresses (optional warning)
        if !is_public_relay_url(&url) {
            log::warn!("Setting private media server: {}", url);
        }

        // Update memory
        {
            let mut uploader = self.media_uploader.write().await;
            uploader.set_blossom_server(url.clone());
            if let Some(t) = token.clone() {
                uploader.set_blossom_token(t);
            } else {
                uploader.set_blossom_token(String::new());
            }
        }

        // Save to database
        let db_guard = self.db.read().await;
        if let Some(ref db) = *db_guard {
            db.set_cache("relay_media_server", &url, None).await?;
            db.set_cache("relay_media_server_token", &token.unwrap_or_default(), None).await?;
        }

        log::info!("Media server set to: {}", url);
        Ok(())
    }

    /// Add relay to custom relays
    pub async fn add_custom_relay(&self, relay_url: String) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // Filter out private/local addresses - they can't be used for cross-device messaging
        if !is_public_relay_url(&relay_url) {
            log::warn!("Rejected private relay address: {}", relay_url);
            return Ok(()); // Silently ignore private addresses
        }

        {
            let mut relay_guard = self.relay_manager.write().await;
            relay_guard.add_relay(relay_url.clone());
        }

        // Add to active client if initialized
        let transport_url = relay_url.clone();
        let client_guard = self.client.read().await;
        if let Some(client) = client_guard.as_ref() {
            if let Err(e) = client.add_relay(transport_url).await {
                log::warn!("Failed to add relay to client: {}", e);
            } else {
                client.connect().await;
            }
        }

        self.save_relay_config().await?;

        Ok(())
    }

    /// Remove relay from custom relays
    pub async fn remove_custom_relay(&self, relay_url: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        {
            let mut relay_guard = self.relay_manager.write().await;
            relay_guard.remove_relay(relay_url);
        }

        // Remove from active client if initialized
        let client_guard = self.client.read().await;
        if let Some(client) = client_guard.as_ref() {
            let _ = client.remove_relay(relay_url).await;
        }

        self.save_relay_config().await?;
        Ok(())
    }

    /// Set relay mode (Hybrid or Exclusive)
    pub async fn set_relay_mode(&self, mode: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        use crate::nostr::relay::RelayMode;

        let mode_enum = match mode {
            "hybrid" => RelayMode::Hybrid,
            "exclusive" => RelayMode::Exclusive,
            _ => return Err("Invalid relay mode. Use 'hybrid' or 'exclusive'".into()),
        };

        {
            let mut relay_guard = self.relay_manager.write().await;
            relay_guard.set_mode(mode_enum.clone());
        }

        // If client is initialized, we might need to reconnect with correct relays
        // For simplicity, we just save and let initialize handle it or user restart.
        // Actually, let's try to update client relays if initialized.
        let client_guard = self.client.read().await;
        if let Some(client) = client_guard.as_ref() {
            // Remove all relays and re-add according to new mode
            let current_relays = client.relays().await;
            for (url, _) in current_relays {
                let _ = client.remove_relay(url).await;
            }
            
            let relay_guard = self.relay_manager.read().await;
            for url in relay_guard.get_active_relays() {
                let _ = client.add_relay(url).await;
            }
            client.connect().await;
        }

        self.save_relay_config().await?;
        Ok(())
    }

    /// Get current relay configuration
    pub async fn get_relay_config(&self) -> Result<(String, Vec<String>, Vec<String>, String, String), Box<dyn std::error::Error + Send + Sync>> {
        let relay_guard = self.relay_manager.read().await;

        // Get mode as string
        let mode_str = match relay_guard.get_mode() {
            crate::nostr::relay::RelayMode::Hybrid => "hybrid",
            crate::nostr::relay::RelayMode::Exclusive => "exclusive",
        };

        // Get default and custom relays
        let default_relays = relay_guard.get_default_relays();
        let custom_relays = relay_guard.get_custom_relays();

        // Get media server info
        let uploader = self.media_uploader.read().await;
        let media_server = uploader.get_blossom_server().unwrap_or_default();
        let media_token = uploader.get_blossom_token().unwrap_or_default();

        Ok((mode_str.to_string(), default_relays, custom_relays, media_server, media_token))
    }

    /// Get all relay statuses
    pub async fn get_relay_statuses(&self) -> Result<Vec<(String, String)>, Box<dyn std::error::Error + Send + Sync>> {
        let relay_guard = self.relay_manager.read().await;
        let statuses = relay_guard.get_all_status();

        // Convert RelayStatus to string
        let status_strings: Vec<(String, String)> = statuses
            .into_iter()
            .map(|(url, status)| {
                let status_str = match status {
                    crate::nostr::relay::RelayStatus::Connected => "connected".to_string(),
                    crate::nostr::relay::RelayStatus::Connecting => "connecting".to_string(),
                    crate::nostr::relay::RelayStatus::Disconnected => "disconnected".to_string(),
                    crate::nostr::relay::RelayStatus::Failed(e) => format!("failed: {}", e),
                };
                (url, status_str)
            })
            .collect();

        Ok(status_strings)
    }

    /// Generate HTTP authentication header (NIP-98)
    pub async fn generate_http_auth(
        &self,
        url: &str,
        method: &str,
        payload: Option<&str>,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let keys_guard = self.keys.read().await;
        let keys = keys_guard.as_ref().ok_or("Keys not initialized")?;

        let header = self.auth_manager.generate_auth_header(url, method, payload, keys).await?;
        Ok(header.authorization)
    }

    /// Verify HTTP authentication header (NIP-98)
    pub fn verify_http_auth(
        &self,
        header: &str,
        expected_url: &str,
        expected_method: &str,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let valid = self.auth_manager.verify_auth_header(header, expected_url, expected_method)?;
        Ok(valid)
    }

    /// Create service authentication (NIP-98)
    pub async fn create_service_auth(
        &self,
        service_url: &str,
        challenge: &str,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let keys_guard = self.keys.read().await;
        let keys = keys_guard.as_ref().ok_or("Keys not initialized")?;

        let event = self.auth_manager.create_service_auth(service_url, challenge, keys).await?;
        let header = HttpAuthManager::header_from_event(&event)?;
        Ok(header)
    }

    // ==================== NIP-22: Message Reply ====================

    /// Create a reply to a message (NIP-22)
    pub async fn create_reply(
        &self,
        content: &str,
        replied_event_id: &str,
    ) -> Result<EventId, Box<dyn std::error::Error + Send + Sync>> {
        let client_guard = self.client.read().await;
        let client = client_guard.as_ref().ok_or("Client not initialized")?;

        let keys_guard = self.keys.read().await;
        let keys = keys_guard.as_ref().ok_or("Keys not initialized")?;

        // Parse the replied event ID
        let replied_id = EventId::from_hex(replied_event_id)?;

        // Create reply event with 'e' tag using EventBuilder
        let event = EventBuilder::text_note(content)
            .tag(Tag::event(replied_id))
            .sign(keys)
            .await?;

        let event_id = client.send_event(event).await?;
        Ok(*event_id)
    }

    // ==================== NIP-16: Edit/Delete ====================

    /// Edit a message (NIP-16 - Replaceable Events)
    pub async fn edit_message(
        &self,
        message_id: &str,
        new_content: &str,
    ) -> Result<EventId, Box<dyn std::error::Error + Send + Sync>> {
        let client_guard = self.client.read().await;
        let client = client_guard.as_ref().ok_or("Client not initialized")?;

        let keys_guard = self.keys.read().await;
        let keys = keys_guard.as_ref().ok_or("Keys not initialized")?;

        // For NIP-16, we create a new event with the same created_at + 1
        // This replaces the original message
        let original_id = EventId::from_hex(message_id)?;

        // Get original event to use its timestamp
        // Note: In nostr-sdk v0.38, we need to fetch the event first
        let filter = Filter::new().id(original_id).limit(1);
        let events = client.fetch_events(vec![filter], Duration::from_secs(5)).await?;
        let original_event = events.into_iter().next().ok_or("Original event not found")?;
        let new_timestamp = original_event.created_at + Timestamp::from(1);

        // Create edited event
        let event = EventBuilder::text_note(new_content)
            .custom_created_at(new_timestamp)
            .sign(keys)
            .await?;

        let event_id = client.send_event(event).await?;
        Ok(*event_id)
    }

    /// Delete a message (NIP-16)
    pub async fn delete_message(
        &self,
        message_id: &str,
    ) -> Result<EventId, Box<dyn std::error::Error + Send + Sync>> {
        let client_guard = self.client.read().await;
        let client = client_guard.as_ref().ok_or("Client not initialized")?;

        let keys_guard = self.keys.read().await;
        let keys = keys_guard.as_ref().ok_or("Keys not initialized")?;

        // Create deletion event (Kind 5)
        let event_id_to_delete = EventId::from_hex(message_id)?;
        let event = EventBuilder::new(Kind::EventDeletion, "Message deleted")
            .tag(Tag::event(event_id_to_delete))
            .sign(keys)
            .await?;

        let _event_id = client.send_event(event).await?;

        Ok(event_id_to_delete)
    }

    // ==================== NIP-28: Group Chat ====================

    /// Create a channel (NIP-28)
    pub async fn create_channel(
        &self,
        name: &str,
        about: &str,
    ) -> Result<EventId, Box<dyn std::error::Error + Send + Sync>> {
        let client_guard = self.client.read().await;
        let client = client_guard.as_ref().ok_or("Client not initialized")?;

        let keys_guard = self.keys.read().await;
        let keys = keys_guard.as_ref().ok_or("Keys not initialized")?;

        // Kind 40: Channel creation
        let content = serde_json::json!({
            "name": name,
            "about": about,
        }).to_string();

        let event = EventBuilder::new(Kind::Custom(40), content)
            .sign(keys)
            .await?;

        let event_id = client.send_event(event).await?;
        Ok(*event_id)
    }

    /// Join a channel (NIP-28)
    pub async fn join_channel(
        &self,
        _channel_id: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // In NIP-28, joining is implicit - you just start listening
        // This could also publish a membership event if needed
        Ok(())
    }

    /// Leave a channel (NIP-28)
    pub async fn leave_channel(
        &self,
        _channel_id: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // In NIP-28, leaving is implicit - you just stop listening
        Ok(())
    }

    /// Send message to channel (NIP-28 - Kind 42)
    pub async fn send_channel_message(
        &self,
        channel_id: &str,
        content: &str,
    ) -> Result<EventId, Box<dyn std::error::Error + Send + Sync>> {
        let client_guard = self.client.read().await;
        let client = client_guard.as_ref().ok_or("Client not initialized")?;

        let keys_guard = self.keys.read().await;
        let keys = keys_guard.as_ref().ok_or("Keys not initialized")?;

        // Parse channel event ID
        let channel_event_id = EventId::from_hex(channel_id)?;

        // Kind 42: Channel message
        let event = EventBuilder::new(Kind::Custom(42), content)
            .tag(Tag::event(channel_event_id))
            .sign(keys)
            .await?;

        let event_id = client.send_event(event).await?;
        Ok(*event_id)
    }

    /// Get channel messages (NIP-28)
    pub async fn get_channel_messages(
        &self,
        channel_id: &str,
    ) -> Result<Vec<Event>, Box<dyn std::error::Error + Send + Sync>> {
        let client_guard = self.client.read().await;
        let client = client_guard.as_ref().ok_or("Client not initialized")?;

        // Parse channel event ID
        let channel_event_id = EventId::from_hex(channel_id)?;

        // Filter for Kind 42 messages with channel tag
        let filter = Filter::new()
            .kind(Kind::Custom(42))
            .event(channel_event_id)
            .limit(50);

        let events = client.fetch_events(vec![filter], Duration::from_secs(10)).await?;

        Ok(events.into_iter().collect())
    }

    /// Query user's channels (NIP-28)
    pub async fn query_user_channels(
        &self,
    ) -> Result<Vec<Event>, Box<dyn std::error::Error + Send + Sync>> {
        let client_guard = self.client.read().await;
        let client = client_guard.as_ref().ok_or("Client not initialized")?;

        let keys_guard = self.keys.read().await;
        let keys = keys_guard.as_ref().ok_or("Keys not initialized")?;

        // Query Kind 40 (channel creation) and Kind 41 (channel metadata)
        let filter = Filter::new()
            .kinds([Kind::Custom(40), Kind::Custom(41)])
            .author(keys.public_key())
            .limit(100);

        let events = client.fetch_events(vec![filter], Duration::from_secs(10)).await?;

        Ok(events.into_iter().collect())
    }
}

impl Default for NostrService {
    fn default() -> Self {
        Self::new()
    }
}

// ==================== Relay Health & Reconnection ====================

impl NostrService {
    /// Verify relay connection health by checking if relays are connected
    async fn verify_relay_connections(&self, client: &Client) -> bool {
        let relays = client.relays().await;
        if relays.is_empty() {
            log::warn!("verify_relay_connections: No relays connected");
            return false;
        }

        let mut healthy_count = 0;
        for (url, relay) in &relays {
            // Check if relay is connected
            let _ = relay.connect(None).await;
            if relay.is_connected() {
                healthy_count += 1;
                log::debug!("Relay health OK: {}", url);
            } else {
                log::warn!("Relay health FAILED: {}", url);
            }
        }

        // Consider healthy if at least 50% of relays are connected
        let total = relays.len();
        let healthy_percent = (healthy_count * 100) / total;
        healthy_percent >= 50
    }

    /// Start a background health monitor that continuously checks relay health
    /// and attempts to reconnect failed relays
    fn start_relay_health_monitor(&self, client: Client) {
        tauri::async_runtime::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(30));
            let mut failure_count = 0;
            const MAX_FAILURES: u32 = 3;

            loop {
                interval.tick().await;

                log::debug!("Relay health monitor: checking connection health...");

                let relays = client.relays().await;
                if relays.is_empty() {
                    log::error!("Relay health monitor: No relays available, stopping monitor");
                    break;
                }

                let mut needs_reconnect = false;
                let mut failed_relays = Vec::new();

                for (url, relay) in relays {
                    let _ = relay.connect(None).await;
                    if relay.is_connected() {
                        log::debug!("Relay OK: {}", url);
                    } else {
                        log::warn!("Relay FAILED: {}", url);
                        failed_relays.push(url.clone());
                        needs_reconnect = true;
                    }
                }

                if needs_reconnect {
                    failure_count += 1;
                    log::warn!("Relay health monitor: {} relays failed (failure count: {})", failed_relays.len(), failure_count);

                    // Attempt reconnection
                    for url in failed_relays {
                        log::info!("Relay health monitor: Attempting to reconnect to {}", url);
                        if let Err(e) = client.add_relay(url.clone()).await {
                            log::error!("Relay health monitor: Failed to add relay {}: {}", url, e);
                        }
                    }

                    // Trigger reconnection
                    log::info!("Relay health monitor: Triggering reconnection...");
                    client.connect().await;

                    // Check if recovery was successful
                    tokio::time::sleep(Duration::from_secs(5)).await;
                    let new_relays = client.relays().await;
                    let connected_count = new_relays.len();

                    log::info!("Relay health monitor: After reconnect, {} relays available", connected_count);

                    if failure_count >= MAX_FAILURES {
                        log::error!("Relay health monitor: Max failures ({}) reached, stopping monitor", MAX_FAILURES);
                        break;
                    }
                } else {
                    // Reset failure count on success
                    if failure_count > 0 {
                        log::info!("Relay health monitor: All relays healthy, resetting failure count");
                        failure_count = 0;
                    }
                }
            }
        });
    }

    /// Reconnect to all relays with exponential backoff
    pub async fn reconnect_with_backoff(&self) -> Result<(), String> {
        let client_guard = self.client.read().await;
        let client = client_guard.as_ref().ok_or("Client not initialized")?;

        let mut attempt = 0;
        const MAX_ATTEMPTS: u32 = 5;
        const BASE_DELAY: u64 = 2; // seconds

        while attempt < MAX_ATTEMPTS {
            attempt += 1;
            let delay = BASE_DELAY * 2_u64.pow(attempt - 1);

            log::info!("Reconnect attempt {} of {} (delay: {}s)", attempt, MAX_ATTEMPTS, delay);
            tokio::time::sleep(Duration::from_secs(delay)).await;

            // Try to reconnect
            client.connect().await;

            // Verify
            tokio::time::sleep(Duration::from_secs(3)).await;
            let healthy = self.verify_relay_connections(client).await;

            if healthy {
                log::info!("Reconnect successful after {} attempts", attempt);
                return Ok(());
            }

            log::warn!("Reconnect attempt {} failed, will retry", attempt);
        }

        Err("All reconnection attempts failed".to_string())
    }

    /// Get detailed relay status information
    pub async fn get_relay_diagnostics(&self) -> Result<Vec<(String, String, bool)>, String> {
        let client_guard = self.client.read().await;
        let client = client_guard.as_ref().ok_or("Client not initialized")?;

        let relays = client.relays().await;
        let mut diagnostics = Vec::new();

        for (url, relay) in relays {
            let _ = relay.connect(None).await;
            let is_connected = relay.is_connected();
            diagnostics.push((url.to_string(), "connected".to_string(), is_connected));
        }

        Ok(diagnostics)
    }
}
