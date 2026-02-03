// Encrypted storage for private key using master password
// Private key is encrypted with PBKDF2 + AES-GCM before storing to disk

use secrecy::{ExposeSecret, Secret};
use std::sync::RwLock;
use aes_gcm::{Aes256Gcm, Key, Nonce};
use aes_gcm::aead::{Aead, KeyInit};
use pbkdf2::pbkdf2_hmac;
use sha2::Sha256;
use std::path::PathBuf;
use std::fs;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use chrono::{Datelike, Utc};

const PBKDF2_ITERATIONS: u32 = 100_000;
const AES_KEY_SIZE: usize = 32;
const AES_NONCE_SIZE: usize = 12;
const UNLOCK_MAX_ATTEMPTS: u32 = 5;
const UNLOCK_TIME_ROLLBACK_GRACE_SECONDS: i64 = 300;

static CURRENT_PRIVATE_KEY: RwLock<Option<Secret<String>>> = RwLock::new(None);

pub struct SecureStorage;

impl SecureStorage {
    pub fn new() -> Result<Self, String> {
        Ok(Self)
    }

    pub fn save_private_key(&self, _nsec: &str) -> Result<(), String> {
        // No-op: private keys are not persisted to disk
        Ok(())
    }

    pub fn load_private_key(&self) -> Result<Secret<String>, String> {
        // No-op: private keys are not persisted to disk
        Err("Private keys are not persisted".to_string())
    }
}

/// Set the current session's private key in memory
pub fn set_current_private_key(nsec: String) {
    *CURRENT_PRIVATE_KEY.write().unwrap() = Some(Secret::new(nsec));
}

/// Clear the current session's private key from memory
pub fn clear_current_private_key() {
    *CURRENT_PRIVATE_KEY.write().unwrap() = None;
}

/// Get the current session's private key from memory
pub fn get_current_private_key() -> Option<String> {
    CURRENT_PRIVATE_KEY.read().unwrap().as_ref().map(|s| s.expose_secret().clone())
}

use tauri::Manager;
use tauri::AppHandle;

/// Encrypt private key with master password and save to disk
pub fn encrypt_and_save_private_key(app: &AppHandle, nsec: &str, master_password: &str) -> Result<(), String> {
    // Derive key from master password using PBKDF2
    let mut salt = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut salt);

    let mut derived_key = [0u8; AES_KEY_SIZE];
    pbkdf2_hmac::<Sha256>(master_password.as_bytes(), &salt, PBKDF2_ITERATIONS, &mut derived_key);

    // Generate random nonce
    let mut nonce_bytes = [0u8; AES_NONCE_SIZE];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    // Encrypt the private key
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&derived_key));
    let ciphertext = cipher.encrypt(nonce, nsec.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;

    // Combine salt + nonce + ciphertext
    let mut encrypted_data = Vec::new();
    encrypted_data.extend_from_slice(&salt);
    encrypted_data.extend_from_slice(&nonce_bytes);
    encrypted_data.extend_from_slice(&ciphertext);

    // Save to file
    let path = get_encrypted_key_path(app)?;
    fs::write(&path, encrypted_data)
        .map_err(|e| format!("保存加密密钥失败: {}", e))?;

    Ok(())
}

/// Load and decrypt private key using master password
pub fn load_and_decrypt_private_key(app: &AppHandle, master_password: &str) -> Result<String, String> {
    let path = get_encrypted_key_path(app)?;

    if !path.exists() {
        return Err("未找到加密密钥。请先使用私钥登录。".to_string());
    }

    let encrypted_data = fs::read(&path)
        .map_err(|e| format!("读取加密密钥失败: {}", e))?;

    if encrypted_data.len() < 32 + AES_NONCE_SIZE {
        return Err("无效的加密数据格式".to_string());
    }

    // Extract salt, nonce, and ciphertext
    let salt = &encrypted_data[0..32];
    let nonce_bytes = &encrypted_data[32..32 + AES_NONCE_SIZE];
    let ciphertext = &encrypted_data[32 + AES_NONCE_SIZE..];

    // Derive key from master password
    let mut derived_key = [0u8; AES_KEY_SIZE];
    pbkdf2_hmac::<Sha256>(master_password.as_bytes(), salt, PBKDF2_ITERATIONS, &mut derived_key);

    // Decrypt
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&derived_key));
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher.decrypt(nonce, ciphertext)
        .map_err(|_| "密码不正确".to_string())?;

    String::from_utf8(plaintext)
        .map_err(|e| format!("无效的解密数据: {}", e))
}

/// Check if encrypted private key exists
pub fn has_encrypted_key(app: &AppHandle) -> bool {
    get_encrypted_key_path(app).map(|p| p.exists()).unwrap_or(false)
}

/// Delete encrypted private key file
pub fn delete_encrypted_key(app: &AppHandle) -> Result<(), String> {
    let path = get_encrypted_key_path(app)?;
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|e| format!("删除加密密钥失败: {}", e))?;
    }
    Ok(())
}

/// Get path for encrypted key storage
fn get_encrypted_key_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get data directory: {}", e))?;
    
    // Ensure "ostia" subdirectory exists if needed, or just use root
    // Typically app_data_dir ends in package name, so we can use it directly or make a subdir
    // Let's use it directly to be safe on Android
    let final_dir = app_data_dir; // .join("ostia"); 

    if !final_dir.exists() {
        fs::create_dir_all(&final_dir)
            .map_err(|e| format!("创建应用数据目录失败: {}", e))?;
    }

    Ok(final_dir.join("encrypted_key.dat"))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UnlockLockoutState {
    pub date: String,
    pub attempts: u32,
    pub locked: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct UnlockLockoutRecord {
    date: String,
    attempts: u32,
    locked: bool,
    last_seen_ts: Option<i64>,
}

fn get_today_key() -> String {
    let now = Utc::now();
    format!("{:04}-{:02}-{:02}", now.year(), now.month(), now.day())
}

fn get_unlock_lockout_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get data directory: {}", e))?;
    let final_dir = app_data_dir;
    if !final_dir.exists() {
        fs::create_dir_all(&final_dir)
            .map_err(|e| format!("创建应用数据目录失败: {}", e))?;
    }
    Ok(final_dir.join("unlock_lockout.dat"))
}

fn get_unlock_lockout_key_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get data directory: {}", e))?;
    let final_dir = app_data_dir;
    if !final_dir.exists() {
        fs::create_dir_all(&final_dir)
            .map_err(|e| format!("创建应用数据目录失败: {}", e))?;
    }
    Ok(final_dir.join("unlock_lockout.key"))
}

fn get_unlock_lockout_key(app: &AppHandle) -> Result<[u8; 32], String> {
    // Strategy (Simplified by User Request):
    // 1. Try File. If success, use it.
    // 2. If not, Generate New -> File.
    // NOTE: Keyring usage is completely removed for this purpose to avoid environment-specific issues.

    // 1. Try File
    let path = get_unlock_lockout_key_path(app)?;
    if path.exists() {
        // Read carefully
        let bytes = fs::read(&path).map_err(|e| format!("读取解锁密钥失败: {}", e))?;
        if bytes.len() == 32 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&bytes);
            return Ok(key);
        } else {
            println!("Unlock key file corrupted, length: {}", bytes.len());
            return Err(format!("解锁密钥文件损坏 (长度: {})", bytes.len()));
        }
    }

    // 2. Generate New
    let mut key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut key);

    // Ensure directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建密钥目录失败: {}", e))?;
    }

    // Save to file
    fs::write(&path, key).map_err(|e| format!("保存解锁密钥失败: {}", e))?;
    println!("Generated new unlock key at {:?}", path);
    Ok(key)
}

fn encrypt_unlock_lockout_record(key: &[u8; 32], record: &UnlockLockoutRecord) -> Result<Vec<u8>, String> {
    let json = serde_json::to_vec(record).map_err(|e| format!("序列化解锁状态失败: {}", e))?;
    let mut nonce_bytes = [0u8; AES_NONCE_SIZE];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let ciphertext = cipher.encrypt(nonce, json.as_slice())
        .map_err(|e| format!("加密解锁状态失败: {}", e))?;
    let mut data = Vec::new();
    data.extend_from_slice(&nonce_bytes);
    data.extend_from_slice(&ciphertext);
    Ok(data)
}

fn decrypt_unlock_lockout_record(key: &[u8; 32], data: &[u8]) -> Result<UnlockLockoutRecord, String> {
    if data.len() < AES_NONCE_SIZE {
        return Err("解锁状态数据无效".to_string());
    }
    let nonce_bytes = &data[0..AES_NONCE_SIZE];
    let ciphertext = &data[AES_NONCE_SIZE..];
    let nonce = Nonce::from_slice(nonce_bytes);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let plaintext = cipher.decrypt(nonce, ciphertext)
        .map_err(|_| "解锁状态解密失败".to_string())?;
    let record: UnlockLockoutRecord = serde_json::from_slice(&plaintext)
        .map_err(|e| format!("解锁状态解析失败: {}", e))?;
    Ok(record)
}

fn save_unlock_lockout_record(app: &AppHandle, key: &[u8; 32], record: &UnlockLockoutRecord) -> Result<(), String> {
    let data = encrypt_unlock_lockout_record(key, record)?;
    let path = get_unlock_lockout_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建解锁状态目录失败: {}", e))?;
    }
    fs::write(&path, data).map_err(|e| format!("保存解锁状态失败: {}", e))?;
    println!("Saved unlock lockout record: attempts={}", record.attempts);
    Ok(())
}

fn load_unlock_lockout_record(app: &AppHandle) -> Result<UnlockLockoutRecord, String> {
    let now = Utc::now().timestamp();
    let today = get_today_key();
    let key = get_unlock_lockout_key(app)?;
    let path = get_unlock_lockout_path(app)?;
    if !path.exists() {
        // If file doesn't exist, we start fresh (unlocked)
        let record = UnlockLockoutRecord {
            date: today.clone(),
            attempts: 0,
            locked: false,
            last_seen_ts: Some(now),
        };
        println!("Unlock lockout file not found, creating new record: {:?}", record);
        let _ = save_unlock_lockout_record(app, &key, &record);
        return Ok(record);
    }
    let data = fs::read(&path).map_err(|e| format!("读取解锁状态失败: {}", e))?;
    let today_key = today.clone();
    let mut record = match decrypt_unlock_lockout_record(&key, &data) {
        Ok(rec) => rec,
        Err(e) => {
            println!("Decryption failed: {}, locking out", e);
            let record = UnlockLockoutRecord {
                date: today.clone(),
                attempts: UNLOCK_MAX_ATTEMPTS,
                locked: true,
                last_seen_ts: Some(now),
            };
            let _ = save_unlock_lockout_record(app, &key, &record);
            return Ok(record);
        },
    };
    
    let last_seen = record.last_seen_ts.unwrap_or(now);
    println!("Loaded unlock record: attempts={}, locked={}, date={}, today={}", record.attempts, record.locked, record.date, today_key);

    if now + UNLOCK_TIME_ROLLBACK_GRACE_SECONDS < last_seen {
        println!("Time rollback detected! Locking out.");
        record.attempts = UNLOCK_MAX_ATTEMPTS;
        record.locked = true;
        let _ = save_unlock_lockout_record(app, &key, &record);
    } else if record.date != today_key {
        // Date changed
        if !record.locked {
             println!("New day detected, resetting attempts.");
             record.date = today_key;
             record.attempts = 0;
             record.locked = false;
             let _ = save_unlock_lockout_record(app, &key, &record);
        } else {
             // If locked, do we reset on new day? 
             // Logic says: "今日密码尝试已达上限". So yes, new day = new attempts.
             println!("New day detected, resetting locked state.");
             record.date = today_key;
             record.attempts = 0;
             record.locked = false;
             let _ = save_unlock_lockout_record(app, &key, &record);
        }
    }
    
    record.last_seen_ts = Some(now.max(last_seen));
    // We don't save here to avoid excessive writes on just reading, 
    // unless we modified it above.
    Ok(record)
}

pub fn get_unlock_lockout_state(app: &AppHandle) -> Result<UnlockLockoutState, String> {
    let record = load_unlock_lockout_record(app)?;
    Ok(UnlockLockoutState {
        date: record.date,
        attempts: record.attempts,
        locked: record.locked,
    })
}

pub fn record_unlock_failure(app: &AppHandle) -> Result<UnlockLockoutState, String> {
    let now = Utc::now().timestamp();
    // Load first to ensure we have latest state and handle date resets
    let mut record = load_unlock_lockout_record(app)?;
    
    // Increment attempts
    record.attempts = record.attempts.saturating_add(1);
    println!("Recording failure. New attempts: {}/{}", record.attempts, UNLOCK_MAX_ATTEMPTS);
    
    if record.attempts >= UNLOCK_MAX_ATTEMPTS {
        println!("Max attempts reached. Locking out.");
        record.locked = true;
    }
    record.last_seen_ts = Some(now);
    
    let key = get_unlock_lockout_key(app)?;
    save_unlock_lockout_record(app, &key, &record)?;
    
    Ok(UnlockLockoutState {
        date: record.date,
        attempts: record.attempts,
        locked: record.locked,
    })
}

pub fn reset_unlock_lockout(app: &AppHandle) -> Result<(), String> {
    let now = Utc::now().timestamp();
    let record = UnlockLockoutRecord {
        date: get_today_key(),
        attempts: 0,
        locked: false,
        last_seen_ts: Some(now),
    };
    let key = get_unlock_lockout_key(app)?;
    save_unlock_lockout_record(app, &key, &record)?;
    Ok(())
}

pub fn get_stored_key() -> Option<String> {
    get_current_private_key()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_secure_storage_new() {
        // Test that SecureStorage can be created
        let result = SecureStorage::new();
        assert!(result.is_ok(), "SecureStorage::new() should succeed");
    }

    #[test]
    fn test_secret_not_exposed_in_debug() {
        let secret = Secret::new("sensitive_data".to_string());
        let debug_output = format!("{:?}", secret);

        // Secret should not contain the actual value in debug output
        assert!(
            !debug_output.contains("sensitive_data"),
            "Secret should not expose value in debug output"
        );
    }
}
