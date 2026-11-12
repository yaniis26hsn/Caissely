use serde::{Serialize, Serializer};

#[derive(Debug)]
pub struct AppError(pub String);

impl AppError {
    pub fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for AppError {}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.0)
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(value: rusqlite::Error) -> Self {
        match &value {
            rusqlite::Error::SqliteFailure(_, Some(message)) => {
                if message.contains("UNIQUE constraint failed: users.username") {
                    Self::new("That username is already used by another account.")
                } else if message.contains("UNIQUE constraint failed: product_barcodes.barcode") {
                    Self::new("That barcode is already assigned to another product.")
                } else if message.contains("UNIQUE constraint failed: sales.receipt_number") {
                    Self::new("Receipt numbering conflict. Please try again.")
                } else if message.contains("UNIQUE constraint failed: devices.receipt_prefix") {
                    Self::new("That receipt prefix is already used.")
                } else if message.contains("FOREIGN KEY constraint failed") {
                    Self::new("This record is linked to existing history and cannot be removed.")
                } else if message.contains("CHECK constraint failed") {
                    Self::new("The data breaks a database safety rule (for example negative stock).")
                } else {
                    Self::new(format!("Database error: {message}"))
                }
            }
            _ => Self::new(format!("Database error: {value}")),
        }
    }
}

impl From<argon2::password_hash::Error> for AppError {
    fn from(value: argon2::password_hash::Error) -> Self {
        Self::new(format!("Password security error: {value}"))
    }
}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        Self::new(format!("File error: {value}"))
    }
}

pub type AppResult<T> = Result<T, AppError>;

pub trait OptionExt<T> {
    fn or_not_found(self, message: impl Into<String>) -> AppResult<T>;
}

impl<T> OptionExt<T> for Option<T> {
    fn or_not_found(self, message: impl Into<String>) -> AppResult<T> {
        self.ok_or_else(|| AppError::new(message))
    }
}
