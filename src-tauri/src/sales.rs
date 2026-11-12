use std::collections::BTreeMap;

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde_json::json;
use uuid::Uuid;

use crate::customers;
use crate::db::{self, get_shop_settings, log_audit};
use crate::error::{AppError, AppResult, OptionExt};
use crate::models::{
    is_one_of, CreateSaleInput, Payment, Sale, SaleItem, User, PAYMENT_METHODS, PRICE_TIERS,
};
use crate::shifts;

const SALE_SELECT: &str = "SELECT s.id, s.type AS sale_type, s.original_sale_id, s.receipt_number,
    s.device_seq, s.user_id, u.full_name AS user_name, s.shift_id, s.customer_id,
    c.name AS customer_name, s.price_tier, s.subtotal, s.discount, s.vat_total, s.stamp_duty,
    s.total, s.created_offline, s.created_at
    FROM sales s JOIN users u ON u.id = s.user_id
    LEFT JOIN customers c ON c.id = s.customer_id";

fn map_sale(row: &Row<'_>) -> rusqlite::Result<Sale> {
    Ok(Sale {
        id: row.get("id")?,
        sale_type: row.get("sale_type")?,
        original_sale_id: row.get("original_sale_id")?,
        receipt_number: row.get("receipt_number")?,
        device_seq: row.get("device_seq")?,
        user_id: row.get("user_id")?,
        user_name: row.get("user_name")?,
        shift_id: row.get("shift_id")?,
        customer_id: row.get("customer_id")?,
        customer_name: row.get("customer_name")?,
        price_tier: row.get("price_tier")?,
        subtotal: row.get("subtotal")?,
        discount: row.get("discount")?,
        vat_total: row.get("vat_total")?,
        stamp_duty: row.get("stamp_duty")?,
        total: row.get("total")?,
        created_offline: row.get::<_, i64>("created_offline")? != 0,
        created_at: row.get("created_at")?,
        items: Vec::new(),
        payments: Vec::new(),
    })
}

fn attach_children(conn: &Connection, sales: &mut [Sale]) -> AppResult<()> {
    if sales.is_empty() {
        return Ok(());
    }
    let ids: Vec<String> = sales.iter().map(|sale| sale.id.clone()).collect();
    let placeholders = vec!["?"; ids.len()].join(",");

    let items_sql = format!(
        "SELECT si.id, si.sale_id, si.product_id, p.name_fr AS product_name,
                p.name_ar AS product_name_ar, si.quantity, si.unit_price, si.unit_cost,
                si.vat_rate, si.line_total
         FROM sale_items si JOIN products p ON p.id = si.product_id
         WHERE si.sale_id IN ({placeholders}) ORDER BY si.rowid"
    );
    let mut statement = conn.prepare(&items_sql)?;
    let rows = statement.query_map(rusqlite::params_from_iter(ids.iter()), |row| {
        Ok((
            row.get::<_, String>("sale_id")?,
            SaleItem {
                id: row.get("id")?,
                product_id: row.get("product_id")?,
                product_name: row.get("product_name")?,
                product_name_ar: row.get("product_name_ar")?,
                quantity: row.get("quantity")?,
                unit_price: row.get("unit_price")?,
                unit_cost: row.get("unit_cost")?,
                vat_rate: row.get("vat_rate")?,
                line_total: row.get("line_total")?,
            },
        ))
    })?;
    let mut grouped_items: BTreeMap<String, Vec<SaleItem>> = BTreeMap::new();
    for row in rows {
        let (sale_id, item) = row?;
        grouped_items.entry(sale_id).or_default().push(item);
    }

    let payments_sql = format!(
        "SELECT id, sale_id, method, amount, cash_given, created_at
         FROM payments WHERE sale_id IN ({placeholders}) ORDER BY rowid"
    );
    let mut statement = conn.prepare(&payments_sql)?;
    let rows = statement.query_map(rusqlite::params_from_iter(ids.iter()), |row| {
        Ok((
            row.get::<_, String>("sale_id")?,
            Payment {
                id: row.get("id")?,
                sale_id: row.get("sale_id")?,
                method: row.get("method")?,
                amount: row.get("amount")?,
                cash_given: row.get("cash_given")?,
                created_at: row.get("created_at")?,
            },
        ))
    })?;
    let mut grouped_payments: BTreeMap<String, Vec<Payment>> = BTreeMap::new();
    for row in rows {
        let (sale_id, payment) = row?;
        grouped_payments.entry(sale_id).or_default().push(payment);
    }

    for sale in sales {
        sale.items = grouped_items.remove(&sale.id).unwrap_or_default();
        sale.payments = grouped_payments.remove(&sale.id).unwrap_or_default();
    }
    Ok(())
}

pub fn get_sale(conn: &Connection, id: &str) -> AppResult<Sale> {
    let sale = conn
        .query_row(
            &format!("{SALE_SELECT} WHERE s.id = ?1"),
            params![id],
            map_sale,
        )
        .optional()?
        .or_not_found("Sale not found.")?;
    let mut sales = vec![sale];
    attach_children(conn, &mut sales)?;
    Ok(sales.pop().expect("sale exists"))
}

pub fn list_sales(
    conn: &Connection,
    period: &str,
    worker_id: Option<i64>,
    limit: i64,
) -> AppResult<Vec<Sale>> {
    let clause = db::period_clause(period);
    let mut sql = format!("{SALE_SELECT} WHERE {clause}");
    let mut values: Vec<rusqlite::types::Value> = Vec::new();
    if let Some(worker_id) = worker_id {
        sql.push_str(" AND s.user_id = ?");
        values.push(rusqlite::types::Value::Integer(worker_id));
    }
    sql.push_str(" ORDER BY s.created_at DESC, s.rowid DESC LIMIT ?");
    values.push(rusqlite::types::Value::Integer(limit.clamp(1, 500)));

    let mut statement = conn.prepare(&sql)?;
    let rows = statement.query_map(rusqlite::params_from_iter(values.iter()), map_sale)?;
    let mut sales = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    attach_children(conn, &mut sales)?;
    Ok(sales)
}

fn round_quantity(value: f64) -> f64 {
    (value * 1000.0).round() / 1000.0
}

fn round_money(value: f64) -> i64 {
    value.round() as i64
}

struct Line {
    product_id: i64,
    quantity: f64,
    unit_price: i64,
    unit_cost: i64,
    vat_rate: f64,
    line_total: i64,
    track_expiry: bool,
}

fn next_receipt(
    tx: &Connection,
    device_id: &str,
) -> AppResult<(String, i64, String)> {
    let (prefix, device_ok): (String, i64) = tx
        .query_row(
            "SELECT receipt_prefix, is_active FROM devices WHERE id = ?1",
            params![device_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?
        .or_not_found("Receipt device not found.")?;
    if device_ok == 0 {
        return Err(AppError::new("This device is deactivated."));
    }
    let sequence: i64 = tx.query_row(
        "SELECT COALESCE(MAX(device_seq), 0) + 1 FROM sales WHERE device_id = ?1",
        params![device_id],
        |row| row.get(0),
    )?;
    let receipt_number = format!("{prefix}-{sequence:06}");
    Ok((receipt_number, sequence, prefix))
}

fn consume_batches(tx: &Connection, product_id: i64, quantity: f64) -> AppResult<()> {
    if quantity <= 0.0 {
        return Ok(());
    }
    let batches = {
        let mut statement = tx.prepare(
            "SELECT id, quantity_remaining FROM stock_batches
             WHERE product_id = ?1 AND quantity_remaining > 0
             ORDER BY CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END, expiry_date, id",
        )?;
        let rows = statement.query_map(params![product_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, f64>(1)?))
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };

    let mut remaining = quantity;
    for (batch_id, available) in batches {
        if remaining <= 0.0 {
            break;
        }
        let taken = remaining.min(available);
        tx.execute(
            "UPDATE stock_batches SET quantity_remaining = quantity_remaining - ?1 WHERE id = ?2",
            params![taken, batch_id],
        )?;
        remaining -= taken;
    }
    Ok(())
}

pub fn create_sale(
    conn: &mut Connection,
    actor: &User,
    device_id: &str,
    input: CreateSaleInput,
) -> AppResult<Sale> {
    if input.items.is_empty() {
        return Err(AppError::new("Add at least one product to the sale."));
    }
    if !is_one_of(&input.price_tier, &PRICE_TIERS) {
        return Err(AppError::new("Unknown price tier."));
    }
    if !is_one_of(&input.payment_method, &PAYMENT_METHODS) {
        return Err(AppError::new("Unknown payment method."));
    }
    if input.discount < 0 {
        return Err(AppError::new("Discount cannot be negative."));
    }
    if actor.role == "cashier" && input.discount > 0 {
        return Err(AppError::new(
            "Cashiers are not allowed to apply discounts.",
        ));
    }
    if input.payment_method == "credit" && input.customer_id.is_none() {
        return Err(AppError::new(
            "A customer is required for a credit sale.",
        ));
    }

    let mut requested: BTreeMap<i64, f64> = BTreeMap::new();
    for item in &input.items {
        if !item.quantity.is_finite() || item.quantity <= 0.0 {
            return Err(AppError::new("Every sale quantity must be greater than zero."));
        }
        *requested.entry(item.product_id).or_insert(0.0) += round_quantity(item.quantity);
    }

    let transaction = conn.transaction()?;
    let settings = get_shop_settings(&transaction)?;
    let shift = shifts::current_shift(&transaction, actor.id, device_id)?;
    let shift_id = shift.as_ref().map(|value| value.id);

    let mut lines: Vec<Line> = Vec::new();
    let mut subtotal: i64 = 0;

    for (product_id, quantity) in requested {
        let product = crate::db::get_product_raw(&transaction, product_id)?;
        if !product.is_active {
            return Err(AppError::new(format!(
                "{} is archived and cannot be sold.",
                product.name_fr
            )));
        }
        if product.unit_type == "unit" && quantity.fract() != 0.0 {
            return Err(AppError::new(format!(
                "{} is sold by unit and needs a whole quantity.",
                product.name_fr
            )));
        }
        if !settings.allow_negative_stock && product.stock_quantity + 0.0005 < quantity {
            return Err(AppError::new(format!(
                "Not enough stock for {}. Available: {}, requested: {}.",
                product.name_fr, product.stock_quantity, quantity
            )));
        }
        let unit_price = if input.price_tier == "wholesale" {
            product.price_wholesale.unwrap_or(product.price_retail)
        } else {
            product.price_retail
        };
        let line_total = round_money(unit_price as f64 * quantity);
        subtotal += line_total;
        lines.push(Line {
            product_id: product.id,
            quantity,
            unit_price,
            unit_cost: product.cost_price,
            vat_rate: product.vat_rate,
            line_total,
            track_expiry: product.track_expiry,
        });
    }

    if input.discount > subtotal {
        return Err(AppError::new("Discount cannot exceed the subtotal."));
    }
    let total_before_stamp = subtotal - input.discount;
    let vat_total = if settings.vat_enabled && subtotal > 0 {
        let vat_share: f64 = lines
            .iter()
            .map(|line| {
                line.line_total as f64 * line.vat_rate / (100.0 + line.vat_rate)
            })
            .sum();
        round_money(vat_share * total_before_stamp as f64 / subtotal as f64)
    } else {
        0
    };
    let stamp_duty = if settings.stamp_duty_enabled && input.payment_method == "cash" {
        100
    } else {
        0
    };
    let total = total_before_stamp + stamp_duty;

    let customer = match input.customer_id {
        Some(customer_id) => {
            let customer = customers::get_customer(&transaction, customer_id)?;
            if !customer.is_active {
                return Err(AppError::new("This customer account is inactive."));
            }
            if input.payment_method == "credit" {
                if let Some(limit) = customer.credit_limit {
                    if customer.balance + total > limit {
                        return Err(AppError::new(format!(
                            "Credit limit exceeded for {}. Current balance: {:.2} DA, limit: {:.2} DA.",
                            customer.name,
                            customer.balance as f64 / 100.0,
                            limit as f64 / 100.0
                        )));
                    }
                }
            }
            Some(customer)
        }
        None => None,
    };

    let cash_given = if input.payment_method == "cash" {
        let given = input
            .cash_given
            .ok_or_else(|| AppError::new("Enter the cash amount received."))?;
        if given < total {
            return Err(AppError::new(format!(
                "Cash received is short by {:.2} DA.",
                (total - given) as f64 / 100.0
            )));
        }
        Some(given)
    } else {
        None
    };

    let (receipt_number, device_seq, _prefix) = next_receipt(&transaction, device_id)?;
    let now = db::now_local();
    let sale_id = Uuid::new_v4().to_string();

    transaction.execute(
        "INSERT INTO sales
         (id, type, original_sale_id, receipt_number, device_id, device_seq, user_id, shift_id,
          customer_id, price_tier, subtotal, discount, vat_total, stamp_duty, total,
          created_offline, created_at, synced_at)
         VALUES (?1, 'sale', NULL, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 0, ?14, ?14)",
        params![
            sale_id,
            receipt_number,
            device_id,
            device_seq,
            actor.id,
            shift_id,
            input.customer_id,
            input.price_tier,
            subtotal,
            input.discount,
            vat_total,
            stamp_duty,
            total,
            now
        ],
    )?;

    for line in &lines {
        transaction.execute(
            "INSERT INTO sale_items
             (id, sale_id, product_id, quantity, unit_price, unit_cost, vat_rate, line_total)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                Uuid::new_v4().to_string(),
                sale_id,
                line.product_id,
                line.quantity,
                line.unit_price,
                line.unit_cost,
                line.vat_rate,
                line.line_total
            ],
        )?;
        transaction.execute(
            "UPDATE products SET stock_quantity = stock_quantity - ?1, updated_at = ?2 WHERE id = ?3",
            params![line.quantity, now, line.product_id],
        )?;
        if line.track_expiry {
            consume_batches(&transaction, line.product_id, line.quantity)?;
        }
        transaction.execute(
            "INSERT INTO stock_movements
             (id, product_id, type, quantity, reason, user_id, device_id, sale_id, purchase_id, created_at)
             VALUES (?1, ?2, 'sale', ?3, ?4, ?5, ?6, ?7, NULL, ?8)",
            params![
                Uuid::new_v4().to_string(),
                line.product_id,
                -line.quantity,
                format!("Sale {receipt_number}"),
                actor.id,
                device_id,
                sale_id,
                now
            ],
        )?;
    }

    transaction.execute(
        "INSERT INTO payments (id, sale_id, method, amount, cash_given, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            Uuid::new_v4().to_string(),
            sale_id,
            input.payment_method,
            total,
            cash_given,
            now
        ],
    )?;

    if input.payment_method == "credit" {
        let customer = customer.as_ref().expect("credit sale has customer");
        transaction.execute(
            "INSERT INTO customer_ledger
             (id, customer_id, type, amount, sale_id, payment_method, user_id, note, created_at)
             VALUES (?1, ?2, 'credit_sale', ?3, ?4, 'credit', ?5, ?6, ?7)",
            params![
                Uuid::new_v4().to_string(),
                customer.id,
                total,
                sale_id,
                actor.id,
                format!("Credit sale {receipt_number}"),
                now
            ],
        )?;
    }

    log_audit(
        &transaction,
        Some(actor.id),
        Some(device_id),
        "sale_created",
        "sales",
        Some(&sale_id),
        None,
        Some(
            &json!({
                "receipt": receipt_number,
                "total": total,
                "payment": input.payment_method,
                "items": lines.len()
            })
            .to_string(),
        ),
    )?;

    transaction.commit()?;
    get_sale(conn, &sale_id)
}

pub fn return_sale(
    conn: &mut Connection,
    actor: &User,
    device_id: &str,
    original_sale_id: &str,
) -> AppResult<Sale> {
    if actor.role == "cashier" {
        return Err(AppError::new("Cashiers cannot process returns."));
    }

    let original = get_sale(conn, original_sale_id)?;
    if original.sale_type != "sale" {
        return Err(AppError::new("Only a completed sale can be returned."));
    }
    let already: Option<String> = conn
        .query_row(
            "SELECT id FROM sales WHERE original_sale_id = ?1 AND type = 'return' LIMIT 1",
            params![original_sale_id],
            |row| row.get(0),
        )
        .optional()?;
    if already.is_some() {
        return Err(AppError::new("This sale has already been returned."));
    }

    let payment_method = original
        .payments
        .first()
        .map(|payment| payment.method.clone())
        .ok_or_else(|| AppError::new("Original sale has no payment record."))?;

    let transaction = conn.transaction()?;
    let shift = shifts::current_shift(&transaction, actor.id, device_id)?;
    let shift_id = shift.as_ref().map(|value| value.id);
    let (receipt_number, device_seq, _prefix) = next_receipt(&transaction, device_id)?;
    let now = db::now_local();
    let return_id = Uuid::new_v4().to_string();

    transaction.execute(
        "INSERT INTO sales
         (id, type, original_sale_id, receipt_number, device_id, device_seq, user_id, shift_id,
          customer_id, price_tier, subtotal, discount, vat_total, stamp_duty, total,
          created_offline, created_at, synced_at)
         VALUES (?1, 'return', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 0, ?15, ?15)",
        params![
            return_id,
            original.id,
            receipt_number,
            device_id,
            device_seq,
            actor.id,
            shift_id,
            original.customer_id,
            original.price_tier,
            original.subtotal,
            original.discount,
            original.vat_total,
            original.stamp_duty,
            original.total,
            now
        ],
    )?;

    for item in &original.items {
        transaction.execute(
            "INSERT INTO sale_items
             (id, sale_id, product_id, quantity, unit_price, unit_cost, vat_rate, line_total)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                Uuid::new_v4().to_string(),
                return_id,
                item.product_id,
                item.quantity,
                item.unit_price,
                item.unit_cost,
                item.vat_rate,
                item.line_total
            ],
        )?;
        transaction.execute(
            "UPDATE products SET stock_quantity = stock_quantity + ?1, updated_at = ?2 WHERE id = ?3",
            params![item.quantity, now, item.product_id],
        )?;
        transaction.execute(
            "INSERT INTO stock_movements
             (id, product_id, type, quantity, reason, user_id, device_id, sale_id, purchase_id, created_at)
             VALUES (?1, ?2, 'customer_return', ?3, ?4, ?5, ?6, ?7, NULL, ?8)",
            params![
                Uuid::new_v4().to_string(),
                item.product_id,
                item.quantity,
                format!("Return of {receipt_number}"),
                actor.id,
                device_id,
                return_id,
                now
            ],
        )?;
        if let Ok(product) = crate::db::get_product_raw(&transaction, item.product_id) {
            if product.track_expiry {
                transaction.execute(
                    "INSERT INTO stock_batches
                     (product_id, quantity_remaining, expiry_date, received_at, purchase_item_id)
                     VALUES (?1, ?2, NULL, ?3, NULL)",
                    params![item.product_id, item.quantity, now],
                )?;
            }
        }
    }

    transaction.execute(
        "INSERT INTO payments (id, sale_id, method, amount, cash_given, created_at)
         VALUES (?1, ?2, ?3, ?4, NULL, ?5)",
        params![
            Uuid::new_v4().to_string(),
            return_id,
            payment_method,
            original.total,
            now
        ],
    )?;

    if payment_method == "credit" {
        if let Some(customer_id) = original.customer_id {
            transaction.execute(
                "INSERT INTO customer_ledger
                 (id, customer_id, type, amount, sale_id, payment_method, user_id, note, created_at)
                 VALUES (?1, ?2, 'adjustment', ?3, ?4, 'credit', ?5, ?6, ?7)",
                params![
                    Uuid::new_v4().to_string(),
                    customer_id,
                    -original.total,
                    return_id,
                    actor.id,
                    format!("Return of {receipt_number}"),
                    now
                ],
            )?;
        }
    }

    log_audit(
        &transaction,
        Some(actor.id),
        Some(device_id),
        "sale_returned",
        "sales",
        Some(&return_id),
        Some(&json!({ "originalSaleId": original.id }).to_string()),
        Some(
            &json!({
                "receipt": receipt_number,
                "total": original.total,
                "payment": payment_method
            })
            .to_string(),
        ),
    )?;

    transaction.commit()?;
    get_sale(conn, &return_id)
}
