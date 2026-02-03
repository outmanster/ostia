use nostr_sdk::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use aes_gcm::{
    aead::{Aead, KeyInit, OsRng, generic_array::GenericArray},
    Aes256Gcm,
};
use rand::Rng;
use ::hex::{encode, decode};
use chrono::Utc;

use crate::storage::database::Database;

/// NIP-44 加密会话管理器
///
/// NIP-44 使用 ChaCha20-Poly1305 进行加密
/// 每个会话有独立的密钥和 nonce 计数器
pub struct Nip44Encryption {
    /// 会话密钥缓存：对方公钥 -> (密钥, nonce_counter)
    sessions: Arc<RwLock<HashMap<String, [u8; 32]>>>,
    /// 数据库引用
    db: Arc<RwLock<Option<Arc<Database>>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedMessage {
    pub ciphertext: String,      // 加密后的消息 (hex)
    pub nonce: String,           // Nonce (hex)
    pub pubkey: String,          // 对方公钥
    pub timestamp: u64,          // 加密时间
}

impl Nip44Encryption {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            db: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn set_database(&self, db: Arc<Database>) {
        *self.db.write().await = Some(db);
    }

    /// 获取或创建会话密钥
    ///
    /// 使用 HKDF 从共享密钥派生会话密钥
    async fn get_session_key(&self, their_pubkey: &str) -> Result<[u8; 32], String> {
        {
            let sessions = self.sessions.read().await;
            if let Some(key) = sessions.get(their_pubkey) {
                return Ok(*key);
            }
        }

        // 从数据库加载已保存的会话密钥
        let db_guard = self.db.read().await;
        if let Some(db) = db_guard.as_ref() {
            if let Ok(Some(key_hex)) = db.get_cache(&format!("nip44_session_{}", their_pubkey)).await {
                if let Ok(key_bytes) = decode(&key_hex) {
                    if key_bytes.len() == 32 {
                        let mut key = [0u8; 32];
                        key.copy_from_slice(&key_bytes);

                        // 保存到内存缓存
                        let mut sessions = self.sessions.write().await;
                        sessions.insert(their_pubkey.to_string(), key);
                        return Ok(key);
                    }
                }
            }
        }

        // 创建新会话密钥（实际实现需要从 NIP-44 密钥交换获取）
        // 这里使用简化的密钥派生，实际应使用 NIP-44 的密钥协商
        let mut key = [0u8; 32];
        OsRng.fill(&mut key);

        // 保存到内存缓存
        {
            let mut sessions = self.sessions.write().await;
            sessions.insert(their_pubkey.to_string(), key);
        }

        // 持久化到数据库
        if let Some(db) = db_guard.as_ref() {
            db.set_cache(
                &format!("nip44_session_{}", their_pubkey),
                &encode(key),
                Some(3600 * 24 * 30), // 30 天过期
            ).await?;
        }

        Ok(key)
    }

    /// 加密消息 (NIP-44)
    pub async fn encrypt(
        &self,
        plaintext: &str,
        their_pubkey: &str,
        keys: &Keys,
    ) -> Result<EncryptedMessage, String> {
        let receiver_pk = PublicKey::parse(their_pubkey)
            .map_err(|e| format!("Failed to parse receiver pubkey: {}", e))?;

        let ciphertext = nip44::encrypt(keys.secret_key(), &receiver_pk, plaintext, nip44::Version::V2)
            .map_err(|e| format!("Encryption failed: {}", e))?;

        Ok(EncryptedMessage {
            ciphertext,
            nonce: String::new(),
            pubkey: their_pubkey.to_string(),
            timestamp: Utc::now().timestamp() as u64,
        })
    }

    /// 解密消息 (NIP-44)
    pub async fn decrypt(
        &self,
        encrypted: &EncryptedMessage,
        keys: &Keys,
    ) -> Result<String, String> {
        let sender_pk = PublicKey::parse(&encrypted.pubkey)
            .map_err(|e| format!("Failed to parse sender pubkey: {}", e))?;

        nip44::decrypt(keys.secret_key(), &sender_pk, &encrypted.ciphertext)
            .map_err(|e| format!("Decryption failed: {}", e))
    }

    /// 加密私信消息 (NIP-44 + NIP-17 Gift Wrap)
    ///
    /// 这是完整的私信流程：
    /// 1. 创建 Rumor (实际消息内容)
    /// 2. 使用 NIP-44 加密 Rumor
    /// 3. 创建 Seal (加密的 Rumor + 接收者公钥)
    /// 4. 创建 Gift Wrap (Seal + 随机 nonce)
    pub async fn create_private_message(
        &self,
        content: &str,
        receiver_pubkey: &str,
        keys: &Keys,
    ) -> Result<Event, String> {
        let sender_pubkey = keys.public_key();

        // 1. 创建 Rumor (未签名的消息)
        let rumor = UnsignedEvent::new(
            sender_pubkey,
            Timestamp::now(),
            Kind::TextNote,
            vec![],
            content,
        );

        // 2. 序列化并加密 Rumor
        let rumor_json = serde_json::to_string(&rumor)
            .map_err(|e| format!("Failed to serialize rumor: {}", e))?;

        let encrypted = self.encrypt(&rumor_json, receiver_pubkey, keys).await?;

        // 3. 创建 Seal (Kind 13)
        let seal_content = encrypted.ciphertext;
        let receiver_pk = PublicKey::parse(receiver_pubkey)
            .map_err(|e| format!("Failed to parse receiver pubkey: {}", e))?;

        let seal = UnsignedEvent::new(
            sender_pubkey,
            Timestamp::now(),
            Kind::Custom(13),
            vec![Tag::public_key(receiver_pk)],
            seal_content,
        );

        // 4. 创建 Gift Wrap (Kind 1059)
        let seal_json = serde_json::to_string(&seal)
            .map_err(|e| format!("Failed to serialize seal: {}", e))?;

        // 使用随机私钥签名 Gift Wrap
        let random_keys = Keys::generate();
        let gift_wrap = EventBuilder::new(Kind::GiftWrap, seal_json)
            .tag(Tag::public_key(receiver_pk))
            .sign(&random_keys)
            .await
            .map_err(|e| format!("Failed to sign gift wrap: {}", e))?;

        Ok(gift_wrap)
    }

    /// 解包私信消息
    ///
    /// 解析 Gift Wrap -> Seal -> Rumor
    pub async fn unwrap_private_message(
        &self,
        event: &Event,
        keys: &Keys,
    ) -> Result<UnsignedEvent, String> {
        if event.kind != Kind::GiftWrap {
            return Err("Not a Gift Wrap event".to_string());
        }

        // 解析 Seal
        let seal_json = &event.content;
        let seal: UnsignedEvent = serde_json::from_str(seal_json)
            .map_err(|e| format!("Failed to parse seal: {}", e))?;

        if seal.kind != Kind::Custom(13) {
            return Err("Not a Seal event".to_string());
        }

        // 检查是否是发给我们的
        let my_pubkey = keys.public_key();
        let receiver_tag = seal.tags.iter()
            .find(|t| t.as_slice().get(0) == Some(&"p".to_string()))
            .ok_or("No receiver tag in seal")?;

        let receiver_hex = receiver_tag.as_slice().get(1)
            .ok_or("Invalid receiver tag")?;

        if receiver_hex != &my_pubkey.to_hex() {
            return Err("Not intended for this recipient".to_string());
        }

        let seal_content = seal.content.trim();
        let (encrypted, use_legacy) = if let Some((ciphertext, nonce)) = seal_content.split_once('|') {
            (
                EncryptedMessage {
                    ciphertext: ciphertext.to_string(),
                    nonce: nonce.to_string(),
                    pubkey: seal.pubkey.to_hex(),
                    timestamp: seal.created_at.as_u64(),
                },
                true,
            )
        } else {
            (
                EncryptedMessage {
                    ciphertext: seal_content.to_string(),
                    nonce: String::new(),
                    pubkey: seal.pubkey.to_hex(),
                    timestamp: seal.created_at.as_u64(),
                },
                false,
            )
        };

        let rumor_json = if use_legacy {
            self.decrypt_legacy(&encrypted).await?
        } else {
            self.decrypt(&encrypted, keys).await?
        };

        // 解析 Rumor
        let rumor: UnsignedEvent = serde_json::from_str(&rumor_json)
            .map_err(|e| format!("Failed to parse rumor: {}", e))?;

        Ok(rumor)
    }

    /// 删除会话（用于重置加密）
    pub async fn delete_session(&self, their_pubkey: &str) -> Result<(), String> {
        // 从内存移除
        {
            let mut sessions = self.sessions.write().await;
            sessions.remove(their_pubkey);
        }

        // 从数据库移除
        let db_guard = self.db.read().await;
        if let Some(db) = db_guard.as_ref() {
            db.delete_cache(&format!("nip44_session_{}", their_pubkey)).await?;
        }

        Ok(())
    }

    async fn decrypt_legacy(
        &self,
        encrypted: &EncryptedMessage,
    ) -> Result<String, String> {
        let key = self.get_session_key(&encrypted.pubkey).await?;

        let nonce_bytes = decode(&encrypted.nonce)
            .map_err(|e| format!("Invalid nonce: {}", e))?;
        let ciphertext_bytes = decode(&encrypted.ciphertext)
            .map_err(|e| format!("Invalid ciphertext: {}", e))?;

        let cipher = Aes256Gcm::new(GenericArray::from_slice(&key));
        let plaintext = cipher.decrypt(&GenericArray::from_slice(&nonce_bytes), ciphertext_bytes.as_slice())
            .map_err(|e| format!("Decryption failed: {}", e))?;

        String::from_utf8(plaintext)
            .map_err(|e| format!("Invalid UTF-8: {}", e))
    }

    /// 获取所有会话
    pub async fn get_sessions(&self) -> Vec<String> {
        let sessions = self.sessions.read().await;
        sessions.keys().cloned().collect()
    }

    /// 导出会话密钥（用于备份）
    pub async fn export_session(&self, their_pubkey: &str) -> Result<String, String> {
        let key = self.get_session_key(their_pubkey).await?;
        Ok(encode(key))
    }

    /// 导入会话密钥（用于恢复）
    pub async fn import_session(
        &self,
        their_pubkey: &str,
        key_hex: &str,
    ) -> Result<(), String> {
        let key_bytes = decode(key_hex)
            .map_err(|e| format!("Invalid key hex: {}", e))?;

        if key_bytes.len() != 32 {
            return Err("Invalid key length".to_string());
        }

        let mut key = [0u8; 32];
        key.copy_from_slice(&key_bytes);

        // 保存到内存
        {
            let mut sessions = self.sessions.write().await;
            sessions.insert(their_pubkey.to_string(), key);
        }

        // 持久化到数据库
        let db_guard = self.db.read().await;
        if let Some(db) = db_guard.as_ref() {
            db.set_cache(
                &format!("nip44_session_{}", their_pubkey),
                key_hex,
                Some(3600 * 24 * 30),
            ).await?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_encrypt_decrypt() {
        let encryption = Nip44Encryption::new();
        let sender = Keys::generate();
        let receiver = Keys::generate();
        let their_pubkey = receiver.public_key().to_hex();
        let plaintext = "Hello, NIP-44!";

        // 加密
        let mut encrypted = encryption.encrypt(plaintext, &their_pubkey, &sender).await.unwrap();
        encrypted.pubkey = sender.public_key().to_hex();

        // 解密
        let decrypted = encryption.decrypt(&encrypted, &receiver).await.unwrap();

        assert_eq!(decrypted, plaintext);
    }

    #[tokio::test]
    async fn test_session_persistence() {
        let encryption = Nip44Encryption::new();
        let their_pubkey = "npub1test2";

        // 创建会话
        let key1 = encryption.get_session_key(their_pubkey).await.unwrap();

        // 再次获取应返回相同密钥
        let key2 = encryption.get_session_key(their_pubkey).await.unwrap();

        assert_eq!(key1, key2);
    }
}
