use std::path::PathBuf;

pub fn get_app_data_dir(app_name: &str) -> Option<PathBuf> {
    dirs::data_dir().map(|p| p.join(app_name))
}

pub fn get_app_cache_dir(app_name: &str) -> Option<PathBuf> {
    dirs::cache_dir().map(|p| p.join(app_name))
}

pub fn get_database_path(app_name: &str) -> Option<PathBuf> {
    get_app_data_dir(app_name).map(|p| p.join("ostia.db"))
}

#[cfg(target_os = "windows")]
pub fn get_platform_name() -> &'static str {
    "windows"
}

#[cfg(target_os = "macos")]
pub fn get_platform_name() -> &'static str {
    "macos"
}

#[cfg(target_os = "linux")]
pub fn get_platform_name() -> &'static str {
    "linux"
}

#[cfg(target_os = "android")]
pub fn get_platform_name() -> &'static str {
    "android"
}

#[cfg(target_os = "ios")]
pub fn get_platform_name() -> &'static str {
    "ios"
}

#[cfg(not(any(
    target_os = "windows",
    target_os = "macos",
    target_os = "linux",
    target_os = "android",
    target_os = "ios"
)))]
pub fn get_platform_name() -> &'static str {
    "unknown"
}
