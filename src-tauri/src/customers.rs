use rusqlite::{params, Connection, OptionalExtension};
use serde_json::json;
use uuid::Uuid;

use crate::db::{self, log_audit};
use crate::error::{AppError, AppResult, OptionExt};
use crate::models::{
    is_one_of, Customer, CustomerInput, CustomerLedgerEntry, CustomerStatement, PAYMENT_METHODS,
};

fn customer_select_sql() -> &'static str {
    "SELECT c.id, c.name, c.phone, c.credit_limit, c.is_active, c.created_at,
            COALESCE((SELECT SUM(l.amount) FROM customer_ledger l WHERE l.customer_id = c.id), 0) AS balance,
            CASE WHEN COALESCE((SELECT SUM(l.amount) FROM customer_ledger l WHERE l.customer_id = c.id), 0) > 0
                  AND EXISTS (SELECT 1 FROM customer_ledger l2 WHERE l2.customer_id = c.id
                              AND l2.type = 'credit_sale'
                              AND l2.created_at < datetime('now','localtime','-30 days'))
                 THEN 1 ELSE 0 END AS has_overdue
     FROM customers c"
}

fn map_customer(row: &rusqlite::Row<'_>) -> rusqlite::Result<Customer> {
    Ok(Customer {
        id: row.get("id")?,
        name: row.get("name")?,
        phone: row.get("phone")?,
        credit_limit: row.get("credit_limit")?,
        is_active: row.get::<_, i64>("is_active")? != 0,
        created_at: row.get("created_at")?,
        balance: row.get("balance")?,
        has_overdue: row.get::<_, i64>("has_overdue")? != 0,
    })
}

pub fn list_customers(
    conn: &Connection,
    search: Option<&str>,
    include_inactive: bool,
    only_debtors: bool,
) -> AppResult<Vec<Customer>> {
    let mut sql = format!("{} WHERE 1 = 1", customer_select_sql());
    let mut values: Vec<rusqlite::types::Value> = Vec::new();

    if !include_inactive {
        sql.push_str(" AND c.is_active = 1");
    }
    if only_debtors {
        sql.push_str(
            " AND COALESCE((SELECT SUM(l.amount) FROM customer_ledger l WHERE l.customer_id = c.id), 0) > 0",
        );
    }
    if let Some(search) = search.map(str::trim).filter(|value| !value.is_empty()) {
        let pattern = format!("%{search}%");
        sql.push_str(" AND (c.name LIKE ? OR COALESCE(c.phone, '') LIKE ?)");
        values.push(rusqlite::types::Value::Text(pattern.clone()));
        values.push(rusqlite::types::Value::Text(pattern));
    }
    sql.push_str(" ORDER BY balance DESC, c.name COLLATE NOCASE");

    let mut statement = conn.prepare(&sql)?;
    let rows = statement.query_map(rusqlite::params_from_iter(values.iter()), map_customer)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn get_customer(conn: &Connection, id: i64) -> AppResult<Customer> {
    let customer = conn
        .query_row(
            &format!("{} WHERE c.id = ?1", customer_select_sql()),
            params![id],
            map_customer,
        )
        .optional()?
        .or_not_found("Customer not found.")?;
    Ok(customer)
}

pub fn create_customer(
    conn: &Connection,
    input: CustomerInput,
    actor_id: i64,
    device_id: Option<&str>,
) -> AppResult<Customer> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::new("Customer name is required."));
    }
    if let Some(limit) = input.credit_limit {
        if limit < 0 {
            return Err(AppError::new("Credit limit cannot be negative."));
        }
    }
    conn.execute(
        "INSERT INTO customers (name, phone, credit_limit, is_active, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            name,
            input.phone.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            input.credit_limit,
            input.is_active as i64,
            db::now_local()
        ],
    )?;
    let id = conn.last_insert_rowid();
    let customer = get_customer(conn, id)?;
    log_audit(
        conn,
        Some(actor_id),
        device_id,
        "customer_created",
        "customers",
        Some(&id.to_string()),
        None,
        Some(&serde_json::to_string(&customer).unwrap_or_default()),
    )?;
    Ok(customer)
}

pub fn update_customer(
    conn: &Connection,
    id: i64,
    input: CustomerInput,
    actor_id: i64,
    device_id: Option<&str>,
) -> AppResult<Customer> {
    let existing = get_customer(conn, id)?;
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::new("Customer name is required."));
    }
    if let Some(limit) = input.credit_limit {
        if limit < 0 {
            return Err(AppError::new("Credit limit cannot be negative."));
        }
    }
    conn.execute(
        "UPDATE customers SET name = ?1, phone = ?2, credit_limit = ?3, is_active = ?4 WHERE id = ?5",
        params![
            name,
            input.phone.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            input.credit_limit,
            input.is_active as i64,
            id
        ],
    )?;
    let updated = get_customer(conn, id)?;
    log_audit(
        conn,
        Some(actor_id),
        device_id,
        "customer_updated",
        "customers",
        Some(&id.to_string()),
        Some(&serde_json::to_string(&existing).unwrap_or_default()),
        Some(&serde_json::to_string(&updated).unwrap_or_default()),
    )?;
    Ok(updated)
}

pub fn customer_statement(conn: &Connection, id: i64) -> AppResult<CustomerStatement> {
    let customer = get_customer(conn, id)?;
    let mut statement = conn.prepare(
        "SELECT l.id, l.customer_id, l.type, l.amount, l.sale_id,
                s.receipt_number, l.payment_method, l.note,
                u.full_name AS user_name, l.created_at
         FROM customer_ledger l
         LEFT JOIN sales s ON s.id = l.sale_id
         LEFT JOIN users u ON u.id = l.user_id
         WHERE l.customer_id = ?1
         ORDER BY l.created_at DESC, l.rowid DESC",
    )?;
    let rows = statement.query_map(params![id], |row| {
        Ok(CustomerLedgerEntry {
            id: row.get(0)?,
            customer_id: row.get(1)?,
            entry_type: row.get(2)?,
            amount: row.get(3)?,
            sale_id: row.get(4)?,
            receipt_number: row.get(5)?,
            payment_method: row.get(6)?,
            note: row.get(7)?,
            user_name: row.get(8)?,
            created_at: row.get(9)?,
        })
    })?;
    let entries = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(CustomerStatement {
        balance: customer.balance,
        customer,
        entries,
    })
}

pub fn record_payment(
    conn: &Connection,
    customer_id: i64,
    method: &str,
    amount: i64,
    note: Option<&str>,
    actor_id: i64,
    device_id: Option<&str>,
) -> AppResult<Customer> {
    if !is_one_of(method, &PAYMENT_METHODS) || method == "credit" {
        return Err(AppError::new("Choose a real payment method (not credit)."));
    }
    if amount <= 0 {
        return Err(AppError::new("Payment amount must be greater than zero."));
    }
    let customer = get_customer(conn, customer_id)?;
    if customer.balance <= 0 {
        return Err(AppError::new("This customer has no outstanding balance."));
    }
    if amount > customer.balance {
        return Err(AppError::new(format!(
            "Payment exceeds the outstanding balance of {} DA.",
            customer.balance as f64 / 100.0
        )));
    }

    let transaction = conn.unchecked_transaction()?;
    let now = db::now_local();
    transaction.execute(
        "INSERT INTO customer_ledger
         (id, customer_id, type, amount, sale_id, payment_method, user_id, note, created_at)
         VALUES (?1, ?2, 'payment', ?3, NULL, ?4, ?5, ?6, ?7)",
        params![
            Uuid::new_v4().to_string(),
            customer_id,
            -amount,
            method,
            actor_id,
            note.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            now
        ],
    )?;

    if method == "cash" {
        if let Some(shift_id) = current_open_shift_id(&transaction, actor_id, device_id)? {
            transaction.execute(
                "INSERT INTO cash_movements (shift_id, type, amount, reason, created_at)
                 VALUES (?1, 'cash_in', ?2, ?3, ?4)",
                params![
                    shift_id,
                    amount,
                    format!("Customer payment: {}", customer.name),
                    now
                ],
            )?;
        }
    }

    log_audit(
        &transaction,
        Some(actor_id),
        device_id,
        "customer_payment",
        "customers",
        Some(&customer_id.to_string()),
        Some(&json!({ "balance": customer.balance }).to_string()),
        Some(&json!({ "amount": amount, "method": method }).to_string()),
    )?;
    transaction.commit()?;
    get_customer(conn, customer_id)
}

pub fn current_open_shift_id(
    conn: &Connection,
    user_id: i64,
    device_id: Option<&str>,
) -> AppResult<Option<i64>> {
    let shift = conn
        .query_row(
            "SELECT id FROM shifts WHERE user_id = ?1 AND device_id = ?2 AND closed_at IS NULL
             ORDER BY id DESC LIMIT 1",
            params![user_id, device_id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(shift)
}
