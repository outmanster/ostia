use sqlx::{sqlite::SqlitePool, Row};
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContactRecord {
    pub npub: String,
    pub name: Option<String>,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    pub picture: Option<String>,
    pub blocked: bool,
    pub remark: Option<String>,
}

/// Message record for database storage
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageRecord {
    pub id: String,
    pub sender: String,
    pub receiver: String,
    pub content: String,
    pub timestamp: i64,
    pub status: String,
    #[serde(rename = "messageType")]
    pub message_type: String,
    #[serde(rename = "mediaUrl")]
    pub media_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSession {
    pub contact: ContactRecord,
    pub last_message: String,
    pub last_timestamp: i64,
    pub unread_count: i32,
    #[serde(rename = "lastMessageType")]
    pub last_message_type: Option<String>,
}

pub struct Database {
    pool: SqlitePool,
}

impl Database {
    pub async fn new(path: &str) -> Result<Self, String> {
        let pool = SqlitePool::connect(path)
            .await
            .map_err(|e| format!("Failed to connect to database: {}", e))?;

        Ok(Self { pool })
    }

    pub async fn initialize(&self) -> Result<(), String> {
        // Create messages table with all columns
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                sender TEXT NOT NULL,
                receiver TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'sent',
                message_type TEXT NOT NULL DEFAULT 'text',
                media_url TEXT,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
            )
            "#,
        )
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to create messages table: {}", e))?;

        // Create indexes for messages
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender)")
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to create index: {}", e))?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver)")
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to create index: {}", e))?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)")
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to create index: {}", e))?;

        // Create contacts table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS contacts (
                npub TEXT PRIMARY KEY,
                name TEXT,
                display_name TEXT,
                picture TEXT,
                blocked INTEGER NOT NULL DEFAULT 0,
                remark TEXT,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
            )
            "#,
        )
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to create contacts table: {}", e))?;

        // Add remark column if it doesn't exist (for existing databases)
        let _ = sqlx::query("ALTER TABLE contacts ADD COLUMN remark TEXT")
            .execute(&self.pool)
            .await;

        // Create cache table
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS cache (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                expires_at INTEGER
            )
            "#,
        )
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to create cache table: {}", e))?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS deleted_events (
                id TEXT PRIMARY KEY,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
            )
            "#,
        )
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to create deleted_events table: {}", e))?;

        // Create FTS5 virtual table for messages
        // We use contentless-delete (or external content) if we wanted to save space, 
        // but for simplicity we'll just store the content in FTS5 too.
        sqlx::query(
            "CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(id UNINDEXED, content)"
        )
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to create messages_fts table: {}", e))?;

        // Triggers to keep FTS in sync
        sqlx::query(
            r#"
            CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
                INSERT INTO messages_fts(id, content) VALUES (new.id, new.content);
            END;
            "#
        )
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to create trigger messages_ai: {}", e))?;

        sqlx::query(
            r#"
            CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
                DELETE FROM messages_fts WHERE id = old.id;
            END;
            "#
        )
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to create trigger messages_ad: {}", e))?;

        sqlx::query(
            r#"
            CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE OF content ON messages BEGIN
                UPDATE messages_fts SET content = new.content WHERE id = old.id;
            END;
            "#
        )
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to create trigger messages_au: {}", e))?;

        // Historical data sync: Insert messages that are not in FTS yet
        sqlx::query(
            r#"
            INSERT INTO messages_fts(id, content)
            SELECT id, content FROM messages
            WHERE id NOT IN (SELECT id FROM messages_fts)
            "#
        )
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to sync historical messages to FTS: {}", e))?;

        // Migration: Add missing columns to messages table if they don't exist
        // SQLite doesn't have IF NOT EXISTS for ALTER TABLE, so we check pragma
        let columns: Vec<String> = sqlx::query_scalar("SELECT name FROM pragma_table_info('messages')")
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to get table info: {}", e))?;

        if !columns.contains(&"message_type".to_string()) {
            sqlx::query("ALTER TABLE messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'text'")
                .execute(&self.pool)
                .await
                .map_err(|e| format!("Failed to add message_type column: {}", e))?;
        }

        if !columns.contains(&"media_url".to_string()) {
            sqlx::query("ALTER TABLE messages ADD COLUMN media_url TEXT")
                .execute(&self.pool)
                .await
                .map_err(|e| format!("Failed to add media_url column: {}", e))?;
        }

        Ok(())
    }

    pub async fn message_exists(&self, id: &str) -> Result<bool, String> {
        let row = sqlx::query("SELECT COUNT(*) as count FROM messages WHERE id = ?")
            .bind(id)
            .fetch_one(&self.pool)
            .await
            .map_err(|e| format!("Failed to check message: {}", e))?;

        let count: i64 = row.get("count");
        Ok(count > 0)
    }

    pub async fn export_to_file(&self, path: &str) -> Result<(), String> {
        // Remove existing file if it exists, because VACUUM INTO fails if file exists
        if std::path::Path::new(path).exists() {
             std::fs::remove_file(path).map_err(|e| format!("Failed to remove existing backup file: {}", e))?;
        }

        // Use VACUUM INTO to create a consistent backup
        sqlx::query(&format!("VACUUM INTO '{}'", path))
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to backup database: {}", e))?;
        Ok(())
    }

    pub async fn import_from_file(&self, path: &str) -> Result<(), String> {
        // Verify the file exists
        if !std::path::Path::new(path).exists() {
            return Err("Backup file not found".to_string());
        }

        let mut tx = self.pool.begin().await.map_err(|e| format!("Failed to start transaction: {}", e))?;

        // Attach the backup database
        let safe_path = path.replace("'", "''");
        sqlx::query(&format!("ATTACH DATABASE '{}' AS backup_db", safe_path))
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Failed to attach backup database: {}", e))?;

        // Tables to restore
        let tables = vec!["contacts", "messages", "cache", "deleted_events"];

        for table in tables {
            // Clear current table
            if let Err(e) = sqlx::query(&format!("DELETE FROM {}", table)).execute(&mut *tx).await {
                 let _ = sqlx::query("DETACH DATABASE backup_db").execute(&mut *tx).await;
                 return Err(format!("Failed to clear {}: {}", table, e));
            }

            // Copy from backup
            // We use INSERT INTO ... SELECT * FROM ...
            if let Err(e) = sqlx::query(&format!("INSERT INTO main.{} SELECT * FROM backup_db.{}", table, table)).execute(&mut *tx).await {
                 let _ = sqlx::query("DETACH DATABASE backup_db").execute(&mut *tx).await;
                 return Err(format!("Failed to restore {}: {}", table, e));
            }
        }
            
        // Detach
        sqlx::query("DETACH DATABASE backup_db")
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Failed to detach backup database: {}", e))?;

        tx.commit().await.map_err(|e| format!("Failed to commit transaction: {}", e))?;

        Ok(())
    }

    pub async fn deleted_event_exists(&self, id: &str) -> Result<bool, String> {
        let row = sqlx::query("SELECT COUNT(*) as count FROM deleted_events WHERE id = ?")
            .bind(id)
            .fetch_one(&self.pool)
            .await
            .map_err(|e| format!("Failed to check deleted event: {}", e))?;

        let count: i64 = row.get("count");
        Ok(count > 0)
    }

    pub async fn add_deleted_event(&self, id: &str) -> Result<(), String> {
        sqlx::query("INSERT OR IGNORE INTO deleted_events (id) VALUES (?)")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to add deleted event: {}", e))?;

        Ok(())
    }

    // =====================
    // Message operations
    // =====================

    pub async fn save_message(&self, message: &MessageRecord) -> Result<bool, String> {
        // Check if message already exists OR was explicitly deleted
        if self.message_exists(&message.id).await? || self.deleted_event_exists(&message.id).await? {
            return Ok(false);
        }

        log::debug!("Database save_message - id: {}, type: {}, media_url: {:?}", message.id, message.message_type, message.media_url);
        log::debug!("Database save_message - FULL media_url string: '{}'", message.media_url.clone().unwrap_or_default());
        log::debug!("Database save_message - media_url length: {}", message.media_url.clone().unwrap_or_default().len());
        log::debug!("Database save_message - media_url contains '#': {}", message.media_url.clone().unwrap_or_default().contains('#'));

        sqlx::query(
            r#"
            INSERT OR REPLACE INTO messages
            (id, sender, receiver, content, timestamp, status, message_type, media_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&message.id)
        .bind(&message.sender)
        .bind(&message.receiver)
        .bind(&message.content)
        .bind(message.timestamp)
        .bind(&message.status)
        .bind(&message.message_type)
        .bind(&message.media_url)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to save message: {}", e))?;

        Ok(true)
    }

    pub async fn get_messages(
        &self,
        contact_npub: &str,
        my_npub: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<MessageRecord>, String> {
        let rows = sqlx::query(
            r#"
            SELECT id, sender, receiver, content, timestamp, status,
                   COALESCE(message_type, 'text') as message_type, media_url
            FROM messages
            WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?)
            ORDER BY timestamp DESC, id DESC
            LIMIT ? OFFSET ?
            "#,
        )
        .bind(contact_npub)
        .bind(my_npub)
        .bind(my_npub)
        .bind(contact_npub)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to get messages: {}", e))?;

        let mut messages: Vec<MessageRecord> = rows
            .iter()
            .map(|row| MessageRecord {
                id: row.get("id"),
                sender: row.get("sender"),
                receiver: row.get("receiver"),
                content: row.get("content"),
                timestamp: row.get("timestamp"),
                status: row.get("status"),
                message_type: row.get("message_type"),
                media_url: row.get("media_url"),
            })
            .collect();

        // Reverse to return in chronological order (oldest to newest)
        // because frontend expects them that way, but we queried newest first
        // to support pagination from the bottom.
        messages.reverse();

        // Debug log for image messages
        for msg in &messages {
            if msg.message_type == "image" {
                log::debug!("Database get_messages - id: {}, media_url: {:?}", msg.id, msg.media_url);
                if let Some(ref url) = msg.media_url {
                    log::debug!("Database get_messages - FULL media_url string: '{}'", url);
                    log::debug!("Database get_messages - media_url length: {}", url.len());
                    log::debug!("Database get_messages - media_url contains '#': {}", url.contains('#'));
                    log::debug!("Database get_messages - media_url fragment parts: {:?}", url.split('#').collect::<Vec<_>>());
                }
            }
        }

        Ok(messages)
    }

    pub async fn update_message_status(&self, id: &str, status: &str) -> Result<(), String> {
        sqlx::query("UPDATE messages SET status = ? WHERE id = ?")
            .bind(status)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to update message status: {}", e))?;

        Ok(())
    }

    pub async fn mark_all_messages_read(&self, contact_npub: &str, my_npub: &str) -> Result<Vec<String>, String> {
        // 1. Get all unread message IDs for this contact
        let rows = sqlx::query(
            "SELECT id FROM messages WHERE sender = ? AND receiver = ? AND status != 'read'"
        )
        .bind(contact_npub)
        .bind(my_npub)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to get unread messages: {}", e))?;

        let ids: Vec<String> = rows.iter().map(|r| r.get("id")).collect();

        if ids.is_empty() {
            return Ok(vec![]);
        }

        // 2. Update all to read
        sqlx::query(
            "UPDATE messages SET status = 'read' WHERE sender = ? AND receiver = ? AND status != 'read'"
        )
        .bind(contact_npub)
        .bind(my_npub)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to mark all messages as read: {}", e))?;

        Ok(ids)
    }

    pub async fn delete_message(&self, id: &str) -> Result<(), String> {
        // Record as deleted event to prevent re-sync
        let _ = self.add_deleted_event(id).await;

        sqlx::query("DELETE FROM messages WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to delete message: {}", e))?;

        Ok(())
    }

    pub async fn delete_conversation(&self, contact_npub: &str, my_npub: &str) -> Result<(), String> {
        // First, record all message IDs to be deleted into deleted_events
        sqlx::query(
            r#"
            INSERT OR IGNORE INTO deleted_events (id)
            SELECT id FROM messages
            WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?)
            "#,
        )
        .bind(contact_npub)
        .bind(my_npub)
        .bind(my_npub)
        .bind(contact_npub)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to record deleted conversation events: {}", e))?;

        // Then delete the messages
        sqlx::query(
            r#"
            DELETE FROM messages
            WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?)
            "#,
        )
        .bind(contact_npub)
        .bind(my_npub)
        .bind(my_npub)
        .bind(contact_npub)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to delete conversation: {}", e))?;

        Ok(())
    }

    pub async fn get_latest_message(
        &self,
        contact_npub: &str,
        my_npub: &str,
    ) -> Result<Option<MessageRecord>, String> {
        let row = sqlx::query(
            r#"
            SELECT id, sender, receiver, content, timestamp, status,
                   COALESCE(message_type, 'text') as message_type, media_url
            FROM messages
            WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?)
            ORDER BY timestamp DESC
            LIMIT 1
            "#,
        )
        .bind(contact_npub)
        .bind(my_npub)
        .bind(my_npub)
        .bind(contact_npub)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("Failed to get latest message: {}", e))?;

        Ok(row.map(|r| MessageRecord {
            id: r.get("id"),
            sender: r.get("sender"),
            receiver: r.get("receiver"),
            content: r.get("content"),
            timestamp: r.get("timestamp"),
            status: r.get("status"),
            message_type: r.get("message_type"),
            media_url: r.get("media_url"),
        }))
    }

    pub async fn get_message_by_id(&self, id: &str) -> Result<Option<MessageRecord>, String> {
        let row = sqlx::query(
            r#"
            SELECT id, sender, receiver, content, timestamp, status,
                   COALESCE(message_type, 'text') as message_type, media_url
            FROM messages
            WHERE id = ?
            "#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("Failed to get message by id: {}", e))?;

        Ok(row.map(|r| MessageRecord {
            id: r.get("id"),
            sender: r.get("sender"),
            receiver: r.get("receiver"),
            content: r.get("content"),
            timestamp: r.get("timestamp"),
            status: r.get("status"),
            message_type: r.get("message_type"),
            media_url: r.get("media_url"),
        }))
    }

    // =====================
    // Contact operations
    // =====================

    pub async fn add_contact(&self, contact: &ContactRecord) -> Result<(), String> {
        sqlx::query(
            r#"
            INSERT OR REPLACE INTO contacts (npub, name, display_name, picture, blocked, remark)
            VALUES (?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&contact.npub)
        .bind(&contact.name)
        .bind(&contact.display_name)
        .bind(&contact.picture)
        .bind(contact.blocked as i32)
        .bind(&contact.remark)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to add contact: {}", e))?;

        Ok(())
    }

    pub async fn remove_contact(&self, npub: &str) -> Result<(), String> {
        sqlx::query("DELETE FROM contacts WHERE npub = ?")
            .bind(npub)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to remove contact: {}", e))?;

        Ok(())
    }

    pub async fn get_contacts(&self) -> Result<Vec<ContactRecord>, String> {
        let rows = sqlx::query(
            "SELECT npub, name, display_name, picture, blocked, remark FROM contacts ORDER BY name ASC, npub ASC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to get contacts: {}", e))?;

        let contacts = rows
            .iter()
            .map(|row| ContactRecord {
                npub: row.get("npub"),
                name: row.get("name"),
                display_name: row.get("display_name"),
                picture: row.get("picture"),
                blocked: row.get::<i32, _>("blocked") != 0,
                remark: row.get("remark"),
            })
            .collect();

        Ok(contacts)
    }

    pub async fn get_contact(&self, npub: &str) -> Result<Option<ContactRecord>, String> {
        let row = sqlx::query(
            "SELECT npub, name, display_name, picture, blocked, remark FROM contacts WHERE npub = ?",
        )
        .bind(npub)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("Failed to get contact: {}", e))?;

        Ok(row.map(|r| ContactRecord {
            npub: r.get("npub"),
            name: r.get("name"),
            display_name: r.get("display_name"),
            picture: r.get("picture"),
            blocked: r.get::<i32, _>("blocked") != 0,
            remark: r.get("remark"),
        }))
    }

    pub async fn update_contact_blocked(&self, npub: &str, blocked: bool) -> Result<(), String> {
        sqlx::query("UPDATE contacts SET blocked = ? WHERE npub = ?")
            .bind(blocked as i32)
            .bind(npub)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to update contact: {}", e))?;

        Ok(())
    }

    pub async fn update_contact_profile(
        &self,
        npub: &str,
        name: Option<&str>,
        display_name: Option<&str>,
        picture: Option<&str>,
    ) -> Result<(), String> {
        sqlx::query(
            r#"
            UPDATE contacts
            SET name = COALESCE(?, name),
                display_name = COALESCE(?, display_name),
                picture = COALESCE(?, picture)
            WHERE npub = ?
            "#,
        )
        .bind(name)
        .bind(display_name)
        .bind(picture)
        .bind(npub)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to update contact profile: {}", e))?;

        Ok(())
    }

    pub async fn update_contact_remark(
        &self,
        npub: &str,
        remark: Option<&str>,
    ) -> Result<(), String> {
        sqlx::query(
            "UPDATE contacts SET remark = ? WHERE npub = ?",
        )
        .bind(remark)
        .bind(npub)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to update contact remark: {}", e))?;
        Ok(())
    }

    // =====================
    // Cache operations
    // =====================

    pub async fn set_cache(&self, key: &str, value: &str, expires_at: Option<i64>) -> Result<(), String> {
        sqlx::query(
            r#"
            INSERT OR REPLACE INTO cache (key, value, expires_at)
            VALUES (?, ?, ?)
            "#,
        )
        .bind(key)
        .bind(value)
        .bind(expires_at)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to set cache: {}", e))?;

        Ok(())
    }

    pub async fn get_cache(&self, key: &str) -> Result<Option<String>, String> {
        let row = sqlx::query(
            r#"
            SELECT value, expires_at FROM cache WHERE key = ?
            "#,
        )
        .bind(key)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("Failed to get cache: {}", e))?;

        if let Some(r) = row {
            let expires_at: Option<i64> = r.get("expires_at");
            if let Some(exp) = expires_at {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs() as i64;
                if now > exp {
                    // Cache expired, delete it
                    let _ = self.delete_cache(key).await;
                    return Ok(None);
                }
            }
            Ok(Some(r.get("value")))
        } else {
            Ok(None)
        }
    }

    // =====================
    // Backup & Restore
    // =====================
    // Implemented in export_to_file and import_from_file above

    pub async fn delete_cache(&self, key: &str) -> Result<(), String> {
        sqlx::query("DELETE FROM cache WHERE key = ?")
            .bind(key)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to delete cache: {}", e))?;

        Ok(())
    }

    pub async fn cleanup_old_data(&self) -> Result<(u64, u64), String> {
        // 1. Clean up old deleted events (older than 7 days)
        // This keeps the deleted_events table from growing indefinitely
        let deleted_count = sqlx::query(
            "DELETE FROM deleted_events WHERE created_at < (strftime('%s', 'now') - 7 * 24 * 60 * 60)"
        )
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to prune deleted_events: {}", e))?
        .rows_affected();

        // 2. Clean up messages from strangers (non-contacts) older than 3 days
        // We do a subquery check to see if the sender/receiver is IN the contacts table
        let message_count = sqlx::query(
            r#"
            DELETE FROM messages 
            WHERE timestamp < (strftime('%s', 'now') - 3 * 24 * 60 * 60)
            AND (
                (sender NOT IN (SELECT npub FROM contacts))
                AND 
                (receiver NOT IN (SELECT npub FROM contacts))
            )
            "#
        )
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to prune stranger messages: {}", e))?
        .rows_affected();

        Ok((deleted_count, message_count))
    }

    pub async fn vacuum(&self) -> Result<(), String> {
        sqlx::query("VACUUM")
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to vacuum database: {}", e))?;
        Ok(())
    }

    /// 手动清理所有 7 天前的旧消息
    pub async fn cleanup_all_old_messages(&self) -> Result<u64, String> {
        let deleted_count = sqlx::query(
            "DELETE FROM messages WHERE timestamp < (strftime('%s', 'now') - 7 * 24 * 60 * 60)"
        )
        .execute(&self.pool)
        .await
        .map_err(|e| format!("清理旧消息失败: {}", e))?
        .rows_affected();

        Ok(deleted_count)
    }

    /// 获取数据库统计信息
    pub async fn get_stats(&self) -> Result<(u64, u64, u64, Option<i64>), String> {
        // 消息总数
        let total_messages: u64 = sqlx::query_scalar("SELECT COUNT(*) FROM messages")
            .fetch_one(&self.pool)
            .await
            .map_err(|e| format!("查询消息总数失败: {}", e))?;

        // 联系人数量
        let total_contacts: u64 = sqlx::query_scalar("SELECT COUNT(*) FROM contacts")
            .fetch_one(&self.pool)
            .await
            .map_err(|e| format!("查询联系人数量失败: {}", e))?;

        // 删除记录数量
        let deleted_events: u64 = sqlx::query_scalar("SELECT COUNT(*) FROM deleted_events")
            .fetch_one(&self.pool)
            .await
            .map_err(|e| format!("查询删除记录失败: {}", e))?;

        // 最旧消息时间 (使用 fetch_optional 处理可能为空的情况)
        let oldest_timestamp: Option<i64> = sqlx::query_scalar(
            "SELECT MIN(timestamp) FROM messages"
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("查询最旧消息失败: {}", e))?
        .flatten();

        Ok((total_messages, total_contacts, deleted_events, oldest_timestamp))
    }

    pub async fn get_chat_sessions(&self, my_npub: &str) -> Result<Vec<ChatSession>, String> {
        // Query to get the latest message for each contact we've communicated with
        let rows = sqlx::query(
            r#"
            SELECT
                COALESCE(c.npub, m.contact_npub) as npub,
                COALESCE(c.name, '') as name,
                COALESCE(c.display_name, '') as display_name,
                COALESCE(c.picture, '') as picture,
                COALESCE(c.blocked, 0) as blocked,
                COALESCE(c.remark, '') as remark,
                COALESCE(c.remark, '') as remark,
                m.content as last_message,
                m.timestamp as last_timestamp,
                m.message_type as last_message_type,
                (
                    SELECT COUNT(*)
                    FROM messages m2
                    WHERE m2.receiver = ?
                      AND m2.sender = m.contact_npub
                      AND m2.status != 'read'
                ) as unread_count
            FROM (
                SELECT
                    sender, receiver, content, timestamp, message_type,
                    CASE WHEN sender = ? THEN receiver ELSE sender END as contact_npub,
                    ROW_NUMBER() OVER (
                        PARTITION BY CASE WHEN sender = ? THEN receiver ELSE sender END
                        ORDER BY timestamp DESC
                    ) as rn
                FROM messages
                WHERE sender = ? OR receiver = ?
            ) m
            JOIN contacts c ON c.npub = m.contact_npub
            WHERE m.rn = 1
            ORDER BY m.timestamp DESC
            "#,
        )
        .bind(my_npub)
        .bind(my_npub)
        .bind(my_npub)
        .bind(my_npub)
        .bind(my_npub)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to get chat sessions: {}", e))?;

        let sessions = rows
            .iter()
            .map(|row| ChatSession {
                contact: ContactRecord {
                    npub: row.get("npub"),
                    name: Some(row.get("name")),
                    display_name: Some(row.get("display_name")),
                    picture: Some(row.get("picture")),
                    blocked: row.get::<i32, _>("blocked") != 0,
                    remark: Some(row.get("remark")),
                },
                last_message: row.get("last_message"),
                last_timestamp: row.get("last_timestamp"),
                unread_count: row.get("unread_count"),
                last_message_type: row.get("last_message_type"),
            })
            .collect();

        Ok(sessions)
    }

    pub async fn search_contacts_by_message(&self, query: &str) -> Result<Vec<String>, String> {
        let rows = sqlx::query(
            r#"
            SELECT DISTINCT 
                CASE WHEN m.sender = m_fts.id THEN m.receiver ELSE m.sender END as contact_npub
            FROM messages_fts m_fts
            JOIN messages m ON m.id = m_fts.id
            WHERE messages_fts MATCH ?
            "#
        )
        // Note: FTS5 query syntax is used. Simple keyword search works as is.
        .bind(query)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to search messages: {}", e))?;

        let npubs = rows.iter().map(|row| row.get(0)).collect();
        Ok(npubs)
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Helper to create an in-memory test database
    async fn create_test_db() -> Result<Database, String> {
        let db = Database::new("sqlite::memory:").await?;
        db.initialize().await?;
        Ok(db)
    }

    #[tokio::test]
    async fn test_database_new_and_initialize() {
        let result = create_test_db().await;
        assert!(result.is_ok(), "Should create in-memory database");

        let _db = result.unwrap();
        // Database created successfully
    }

    #[tokio::test]
    async fn test_save_and_get_message() {
        let db = create_test_db().await.unwrap();

        let message = MessageRecord {
            id: "test_id_1".to_string(),
            sender: "npub1sender".to_string(),
            receiver: "npub1receiver".to_string(),
            content: "Hello, World!".to_string(),
            timestamp: 1700000000,
            status: "sent".to_string(),
            message_type: "text".to_string(),
            media_url: None,
        };

        // Save message
        let save_result = db.save_message(&message).await;
        assert!(save_result.is_ok(), "Should save message");

        // Get messages
        let messages = db.get_messages("npub1receiver", "npub1sender", 10, 0).await;
        assert!(messages.is_ok(), "Should get messages");

        let msgs = messages.unwrap();
        assert_eq!(msgs.len(), 1, "Should have 1 message");
        assert_eq!(msgs[0].id, "test_id_1");
        assert_eq!(msgs[0].content, "Hello, World!");
    }

    #[tokio::test]
    async fn test_message_exists() {
        let db = create_test_db().await.unwrap();

        let message = MessageRecord {
            id: "test_id_2".to_string(),
            sender: "npub1sender".to_string(),
            receiver: "npub1receiver".to_string(),
            content: "Test".to_string(),
            timestamp: 1700000000,
            status: "sent".to_string(),
            message_type: "text".to_string(),
            media_url: None,
        };

        // Should not exist initially
        let exists = db.message_exists("test_id_2").await;
        assert!(exists.is_ok(), "Should check existence");
        assert!(!exists.unwrap(), "Message should not exist initially");

        // Save message
        db.save_message(&message).await.unwrap();

        // Should exist now
        let exists = db.message_exists("test_id_2").await;
        assert!(exists.unwrap(), "Message should exist after save");
    }

    #[tokio::test]
    async fn test_update_message_status() {
        let db = create_test_db().await.unwrap();

        let message = MessageRecord {
            id: "test_id_3".to_string(),
            sender: "npub1sender".to_string(),
            receiver: "npub1receiver".to_string(),
            content: "Test".to_string(),
            timestamp: 1700000000,
            status: "pending".to_string(),
            message_type: "text".to_string(),
            media_url: None,
        };

        db.save_message(&message).await.unwrap();

        // Update status
        let update_result = db.update_message_status("test_id_3", "delivered").await;
        assert!(update_result.is_ok(), "Should update status");

        // Verify update
        let messages = db.get_messages("npub1receiver", "npub1sender", 10, 0).await.unwrap();
        assert_eq!(messages[0].status, "delivered");
    }

    #[tokio::test]
    async fn test_get_latest_message() {
        let db = create_test_db().await.unwrap();

        // Save multiple messages
        let msg1 = MessageRecord {
            id: "msg1".to_string(),
            sender: "npub1sender".to_string(),
            receiver: "npub1receiver".to_string(),
            content: "First".to_string(),
            timestamp: 1700000000,
            status: "sent".to_string(),
            message_type: "text".to_string(),
            media_url: None,
        };

        let msg2 = MessageRecord {
            id: "msg2".to_string(),
            sender: "npub1sender".to_string(),
            receiver: "npub1receiver".to_string(),
            content: "Second".to_string(),
            timestamp: 1700000010,
            status: "sent".to_string(),
            message_type: "text".to_string(),
            media_url: None,
        };

        db.save_message(&msg1).await.unwrap();
        db.save_message(&msg2).await.unwrap();

        let latest = db.get_latest_message("npub1receiver", "npub1sender").await.unwrap();
        assert!(latest.is_some(), "Should have latest message");
        assert_eq!(latest.unwrap().content, "Second", "Should get latest by timestamp");
    }

    #[tokio::test]
    async fn test_contact_operations() {
        let db = create_test_db().await.unwrap();

        let contact = ContactRecord {
            npub: "npub1test".to_string(),
            name: Some("TestUser".to_string()),
            display_name: Some("Test User".to_string()),
            picture: Some("https://example.com/pic.png".to_string()),
            blocked: false,
            remark: None,
        };

        // Add contact
        let add_result = db.add_contact(&contact).await;
        assert!(add_result.is_ok(), "Should add contact");

        // Get contacts
        let contacts = db.get_contacts().await.unwrap();
        assert_eq!(contacts.len(), 1, "Should have 1 contact");
        assert_eq!(contacts[0].name, Some("TestUser".to_string()));

        // Get specific contact
        let specific = db.get_contact("npub1test").await.unwrap();
        assert!(specific.is_some(), "Should find contact");
        assert_eq!(specific.unwrap().display_name, Some("Test User".to_string()));

        // Update blocked
        db.update_contact_blocked("npub1test", true).await.unwrap();
        let updated = db.get_contact("npub1test").await.unwrap();
        assert!(updated.unwrap().blocked, "Should be blocked");

        // Remove contact
        db.remove_contact("npub1test").await.unwrap();
        let contacts = db.get_contacts().await.unwrap();
        assert!(contacts.is_empty(), "Should have no contacts after removal");
    }

    #[tokio::test]
    async fn test_cache_operations() {
        let db = create_test_db().await.unwrap();

        // Set cache
        let set_result = db.set_cache("test_key", "test_value", None).await;
        assert!(set_result.is_ok(), "Should set cache");

        // Get cache
        let value = db.get_cache("test_key").await.unwrap();
        assert_eq!(value, Some("test_value".to_string()));

        // Set cache with expiration
        let future_time = 9999999999; // Far future
        db.set_cache("exp_key", "exp_value", Some(future_time)).await.unwrap();

        let exp_value = db.get_cache("exp_key").await.unwrap();
        assert_eq!(exp_value, Some("exp_value".to_string()));

        // Delete cache
        db.delete_cache("test_key").await.unwrap();
        let deleted = db.get_cache("test_key").await.unwrap();
        assert!(deleted.is_none(), "Cache should be deleted");
    }

    #[tokio::test]
    async fn test_cache_expiration() {
        let db = create_test_db().await.unwrap();

        // Set cache with past expiration
        let past_time = 1000000000; // Year 2001
        db.set_cache("expired", "value", Some(past_time)).await.unwrap();

        // Should return None (expired)
        let value = db.get_cache("expired").await.unwrap();
        assert!(value.is_none(), "Expired cache should return None");
    }

    #[tokio::test]
    async fn test_message_conversation_filtering() {
        let db = create_test_db().await.unwrap();

        // Messages between A and B
        let msg_ab = MessageRecord {
            id: "ab1".to_string(),
            sender: "npubA".to_string(),
            receiver: "npubB".to_string(),
            content: "A to B".to_string(),
            timestamp: 1700000000,
            status: "sent".to_string(),
            message_type: "text".to_string(),
            media_url: None,
        };

        // Messages between A and C
        let msg_ac = MessageRecord {
            id: "ac1".to_string(),
            sender: "npubA".to_string(),
            receiver: "npubC".to_string(),
            content: "A to C".to_string(),
            timestamp: 1700000000,
            status: "sent".to_string(),
            message_type: "text".to_string(),
            media_url: None,
        };

        db.save_message(&msg_ab).await.unwrap();
        db.save_message(&msg_ac).await.unwrap();

        // Get conversation between A and B
        let conv = db.get_messages("npubB", "npubA", 10, 0).await.unwrap();
        assert_eq!(conv.len(), 1, "Should only get A-B messages");
        assert_eq!(conv[0].content, "A to B");
    }

    #[tokio::test]
    async fn test_update_contact_profile() {
        let db = create_test_db().await.unwrap();

        let contact = ContactRecord {
            npub: "npub1profile".to_string(),
            name: None,
            display_name: None,
            picture: None,
            blocked: false,
            remark: None,
        };

        db.add_contact(&contact).await.unwrap();

        // Update profile
        db.update_contact_profile(
            "npub1profile",
            Some("NewName"),
            Some("New Display"),
            Some("new_pic.png"),
        ).await.unwrap();

        let updated = db.get_contact("npub1profile").await.unwrap();
        assert!(updated.is_some());
        let c = updated.unwrap();
        assert_eq!(c.name, Some("NewName".to_string()));
        assert_eq!(c.display_name, Some("New Display".to_string()));
        assert_eq!(c.picture, Some("new_pic.png".to_string()));
    }
}
