use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Nostr error: {0}")]
    Nostr(String),

    #[error("Storage error: {0}")]
    Storage(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Encryption error: {0}")]
    Encryption(String),

    #[error("Network error: {0}")]
    Network(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Key error: {0}")]
    Key(String),
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        AppError::Database(err.to_string())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(err: reqwest::Error) -> Self {
        AppError::Network(err.to_string())
    }
}

impl From<nostr_sdk::client::Error> for AppError {
    fn from(err: nostr_sdk::client::Error) -> Self {
        AppError::Nostr(err.to_string())
    }
}

impl From<nostr_sdk::key::Error> for AppError {
    fn from(err: nostr_sdk::key::Error) -> Self {
        AppError::Key(err.to_string())
    }
}



impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
