use rusqlite::{params, Connection, OptionalExtension};
use serde_json::json;

use crate::db::{self, log_audit};
use crate::error::{AppError, AppResult, OptionExt};
use crate::models::{CashMovement, CashMovementInput, Shift, ShiftTotals};

const SHIFT_SELECT: &str = "SELECT sh.id, sh.user_id, u.full_name AS user_name, sh.device_id,
    sh.opened_at, sh.closed_at, sh.opening_cash, sh.expected_cash, sh.counted_cash, sh.difference,
    COALESCE((SELECT SUM(cm.amount) FROM cash_movements cm WHERE cm.shift_id = sh.id AND cm.type = 'cash_in'), 0) AS cash_in,
    COALESCE((SELECT SUM(cm.amount) FROM cash_movements cm WHERE cm.shift_id = sh.id AND cm.type = 'cash_out'), 0) AS cash_out,
    sh.opening_cash
      + COALESCE((SELECT SUM(CASE WHEN s.type = 'return' THEN -p.amount ELSE p.amount END)
                  FROM payments p JOIN sales s ON s.id = p.sale_id
                  WHERE s.shift_id = sh.id AND p.method = 'cash'), 0)
      + COALESCE((SELECT SUM(cm.amount) FROM cash_movements cm WHERE cm.shift_id = sh.id AND cm.type = 'cash_in'), 0)
      - COALESCE((SELECT SUM(cm.amount) FROM cash_movements cm WHERE cm.shift_id = sh.id AND cm.type = 'cash_out'), 0)
      AS live_expected
    FROM shifts sh JOIN users u ON u.id = sh.user_id";

fn map_shift(row: &rusqlite::Row<'_>) -> rusqlite::Result<Shift> {
    let closed_at: Option<String> = row.get("closed_at")?;
    let stored_expected: Option<i64> = row.get("expected_cash")?;
    let live_expected: i64 = row.get("live_expected")?;
    let expected_cash = if closed_at.is_some() {
        stored_expected.unwrap_or(live_expected)
    } else {
        live_expected
    };
    Ok(Shift {
        id: row.get("id")?,
        user_id: row.get("user_id")?,
        user_name: row.get("user_name")?,
        device_id: row.get("device_id")?,
        opened_at: row.get("opened_at")?,
        closed_at,
        opening_cash: row.get("opening_cash")?,
        expected_cash,
        counted_cash: row.get("counted_cash")?,
        difference: row.get("difference")?,
        cash_in: row.get("cash_in")?,
        cash_out: row.get("cash_out")?,
    })
}

pub fn get_shift(conn: &Connection, id: i64) -> AppResult<Shift> {
    let shift = conn
        .query_row(
            &format!("{SHIFT_SELECT} WHERE sh.id = ?1"),
            params![id],
            map_shift,
        )
        .optional()?
        .or_not_found("Shift not found.")?;
    Ok(shift)
}

pub fn current_shift(
    conn: &Connection,
    user_id: i64,
    device_id: &str,
) -> AppResult<Option<Shift>> {
    let shift = conn
        .query_row(
            &format!(
                "{SHIFT_SELECT} WHERE sh.user_id = ?1 AND sh.device_id = ?2 AND sh.closed_at IS NULL
                 ORDER BY sh.id DESC LIMIT 1"
            ),
            params![user_id, device_id],
            map_shift,
        )
        .optional()?;
    Ok(shift)
}

pub fn current_shift_totals(
    conn: &Connection,
    user_id: i64,
    device_id: &str,
) -> AppResult<ShiftTotals> {
    let current = current_shift(conn, user_id, device_id)?;
    if let Some(shift) = current {
        let cash_sales: i64 = conn.query_row(
            "SELECT COALESCE(SUM(CASE WHEN s.type = 'return' THEN -p.amount ELSE p.amount END), 0)
             FROM payments p JOIN sales s ON s.id = p.sale_id
             WHERE s.shift_id = ?1 AND p.method = 'cash'",
            params![shift.id],
            |row| row.get(0),
        )?;
        Ok(ShiftTotals {
            cash_in: shift.cash_in,
            cash_out: shift.cash_out,
            cash_sales,
            expected_cash: shift.expected_cash,
            current: Some(shift),
        })
    } else {
        Ok(ShiftTotals {
            current: None,
            cash_in: 0,
            cash_out: 0,
            cash_sales: 0,
            expected_cash: 0,
        })
    }
}

pub fn open_shift(
    conn: &Connection,
    user_id: i64,
    device_id: &str,
    opening_cash: i64,
) -> AppResult<Shift> {
    if opening_cash < 0 {
        return Err(AppError::new("Opening cash cannot be negative."));
    }
    if current_shift(conn, user_id, device_id)?.is_some() {
        return Err(AppError::new("You already have an open shift on this device."));
    }
    conn.execute(
        "INSERT INTO shifts (user_id, device_id, opened_at, opening_cash)
         VALUES (?1, ?2, ?3, ?4)",
        params![user_id, device_id, db::now_local(), opening_cash],
    )?;
    let id = conn.last_insert_rowid();
    log_audit(
        conn,
        Some(user_id),
        Some(device_id),
        "shift_opened",
        "shifts",
        Some(&id.to_string()),
        None,
        Some(&json!({ "openingCash": opening_cash }).to_string()),
    )?;
    get_shift(conn, id)
}

pub fn close_shift(
    conn: &Connection,
    user_id: i64,
    device_id: &str,
    counted_cash: i64,
) -> AppResult<Shift> {
    if counted_cash < 0 {
        return Err(AppError::new("Counted cash cannot be negative."));
    }
    let shift = current_shift(conn, user_id, device_id)?
        .ok_or_else(|| AppError::new("There is no open shift to close."))?;
    let expected = shift.expected_cash;
    let difference = counted_cash - expected;
    conn.execute(
        "UPDATE shifts SET closed_at = ?1, expected_cash = ?2, counted_cash = ?3, difference = ?4
         WHERE id = ?5",
        params![
            db::now_local(),
            expected,
            counted_cash,
            difference,
            shift.id
        ],
    )?;
    log_audit(
        conn,
        Some(user_id),
        Some(device_id),
        "shift_closed",
        "shifts",
        Some(&shift.id.to_string()),
        Some(&json!({ "expectedCash": expected }).to_string()),
        Some(&json!({ "countedCash": counted_cash, "difference": difference }).to_string()),
    )?;
    get_shift(conn, shift.id)
}

pub fn add_cash_movement(
    conn: &Connection,
    user_id: i64,
    device_id: &str,
    input: CashMovementInput,
) -> AppResult<Shift> {
    if input.amount <= 0 {
        return Err(AppError::new("Cash amount must be greater than zero."));
    }
    if input.movement_type != "cash_in" && input.movement_type != "cash_out" {
        return Err(AppError::new("Unknown cash movement type."));
    }
    if input.reason.trim().is_empty() {
        return Err(AppError::new("A reason is required for cash movements."));
    }
    let shift = current_shift(conn, user_id, device_id)?
        .ok_or_else(|| AppError::new("Open a shift before recording cash movements."))?;
    conn.execute(
        "INSERT INTO cash_movements (shift_id, type, amount, reason, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            shift.id,
            input.movement_type,
            input.amount,
            input.reason.trim(),
            db::now_local()
        ],
    )?;
    log_audit(
        conn,
        Some(user_id),
        Some(device_id),
        "cash_movement",
        "shifts",
        Some(&shift.id.to_string()),
        None,
        Some(
            &json!({
                "type": input.movement_type,
                "amount": input.amount,
                "reason": input.reason.trim()
            })
            .to_string(),
        ),
    )?;
    get_shift(conn, shift.id)
}

pub fn list_shifts(conn: &Connection, limit: i64) -> AppResult<Vec<Shift>> {
    let mut statement = conn.prepare(&format!(
        "{SHIFT_SELECT} ORDER BY sh.id DESC LIMIT ?1"
    ))?;
    let rows = statement.query_map(params![limit.clamp(1, 500)], map_shift)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn list_cash_movements(conn: &Connection, shift_id: i64) -> AppResult<Vec<CashMovement>> {
    let mut statement = conn.prepare(
        "SELECT id, shift_id, type, amount, reason, created_at FROM cash_movements
         WHERE shift_id = ?1 ORDER BY id DESC",
    )?;
    let rows = statement.query_map(params![shift_id], |row| {
        Ok(CashMovement {
            id: row.get(0)?,
            shift_id: row.get(1)?,
            movement_type: row.get(2)?,
            amount: row.get(3)?,
            reason: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}
