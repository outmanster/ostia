use nostr_sdk::prelude::*;
use serde::{Deserialize, Serialize};
use tauri::command;

use crate::storage::secure::{
    set_current_private_key, clear_current_private_key,
    encrypt_and_save_private_key, load_and_decrypt_private_key,
    has_encrypted_key, delete_encrypted_key,
    get_unlock_lockout_state as load_unlock_lockout_state,
    record_unlock_failure as record_unlock_failure_state,
    reset_unlock_lockout as reset_unlock_lockout_state,
    UnlockLockoutState
};

#[derive(Debug, Serialize, Deserialize)]
pub struct Account {
    pub npub: String,
    pub nsec: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Profile {
    pub npub: String,
    pub name: Option<String>,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    pub about: Option<String>,
    pub picture: Option<String>,
    pub nip05: Option<String>,
}

#[command]
pub async fn generate_account() -> Result<Account, String> {
    println!("Rust: Entering generate_account");
    
    println!("Rust: Testing rand::thread_rng()");
    let mut dummy = [0u8; 32];
    use rand::RngCore;
    rand::thread_rng().fill_bytes(&mut dummy);
    println!("Rust: rand::thread_rng().fill_bytes() successful");

    println!("Rust: Calling Keys::generate()");
    let keys = Keys::generate();
    println!("Rust: Keys::generate() successful");

    println!("Rust: Getting secret key");
    let secret_key = keys.secret_key();
    
    println!("Rust: Encoding secret key to bech32");
    let nsec = secret_key
        .to_bech32()
        .map_err(|e| format!("编码私钥失败: {}", e))?;

    println!("Rust: Encoding public key to bech32");
    let npub = keys
        .public_key()
        .to_bech32()
        .map_err(|e| format!("编码公钥失败: {}", e))?;

    println!("Rust: Returning account with npub: {}", npub);
    Ok(Account { npub, nsec })
}

#[command]
pub async fn import_private_key(nsec: String) -> Result<String, String> {
    // Validate the nsec format
    if !nsec.starts_with("nsec1") {
        return Err("无效的 nsec 格式：必须以 'nsec1' 开头".to_string());
    }

    // Parse and validate the key
    let keys = Keys::parse(&nsec)
        .map_err(|e| format!("无效的私钥: {}", e))?;

    // Return the corresponding npub
    let npub = keys
        .public_key()
        .to_bech32()
        .map_err(|e| format!("编码公钥失败: {}", e))?;

    Ok(npub)
}

#[command]
pub async fn save_private_key(nsec: String) -> Result<(), String> {
    // Validate key before saving
    Keys::parse(&nsec)
        .map_err(|e| format!("无效的私钥: {}", e))?;

    println!("Setting current private key in memory...");
    set_current_private_key(nsec);
    println!("Private key set successfully");
    Ok(())
}

#[command]
pub async fn load_stored_key() -> Result<Option<String>, String> {
    println!("Attempting to load private key from memory...");
    match crate::storage::secure::get_current_private_key() {
        Some(key) => {
            println!("Private key loaded successfully from memory");
            Ok(Some(key))
        },
        None => {
            println!("Private key not found in memory");
            Ok(None)
        }
    }
}

#[command]
pub async fn delete_stored_key() -> Result<(), String> {
    println!("Clearing current private key from memory...");
    clear_current_private_key();
    println!("Private key cleared successfully");
    Ok(())
}

#[command]
pub async fn get_public_key(nsec: String) -> Result<String, String> {
    let keys = Keys::parse(&nsec)
        .map_err(|e| format!("无效的私钥: {}", e))?;

    let npub = keys
        .public_key()
        .to_bech32()
        .map_err(|e| format!("编码公钥失败: {}", e))?;

    Ok(npub)
}

#[command]
pub async fn npub_to_hex(npub: String) -> Result<String, String> {
    let pubkey = PublicKey::from_bech32(&npub)
        .map_err(|e| format!("无效的 npub: {}", e))?;
    Ok(pubkey.to_hex())
}

#[command]
pub async fn has_master_password(app: tauri::AppHandle) -> Result<bool, String> {
    Ok(has_encrypted_key(&app))
}

#[command]
pub async fn save_encrypted_private_key(app: tauri::AppHandle, nsec: String, master_password: String) -> Result<(), String> {
    // Validate the private key first
    Keys::parse(&nsec)
        .map_err(|e| format!("无效的私钥: {}", e))?;

    encrypt_and_save_private_key(&app, &nsec, &master_password)?;
    set_current_private_key(nsec);
    Ok(())
}

#[command]
pub async fn load_decrypted_private_key(app: tauri::AppHandle, master_password: String) -> Result<String, String> {
    let nsec = load_and_decrypt_private_key(&app, &master_password)?;
    set_current_private_key(nsec.clone());
    Ok(nsec)
}

#[command]
pub async fn delete_master_password(app: tauri::AppHandle) -> Result<(), String> {
    // 直接删除加密文件，无需验证密码
    delete_encrypted_key(&app)?;

    // 清除内存中的私钥
    clear_current_private_key();

    Ok(())
}

#[command]
pub async fn get_unlock_lockout_state(app: tauri::AppHandle) -> Result<UnlockLockoutState, String> {
    load_unlock_lockout_state(&app)
}

#[command]
pub async fn record_unlock_failure(app: tauri::AppHandle) -> Result<UnlockLockoutState, String> {
    record_unlock_failure_state(&app)
}

#[command]
pub async fn reset_unlock_lockout(app: tauri::AppHandle) -> Result<(), String> {
    reset_unlock_lockout_state(&app)
}

#[command]
pub async fn publish_identity(
    state: tauri::State<'_, crate::AppState>,
    name: String,
    display_name: Option<String>,
    about: Option<String>,
    picture: Option<String>,
    nip05: Option<String>,
) -> Result<String, String> {
    let profile = crate::nostr::service::ProfileData {
        name: Some(name),
        display_name,
        about,
        picture,
        nip05,
        banner: None, // Added missing field
        website: None, // Added missing field
    };

    let event_id = state.nostr_service
        .set_metadata(profile)
        .await
        .map_err(|e| e.to_string())?;

    Ok(event_id.to_hex())
}

#[command]
pub async fn fetch_profile(
    state: tauri::State<'_, crate::AppState>,
    npub: String,
) -> Result<Profile, String> {
    let profile_data = state.nostr_service
        .fetch_profile(&npub)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("未找到该用户的资料".to_string())?;

    Ok(Profile {
        npub,
        name: profile_data.name,
        display_name: profile_data.display_name,
        about: profile_data.about,
        picture: profile_data.picture,
        nip05: profile_data.nip05,
    })
}
