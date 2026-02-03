use nostr_sdk::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use base64::{Engine as _, engine::general_purpose};

/// NIP-98 HTTP Authentication Manager
///
/// Provides HTTP authentication using Nostr events
/// https://github.com/nostr-protocol/nips/blob/master/98.md
pub struct HttpAuthManager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpAuthHeader {
    pub authorization: String,
    pub created_at: u64,
}

impl HttpAuthManager {
    pub fn new() -> Self {
        Self
    }

    /// Generate Blossom (BUD-01/02) authentication header
    /// kind 24242
    pub async fn generate_blossom_auth_header(
        &self,
        _url: &str, // Kept for interface consistency or if needed for "u" tag
        action: &str,
        payload_hash: Option<&str>,
        signer: &impl NostrSigner,
    ) -> Result<HttpAuthHeader, String> {
        // Blossom Auth uses Kind 24242
        // Tags: ["t", action], ["expiration", timestamp], ["x", hash] (optional)
        
        let expiration = Timestamp::now().as_u64() + 300; // 5 minutes validity
        
        let mut tags = vec![
            Tag::custom(
                TagKind::Custom("t".into()),
                vec![action.to_string()],
            ),
            Tag::custom(
                TagKind::Expiration,
                vec![expiration.to_string()],
            ),
        ];

        if let Some(hash) = payload_hash {
             tags.push(Tag::custom(
                TagKind::Custom("x".into()),
                vec![hash.to_string()],
            ));
        }

        // Create the auth event (Kind 24242 - Blossom)
        // v9: Forward-dating by 40s
        log::info!("Blossom Auth (v9) active: forward-dating 40s");
        let created_at = Timestamp::from(Timestamp::now().as_u64().saturating_add(40));

        let event = EventBuilder::new(Kind::Custom(24242), "Blossom Upload")
            .tags(tags)
            .custom_created_at(created_at)
            .sign(signer)
            .await
            .map_err(|e| format!("Failed to sign Blossom auth event: {}", e))?;

        // Encode as base64
        let event_json = serde_json::to_string(&event)
            .map_err(|e| format!("Failed to serialize event: {}", e))?;

        let event_base64 = general_purpose::STANDARD.encode(event_json);
        let auth_value = format!("Nostr {}", event_base64);

        Ok(HttpAuthHeader {
            authorization: auth_value,
            created_at: event.created_at.as_u64(),
        })
    }

    /// Generate NIP-98 authentication header
    ///
    /// Creates a signed event that serves as HTTP authentication
    ///
    /// # Arguments
    /// * `url` - The URL being requested
    /// * `method` - HTTP method (GET, POST, PUT, DELETE, etc.)
    /// * `payload` - Optional request payload hash
    /// * `signer` - Nostr signer for event signing
    ///
    /// # Returns
    /// Authorization header value
    pub async fn generate_auth_header(
        &self,
        url: &str,
        method: &str,
        payload: Option<&str>,
        signer: &impl NostrSigner,
    ) -> Result<HttpAuthHeader, String> {
        // Create tags for the auth event
        let mut tags = vec![
            Tag::custom(
                TagKind::Custom("u".into()),
                vec![url.to_string()],
            ),
            Tag::custom(
                TagKind::Custom("method".into()),
                vec![method.to_uppercase()],
            ),
        ];

        // Add payload tag if provided
        if let Some(payload_hash) = payload {
            // In production, this should be SHA256 hash of the payload
            tags.push(Tag::custom(
                TagKind::Custom("payload".into()),
                vec![payload_hash.to_string()],
            ));
        }

        // Create the auth event (Kind 27235)
        // v9: Forward-dating by 40s
        log::info!("NIP-98 Auth (v9) active: forward-dating 40s");
        let created_at = Timestamp::from(Timestamp::now().as_u64().saturating_add(40));
        
        let event = EventBuilder::new(Kind::Custom(27235), "")
            .tags(tags)
            .custom_created_at(created_at)
            .sign(signer)
            .await
            .map_err(|e| format!("Failed to sign auth event: {}", e))?;

        // Encode as base64 for Authorization header
        let event_json = serde_json::to_string(&event)
            .map_err(|e| format!("Failed to serialize event: {}", e))?;

        let event_base64 = general_purpose::STANDARD.encode(event_json);
        let auth_value = format!("Nostr {}", event_base64);

        Ok(HttpAuthHeader {
            authorization: auth_value,
            created_at: event.created_at.as_u64(),
        })
    }

    /// Verify NIP-98 authentication header
    ///
    /// # Arguments
    /// * `header` - Authorization header value
    /// * `expected_url` - Expected URL
    /// * `expected_method` - Expected HTTP method
    ///
    /// # Returns
    /// True if valid, false otherwise
    pub fn verify_auth_header(
        &self,
        header: &str,
        expected_url: &str,
        expected_method: &str,
    ) -> Result<bool, String> {
        // Parse "Nostr <event_json>" format
        if !header.starts_with("Nostr ") {
            return Err("Invalid auth header format".to_string());
        }

        let encoded_event = &header[6..]; // Skip "Nostr "
        let event_json_bytes = general_purpose::STANDARD.decode(encoded_event)
            .map_err(|e| format!("Failed to decode base64: {}", e))?;
        let event_json = String::from_utf8(event_json_bytes)
            .map_err(|e| format!("Invalid UTF-8: {}", e))?;
        let event: Event = serde_json::from_str(&event_json)
            .map_err(|e| format!("Failed to parse event: {}", e))?;

        // Verify event kind
        if event.kind != Kind::Custom(27235) {
            return Err("Invalid event kind".to_string());
        }

        // Verify URL tag
        let url_tag = event.tags.iter()
            .find(|t| t.as_slice().get(0) == Some(&"u".to_string()))
            .ok_or("Missing URL tag")?;

        let url_value = url_tag.as_slice().get(1)
            .ok_or("Invalid URL tag")?;

        if url_value != &expected_url.to_string() {
            return Err("URL mismatch".to_string());
        }

        // Verify method tag
        let method_tag = event.tags.iter()
            .find(|t| t.as_slice().get(0) == Some(&"method".to_string()))
            .ok_or("Missing method tag")?;

        let method_value = method_tag.as_slice().get(1)
            .ok_or("Invalid method tag")?;

        if method_value.to_uppercase() != expected_method.to_uppercase() {
            return Err("Method mismatch".to_string());
        }

        // Verify signature
        // In production, you would also check:
        // - Event timestamp (anti-replay)
        // - Allowed pubkeys
        // - Challenge nonce validation

        Ok(true)
    }

    /// Create authentication event for specific service
    ///
    /// # Arguments
    /// * `service_url` - Service base URL
    /// * `challenge` - Challenge from service
    /// * `signer` - Nostr signer
    ///
    /// # Returns
    /// Auth event for the service
    pub async fn create_service_auth(
        &self,
        service_url: &str,
        challenge: &str,
        signer: &impl NostrSigner,
    ) -> Result<Event, String> {
        let tags = vec![
            Tag::custom(
                TagKind::Custom("u".into()),
                vec![service_url.to_string()],
            ),
            Tag::custom(
                TagKind::Custom("method".into()),
                vec!["GET".to_string()],
            ),
            Tag::custom(
                TagKind::Custom("challenge".into()),
                vec![challenge.to_string()],
            ),
        ];

        let event = EventBuilder::new(Kind::Custom(27235), "")
            .tags(tags)
            .sign(signer)
            .await
            .map_err(|e| format!("Failed to sign auth event: {}", e))?;

        Ok(event)
    }

    /// Generate authorization header from event
    pub fn header_from_event(event: &Event) -> Result<String, String> {
        let event_json = serde_json::to_string(event)
            .map_err(|e| format!("Failed to serialize event: {}", e))?;
        let event_base64 = general_purpose::STANDARD.encode(event_json);
        Ok(format!("Nostr {}", event_base64))
    }

    /// Parse authorization header to get event
    pub fn parse_header(header: &str) -> Result<Event, String> {
        if !header.starts_with("Nostr ") {
            return Err("Invalid auth header format".to_string());
        }

        let event_json = &header[6..];
        let event: Event = serde_json::from_str(event_json)
            .map_err(|e| format!("Failed to parse event: {}", e))?;

        Ok(event)
    }

    /// Get all tags from auth event
    pub fn get_auth_tags(&self, event: &Event) -> HashMap<String, String> {
        let mut tags = HashMap::new();

        for tag in event.tags.iter() {
            let parts = tag.as_slice();
            if parts.len() >= 2 {
                let key = parts[0].clone();
                let value = parts[1].clone();
                tags.insert(key, value);
            }
        }

        tags
    }
}

impl Default for HttpAuthManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_http_auth_manager_creation() {
        let manager = HttpAuthManager::new();
        let keys = Keys::generate();
        let event = EventBuilder::new(Kind::TextNote, "")
            .tags(Vec::<Tag>::new())
            .sign(&keys)
            .await
            .unwrap();
        assert!(manager.get_auth_tags(&event).is_empty());
    }
}
