use argon2::password_hash::SaltString;
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use rand_core::OsRng;

use crate::error::{AppError, AppResult};

pub fn hash_secret(secret: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(secret.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(AppError::from)
}

pub fn verify_secret(secret: &str, hash: &str) -> bool {
    PasswordHash::new(hash)
        .map(|parsed| {
            Argon2::default()
                .verify_password(secret.as_bytes(), &parsed)
                .is_ok()
        })
        .unwrap_or(false)
}

pub fn validate_password(password: &str) -> AppResult<()> {
    let length = password.chars().count();
    if length < 8 {
        return Err(AppError::new("Password must be at least 8 characters."));
    }
    if length > 128 {
        return Err(AppError::new("Password is too long."));
    }
    Ok(())
}

pub fn validate_pin(pin: &str) -> AppResult<()> {
    let length = pin.chars().count();
    if !(4..=8).contains(&length) {
        return Err(AppError::new("PIN must contain 4 to 8 digits."));
    }
    if !pin.chars().all(|character| character.is_ascii_digit()) {
        return Err(AppError::new("PIN must contain digits only."));
    }
    Ok(())
}

pub fn validate_username(username: &str) -> AppResult<()> {
    let length = username.chars().count();
    if !(3..=40).contains(&length) {
        return Err(AppError::new(
            "Username must contain between 3 and 40 characters.",
        ));
    }
    if !username
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || "._-".contains(character))
    {
        return Err(AppError::new(
            "Username may only contain letters, digits, dots, dashes and underscores.",
        ));
    }
    Ok(())
}

pub fn validate_required(value: &str, label: &str) -> AppResult<()> {
    if value.trim().is_empty() {
        return Err(AppError::new(format!("{label} is required.")));
    }
    Ok(())
}
