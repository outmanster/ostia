use std::path::PathBuf;

#[tauri::command]
pub async fn get_icon_bytes(icon_name: &str) -> Result<Vec<u8>, String> {
    let icon_path = PathBuf::from("src/assets/icons").join(format!("{}.png", icon_name));

    std::fs::read(&icon_path)
        .map_err(|e| format!("Failed to read icon file {icon_path:?}: {e}"))
}

#[tauri::command]
pub async fn get_windows_icon_bytes() -> Result<serde_json::Value, String> {
    let icon_white = get_icon_bytes("icon_white").await?;
    let icon_dark = get_icon_bytes("icon_dark").await?;

    Ok(serde_json::json!({
        "iconWhite": icon_white,
        "iconDark": icon_dark
    }))
}
