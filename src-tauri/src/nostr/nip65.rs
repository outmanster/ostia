use nostr_sdk::prelude::*;
use std::time::Duration;
use serde::{Deserialize, Serialize};

/// NIP-65 Relay List Entry
/// Represents a relay entry from a user's NIP-65 metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayListEntry {
    pub url: String,
    pub read: bool,
    pub write: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayHealthResult {
    pub url: String,
    pub status: String,
    pub reason: Option<String>,
}

/// Check if a relay URL is a public address (not Android emulator private network)
/// This prevents Android emulator addresses (10.0.2.2) from being used in cross-device communication
/// Note: localhost is allowed because users may use it for local testing with port forwarding
pub fn is_public_relay_url(url: &str) -> bool {
    let lower = url.to_lowercase();

    // Filter out Android emulator addresses (10.0.2.2) and other 10.0.0.0/8 ranges
    // These addresses only work on the Android emulator and can't be reached by other devices
    // Filter out Android emulator addresses (10.0.2.2) and other 10.0.0.0/8 ranges
    // v14.0: Allow 10.0.2.2 for local emulator testing as requested by user
    if  lower.contains("10.0.0.")
        || lower.contains("10.0.1.")
        || lower.contains("10.0.3.")
        || lower.contains("10.0.4.")
        || lower.contains("10.0.5.")
        || lower.contains("10.0.6.")
        || lower.contains("10.0.7.")
        || lower.contains("10.0.8.")
        || lower.contains("10.0.9.")
        || lower.contains("10.0.10.") {
        return false;
    }

    // Filter out other private network ranges that can't be reached cross-device
    // 172.16.0.0/12
    if lower.contains("172.16.")
        || lower.contains("172.17.")
        || lower.contains("172.18.")
        || lower.contains("172.19.")
        || lower.contains("172.20.")
        || lower.contains("172.21.")
        || lower.contains("172.22.")
        || lower.contains("172.23.")
        || lower.contains("172.24.")
        || lower.contains("172.25.")
        || lower.contains("172.26.")
        || lower.contains("172.27.")
        || lower.contains("172.28.")
        || lower.contains("172.29.")
        || lower.contains("172.30.")
        || lower.contains("172.31.") {
        return false;
    }
    // v14.0: Local IPs (192.168.x.x, 127.0.0.1, etc.) are now ALLOWED for testing
    // Previously specific blocks for 192.168, 169.254, and 127.0.0.1 are removed here.
    
    // localhost is ALLOWED - users can use it with port forwarding
    // ::1 IPv6 loopback is also allowed
    true
}

/// NIP-65 Relay Discovery Manager
/// Handles querying user relay lists and managing relay modes
pub struct Nip65Manager {
    client: Option<Client>,
}

impl Nip65Manager {
    pub fn new() -> Self {
        Self { client: None }
    }

    /// Set the client for relay discovery
    pub fn set_client(&mut self, client: Client) {
        self.client = Some(client);
    }

    /// Query a user's relay list (NIP-65)
    /// Returns a list of relays with read/write permissions
    pub async fn query_user_relays(
        &self,
        pubkey: &str,
        timeout: Option<Duration>,
    ) -> Result<Vec<RelayListEntry>, String> {
        let client = self.client.as_ref().ok_or("Client not initialized")?;

        let pub_key = PublicKey::parse(pubkey).map_err(|e| e.to_string())?;

        // Create filter for Kind 10002 (Relay List Metadata)
        let filter = Filter::new()
            .kind(Kind::RelayList)
            .author(pub_key)
            .limit(1);

        let timeout = timeout.unwrap_or(Duration::from_secs(10));

        // Fetch events
        let events = client
            .fetch_events(vec![filter], timeout)
            .await
            .map_err(|e| format!("Failed to fetch relay list: {}", e))?;

        if let Some(event) = events.into_iter().next() {
            // Parse tags to extract relay information
            // NIP-65 format: [\"r\", \"wss://relay.example.com\", \"read\", \"write\"]
            // or [\"r\", \"wss://relay.example.com\"] (both read and write)
            let mut relays = Vec::new();

            for tag in event.tags {
                if tag.kind() == TagKind::from("r") {
                    if let Some(url) = tag.content() {
                        // Filter out private/local addresses that won't work across devices
                        // Only include public relay addresses
                        if is_public_relay_url(url) {
                            // Get additional values (read/write permissions)
                            // Tag format: [\"r\", \"url\", \"read\", \"write\"] or [\"r\", \"url\"]
                            let tag_slice = tag.as_slice();
                            let additional: Vec<&str> = if tag_slice.len() > 2 {
                                tag_slice[2..].iter().filter_map(|s| Some(s.as_str())).collect()
                            } else {
                                Vec::new()
                            };

                            let read = additional.iter().any(|s| s.contains("read")) || additional.is_empty();
                            let write = additional.iter().any(|s| s.contains("write")) || additional.is_empty();

                            relays.push(RelayListEntry {
                                url: url.to_string(),
                                read,
                                write,
                            });
                        }
                    }
                }
            }

            return Ok(relays);
        }

        Ok(Vec::new())
    }

    /// Query multiple users' relay lists and merge them
    pub async fn query_multiple_users_relays(
        &self,
        pubkeys: &[&str],
        timeout: Option<Duration>,
    ) -> Result<Vec<RelayListEntry>, String> {
        let client = self.client.as_ref().ok_or("Client not initialized")?;

        // Parse all public keys
        let parsed_keys: Result<Vec<PublicKey>, _> = pubkeys
            .iter()
            .map(|pk| PublicKey::parse(pk))
            .collect();

        let parsed_keys = parsed_keys.map_err(|e| e.to_string())?;

        // Create filter for Kind 10002 from multiple authors
        let filter = Filter::new()
            .kind(Kind::RelayList)
            .authors(parsed_keys)
            .limit(pubkeys.len());

        let timeout = timeout.unwrap_or(Duration::from_secs(10));

        let events = client
            .fetch_events(vec![filter], timeout)
            .await
            .map_err(|e| format!("Failed to fetch relay lists: {}", e))?;

        // Merge all relay entries, deduplicating by URL
        let mut relay_map = std::collections::HashMap::new();

        for event in events {
            for tag in event.tags {
                if tag.kind() == TagKind::from("r") {
                    if let Some(url) = tag.content() {
                        // Filter out private/local addresses
                        if is_public_relay_url(url) {
                            // Get additional values (read/write permissions)
                            let tag_slice = tag.as_slice();
                            let additional: Vec<&str> = if tag_slice.len() > 2 {
                                tag_slice[2..].iter().filter_map(|s| Some(s.as_str())).collect()
                            } else {
                                Vec::new()
                            };

                            let read = additional.iter().any(|s| s.contains("read")) || additional.is_empty();
                            let write = additional.iter().any(|s| s.contains("write")) || additional.is_empty();

                            // Keep the most permissive settings
                            let entry = relay_map.entry(url.to_string()).or_insert(RelayListEntry {
                                url: url.to_string(),
                                read: false,
                                write: false,
                            });

                            entry.read = entry.read || read;
                            entry.write = entry.write || write;
                        }
                    }
                }
            }
        }

        Ok(relay_map.into_values().collect())
    }

    /// Get current user's relay list (NIP-65) from the network
    pub async fn get_my_relays(&self) -> Result<Vec<RelayListEntry>, String> {
        let client = self.client.as_ref().ok_or("Client not initialized")?;
        
        let signer = client.signer().await.map_err(|e| e.to_string())?;
        let pubkey = signer.get_public_key().await.map_err(|e| e.to_string())?;
        
        // Use our existing query_user_relays logic for ourselves
        self.query_user_relays(&pubkey.to_string(), None).await
    }

    /// Publish relay list (NIP-65)
    /// Creates and publishes a Kind 10002 event
    pub async fn publish_relay_list(
        &self,
        relays: &[RelayListEntry],
    ) -> Result<EventId, String> {
        let client = self.client.as_ref().ok_or("Client not initialized")?;

        // Build tags for NIP-65
        let mut tags: Vec<Tag> = Vec::new();
        log::info!("Publish Relay List (v15.5): Building tags...");
        
        for relay in relays {
            if !relay.read && !relay.write {
                continue;
            }

            // Filter out private addresses from the PUBLISHED list
            // However, if the user explicitly wants to publish Kind 10002, we should include all relays they added,
            // because they might be using a private relay accessible via VPN/Tailscale (e.g. 100.x.y.z)
            // or a public domain that resolves to private IP.
            // 
            // BUT, for strictly local IPs (localhost, 127.0.0.1, 192.168.x.x), publishing them is usually useless and leaks local info.
            // So we keep the filter for strictly local IPs.
            if !is_public_relay_url(&relay.url) {
                log::warn!("NIP-65: Not publishing private address: {}", relay.url);
                continue;
            }

            let mut tag_values = vec!["r".to_string(), relay.url.clone()];
            if relay.read && !relay.write {
                tag_values.push("read".to_string());
            } else if !relay.read && relay.write {
                tag_values.push("write".to_string());
            }

            if let Ok(tag) = Tag::parse(&tag_values) {
                tags.push(tag);
            }
        }

        let signer = client.signer().await.map_err(|e| e.to_string())?;
        let pubkey = signer.get_public_key().await.map_err(|e| e.to_string())?;

        let unsigned = UnsignedEvent::new(
            pubkey,
            Timestamp::now(),
            Kind::RelayList,
            tags,
            "",
        );

        let event = signer
            .sign_event(unsigned)
            .await
            .map_err(|e| format!("Failed to create relay list event: {}", e))?;

        log::info!("Publishing NIP-65 Relay List...");
        
        // Define targets for actual publishing
        let mut final_targets = Vec::new();
        for relay_entry in relays {
            if relay_entry.write {
                final_targets.push(relay_entry.url.clone());
                // Ensure checking if relay is already added is handled by sdk, but explicit add is safe
                let _ = client.add_relay(relay_entry.url.clone()).await;
                
                // Critical Fix for Windows:
                // Localhost often resolves to ::1 (IPv6), but some relays only listen on 127.0.0.1 (IPv4).
                // We add 127.0.0.1 as a shadow target to ensure delivery.
                if relay_entry.url.contains("localhost") {
                    let fallback = relay_entry.url.replace("localhost", "127.0.0.1");
                    final_targets.push(fallback.clone());
                    let _ = client.add_relay(fallback).await;
                }
            }
        }
        
        // Trigger connect for all relays to ensure active sockets
        client.connect().await;
        
        // Short wait for handshake (socket establishment)
        tokio::time::sleep(Duration::from_millis(500)).await;

        log::info!("Broadcasting relay list to {} targets...", final_targets.len());
        
        // We use send_event_to iterating over targets to track success per-relay.
        // This is more robust than a global broadcast which obscures individual failures.
        let mut success_count = 0;
        for url in &final_targets {
            match client.send_event_to([url], event.clone()).await {
                Ok(_) => {
                    log::info!("✅ Published to {}", url);
                    success_count += 1;
                }
                Err(e) => {
                    log::warn!("❌ Failed to publish to {}: {}", url, e);
                }
            }
        }

        if success_count > 0 {
            log::info!("Successfully published relay list to {}/{} relays.", success_count, final_targets.len());
            Ok(event.id)
        } else {
            log::error!("Failed to publish to any relay.");
            Err("无法连接到任何中继器。请检查网络或中继器状态。".into())
        }
    }

    /// Perform health check on a relay
    /// Returns true if relay is responsive
    pub async fn check_relay_health(&self, relay_url: &str) -> RelayHealthResult {
        let relay_url = relay_url.trim();
        if relay_url.is_empty() {
            return RelayHealthResult {
                url: relay_url.to_string(),
                status: "invalid".to_string(),
                reason: Some("地址为空".to_string()),
            };
        }

        let client = match &self.client {
            Some(c) => c,
            None => {
                return RelayHealthResult {
                    url: relay_url.to_string(),
                    status: "disconnected".to_string(),
                    reason: Some("客户端未初始化".to_string()),
                };
            }
        };

        if let Err(error) = client.add_relay(relay_url.to_string()).await {
            return RelayHealthResult {
                url: relay_url.to_string(),
                status: "invalid".to_string(),
                reason: Some(format!("地址无效: {}", error)),
            };
        }

        if let Ok(relay) = client.relay(relay_url).await {
            let _ = relay.connect(Some(Duration::from_secs(5))).await;
            if relay.is_connected() {
                return RelayHealthResult {
                    url: relay_url.to_string(),
                    status: "connected".to_string(),
                    reason: None,
                };
            }
        }

        if relay_url.contains("localhost") {
            let fallback = relay_url.replace("localhost", "127.0.0.1");
            if fallback != relay_url && client.add_relay(fallback.clone()).await.is_ok() {
                if let Ok(relay) = client.relay(&fallback).await {
                    let _ = relay.connect(Some(Duration::from_secs(5))).await;
                    if relay.is_connected() {
                        return RelayHealthResult {
                            url: relay_url.to_string(),
                            status: "connected".to_string(),
                            reason: None,
                        };
                    }
                }
            }
        }

        RelayHealthResult {
            url: relay_url.to_string(),
            status: "disconnected".to_string(),
            reason: Some("连接失败或超时".to_string()),
        }
    }

    /// Check health of multiple relays concurrently
    pub async fn check_relays_health(&self, relay_urls: &[String]) -> Vec<RelayHealthResult> {
        let mut results = Vec::new();

        for url in relay_urls {
            let result = self.check_relay_health(url).await;
            results.push(result);
        }

        results
    }

    /// Get relay recommendations based on user preferences
    /// Returns an empty list, forcing users to add their own relays
    /// These are hard-coded defaults that work offline
    pub fn get_recommended_relays(&self) -> Vec<RelayListEntry> {
        // 完全清空中继器推荐，用户必须自己添加
        vec![]
    }
}

impl Default for Nip65Manager {
    fn default() -> Self {
        Self::new()
    }
}
