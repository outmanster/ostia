use tauri::{Runtime, Window};

#[cfg(windows)]
mod win_impl {
    use windows_sys::Win32::{
        Foundation::{HWND, ERROR_SUCCESS},
        UI::WindowsAndMessaging::{
            SendMessageW, ICON_BIG, ICON_SMALL, WM_SETICON,
            CreateIconIndirect, ICONINFO
        },
        Graphics::Gdi::{CreateBitmap, DeleteObject, HBITMAP},
        System::Registry::{
            RegOpenKeyExW, RegQueryValueExW, HKEY_CURRENT_USER, KEY_READ, RegCloseKey
        }
    };

    pub unsafe fn get_theme_registry_value(name: &str) -> Option<u32> {
        let subkey = "Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize\0"
            .encode_utf16()
            .collect::<Vec<u16>>();
        let value_name = format!("{}\0", name)
            .encode_utf16()
            .collect::<Vec<u16>>();
        
        let mut hkey = std::ptr::null_mut();
        if RegOpenKeyExW(HKEY_CURRENT_USER, subkey.as_ptr(), 0, KEY_READ, &mut hkey) != ERROR_SUCCESS {
            return None;
        }

        let mut value = 0u32;
        let mut size = std::mem::size_of::<u32>() as u32;
        let status = RegQueryValueExW(
            hkey,
            value_name.as_ptr(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            &mut value as *mut _ as *mut u8,
            &mut size,
        );

        RegCloseKey(hkey);

        if status == ERROR_SUCCESS {
            Some(value)
        } else {
            None
        }
    }

    pub unsafe fn set_icon_from_pixels(hwnd: HWND, pixels: &[u8], width: u32, height: u32, is_big: bool) -> Result<(), String> {
        // GDI CreateBitmap for 32bpp expects BGRA format, but rust-image gives RGBA.
        let mut bgra_pixels = pixels.to_vec();
        for i in (0..bgra_pixels.len()).step_by(4) {
            let r = bgra_pixels[i];
            let b = bgra_pixels[i + 2];
            bgra_pixels[i] = b;
            bgra_pixels[i + 2] = r;
        }

        // Create the XOR bitmap (color)
        let hbm_color = CreateBitmap(width as i32, height as i32, 1, 32, bgra_pixels.as_ptr() as *const _);
        if hbm_color == std::ptr::null_mut() {
            return Err("Failed to create color bitmap".to_string());
        }

        // Create the AND bitmap (mask) - all zeros means use alpha channel of XOR bitmap
        let mask_count = (width * height / 8) + 64; // Extra padding
        let mask_bytes = vec![0u8; mask_count as usize];
        let hbm_mask = CreateBitmap(width as i32, height as i32, 1, 1, mask_bytes.as_ptr() as *const _);
        if hbm_mask == std::ptr::null_mut() {
            DeleteObject(hbm_color);
            return Err("Failed to create mask bitmap".to_string());
        }
        
        let icon_info = ICONINFO {
            fIcon: 1, // TRUE for icon
            xHotspot: 0,
            yHotspot: 0,
            hbmMask: hbm_mask as HBITMAP,
            hbmColor: hbm_color as HBITMAP,
        };

        let hicon = CreateIconIndirect(&icon_info);
        
        // Cleanup bitmaps (CreateIconIndirect copies them)
        DeleteObject(hbm_color);
        DeleteObject(hbm_mask);

        if hicon == std::ptr::null_mut() {
            return Err("Failed to create HICON".to_string());
        }

        // SendMessageW expects LPARAM (isize) for the last argument.
        SendMessageW(hwnd, WM_SETICON, (if is_big { ICON_BIG } else { ICON_SMALL }) as usize, hicon as isize);
        Ok(())
    }
}

#[tauri::command]
pub async fn get_windows_theme_settings() -> Result<serde_json::Value, String> {
    #[cfg(windows)]
    {
        unsafe {
            let system_light = win_impl::get_theme_registry_value("SystemUsesLightTheme").unwrap_or(0);
            let apps_light = win_impl::get_theme_registry_value("AppsUseLightTheme").unwrap_or(0);
            
            Ok(serde_json::json!({
                "system": if system_light == 1 { "light" } else { "dark" },
                "apps": if apps_light == 1 { "light" } else { "dark" }
            }))
        }
    }
    #[cfg(not(windows))]
    Ok(serde_json::json!({ "system": "unknown", "apps": "unknown" }))
}

#[tauri::command]
pub async fn set_windows_icons<R: Runtime>(
    window: Window<R>,
    taskbar_icon: Vec<u8>,
    window_icon: Vec<u8>,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        use image::GenericImageView;
        use windows_sys::Win32::Foundation::HWND;

        let hwnd = window.hwnd().map_err(|_| "Failed to get HWND")?.0 as HWND;
        
        let process_icon = |bytes: Vec<u8>, is_big: bool| -> Result<(), String> {
            let img = image::load_from_memory(&bytes)
                .map_err(|e| format!("Failed to load image: {}", e))?;
            
            // Standard Windows icon sizes to prevent jagged edges from OS-level nearest-neighbor scaling
            let (target_w, target_h) = if is_big { (48, 48) } else { (16, 16) };
            
            let img = img.resize_exact(target_w, target_h, image::imageops::FilterType::Lanczos3);
            let (width, height) = img.dimensions();
            let rgba = img.to_rgba8();
            unsafe {
                win_impl::set_icon_from_pixels(hwnd, rgba.as_raw(), width, height, is_big)
            }
        };

        process_icon(taskbar_icon, true)?;
        process_icon(window_icon, false)?;
    }

    Ok(())
}
