use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

use rusqlite::Connection;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::models::User;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub session: Mutex<Option<User>>,
    pub db_path: PathBuf,
    pub backup_dir: PathBuf,
    pub export_dir: PathBuf,
    pub device_id: String,
}

pub fn lock_db<'a>(state: &'a State<'_, AppState>) -> AppResult<MutexGuard<'a, Connection>> {
    state
        .db
        .lock()
        .map_err(|_| AppError::new("The local database is unavailable."))
}

pub fn session_user(state: &State<'_, AppState>) -> AppResult<User> {
    let guard = state
        .session
        .lock()
        .map_err(|_| AppError::new("The session is unavailable."))?;
    guard
        .clone()
        .ok_or_else(|| AppError::new("Please sign in to continue."))
}

pub fn require_roles(state: &State<'_, AppState>, roles: &[&str]) -> AppResult<User> {
    let user = session_user(state)?;
    if !roles.contains(&user.role.as_str()) {
        return Err(AppError::new(
            "You do not have permission to perform this action.",
        ));
    }
    if !user.is_active {
        return Err(AppError::new("This account is deactivated."));
    }
    Ok(user)
}

pub fn set_session(state: &State<'_, AppState>, user: Option<User>) -> AppResult<()> {
    let mut guard = state
        .session
        .lock()
        .map_err(|_| AppError::new("The session is unavailable."))?;
    *guard = user;
    Ok(())
}
