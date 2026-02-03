use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct MemoryCache {
    data: HashMap<String, CacheEntry>,
}

struct CacheEntry {
    value: String,
    expires_at: Option<u64>,
}

impl MemoryCache {
    pub fn new() -> Self {
        Self {
            data: HashMap::new(),
        }
    }

    pub fn set(&mut self, key: &str, value: String, ttl_seconds: Option<u64>) {
        let expires_at = ttl_seconds.map(|ttl| {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
                + ttl
        });

        self.data.insert(
            key.to_string(),
            CacheEntry { value, expires_at },
        );
    }

    pub fn get(&self, key: &str) -> Option<&String> {
        self.data.get(key).and_then(|entry| {
            if let Some(expires_at) = entry.expires_at {
                let now = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();
                if now > expires_at {
                    return None;
                }
            }
            Some(&entry.value)
        })
    }

    pub fn remove(&mut self, key: &str) -> Option<String> {
        self.data.remove(key).map(|e| e.value)
    }

    pub fn clear(&mut self) {
        self.data.clear();
    }

    pub fn cleanup_expired(&mut self) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        self.data.retain(|_, entry| {
            entry.expires_at.map_or(true, |exp| exp > now)
        });
    }
}

impl Default for MemoryCache {
    fn default() -> Self {
        Self::new()
    }
}
