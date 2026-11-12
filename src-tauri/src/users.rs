use rusqlite::{params, Connection, OptionalExtension};
use serde_json::json;

use crate::auth::{
    hash_secret, validate_password, validate_required, validate_username, verify_secret,
};
use crate::db::{self, log_audit, map_user};
use crate::error::{AppError, AppResult, OptionExt};
use crate::models::{is_one_of, CreateUserInput, UpdateUserInput, User, ROLES};

fn user_by_username(conn: &Connection, username: &str) -> AppResult<Option<(User, String)>> {
    let mut statement = conn.prepare(
        "SELECT id, full_name, username, password_hash, pin_hash, role, is_active, created_at
         FROM users WHERE username = ?1 COLLATE NOCASE",
    )?;
    let row = statement
        .query_row(params![username], |row| {
            Ok((map_user(row)?, row.get::<_, String>("password_hash")?))
        })
        .optional()?;
    Ok(row)
}

pub fn authenticate(
    conn: &Connection,
    username: &str,
    password: &str,
    device_id: Option<&str>,
) -> AppResult<User> {
    let username = username.trim();
    if username.is_empty() || password.is_empty() {
        return Err(AppError::new("Username and password are required."));
    }

    let Some((user, hash)) = user_by_username(conn, username)? else {
        let _ = log_audit(
            conn,
            None,
            device_id,
            "login_failed",
            "users",
            None,
            None,
            Some(&json!({ "username": username }).to_string()),
        );
        return Err(AppError::new("Invalid username or password."));
    };

    if !user.is_active {
        return Err(AppError::new(
            "This account is deactivated. Ask the owner to reactivate it.",
        ));
    }

    if !verify_secret(password, &hash) {
        let _ = log_audit(
            conn,
            Some(user.id),
            device_id,
            "login_failed",
            "users",
            Some(&user.id.to_string()),
            None,
            None,
        );
        return Err(AppError::new("Invalid username or password."));
    }

    log_audit(
        conn,
        Some(user.id),
        device_id,
        "login",
        "users",
        Some(&user.id.to_string()),
        None,
        None,
    )?;
    Ok(user)
}

pub fn authenticate_pin(
    conn: &Connection,
    pin: &str,
    device_id: Option<&str>,
) -> AppResult<User> {
    let pin = pin.trim();
    if pin.is_empty() {
        return Err(AppError::new("Enter your PIN."));
    }

    let mut statement = conn.prepare(
        "SELECT id, full_name, username, password_hash, pin_hash, role, is_active, created_at
         FROM users WHERE is_active = 1 AND pin_hash IS NOT NULL",
    )?;
    let candidates = statement
        .query_map([], |row| {
            Ok((map_user(row)?, row.get::<_, Option<String>>("pin_hash")?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    for (user, pin_hash) in candidates {
        if let Some(pin_hash) = pin_hash {
            if verify_secret(pin, &pin_hash) {
                log_audit(
                    conn,
                    Some(user.id),
                    device_id,
                    "login_pin",
                    "users",
                    Some(&user.id.to_string()),
                    None,
                    None,
                )?;
                return Ok(user);
            }
        }
    }

    let _ = log_audit(
        conn,
        None,
        device_id,
        "login_failed",
        "users",
        None,
        None,
        Some(&json!({ "mode": "pin" }).to_string()),
    );
    Err(AppError::new("Incorrect PIN."))
}

pub fn get_user(conn: &Connection, id: i64) -> AppResult<User> {
    let user = conn
        .query_row(
            "SELECT id, full_name, username, password_hash, pin_hash, role, is_active, created_at
             FROM users WHERE id = ?1",
            params![id],
            map_user,
        )
        .optional()?
        .or_not_found("User not found.")?;
    Ok(user)
}

pub fn list_users(conn: &Connection) -> AppResult<Vec<User>> {
    let mut statement = conn.prepare(
        "SELECT id, full_name, username, password_hash, pin_hash, role, is_active, created_at
         FROM users ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1
         WHEN 'cashier' THEN 2 ELSE 3 END, full_name COLLATE NOCASE",
    )?;
    let rows = statement.query_map([], map_user)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn create_user(
    conn: &Connection,
    input: CreateUserInput,
    actor_id: i64,
    device_id: Option<&str>,
) -> AppResult<User> {
    let full_name = input.full_name.trim().to_string();
    let username = input.username.trim().to_string();
    validate_required(&full_name, "Full name")?;
    validate_username(&username)?;
    validate_password(&input.password)?;
    if !is_one_of(&input.role, &ROLES) {
        return Err(AppError::new("Unknown user role."));
    }
    db::ensure_unique_username(conn, &username, None)?;
    db::validate_pin_optional(&input.pin)?;

    let password_hash = hash_secret(&input.password)?;
    let pin_hash = match input.pin.as_deref().map(str::trim).filter(|pin| !pin.is_empty()) {
        Some(pin) => Some(hash_secret(pin)?),
        None => None,
    };

    conn.execute(
        "INSERT INTO users (full_name, username, password_hash, pin_hash, role, is_active, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6)",
        params![
            full_name,
            username,
            password_hash,
            pin_hash,
            input.role,
            db::now_local()
        ],
    )?;
    let id = conn.last_insert_rowid();
    let user = get_user(conn, id)?;
    log_audit(
        conn,
        Some(actor_id),
        device_id,
        "user_created",
        "users",
        Some(&id.to_string()),
        None,
        Some(&serde_json::to_string(&user).unwrap_or_default()),
    )?;
    Ok(user)
}

pub fn update_user(
    conn: &Connection,
    id: i64,
    input: UpdateUserInput,
    actor_id: i64,
    device_id: Option<&str>,
) -> AppResult<User> {
    let existing = get_user(conn, id)?;
    let full_name = input.full_name.trim().to_string();
    let username = input.username.trim().to_string();
    validate_required(&full_name, "Full name")?;
    validate_username(&username)?;
    if !is_one_of(&input.role, &ROLES) {
        return Err(AppError::new("Unknown user role."));
    }
    db::ensure_unique_username(conn, &username, Some(id))?;
    db::validate_pin_optional(&input.pin)?;

    if id == actor_id && (input.role != existing.role || !input.is_active) {
        return Err(AppError::new(
            "You cannot change your own role or deactivate your own account.",
        ));
    }

    if existing.role == "owner" && (input.role != "owner" || !input.is_active) {
        let other_owners: i64 = conn.query_row(
            "SELECT COUNT(*) FROM users WHERE role = 'owner' AND is_active = 1 AND id <> ?1",
            params![id],
            |row| row.get(0),
        )?;
        if other_owners == 0 {
            return Err(AppError::new("At least one active owner account is required."));
        }
    }

    let password_hash = match input
        .password
        .as_deref()
        .map(str::trim)
        .filter(|password| !password.is_empty())
    {
        Some(password) => {
            validate_password(password)?;
            Some(hash_secret(password)?)
        }
        None => None,
    };

    let pin_hash = if input.clear_pin {
        Some(None)
    } else {
        match input.pin.as_deref().map(str::trim).filter(|pin| !pin.is_empty()) {
            Some(pin) => Some(Some(hash_secret(pin)?)),
            None => None,
        }
    };

    if let Some(hash) = password_hash {
        conn.execute(
            "UPDATE users SET full_name = ?1, username = ?2, role = ?3, is_active = ?4,
             password_hash = ?5, pin_hash = COALESCE(?6, pin_hash) WHERE id = ?7",
            params![
                full_name,
                username,
                input.role,
                input.is_active as i64,
                hash,
                pin_hash.flatten(),
                id
            ],
        )?;
    } else {
        conn.execute(
            "UPDATE users SET full_name = ?1, username = ?2, role = ?3, is_active = ?4,
             pin_hash = COALESCE(?5, pin_hash) WHERE id = ?6",
            params![
                full_name,
                username,
                input.role,
                input.is_active as i64,
                pin_hash.flatten(),
                id
            ],
        )?;
    }

    if input.clear_pin {
        conn.execute("UPDATE users SET pin_hash = NULL WHERE id = ?1", params![id])?;
    }

    let updated = get_user(conn, id)?;
    log_audit(
        conn,
        Some(actor_id),
        device_id,
        "user_updated",
        "users",
        Some(&id.to_string()),
        Some(&serde_json::to_string(&existing).unwrap_or_default()),
        Some(&serde_json::to_string(&updated).unwrap_or_default()),
    )?;
    Ok(updated)
}

pub fn change_password(
    conn: &Connection,
    user_id: i64,
    current_password: &str,
    new_password: &str,
    device_id: Option<&str>,
) -> AppResult<()> {
    let hash: String = conn.query_row(
        "SELECT password_hash FROM users WHERE id = ?1",
        params![user_id],
        |row| row.get(0),
    )?;
    if !verify_secret(current_password, &hash) {
        return Err(AppError::new("Current password is incorrect."));
    }
    validate_password(new_password)?;
    if current_password == new_password {
        return Err(AppError::new("The new password must be different."));
    }
    let new_hash = hash_secret(new_password)?;
    conn.execute(
        "UPDATE users SET password_hash = ?1 WHERE id = ?2",
        params![new_hash, user_id],
    )?;
    log_audit(
        conn,
        Some(user_id),
        device_id,
        "password_changed",
        "users",
        Some(&user_id.to_string()),
        None,
        None,
    )?;
    Ok(())
}

pub fn change_pin(
    conn: &Connection,
    user_id: i64,
    current_password: &str,
    pin: Option<String>,
    device_id: Option<&str>,
) -> AppResult<()> {
    let hash: String = conn.query_row(
        "SELECT password_hash FROM users WHERE id = ?1",
        params![user_id],
        |row| row.get(0),
    )?;
    if !verify_secret(current_password, &hash) {
        return Err(AppError::new("Current password is incorrect."));
    }
    let new_pin_hash = match pin.as_deref().map(str::trim).filter(|pin| !pin.is_empty()) {
        Some(pin) => {
            db::validate_pin_optional(&Some(pin.to_string()))?;
            Some(hash_secret(pin)?)
        }
        None => None,
    };
    conn.execute(
        "UPDATE users SET pin_hash = ?1 WHERE id = ?2",
        params![new_pin_hash, user_id],
    )?;
    log_audit(
        conn,
        Some(user_id),
        device_id,
        "pin_changed",
        "users",
        Some(&user_id.to_string()),
        None,
        None,
    )?;
    Ok(())
}
