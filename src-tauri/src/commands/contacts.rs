use serde::{Deserialize, Serialize};
use tauri::{command, State};

use crate::storage::database::ContactRecord;
use crate::AppState;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Contact {
    pub npub: String,
    pub name: Option<String>,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    pub picture: Option<String>,
    pub blocked: bool,
    pub remark: Option<String>,
}

impl From<ContactRecord> for Contact {
    fn from(record: ContactRecord) -> Self {
        Contact {
            npub: record.npub,
            name: record.name,
            display_name: record.display_name,
            picture: record.picture,
            blocked: record.blocked,
            remark: record.remark,
        }
    }
}

#[command]
pub async fn add_contact(
    state: State<'_, AppState>,
    npub: String,
    remark: Option<String>,
) -> Result<Contact, String> {
    // Validate npub format
    if !npub.starts_with("npub1") {
        return Err("Invalid npub format: must start with npub1".to_string());
    }

    let db_guard = state.database.read().await;
    let db = db_guard
        .as_ref()
        .ok_or("Database not initialized")?;

    // Check if contact already exists
    if let Some(mut existing) = db.get_contact(&npub).await? {
        if remark.is_some() {
            db.update_contact_remark(&npub, remark.as_deref()).await?;
            existing.remark = remark.clone();
        }
        return Ok(existing.into());
    }

    // Create new contact record
    let contact_record = ContactRecord {
        npub: npub.clone(),
        name: None,
        display_name: None,
        picture: None,
        blocked: false,
        remark: remark.clone(),
    };

    db.add_contact(&contact_record).await?;
    let _ = state.nostr_service.subscribe_contact_metadata(&npub).await;

    Ok(Contact {
        npub,
        name: None,
        display_name: None,
        picture: None,
        blocked: false,
        remark,
    })
}

#[command]
pub async fn remove_contact(state: State<'_, AppState>, npub: String) -> Result<(), String> {
    let db_guard = state.database.read().await;
    let db = db_guard
        .as_ref()
        .ok_or("Database not initialized")?;

    db.remove_contact(&npub).await?;
    
    // Also clear conversation history
    if let Some(my_npub) = state.nostr_service.get_public_key() {
        let _ = db.delete_conversation(&npub, &my_npub).await;
    }
    
    Ok(())
}

#[command]
pub async fn get_contacts(state: State<'_, AppState>) -> Result<Vec<Contact>, String> {
    let db_guard = state.database.read().await;
    let db = db_guard
        .as_ref()
        .ok_or("Database not initialized")?;

    let records = db.get_contacts().await?;
    let contacts: Vec<Contact> = records.into_iter().map(|r| r.into()).collect();

    Ok(contacts)
}

#[command]
pub async fn resolve_nickname(state: State<'_, AppState>, npub: String) -> Result<Option<String>, String> {
    // Try to fetch profile from Nostr network
    let profile = state.nostr_service.fetch_profile(&npub).await;

    if let Ok(Some(profile_data)) = profile {
        // Update contact in database with fetched profile
        let db_guard = state.database.read().await;
        if let Some(db) = db_guard.as_ref() {
            let _ = db.update_contact_profile(
                &npub,
                profile_data.name.as_deref(),
                profile_data.display_name.as_deref(),
                profile_data.picture.as_deref(),
            ).await;
        }
        let _ = state.nostr_service.subscribe_contact_metadata(&npub).await;

        // Return display_name or name
        return Ok(profile_data.display_name.or(profile_data.name));
    }

    // Fallback: check local database
    let db_guard = state.database.read().await;
    if let Some(db) = db_guard.as_ref() {
        if let Ok(Some(contact)) = db.get_contact(&npub).await {
            return Ok(contact.display_name.or(contact.name));
        }
    }

    Ok(None)
}

#[command]
pub async fn block_contact(
    state: State<'_, AppState>,
    npub: String,
    blocked: bool,
) -> Result<(), String> {
    let db_guard = state.database.read().await;
    let db = db_guard
        .as_ref()
        .ok_or("Database not initialized")?;

    db.update_contact_blocked(&npub, blocked).await?;
    Ok(())
}
#[command]
pub async fn update_contact_remark(
    state: State<'_, AppState>,
    npub: String,
    remark: Option<String>,
) -> Result<(), String> {
    let db_guard = state.database.read().await;
    let db = db_guard
        .as_ref()
        .ok_or("Database not initialized")?;

    db.update_contact_remark(&npub, remark.as_deref()).await?;
    Ok(())
}
