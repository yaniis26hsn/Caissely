use std::collections::HashMap;

use chrono::{Datelike, Duration, Local, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension, Row};
use uuid::Uuid;

use crate::auth::{hash_secret, validate_pin};
use crate::error::{AppError, AppResult, OptionExt};
use crate::models::{
    AppInfo, AuditEntry, LicenseInfo, Product, ProductBarcode, ShopSettings, User,
};

pub const DEFAULT_DEVICE_NAME: &str = "Main PC";
pub const DEFAULT_RECEIPT_PREFIX: &str = "PC";

pub fn now_local() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

pub fn today_local() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

pub fn date_from_today(days: i64) -> String {
    (Local::now().date_naive() + Duration::days(days))
        .format("%Y-%m-%d")
        .to_string()
}

pub fn normalize_period(period: &str) -> &'static str {
    match period {
        "today" => "today",
        "week" => "week",
        "month" => "month",
        _ => "all",
    }
}

pub fn period_clause(period: &str) -> &'static str {
    match normalize_period(period) {
        "today" => "date(s.created_at) = date('now','localtime')",
        "week" => "s.created_at >= datetime('now','localtime','-6 days','start of day')",
        "month" => "s.created_at >= datetime('now','localtime','start of month')",
        _ => "1 = 1",
    }
}

pub fn chart_days(period: &str) -> i64 {
    match normalize_period(period) {
        "month" => 30,
        "all" => 30,
        _ => 7,
    }
}

pub fn init_db(conn: &Connection) -> AppResult<String> {
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            pin_hash TEXT,
            role TEXT NOT NULL CHECK (role IN ('owner','manager','cashier','stock_worker')),
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            receipt_prefix TEXT NOT NULL UNIQUE,
            paired_at TEXT,
            is_active INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS shop_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            shop_name TEXT NOT NULL,
            address TEXT,
            phone TEXT,
            rc TEXT,
            nif TEXT,
            nis TEXT,
            ai TEXT,
            vat_enabled INTEGER NOT NULL DEFAULT 0,
            stamp_duty_enabled INTEGER NOT NULL DEFAULT 0,
            default_language TEXT NOT NULL DEFAULT 'fr',
            receipt_footer TEXT,
            allow_negative_stock INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name_ar TEXT,
            name_fr TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name_ar TEXT,
            name_fr TEXT NOT NULL,
            category_id INTEGER REFERENCES categories(id),
            unit_type TEXT NOT NULL DEFAULT 'unit' CHECK (unit_type IN ('unit','weight')),
            price_retail INTEGER NOT NULL DEFAULT 0 CHECK (price_retail >= 0),
            price_wholesale INTEGER CHECK (price_wholesale >= 0),
            cost_price INTEGER NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
            vat_rate REAL NOT NULL DEFAULT 0,
            stock_quantity REAL NOT NULL DEFAULT 0,
            min_stock REAL NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
            track_expiry INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS product_barcodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            barcode TEXT NOT NULL UNIQUE,
            units_per_barcode INTEGER NOT NULL DEFAULT 1 CHECK (units_per_barcode > 0),
            label TEXT
        );

        CREATE TABLE IF NOT EXISTS suppliers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT,
            is_active INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS purchases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
            user_id INTEGER NOT NULL REFERENCES users(id),
            reference TEXT,
            total INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),
            paid_amount INTEGER NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS purchase_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
            product_id INTEGER NOT NULL REFERENCES products(id),
            quantity REAL NOT NULL CHECK (quantity > 0),
            unit_cost INTEGER NOT NULL CHECK (unit_cost >= 0),
            expiry_date TEXT
        );

        CREATE TABLE IF NOT EXISTS stock_batches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            quantity_remaining REAL NOT NULL DEFAULT 0,
            expiry_date TEXT,
            received_at TEXT NOT NULL,
            purchase_item_id INTEGER REFERENCES purchase_items(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS shifts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            device_id TEXT REFERENCES devices(id),
            opened_at TEXT NOT NULL,
            closed_at TEXT,
            opening_cash INTEGER NOT NULL DEFAULT 0,
            expected_cash INTEGER,
            counted_cash INTEGER,
            difference INTEGER
        );

        CREATE TABLE IF NOT EXISTS cash_movements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shift_id INTEGER NOT NULL REFERENCES shifts(id),
            type TEXT NOT NULL CHECK (type IN ('cash_in','cash_out')),
            amount INTEGER NOT NULL CHECK (amount > 0),
            reason TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT,
            credit_limit INTEGER,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sales (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL DEFAULT 'sale' CHECK (type IN ('sale','return')),
            original_sale_id TEXT REFERENCES sales(id),
            receipt_number TEXT NOT NULL UNIQUE,
            device_id TEXT NOT NULL REFERENCES devices(id),
            device_seq INTEGER NOT NULL,
            user_id INTEGER NOT NULL REFERENCES users(id),
            shift_id INTEGER REFERENCES shifts(id),
            customer_id INTEGER REFERENCES customers(id),
            price_tier TEXT NOT NULL DEFAULT 'retail' CHECK (price_tier IN ('retail','wholesale')),
            subtotal INTEGER NOT NULL DEFAULT 0,
            discount INTEGER NOT NULL DEFAULT 0,
            vat_total INTEGER NOT NULL DEFAULT 0,
            stamp_duty INTEGER NOT NULL DEFAULT 0,
            total INTEGER NOT NULL CHECK (total >= 0),
            created_offline INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            synced_at TEXT,
            UNIQUE (device_id, device_seq)
        );

        CREATE TABLE IF NOT EXISTS sale_items (
            id TEXT PRIMARY KEY,
            sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
            product_id INTEGER NOT NULL REFERENCES products(id),
            quantity REAL NOT NULL CHECK (quantity > 0),
            unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
            unit_cost INTEGER NOT NULL CHECK (unit_cost >= 0),
            vat_rate REAL NOT NULL DEFAULT 0,
            line_total INTEGER NOT NULL CHECK (line_total >= 0)
        );

        CREATE TABLE IF NOT EXISTS payments (
            id TEXT PRIMARY KEY,
            sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
            method TEXT NOT NULL CHECK (method IN ('cash','cib','edahabia','baridimob','credit')),
            amount INTEGER NOT NULL CHECK (amount > 0),
            cash_given INTEGER,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS customer_ledger (
            id TEXT PRIMARY KEY,
            customer_id INTEGER NOT NULL REFERENCES customers(id),
            type TEXT NOT NULL CHECK (type IN ('credit_sale','payment','adjustment')),
            amount INTEGER NOT NULL,
            sale_id TEXT REFERENCES sales(id),
            payment_method TEXT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            note TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS stock_movements (
            id TEXT PRIMARY KEY,
            product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            type TEXT NOT NULL CHECK (type IN ('purchase','sale','customer_return','supplier_return','loss','expiry','adjustment')),
            quantity REAL NOT NULL,
            reason TEXT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            device_id TEXT REFERENCES devices(id),
            sale_id TEXT REFERENCES sales(id),
            purchase_id INTEGER REFERENCES purchases(id),
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS supplier_ledger (
            id TEXT PRIMARY KEY,
            supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
            purchase_id INTEGER REFERENCES purchases(id),
            amount INTEGER NOT NULL,
            note TEXT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id),
            device_id TEXT REFERENCES devices(id),
            action TEXT NOT NULL,
            entity TEXT NOT NULL,
            entity_id TEXT,
            old_value TEXT,
            new_value TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL REFERENCES devices(id),
            started_at TEXT NOT NULL,
            finished_at TEXT,
            records_received INTEGER DEFAULT 0,
            records_sent INTEGER DEFAULT 0,
            conflicts_flagged INTEGER DEFAULT 0,
            status TEXT
        );

        CREATE TABLE IF NOT EXISTS license (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            license_id TEXT NOT NULL,
            license_code TEXT NOT NULL,
            machine_fingerprint TEXT NOT NULL,
            plan TEXT,
            max_devices INTEGER NOT NULL DEFAULT 1,
            issued_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            last_seen_date TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_products_name ON products(name_fr, name_ar);
        CREATE INDEX IF NOT EXISTS idx_barcodes_code ON product_barcodes(barcode);
        CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
        CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
        CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_movements_created ON stock_movements(created_at);
        CREATE INDEX IF NOT EXISTS idx_ledger_customer ON customer_ledger(customer_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
        CREATE INDEX IF NOT EXISTS idx_batches_expiry ON stock_batches(expiry_date);
        "#,
    )?;

    seed_settings(conn)?;
    seed_categories(conn)?;
    seed_owner(conn)?;
    seed_license(conn)?;
    ensure_default_device(conn)
}

fn seed_settings(conn: &Connection) -> AppResult<()> {
    conn.execute(
        "INSERT OR IGNORE INTO shop_settings
         (id, shop_name, address, phone, rc, nif, nis, ai, vat_enabled, stamp_duty_enabled,
          default_language, receipt_footer, allow_negative_stock)
         VALUES (1, 'Ma Superette', NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, 'fr', 'Merci pour votre visite !', 0)",
        [],
    )?;
    Ok(())
}

fn seed_categories(conn: &Connection) -> AppResult<()> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM categories", [], |row| row.get(0))?;
    if count > 0 {
        return Ok(());
    }
    let categories = [
        ("Boissons", "مشروبات"),
        ("Produits laitiers", "منتجات الألبان"),
        ("Conserves", "معلبات"),
        ("Nettoyage", "تنظيف"),
        ("Snacks", "وجبات خفيفة"),
        ("Boulangerie", "مخبزة"),
        ("Hygiène", "عناية شخصية"),
        ("Autres", "أخرى"),
    ];
    for (name_fr, name_ar) in categories {
        conn.execute(
            "INSERT INTO categories (name_ar, name_fr, is_active) VALUES (?1, ?2, 1)",
            params![name_ar, name_fr],
        )?;
    }
    Ok(())
}

fn seed_owner(conn: &Connection) -> AppResult<()> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))?;
    if count > 0 {
        return Ok(());
    }
    let password_hash = hash_secret("owner123")?;
    let pin_hash = hash_secret("1234")?;
    conn.execute(
        "INSERT INTO users (full_name, username, password_hash, pin_hash, role, is_active, created_at)
         VALUES (?1, ?2, ?3, ?4, 'owner', 1, ?5)",
        params![
            "Shop Owner",
            "owner",
            password_hash,
            pin_hash,
            now_local()
        ],
    )?;
    Ok(())
}

fn seed_license(conn: &Connection) -> AppResult<()> {
    let today = today_local();
    let expires = date_from_today(365);
    conn.execute(
        "INSERT OR IGNORE INTO license
         (id, license_id, license_code, machine_fingerprint, plan, max_devices, issued_at, expires_at, last_seen_date)
         VALUES (1, 'TRIAL-LOCAL', '', 'local-dev', 'trial', 1, ?1, ?2, ?1)",
        params![today, expires],
    )?;
    Ok(())
}

pub fn ensure_default_device(conn: &Connection) -> AppResult<String> {
    if let Some(id) = conn
        .query_row(
            "SELECT id FROM devices WHERE is_active = 1 ORDER BY rowid LIMIT 1",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()?
    {
        return Ok(id);
    }
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO devices (id, name, type, receipt_prefix, paired_at, is_active)
         VALUES (?1, ?2, 'pc', ?3, ?4, 1)",
        params![id, DEFAULT_DEVICE_NAME, DEFAULT_RECEIPT_PREFIX, now_local()],
    )?;
    Ok(id)
}

pub fn map_user(row: &Row<'_>) -> rusqlite::Result<User> {
    Ok(User {
        id: row.get("id")?,
        full_name: row.get("full_name")?,
        username: row.get("username")?,
        role: row.get("role")?,
        is_active: row.get::<_, i64>("is_active")? != 0,
        has_pin: row
            .get::<_, Option<String>>("pin_hash")?
            .map(|value| !value.is_empty())
            .unwrap_or(false),
        created_at: row.get("created_at")?,
    })
}

pub fn map_product(row: &Row<'_>) -> rusqlite::Result<Product> {
    Ok(Product {
        id: row.get("id")?,
        name_ar: row.get("name_ar")?,
        name_fr: row.get("name_fr")?,
        category_id: row.get("category_id")?,
        category_name: row.get("category_name")?,
        unit_type: row.get("unit_type")?,
        price_retail: row.get("price_retail")?,
        price_wholesale: row.get("price_wholesale")?,
        cost_price: row.get("cost_price")?,
        vat_rate: row.get("vat_rate")?,
        stock_quantity: row.get("stock_quantity")?,
        min_stock: row.get("min_stock")?,
        track_expiry: row.get::<_, i64>("track_expiry")? != 0,
        is_active: row.get::<_, i64>("is_active")? != 0,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        barcodes: Vec::new(),
    })
}

pub const PRODUCT_SELECT: &str = "SELECT p.id, p.name_ar, p.name_fr, p.category_id,
    c.name_fr AS category_name, p.unit_type, p.price_retail, p.price_wholesale,
    p.cost_price, p.vat_rate, p.stock_quantity, p.min_stock, p.track_expiry,
    p.is_active, p.created_at, p.updated_at
    FROM products p LEFT JOIN categories c ON c.id = p.category_id";

pub fn barcodes_for_product(conn: &Connection, product_id: i64) -> AppResult<Vec<ProductBarcode>> {
    let mut statement = conn.prepare(
        "SELECT id, barcode, units_per_barcode, label FROM product_barcodes
         WHERE product_id = ?1 ORDER BY id",
    )?;
    let rows = statement.query_map(params![product_id], |row| {
        Ok(ProductBarcode {
            id: row.get(0)?,
            barcode: row.get(1)?,
            units_per_barcode: row.get(2)?,
            label: row.get(3)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn attach_barcodes(conn: &Connection, products: &mut [Product]) -> AppResult<()> {
    if products.is_empty() {
        return Ok(());
    }
    let ids: Vec<i64> = products.iter().map(|product| product.id).collect();
    let placeholders = vec!["?"; ids.len()].join(",");
    let sql = format!(
        "SELECT id, product_id, barcode, units_per_barcode, label
         FROM product_barcodes WHERE product_id IN ({placeholders}) ORDER BY id"
    );
    let mut statement = conn.prepare(&sql)?;
    let rows = statement.query_map(rusqlite::params_from_iter(ids.iter()), |row| {
        Ok((
            row.get::<_, i64>("product_id")?,
            ProductBarcode {
                id: row.get("id")?,
                barcode: row.get("barcode")?,
                units_per_barcode: row.get("units_per_barcode")?,
                label: row.get("label")?,
            },
        ))
    })?;
    let mut grouped: HashMap<i64, Vec<ProductBarcode>> = HashMap::new();
    for row in rows {
        let (product_id, barcode) = row?;
        grouped.entry(product_id).or_default().push(barcode);
    }
    for product in products {
        product.barcodes = grouped.remove(&product.id).unwrap_or_default();
    }
    Ok(())
}

pub fn get_product_raw(conn: &Connection, id: i64) -> AppResult<Product> {
    let mut product = conn
        .query_row(
            &format!("{PRODUCT_SELECT} WHERE p.id = ?1"),
            params![id],
            map_product,
        )
        .optional()?
        .or_not_found("Product not found.")?;
    product.barcodes = barcodes_for_product(conn, id)?;
    Ok(product)
}

pub fn get_shop_settings(conn: &Connection) -> AppResult<ShopSettings> {
    let settings = conn.query_row(
        "SELECT id, shop_name, address, phone, rc, nif, nis, ai, vat_enabled,
                stamp_duty_enabled, default_language, receipt_footer, allow_negative_stock
         FROM shop_settings WHERE id = 1",
        [],
        |row| {
            Ok(ShopSettings {
                id: row.get(0)?,
                shop_name: row.get(1)?,
                address: row.get(2)?,
                phone: row.get(3)?,
                rc: row.get(4)?,
                nif: row.get(5)?,
                nis: row.get(6)?,
                ai: row.get(7)?,
                vat_enabled: row.get::<_, i64>(8)? != 0,
                stamp_duty_enabled: row.get::<_, i64>(9)? != 0,
                default_language: row.get(10)?,
                receipt_footer: row.get(11)?,
                allow_negative_stock: row.get::<_, i64>(12)? != 0,
            })
        },
    )?;
    Ok(settings)
}

pub fn log_audit(
    conn: &Connection,
    user_id: Option<i64>,
    device_id: Option<&str>,
    action: &str,
    entity: &str,
    entity_id: Option<&str>,
    old_value: Option<&str>,
    new_value: Option<&str>,
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO audit_log (user_id, device_id, action, entity, entity_id, old_value, new_value, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            user_id,
            device_id,
            action,
            entity,
            entity_id,
            old_value,
            new_value,
            now_local()
        ],
    )?;
    Ok(())
}

pub fn list_audit(conn: &Connection, limit: i64) -> AppResult<Vec<AuditEntry>> {
    let mut statement = conn.prepare(
        "SELECT a.id, u.full_name AS user_name, a.action, a.entity, a.entity_id,
                a.old_value, a.new_value, a.created_at
         FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
         ORDER BY a.id DESC LIMIT ?1",
    )?;
    let rows = statement.query_map(params![limit.clamp(1, 1000)], |row| {
        Ok(AuditEntry {
            id: row.get(0)?,
            user_name: row.get(1)?,
            action: row.get(2)?,
            entity: row.get(3)?,
            entity_id: row.get(4)?,
            old_value: row.get(5)?,
            new_value: row.get(6)?,
            created_at: row.get(7)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn app_info(conn: &Connection, db_path: &str, backup_dir: &str, device_id: &str) -> AppResult<AppInfo> {
    let (device_name, receipt_prefix) = conn.query_row(
        "SELECT name, receipt_prefix FROM devices WHERE id = ?1",
        params![device_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    )?;
    Ok(AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        db_path: db_path.to_string(),
        backup_dir: backup_dir.to_string(),
        device_id: device_id.to_string(),
        device_name,
        receipt_prefix,
    })
}

pub fn license_info(conn: &Connection) -> AppResult<LicenseInfo> {
    let row = conn
        .query_row(
            "SELECT license_id, plan, issued_at, expires_at, last_seen_date FROM license WHERE id = 1",
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            },
        )
        .optional()?;

    let Some((license_id, plan, issued_at, expires_at, last_seen_date)) = row else {
        return Ok(LicenseInfo {
            license_id: "UNLICENSED".to_string(),
            plan: "none".to_string(),
            issued_at: today_local(),
            expires_at: today_local(),
            last_seen_date: today_local(),
            days_remaining: 0,
            enforced: false,
        });
    };

    let days_remaining = NaiveDate::parse_from_str(&expires_at, "%Y-%m-%d")
        .map(|date| (date - Local::now().date_naive()).num_days())
        .unwrap_or(0);

    Ok(LicenseInfo {
        license_id,
        plan: plan.unwrap_or_else(|| "trial".to_string()),
        issued_at,
        expires_at,
        last_seen_date,
        days_remaining,
        enforced: false,
    })
}

pub fn update_last_seen(conn: &Connection) -> AppResult<()> {
    conn.execute(
        "UPDATE license SET last_seen_date = ?1 WHERE id = 1",
        params![today_local()],
    )?;
    Ok(())
}

pub fn validate_pin_optional(pin: &Option<String>) -> AppResult<()> {
    if let Some(pin) = pin {
        if !pin.trim().is_empty() {
            validate_pin(pin.trim())?;
        }
    }
    Ok(())
}

pub fn format_date_label(date: NaiveDate) -> String {
    format!("{} {}", date.format("%b"), date.day())
}

pub fn parse_date(value: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").ok()
}

pub fn days_until(date: NaiveDate) -> i64 {
    (date - Local::now().date_naive()).num_days()
}

pub fn ensure_unique_username(conn: &Connection, username: &str, except_id: Option<i64>) -> AppResult<()> {
    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM users WHERE username = ?1 COLLATE NOCASE AND (?2 IS NULL OR id <> ?2) LIMIT 1",
            params![username, except_id],
            |row| row.get(0),
        )
        .optional()?;
    if existing.is_some() {
        return Err(AppError::new("That username is already used by another account."));
    }
    Ok(())
}
