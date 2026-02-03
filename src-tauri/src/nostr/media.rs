use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use rand::RngCore;
use image::{ImageFormat, imageops::FilterType, GenericImageView};
use std::io::Cursor;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::fs;

const NONCE_SIZE: usize = 12;
const MAX_IMAGE_SIZE: usize = 2048; // Max dimension in pixels
const MAX_FILE_SIZE: usize = 25 * 1024 * 1024; // 25MB

/// Media uploader with encryption and compression
pub struct MediaUploader {
    blossom_server: Option<String>,
    blossom_token: Option<String>,
    blossom_servers: Vec<String>,
    cache_dir: Option<PathBuf>,
}

impl MediaUploader {
    pub fn new() -> Self {
        Self {
            blossom_server: None,
            blossom_token: None,
            blossom_servers: Vec::new(),
            cache_dir: None,
        }
    }

    pub fn set_cache_dir(&mut self, path: PathBuf) {
        self.cache_dir = Some(path);
    }

    pub fn set_blossom_server(&mut self, server: String) {
        let server = server.trim().trim_end_matches('/').to_string();
        if !server.is_empty() {
            self.blossom_server = Some(server);
        } else {
            self.blossom_server = None;
        }
    }

    pub fn set_blossom_token(&mut self, token: String) {
        let token = token.trim().to_string();
        if !token.is_empty() {
            self.blossom_token = Some(token);
        } else {
            self.blossom_token = None;
        }
    }

    pub fn get_blossom_server(&self) -> Option<String> {
        self.blossom_server.clone()
    }

    pub fn get_blossom_token(&self) -> Option<String> {
        self.blossom_token.clone()
    }

    /// Generate a unique cache filename from URL (SHA256 hash)
    fn get_cache_path(&self, url: &str) -> Option<PathBuf> {
        let dir = self.cache_dir.as_ref()?;
        
        let mut hasher = Sha256::new();
        hasher.update(url.as_bytes());
        let hash = hex::encode(hasher.finalize());
        
        // Use .enc extension since we cache encrypted blobs
        Some(dir.join(format!("{}.enc", hash)))
    }

    /// Write data to local cache
    fn write_to_cache(&self, url: &str, data: &[u8]) {
        if let Some(path) = self.get_cache_path(url) {
            if let Err(e) = fs::write(&path, data) {
                log::warn!("Cache write failed for {}: {}", url, e);
            } else {
                log::info!("Cached image to {:?}", path);
            }
        }
    }

    /// Read data from local cache
    fn read_from_cache(&self, url: &str) -> Option<Vec<u8>> {
        let path = self.get_cache_path(url)?;
        if path.exists() {
            match fs::read(&path) {
                Ok(data) => {
                    log::info!("Cache hit for {}", url);
                    Some(data)
                }
                Err(e) => {
                    log::warn!("Cache read failed for {}: {}", url, e);
                    None
                }
            }
        } else {
            None
        }
    }

    /// Delete file from local cache
    pub fn delete_from_cache(&self, full_url: &str) {
        // Parse URL part if it has fragments
        let parts: Vec<&str> = full_url.split('#').collect();
        let url = parts[0];

        if let Some(path) = self.get_cache_path(url) {
            if path.exists() {
                if let Err(e) = fs::remove_file(&path) {
                    log::warn!("Failed to delete cache file {:?}: {}", path, e);
                } else {
                    log::info!("Deleted cache file {:?}", path);
                }
            }
        }
    }

    /// Compress image to WebP format with max dimension
    pub fn compress_image(&self, image_data: &[u8]) -> Result<Vec<u8>, String> {
        let img = image::load_from_memory(image_data)
            .map_err(|e| format!("Failed to load image: {}", e))?;

        // Calculate new dimensions maintaining aspect ratio
        let (width, height) = img.dimensions();
        let max_size = MAX_IMAGE_SIZE as u32;
        let (new_width, new_height) = if width > height {
            if width > max_size {
                let ratio = max_size as f32 / width as f32;
                (max_size, (height as f32 * ratio) as u32)
            } else {
                (width, height)
            }
        } else {
            if height > max_size {
                let ratio = max_size as f32 / height as f32;
                ((width as f32 * ratio) as u32, max_size)
            } else {
                (width, height)
            }
        };

        // Resize and convert to WebP
        let resized = img.resize(new_width, new_height, FilterType::Lanczos3);
        let mut buffer = Cursor::new(Vec::new());
        resized
            .write_to(&mut buffer, ImageFormat::WebP)
            .map_err(|e| format!("Failed to encode WebP: {}", e))?;

        let compressed = buffer.into_inner();

        // Check file size limit
        if compressed.len() > MAX_FILE_SIZE {
            return Err(format!("Image too large after compression: {} bytes", compressed.len()));
        }

        log::info!("Compressed image: {}x{} -> {} bytes", width, height, compressed.len());
        Ok(compressed)
    }

    /// Encrypt data with AES-256-GCM
    /// Returns (encrypted_data, key_hex, nonce_hex)
    pub fn encrypt_data(&self, data: &[u8]) -> Result<(Vec<u8>, String, String), String> {
        // Generate random key
        let mut key = [0u8; 32];
        OsRng.fill_bytes(&mut key);

        // Generate random nonce
        let mut nonce_bytes = [0u8; NONCE_SIZE];
        OsRng.fill_bytes(&mut nonce_bytes);

        // Create cipher and encrypt
        let cipher = Aes256Gcm::new_from_slice(&key)
            .map_err(|e| format!("Failed to create cipher: {}", e))?;
        let nonce = Nonce::from_slice(&nonce_bytes);

        let encrypted = cipher
            .encrypt(nonce, data)
            .map_err(|e| format!("Encryption failed: {}", e))?;

        let result = encrypted;

        let key_hex = hex::encode(key);
        let nonce_hex = hex::encode(nonce_bytes);

        Ok((result, key_hex, nonce_hex))
    }

    /// Decrypt data with AES-256-GCM
    pub fn decrypt_data(&self, encrypted: &[u8], key_hex: &str, nonce_hex: &str) -> Result<Vec<u8>, String> {
        let key = hex::decode(key_hex)
            .map_err(|e| format!("Invalid key: {}", e))?;

        let nonce_bytes = hex::decode(nonce_hex)
            .map_err(|e| format!("Invalid nonce: {}", e))?;

        let cipher = Aes256Gcm::new_from_slice(&key)
            .map_err(|e| format!("Failed to create cipher: {}", e))?;
        let nonce = Nonce::from_slice(&nonce_bytes);

        cipher
            .decrypt(nonce, encrypted)
            .map_err(|e| format!("Decryption failed: {}", e))
    }

    /// Upload encrypted data to Blossom server
    async fn upload_to_blossom(
        &self, 
        data: Vec<u8>, 
        signer: Option<&impl nostr_sdk::NostrSigner>
    ) -> Result<String, String> {
        let mut errors = Vec::new();

        // Prepare server list: custom server (if any) + default servers
        let mut servers = self.blossom_servers.clone();
        if let Some(s) = &self.blossom_server {
            servers.insert(0, s.clone());
        }
        
        // No hardcoded localhost fallback - use only configured servers

        for server in servers {
            // Normalize protocol (v6): Blossom/NIP-96 are HTTP-based
            let server_url = server.replace("ws://", "http://").replace("wss://", "https://");
            
            let client = reqwest::Client::new();
            log::info!("Media (v6): Attempting Blossom upload to: {}", server_url);
            
            // Calculate hash (SHA256) first
            let hash = Sha256::digest(&data);
            let hash_hex = hex::encode(hash);

            // Blossom BUD-01 specifies PUT /<sha256>
            // This is the most compatible way to upload a specific blob
            let api_url = format!("{}/{}", server_url, hash_hex);

            let mut request = client.put(&api_url)
                .body(data.clone())
                .header("Content-Type", "application/octet-stream");
            
            // Add static token-based authentication if configured
            // Prioritize token if this is the configured server
            let is_custom_server = self.blossom_server.as_ref().map_or(false, |s| s == &server);
            let mut auth_handled = false;

            if is_custom_server {
                if let Some(token) = &self.blossom_token {
                    let auth_value = if token.to_lowercase().starts_with("bearer ") {
                        token.clone()
                    } else {
                        format!("Bearer {}", token)
                    };
                    request = request.header("Authorization", auth_value);
                    auth_handled = true;
                }
            }
            
            if !auth_handled {
                if let Some(s) = signer {
                    let auth_manager = crate::nostr::auth::HttpAuthManager::new();
                    // Blossom uses specific Kind 24242 and "t" tag for auth
                    match auth_manager.generate_blossom_auth_header(&api_url, "upload", Some(&hash_hex), s).await {
                        Ok(header) => {
                            request = request.header("Authorization", header.authorization);
                        }
                        Err(e) => {
                            errors.push(format!("{}: Auth error - {}", server, e));
                            continue;
                        }
                    }
                }
            }

            match request.send().await {
                Ok(resp) => {
                    let status = resp.status();
                    let text = resp.text().await.unwrap_or_default();
                    
                    if status.is_success() {
                        log::info!("Blossom success {}: {}", server, text);
                        
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                            // 1. Direct URL field
                            if let Some(url) = json.get("url").and_then(|v| v.as_str()) {
                                return Ok(url.to_string());
                            }
                            
                            // 2. Blob descriptor (Event)
                            if let Some(sha256) = json.get("sha256").and_then(|v| v.as_str()) {
                                // Construct URL if sha256 is present
                                return Ok(format!("{}/{}", server_url, sha256));
                            }
                        }
                        errors.push(format!("{}: No URL in response", server));
                    } else {
                        errors.push(format!("{}: Status {} - {}", server, status, text));
                    }
                }
                Err(e) => errors.push(format!("{}: Network - {}", server, e)),
            }
        }

        Err(format!("Blossom upload failed:\n{}", errors.join("\n")))
    }

    /// Main upload method: compress -> encrypt -> upload
    pub async fn upload_image(
        &self,
        image_data: &[u8],
        filename: &str,
        signer: Option<&impl nostr_sdk::NostrSigner>,
    ) -> Result<(String, String, String), String> {
        // Enforce user configuration
        if let Some(ref server) = self.blossom_server {
            log::info!("Media (v9): Active media server is: {}", server);
        } else {
            return Err("未配置媒体服务器，请在设置中添加 Blossom 服务器".to_string());
        }
        log::info!("Starting image upload (v9) for: {}", filename);

        // Step 1: Compress image
        let compressed = self.compress_image(image_data)?;

        // Step 2: Encrypt data
        let (encrypted, key_hex, nonce_hex) = self.encrypt_data(&compressed)?;

        // Step 3: Upload to server
        // Only use configured Blossom server. No fallbacks to hardcoded lists.
        let url = self.upload_to_blossom(encrypted.clone(), signer).await
            .map_err(|e| format!("上传失败: {}", e))?;

        log::info!("Image uploaded successfully: {}", url);

        // Cache the LOCAL encrypted blob immediately
        // We use the uploaded URL as the key
        self.write_to_cache(&url, &encrypted);

        // Return URL with key and nonce as fragment
        // Format: url#key=xxx&nonce=xxx
        let full_url = format!("{}#key={}&nonce={}", url, key_hex, nonce_hex);

        Ok((full_url, key_hex, nonce_hex))
    }

    /// Download and decrypt image from URL
    pub async fn download_image(&self, full_url: &str) -> Result<Vec<u8>, String> {
        // Parse URL and fragment
        let parts: Vec<&str> = full_url.split('#').collect();
        if parts.len() != 2 {
            return Err("Invalid URL format".to_string());
        }

        let url = parts[0];
        let fragment = parts[1];

        // Parse fragment (key=xxx&nonce=xxx)
        let mut key = None;
        let mut nonce = None;

        for param in fragment.split('&') {
            let kv: Vec<&str> = param.split('=').collect();
            if kv.len() == 2 {
                match kv[0] {
                    "key" => key = Some(kv[1]),
                    "nonce" => nonce = Some(kv[1]),
                    _ => {}
                }
            }
        }

        let key = key.ok_or("Missing key in URL fragment")?;
        let nonce = nonce.ok_or("Missing nonce in URL fragment")?;

        // 1. Try to read from cache first
        let encrypted = if let Some(cached_data) = self.read_from_cache(url) {
            cached_data
        } else {
            // 2. If not in cache, download from network
            log::info!("Downloading encrypted image: {}", url);
            let client = reqwest::Client::new();
            let response = client
                .get(url)
                .send()
                .await
                .map_err(|e| format!("Download failed: {}", e))?;

            if !response.status().is_success() {
                let err_msg = format!("Download failed with status: {} at {}", response.status(), url);
                log::error!("{}", err_msg);
                return Err(err_msg);
            }

            let data = response.bytes().await
                .map_err(|e| format!("Failed to read response: {}", e))?
                .to_vec();

            // 3. Write to cache for future use
            self.write_to_cache(url, &data);
            
            data
        };

        // Decrypt
        let decrypted = self.decrypt_data(&encrypted, key, nonce)?;

        Ok(decrypted)
    }
}

impl Default for MediaUploader {
    fn default() -> Self {
        Self::new()
    }
}
