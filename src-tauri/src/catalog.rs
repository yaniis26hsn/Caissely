use rusqlite::{params, Connection, OptionalExtension};
use serde_json::json;

use crate::db::{self, attach_barcodes, log_audit, map_product, PRODUCT_SELECT};
use crate::error::{AppError, AppResult};
use crate::models::{
    is_one_of, BarcodeInput, Category, CategoryInput, CreateProductInput, Product, ScanResult,
    UpdateProductInput, UNIT_TYPES,
};

fn validate_money(value: i64, label: &str) -> AppResult<()> {
    if value < 0 {
        return Err(AppError::new(format!("{label} cannot be negative.")));
    }
    Ok(())
}

fn validate_quantity(value: f64, label: &str) -> AppResult<()> {
    if !value.is_finite() || value < 0.0 {
        return Err(AppError::new(format!("{label} cannot be negative.")));
    }
    Ok(())
}

fn validate_vat(value: f64) -> AppResult<()> {
    if !value.is_finite() || !(0.0..=100.0).contains(&value) {
        return Err(AppError::new("VAT rate must be between 0 and 100."));
    }
    Ok(())
}

fn validate_barcodes(barcodes: &[BarcodeInput]) -> AppResult<()> {
    let mut seen = std::collections::HashSet::new();
    for barcode in barcodes {
        let value = barcode.barcode.trim();
        if value.is_empty() {
            return Err(AppError::new("Barcode value cannot be empty."));
        }
        if !seen.insert(value.to_string()) {
            return Err(AppError::new(format!(
                "Barcode {value} is listed twice on this product."
            )));
        }
        if barcode.units_per_barcode <= 0 {
            return Err(AppError::new(
                "Units per barcode must be greater than zero.",
            ));
        }
    }
    Ok(())
}

fn category_exists(conn: &Connection, category_id: Option<i64>) -> AppResult<()> {
    if let Some(category_id) = category_id {
        let exists: Option<i64> = conn
            .query_row(
                "SELECT id FROM categories WHERE id = ?1",
                params![category_id],
                |row| row.get(0),
            )
            .optional()?;
        if exists.is_none() {
            return Err(AppError::new("Selected category no longer exists."));
        }
    }
    Ok(())
}

pub fn list_categories(conn: &Connection, include_inactive: bool) -> AppResult<Vec<Category>> {
    let sql = if include_inactive {
        "SELECT id, name_ar, name_fr, is_active FROM categories ORDER BY name_fr COLLATE NOCASE"
    } else {
        "SELECT id, name_ar, name_fr, is_active FROM categories WHERE is_active = 1 ORDER BY name_fr COLLATE NOCASE"
    };
    let mut statement = conn.prepare(sql)?;
    let rows = statement.query_map([], |row| {
        Ok(Category {
            id: row.get(0)?,
            name_ar: row.get(1)?,
            name_fr: row.get(2)?,
            is_active: row.get::<_, i64>(3)? != 0,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn create_category(
    conn: &Connection,
    input: CategoryInput,
    actor_id: i64,
    device_id: Option<&str>,
) -> AppResult<Category> {
    let name_fr = input.name_fr.trim().to_string();
    if name_fr.is_empty() {
        return Err(AppError::new("French category name is required."));
    }
    let duplicate: Option<i64> = conn
        .query_row(
            "SELECT id FROM categories WHERE name_fr = ?1 COLLATE NOCASE",
            params![name_fr],
            |row| row.get(0),
        )
        .optional()?;
    if duplicate.is_some() {
        return Err(AppError::new("A category with that French name already exists."));
    }
    conn.execute(
        "INSERT INTO categories (name_ar, name_fr, is_active) VALUES (?1, ?2, ?3)",
        params![
            input.name_ar.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            name_fr,
            input.is_active as i64
        ],
    )?;
    let id = conn.last_insert_rowid();
    log_audit(
        conn,
        Some(actor_id),
        device_id,
        "category_created",
        "categories",
        Some(&id.to_string()),
        None,
        Some(&json!({ "nameFr": name_fr }).to_string()),
    )?;
    Ok(Category {
        id,
        name_ar: input.name_ar,
        name_fr,
        is_active: input.is_active,
    })
}

pub fn update_category(
    conn: &Connection,
    id: i64,
    input: CategoryInput,
    actor_id: i64,
    device_id: Option<&str>,
) -> AppResult<Category> {
    let name_fr = input.name_fr.trim().to_string();
    if name_fr.is_empty() {
        return Err(AppError::new("French category name is required."));
    }
    let duplicate: Option<i64> = conn
        .query_row(
            "SELECT id FROM categories WHERE name_fr = ?1 COLLATE NOCASE AND id <> ?2",
            params![name_fr, id],
            |row| row.get(0),
        )
        .optional()?;
    if duplicate.is_some() {
        return Err(AppError::new("A category with that French name already exists."));
    }
    let updated_rows = conn.execute(
        "UPDATE categories SET name_ar = ?1, name_fr = ?2, is_active = ?3 WHERE id = ?4",
        params![
            input.name_ar.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            name_fr,
            input.is_active as i64,
            id
        ],
    )?;
    if updated_rows == 0 {
        return Err(AppError::new("Category not found."));
    }
    log_audit(
        conn,
        Some(actor_id),
        device_id,
        "category_updated",
        "categories",
        Some(&id.to_string()),
        None,
        Some(&json!({ "nameFr": name_fr }).to_string()),
    )?;
    Ok(Category {
        id,
        name_ar: input.name_ar,
        name_fr,
        is_active: input.is_active,
    })
}

pub fn list_products(
    conn: &Connection,
    search: Option<&str>,
    category_id: Option<i64>,
    stock: Option<&str>,
    include_inactive: bool,
) -> AppResult<Vec<Product>> {
    let mut sql = format!("{PRODUCT_SELECT} WHERE 1 = 1");
    let mut values: Vec<rusqlite::types::Value> = Vec::new();

    if !include_inactive {
        sql.push_str(" AND p.is_active = 1");
    }

    if let Some(search) = search.map(str::trim).filter(|value| !value.is_empty()) {
        let pattern = format!("%{search}%");
        sql.push_str(
            " AND (p.name_fr LIKE ? OR COALESCE(p.name_ar, '') LIKE ? OR EXISTS (
                SELECT 1 FROM product_barcodes b WHERE b.product_id = p.id AND b.barcode LIKE ?))",
        );
        values.push(rusqlite::types::Value::Text(pattern.clone()));
        values.push(rusqlite::types::Value::Text(pattern.clone()));
        values.push(rusqlite::types::Value::Text(pattern));
    }

    if let Some(category_id) = category_id {
        sql.push_str(" AND p.category_id = ?");
        values.push(rusqlite::types::Value::Integer(category_id));
    }

    match stock.unwrap_or("") {
        "out" => sql.push_str(" AND p.stock_quantity <= 0"),
        "low" => sql.push_str(" AND p.stock_quantity > 0 AND p.stock_quantity <= p.min_stock"),
        "in" => sql.push_str(" AND p.stock_quantity > p.min_stock"),
        _ => {}
    }

    sql.push_str(" ORDER BY p.name_fr COLLATE NOCASE");

    let mut statement = conn.prepare(&sql)?;
    let rows = statement.query_map(rusqlite::params_from_iter(values.iter()), map_product)?;
    let mut products = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    attach_barcodes(conn, &mut products)?;
    Ok(products)
}

pub fn get_product(conn: &Connection, id: i64) -> AppResult<Product> {
    db::get_product_raw(conn, id)
}

pub fn find_product_by_barcode(conn: &Connection, barcode: &str) -> AppResult<ScanResult> {
    let barcode = barcode.trim();
    if barcode.is_empty() {
        return Err(AppError::new("Barcode is empty."));
    }
    let found: Option<(i64, i64)> = conn
        .query_row(
            "SELECT p.id, b.units_per_barcode FROM product_barcodes b
             JOIN products p ON p.id = b.product_id
             WHERE b.barcode = ?1 AND p.is_active = 1",
            params![barcode],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    let Some((product_id, units_per_barcode)) = found else {
        return Err(AppError::new(format!("No product found for barcode {barcode}.")));
    };
    Ok(ScanResult {
        product: db::get_product_raw(conn, product_id)?,
        units_per_barcode,
    })
}

fn insert_barcodes(
    conn: &Connection,
    product_id: i64,
    barcodes: &[BarcodeInput],
) -> AppResult<()> {
    for barcode in barcodes {
        let value = barcode.barcode.trim();
        conn.execute(
            "INSERT INTO product_barcodes (product_id, barcode, units_per_barcode, label)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                product_id,
                value,
                barcode.units_per_barcode,
                barcode.label.as_deref().map(str::trim).filter(|label| !label.is_empty())
            ],
        )?;
    }
    Ok(())
}

pub fn create_product(
    conn: &mut Connection,
    input: CreateProductInput,
    actor_id: i64,
    device_id: Option<&str>,
) -> AppResult<Product> {
    let name_fr = input.name_fr.trim().to_string();
    if name_fr.is_empty() {
        return Err(AppError::new("French product name is required."));
    }
    if !is_one_of(&input.unit_type, &UNIT_TYPES) {
        return Err(AppError::new("Unknown unit type."));
    }
    if input.unit_type == "unit" && input.opening_stock.fract() != 0.0 {
        return Err(AppError::new(
            "Unit products must have a whole opening stock quantity.",
        ));
    }
    validate_money(input.price_retail, "Retail price")?;
    if let Some(price) = input.price_wholesale {
        validate_money(price, "Wholesale price")?;
    }
    validate_money(input.cost_price, "Cost price")?;
    validate_vat(input.vat_rate)?;
    validate_quantity(input.opening_stock, "Opening stock")?;
    validate_quantity(input.min_stock, "Minimum stock")?;
    validate_barcodes(&input.barcodes)?;
    category_exists(conn, input.category_id)?;

    let transaction = conn.transaction()?;
    let now = db::now_local();
    transaction.execute(
        "INSERT INTO products
         (name_ar, name_fr, category_id, unit_type, price_retail, price_wholesale, cost_price,
          vat_rate, stock_quantity, min_stock, track_expiry, is_active, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13)",
        params![
            input
                .name_ar
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty()),
            name_fr,
            input.category_id,
            input.unit_type,
            input.price_retail,
            input.price_wholesale,
            input.cost_price,
            input.vat_rate,
            input.opening_stock,
            input.min_stock,
            input.track_expiry as i64,
            input.is_active as i64,
            now
        ],
    )?;
    let id = transaction.last_insert_rowid();
    insert_barcodes(&transaction, id, &input.barcodes)?;

    if input.opening_stock > 0.0 {
        transaction.execute(
            "INSERT INTO stock_movements
             (id, product_id, type, quantity, reason, user_id, device_id, sale_id, purchase_id, created_at)
             VALUES (?1, ?2, 'adjustment', ?3, 'Opening stock', ?4, ?5, NULL, NULL, ?6)",
            params![
                uuid::Uuid::new_v4().to_string(),
                id,
                input.opening_stock,
                actor_id,
                device_id,
                now
            ],
        )?;
    }

    let product = db::get_product_raw(&transaction, id)?;
    log_audit(
        &transaction,
        Some(actor_id),
        device_id,
        "product_created",
        "products",
        Some(&id.to_string()),
        None,
        Some(&serde_json::to_string(&product).unwrap_or_default()),
    )?;
    transaction.commit()?;
    Ok(product)
}

pub fn update_product(
    conn: &mut Connection,
    id: i64,
    input: UpdateProductInput,
    actor_id: i64,
    device_id: Option<&str>,
) -> AppResult<Product> {
    let existing = db::get_product_raw(conn, id)?;
    let name_fr = input.name_fr.trim().to_string();
    if name_fr.is_empty() {
        return Err(AppError::new("French product name is required."));
    }
    if !is_one_of(&input.unit_type, &UNIT_TYPES) {
        return Err(AppError::new("Unknown unit type."));
    }
    validate_money(input.price_retail, "Retail price")?;
    if let Some(price) = input.price_wholesale {
        validate_money(price, "Wholesale price")?;
    }
    validate_money(input.cost_price, "Cost price")?;
    validate_vat(input.vat_rate)?;
    validate_quantity(input.min_stock, "Minimum stock")?;
    validate_barcodes(&input.barcodes)?;
    category_exists(conn, input.category_id)?;

    let transaction = conn.transaction()?;
    let now = db::now_local();
    transaction.execute(
        "UPDATE products SET name_ar = ?1, name_fr = ?2, category_id = ?3, unit_type = ?4,
         price_retail = ?5, price_wholesale = ?6, cost_price = ?7, vat_rate = ?8,
         min_stock = ?9, track_expiry = ?10, is_active = ?11, updated_at = ?12
         WHERE id = ?13",
        params![
            input
                .name_ar
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty()),
            name_fr,
            input.category_id,
            input.unit_type,
            input.price_retail,
            input.price_wholesale,
            input.cost_price,
            input.vat_rate,
            input.min_stock,
            input.track_expiry as i64,
            input.is_active as i64,
            now,
            id
        ],
    )?;
    transaction.execute(
        "DELETE FROM product_barcodes WHERE product_id = ?1",
        params![id],
    )?;
    insert_barcodes(&transaction, id, &input.barcodes)?;

    let updated = db::get_product_raw(&transaction, id)?;
    log_audit(
        &transaction,
        Some(actor_id),
        device_id,
        "product_updated",
        "products",
        Some(&id.to_string()),
        Some(&serde_json::to_string(&existing).unwrap_or_default()),
        Some(&serde_json::to_string(&updated).unwrap_or_default()),
    )?;
    transaction.commit()?;
    Ok(updated)
}

pub fn set_product_active(
    conn: &Connection,
    id: i64,
    active: bool,
    actor_id: i64,
    device_id: Option<&str>,
) -> AppResult<Product> {
    let existing = db::get_product_raw(conn, id)?;
    conn.execute(
        "UPDATE products SET is_active = ?1, updated_at = ?2 WHERE id = ?3",
        params![active as i64, db::now_local(), id],
    )?;
    let updated = db::get_product_raw(conn, id)?;
    log_audit(
        conn,
        Some(actor_id),
        device_id,
        if active { "product_unarchived" } else { "product_archived" },
        "products",
        Some(&id.to_string()),
        Some(&serde_json::to_string(&existing).unwrap_or_default()),
        Some(&serde_json::to_string(&updated).unwrap_or_default()),
    )?;
    Ok(updated)
}
