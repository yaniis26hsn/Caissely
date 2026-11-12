use std::collections::BTreeMap;

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde_json::json;
use uuid::Uuid;

use crate::db::{self, get_shop_settings, log_audit};
use crate::error::{AppError, AppResult, OptionExt};
use crate::models::{
    is_one_of, CreatePurchaseInput, ExpiringBatch, Product, Purchase, PurchaseItem,
    StockAdjustmentInput, StockMovement, Supplier, SupplierInput, User,
};

const MANUAL_MOVEMENTS: [&str; 5] = [
    "adjustment",
    "loss",
    "expiry",
    "customer_return",
    "supplier_return",
];

pub fn list_stock_movements(
    conn: &Connection,
    product_id: Option<i64>,
    movement_type: Option<&str>,
    limit: i64,
) -> AppResult<Vec<StockMovement>> {
    let mut sql = "SELECT m.id, m.product_id, p.name_fr AS product_name, m.type AS movement_type,
        m.quantity, m.reason, u.full_name AS user_name, m.sale_id, m.purchase_id, m.created_at
        FROM stock_movements m
        JOIN products p ON p.id = m.product_id
        LEFT JOIN users u ON u.id = m.user_id
        WHERE 1 = 1"
        .to_string();
    let mut values: Vec<rusqlite::types::Value> = Vec::new();
    if let Some(product_id) = product_id {
        sql.push_str(" AND m.product_id = ?");
        values.push(rusqlite::types::Value::Integer(product_id));
    }
    if let Some(movement_type) = movement_type.filter(|value| !value.is_empty()) {
        sql.push_str(" AND m.type = ?");
        values.push(rusqlite::types::Value::Text(movement_type.to_string()));
    }
    sql.push_str(" ORDER BY m.created_at DESC, m.rowid DESC LIMIT ?");
    values.push(rusqlite::types::Value::Integer(limit.clamp(1, 500)));

    let mut statement = conn.prepare(&sql)?;
    let rows = statement.query_map(rusqlite::params_from_iter(values.iter()), |row| {
        Ok(StockMovement {
            id: row.get(0)?,
            product_id: row.get(1)?,
            product_name: row.get(2)?,
            movement_type: row.get(3)?,
            quantity: row.get(4)?,
            reason: row.get(5)?,
            user_name: row.get(6)?,
            sale_id: row.get(7)?,
            purchase_id: row.get(8)?,
            created_at: row.get(9)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn adjust_stock(
    conn: &mut Connection,
    actor: &User,
    device_id: &str,
    input: StockAdjustmentInput,
) -> AppResult<Product> {
    if !is_one_of(&input.movement_type, &MANUAL_MOVEMENTS) {
        return Err(AppError::new("Unknown stock adjustment type."));
    }
    if !input.quantity_delta.is_finite() || input.quantity_delta == 0.0 {
        return Err(AppError::new("Stock adjustment quantity cannot be zero."));
    }
    let reason = input
        .reason
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::new("A reason is required for stock adjustments."))?;

    match input.movement_type.as_str() {
        "loss" | "expiry" | "supplier_return" if input.quantity_delta > 0.0 => {
            return Err(AppError::new(
                "Loss, expiry and supplier returns must remove stock.",
            ));
        }
        "customer_return" if input.quantity_delta < 0.0 => {
            return Err(AppError::new(
                "Customer returns must add stock back.",
            ));
        }
        _ => {}
    }

    let transaction = conn.transaction()?;
    let product = db::get_product_raw(&transaction, input.product_id)?;
    let settings = get_shop_settings(&transaction)?;
    let new_stock = product.stock_quantity + input.quantity_delta;
    if new_stock < 0.0 && !settings.allow_negative_stock {
        return Err(AppError::new(format!(
            "Adjustment would make stock negative for {}.",
            product.name_fr
        )));
    }

    let now = db::now_local();
    transaction.execute(
        "UPDATE products SET stock_quantity = ?1, updated_at = ?2 WHERE id = ?3",
        params![new_stock, now, input.product_id],
    )?;
    transaction.execute(
        "INSERT INTO stock_movements
         (id, product_id, type, quantity, reason, user_id, device_id, sale_id, purchase_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, NULL, ?8)",
        params![
            Uuid::new_v4().to_string(),
            input.product_id,
            input.movement_type,
            input.quantity_delta,
            reason,
            actor.id,
            device_id,
            now
        ],
    )?;

    if input.quantity_delta < 0.0 && product.track_expiry {
        let remaining = (-input.quantity_delta).max(0.0);
        let batches = {
            let mut statement = transaction.prepare(
                "SELECT id, quantity_remaining FROM stock_batches
                 WHERE product_id = ?1 AND quantity_remaining > 0
                 ORDER BY CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END, expiry_date, id",
            )?;
            let rows = statement
                .query_map(params![input.product_id], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, f64>(1)?))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            rows
        };
        let mut remaining = remaining;
        for (batch_id, available) in batches {
            if remaining <= 0.0 {
                break;
            }
            let taken = remaining.min(available);
            transaction.execute(
                "UPDATE stock_batches SET quantity_remaining = quantity_remaining - ?1 WHERE id = ?2",
                params![taken, batch_id],
            )?;
            remaining -= taken;
        }
    } else if input.quantity_delta > 0.0 && product.track_expiry {
        transaction.execute(
            "INSERT INTO stock_batches
             (product_id, quantity_remaining, expiry_date, received_at, purchase_item_id)
             VALUES (?1, ?2, NULL, ?3, NULL)",
            params![input.product_id, input.quantity_delta, now],
        )?;
    }

    log_audit(
        &transaction,
        Some(actor.id),
        Some(device_id),
        "stock_adjustment",
        "products",
        Some(&input.product_id.to_string()),
        Some(&json!({ "stock": product.stock_quantity }).to_string()),
        Some(
            &json!({
                "stock": new_stock,
                "delta": input.quantity_delta,
                "type": input.movement_type,
                "reason": reason
            })
            .to_string(),
        ),
    )?;
    transaction.commit()?;
    db::get_product_raw(conn, input.product_id)
}

pub fn list_expiring_batches(conn: &Connection, days: i64) -> AppResult<Vec<ExpiringBatch>> {
    let days = days.clamp(1, 365);
    let mut statement = conn.prepare(
        "SELECT b.id, b.product_id, p.name_fr AS product_name, b.quantity_remaining,
                b.expiry_date, b.received_at
         FROM stock_batches b JOIN products p ON p.id = b.product_id
         WHERE b.quantity_remaining > 0 AND b.expiry_date IS NOT NULL
           AND b.expiry_date <= date('now','localtime', ?1)
           AND p.is_active = 1
         ORDER BY b.expiry_date ASC LIMIT 50",
    )?;
    let modifier = format!("+{days} days");
    let rows = statement.query_map(params![modifier], |row| {
        let expiry_date: Option<String> = row.get("expiry_date")?;
        let days_left = expiry_date
            .as_deref()
            .and_then(db::parse_date)
            .map(db::days_until)
            .unwrap_or(0);
        Ok(ExpiringBatch {
            id: row.get("id")?,
            product_id: row.get("product_id")?,
            product_name: row.get("product_name")?,
            quantity_remaining: row.get("quantity_remaining")?,
            expiry_date,
            received_at: row.get("received_at")?,
            days_left,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn supplier_select() -> &'static str {
    "SELECT s.id, s.name, s.phone, s.is_active,
            COALESCE((SELECT SUM(l.amount) FROM supplier_ledger l WHERE l.supplier_id = s.id), 0) AS balance
     FROM suppliers s"
}

fn map_supplier(row: &Row<'_>) -> rusqlite::Result<Supplier> {
    Ok(Supplier {
        id: row.get("id")?,
        name: row.get("name")?,
        phone: row.get("phone")?,
        is_active: row.get::<_, i64>("is_active")? != 0,
        balance: row.get("balance")?,
    })
}

pub fn list_suppliers(conn: &Connection, include_inactive: bool) -> AppResult<Vec<Supplier>> {
    let sql = format!(
        "{}{} ORDER BY s.name COLLATE NOCASE",
        supplier_select(),
        if include_inactive {
            ""
        } else {
            " WHERE s.is_active = 1"
        }
    );
    let mut statement = conn.prepare(&sql)?;
    let rows = statement.query_map([], map_supplier)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn get_supplier(conn: &Connection, id: i64) -> AppResult<Supplier> {
    conn.query_row(
        &format!("{} WHERE s.id = ?1", supplier_select()),
        params![id],
        map_supplier,
    )
    .optional()?
    .or_not_found("Supplier not found.")
}

pub fn create_supplier(
    conn: &Connection,
    input: SupplierInput,
    actor_id: i64,
    device_id: Option<&str>,
) -> AppResult<Supplier> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::new("Supplier name is required."));
    }
    conn.execute(
        "INSERT INTO suppliers (name, phone, is_active) VALUES (?1, ?2, ?3)",
        params![
            name,
            input.phone.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            input.is_active as i64
        ],
    )?;
    let id = conn.last_insert_rowid();
    log_audit(
        conn,
        Some(actor_id),
        device_id,
        "supplier_created",
        "suppliers",
        Some(&id.to_string()),
        None,
        Some(&json!({ "name": name }).to_string()),
    )?;
    get_supplier(conn, id)
}

pub fn update_supplier(
    conn: &Connection,
    id: i64,
    input: SupplierInput,
    actor_id: i64,
    device_id: Option<&str>,
) -> AppResult<Supplier> {
    let existing = get_supplier(conn, id)?;
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::new("Supplier name is required."));
    }
    conn.execute(
        "UPDATE suppliers SET name = ?1, phone = ?2, is_active = ?3 WHERE id = ?4",
        params![
            name,
            input.phone.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            input.is_active as i64,
            id
        ],
    )?;
    log_audit(
        conn,
        Some(actor_id),
        device_id,
        "supplier_updated",
        "suppliers",
        Some(&id.to_string()),
        Some(&serde_json::to_string(&existing).unwrap_or_default()),
        Some(&json!({ "name": name, "isActive": input.is_active }).to_string()),
    )?;
    get_supplier(conn, id)
}

fn map_purchase(row: &Row<'_>) -> rusqlite::Result<Purchase> {
    Ok(Purchase {
        id: row.get("id")?,
        supplier_id: row.get("supplier_id")?,
        supplier_name: row.get("supplier_name")?,
        user_id: row.get("user_id")?,
        user_name: row.get("user_name")?,
        reference: row.get("reference")?,
        total: row.get("total")?,
        paid_amount: row.get("paid_amount")?,
        created_at: row.get("created_at")?,
        items: Vec::new(),
    })
}

const PURCHASE_SELECT: &str = "SELECT pu.id, pu.supplier_id, s.name AS supplier_name, pu.user_id,
    u.full_name AS user_name, pu.reference, pu.total, pu.paid_amount, pu.created_at
    FROM purchases pu JOIN suppliers s ON s.id = pu.supplier_id
    JOIN users u ON u.id = pu.user_id";

fn attach_purchase_items(conn: &Connection, purchases: &mut [Purchase]) -> AppResult<()> {
    if purchases.is_empty() {
        return Ok(());
    }
    let ids: Vec<i64> = purchases.iter().map(|purchase| purchase.id).collect();
    let placeholders = vec!["?"; ids.len()].join(",");
    let sql = format!(
        "SELECT pi.id, pi.purchase_id, pi.product_id, p.name_fr AS product_name,
                pi.quantity, pi.unit_cost, pi.expiry_date
         FROM purchase_items pi JOIN products p ON p.id = pi.product_id
         WHERE pi.purchase_id IN ({placeholders}) ORDER BY pi.rowid"
    );
    let mut statement = conn.prepare(&sql)?;
    let rows = statement.query_map(rusqlite::params_from_iter(ids.iter()), |row| {
        let quantity: f64 = row.get("quantity")?;
        let unit_cost: i64 = row.get("unit_cost")?;
        Ok((
            row.get::<_, i64>("purchase_id")?,
            PurchaseItem {
                id: row.get("id")?,
                product_id: row.get("product_id")?,
                product_name: row.get("product_name")?,
                quantity,
                unit_cost,
                line_total: (quantity * unit_cost as f64).round() as i64,
                expiry_date: row.get("expiry_date")?,
            },
        ))
    })?;
    let mut grouped: BTreeMap<i64, Vec<PurchaseItem>> = BTreeMap::new();
    for row in rows {
        let (purchase_id, item) = row?;
        grouped.entry(purchase_id).or_default().push(item);
    }
    for purchase in purchases {
        purchase.items = grouped.remove(&purchase.id).unwrap_or_default();
    }
    Ok(())
}

pub fn get_purchase(conn: &Connection, id: i64) -> AppResult<Purchase> {
    let purchase = conn
        .query_row(
            &format!("{PURCHASE_SELECT} WHERE pu.id = ?1"),
            params![id],
            map_purchase,
        )
        .optional()?
        .or_not_found("Purchase not found.")?;
    let mut purchases = vec![purchase];
    attach_purchase_items(conn, &mut purchases)?;
    Ok(purchases.pop().expect("purchase exists"))
}

pub fn list_purchases(conn: &Connection, limit: i64) -> AppResult<Vec<Purchase>> {
    let mut statement = conn.prepare(&format!(
        "{PURCHASE_SELECT} ORDER BY pu.created_at DESC, pu.id DESC LIMIT ?1"
    ))?;
    let rows = statement.query_map(params![limit.clamp(1, 500)], map_purchase)?;
    let mut purchases = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    attach_purchase_items(conn, &mut purchases)?;
    Ok(purchases)
}

pub fn create_purchase(
    conn: &mut Connection,
    actor: &User,
    device_id: &str,
    input: CreatePurchaseInput,
) -> AppResult<Purchase> {
    if input.items.is_empty() {
        return Err(AppError::new("Add at least one product to the purchase."));
    }
    if input.paid_amount < 0 {
        return Err(AppError::new("Paid amount cannot be negative."));
    }
    let supplier = get_supplier(conn, input.supplier_id)?;
    if !supplier.is_active {
        return Err(AppError::new("This supplier is inactive."));
    }

    let mut merged: BTreeMap<i64, (f64, i64, Option<String>)> = BTreeMap::new();
    for item in input.items {
        if !item.quantity.is_finite() || item.quantity <= 0.0 {
            return Err(AppError::new("Every purchase quantity must be greater than zero."));
        }
        if item.unit_cost < 0 {
            return Err(AppError::new("Unit cost cannot be negative."));
        }
        if let Some(expiry) = item.expiry_date.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
            if db::parse_date(expiry).is_none() {
                return Err(AppError::new("Expiry date must use YYYY-MM-DD format."));
            }
        }
        let entry = merged
            .entry(item.product_id)
            .or_insert((0.0, item.unit_cost, item.expiry_date.clone()));
        entry.0 += (item.quantity * 1000.0).round() / 1000.0;
    }

    let total: i64 = merged
        .values()
        .map(|(quantity, unit_cost, _)| (quantity * *unit_cost as f64).round() as i64)
        .sum();
    if input.paid_amount > total {
        return Err(AppError::new(
            "Paid amount cannot exceed the purchase total.",
        ));
    }

    let transaction = conn.transaction()?;
    let now = db::now_local();
    let reference = input
        .reference
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    transaction.execute(
        "INSERT INTO purchases (supplier_id, user_id, reference, total, paid_amount, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            input.supplier_id,
            actor.id,
            reference,
            total,
            input.paid_amount,
            now
        ],
    )?;
    let purchase_id = transaction.last_insert_rowid();

    for (product_id, (quantity, unit_cost, expiry_date)) in &merged {
        let product = db::get_product_raw(&transaction, *product_id)?;
        transaction.execute(
            "INSERT INTO purchase_items
             (purchase_id, product_id, quantity, unit_cost, expiry_date)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![purchase_id, product_id, quantity, unit_cost, expiry_date],
        )?;
        let purchase_item_id = transaction.last_insert_rowid();
        transaction.execute(
            "UPDATE products SET stock_quantity = stock_quantity + ?1, cost_price = ?2, updated_at = ?3
             WHERE id = ?4",
            params![quantity, unit_cost, now, product_id],
        )?;
        transaction.execute(
            "INSERT INTO stock_movements
             (id, product_id, type, quantity, reason, user_id, device_id, sale_id, purchase_id, created_at)
             VALUES (?1, ?2, 'purchase', ?3, ?4, ?5, ?6, NULL, ?7, ?8)",
            params![
                Uuid::new_v4().to_string(),
                product_id,
                quantity,
                reference
                    .map(|value| format!("Purchase #{purchase_id} - {value}"))
                    .unwrap_or_else(|| format!("Purchase #{purchase_id}")),
                actor.id,
                device_id,
                purchase_id,
                now
            ],
        )?;
        if expiry_date.is_some() || product.track_expiry {
            transaction.execute(
                "INSERT INTO stock_batches
                 (product_id, quantity_remaining, expiry_date, received_at, purchase_item_id)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![product_id, quantity, expiry_date, now, purchase_item_id],
            )?;
        }
    }

    transaction.execute(
        "INSERT INTO supplier_ledger (id, supplier_id, purchase_id, amount, note, user_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            Uuid::new_v4().to_string(),
            input.supplier_id,
            purchase_id,
            total,
            reference.map(|value| format!("Purchase #{purchase_id} - {value}")),
            actor.id,
            now
        ],
    )?;
    if input.paid_amount > 0 {
        transaction.execute(
            "INSERT INTO supplier_ledger (id, supplier_id, purchase_id, amount, note, user_id, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                Uuid::new_v4().to_string(),
                input.supplier_id,
                purchase_id,
                -input.paid_amount,
                format!("Payment on purchase #{purchase_id}"),
                actor.id,
                now
            ],
        )?;
    }

    log_audit(
        &transaction,
        Some(actor.id),
        Some(device_id),
        "purchase_created",
        "purchases",
        Some(&purchase_id.to_string()),
        None,
        Some(
            &json!({
                "supplier": supplier.name,
                "total": total,
                "paid": input.paid_amount,
                "items": merged.len()
            })
            .to_string(),
        ),
    )?;

    transaction.commit()?;
    get_purchase(conn, purchase_id)
}
