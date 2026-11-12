use std::fs;
use std::path::Path;

use chrono::{Duration, Local};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::json;

use crate::catalog;
use crate::customers;
use crate::db::{self, get_shop_settings, log_audit};
use crate::error::{AppError, AppResult};
use crate::inventory;
use crate::models::{
    BackupFile, CreateProductInput, CreatePurchaseInput, CreateSaleInput, CreateUserInput,
    CustomerInput, PurchaseItemInput, SaleItemInput, ShopSettings, ShopSettingsInput, SupplierInput,
    User,
};
use crate::sales;
use crate::users;

pub fn update_settings(
    conn: &Connection,
    input: ShopSettingsInput,
    actor_id: i64,
    device_id: Option<&str>,
) -> AppResult<ShopSettings> {
    let shop_name = input.shop_name.trim();
    if shop_name.is_empty() {
        return Err(AppError::new("Shop name is required."));
    }
    if !matches!(input.default_language.as_str(), "fr" | "ar" | "en") {
        return Err(AppError::new("Language must be 'fr', 'ar' or 'en'."));
    }
    let existing = get_shop_settings(conn)?;
    conn.execute(
        "UPDATE shop_settings SET shop_name = ?1, address = ?2, phone = ?3, rc = ?4, nif = ?5,
         nis = ?6, ai = ?7, vat_enabled = ?8, stamp_duty_enabled = ?9, default_language = ?10,
         receipt_footer = ?11, allow_negative_stock = ?12 WHERE id = 1",
        params![
            shop_name,
            input.address.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            input.phone.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            input.rc.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            input.nif.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            input.nis.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            input.ai.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            input.vat_enabled as i64,
            input.stamp_duty_enabled as i64,
            input.default_language,
            input.receipt_footer.as_deref().map(str::trim).filter(|value| !value.is_empty()),
            input.allow_negative_stock as i64
        ],
    )?;
    let updated = get_shop_settings(conn)?;
    log_audit(
        conn,
        Some(actor_id),
        device_id,
        "settings_updated",
        "shop_settings",
        Some("1"),
        Some(&serde_json::to_string(&existing).unwrap_or_default()),
        Some(&serde_json::to_string(&updated).unwrap_or_default()),
    )?;
    Ok(updated)
}

pub fn list_backups(backup_dir: &Path) -> AppResult<Vec<BackupFile>> {
    fs::create_dir_all(backup_dir)?;
    let mut backups = Vec::new();
    for entry in fs::read_dir(backup_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("db") {
            continue;
        }
        let metadata = entry.metadata()?;
        let created_at = metadata
            .modified()
            .ok()
            .map(|time| {
                let datetime: chrono::DateTime<chrono::Utc> = time.into();
                datetime
                    .with_timezone(&Local)
                    .format("%Y-%m-%d %H:%M:%S")
                    .to_string()
            })
            .unwrap_or_default();
        backups.push(BackupFile {
            name: entry.file_name().to_string_lossy().to_string(),
            path: path.to_string_lossy().to_string(),
            size_bytes: metadata.len(),
            created_at,
        });
    }
    backups.sort_by(|left, right| right.name.cmp(&left.name));
    Ok(backups)
}

pub fn backup_database(
    conn: &Connection,
    db_path: &Path,
    backup_dir: &Path,
    actor_id: i64,
    device_id: Option<&str>,
) -> AppResult<BackupFile> {
    fs::create_dir_all(backup_dir)?;
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
    let base_name = format!(
        "inventory-backup-{}.db",
        Local::now().format("%Y%m%d-%H%M%S")
    );
    let mut destination = backup_dir.join(&base_name);
    let mut counter = 1;
    while destination.exists() {
        destination = backup_dir.join(format!(
            "inventory-backup-{}-{counter}.db",
            Local::now().format("%Y%m%d-%H%M%S")
        ));
        counter += 1;
    }
    fs::copy(db_path, &destination)?;
    let metadata = fs::metadata(&destination)?;
    let file = BackupFile {
        name: destination
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or(base_name),
        path: destination.to_string_lossy().to_string(),
        size_bytes: metadata.len(),
        created_at: db::now_local(),
    };
    log_audit(
        conn,
        Some(actor_id),
        device_id,
        "backup_created",
        "backup",
        Some(&file.name),
        None,
        Some(&json!({ "path": file.path, "size": file.size_bytes }).to_string()),
    )?;
    Ok(file)
}

fn category_id(conn: &Connection, name_fr: &str) -> AppResult<Option<i64>> {
    let id = conn
        .query_row(
            "SELECT id FROM categories WHERE name_fr = ?1 COLLATE NOCASE",
            params![name_fr],
            |row| row.get(0),
        )
        .optional()?;
    Ok(id)
}

fn ensure_demo_user(
    conn: &mut Connection,
    full_name: &str,
    username: &str,
    password: &str,
    pin: &str,
    role: &str,
    actor_id: i64,
    device_id: &str,
) -> AppResult<User> {
    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM users WHERE username = ?1 COLLATE NOCASE",
            params![username],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(id) = existing {
        return users::get_user(conn, id);
    }
    users::create_user(
        conn,
        CreateUserInput {
            full_name: full_name.to_string(),
            username: username.to_string(),
            password: password.to_string(),
            pin: Some(pin.to_string()),
            role: role.to_string(),
        },
        actor_id,
        Some(device_id),
    )
}

pub fn load_demo_data(
    conn: &mut Connection,
    actor: &User,
    device_id: &str,
) -> AppResult<String> {
    let product_count: i64 =
        conn.query_row("SELECT COUNT(*) FROM products", [], |row| row.get(0))?;
    if product_count > 0 {
        return Err(AppError::new(
            "Demo data can only be loaded while the product catalogue is empty.",
        ));
    }

    let cashier = ensure_demo_user(
        conn,
        "Maya Bennett",
        "cashier",
        "cashier123",
        "1111",
        "cashier",
        actor.id,
        device_id,
    )?;
    let _stock_worker = ensure_demo_user(
        conn,
        "Karim Haddad",
        "stock",
        "stock123",
        "2222",
        "stock_worker",
        actor.id,
        device_id,
    )?;

    let boissons = category_id(conn, "Boissons")?;
    let laitiers = category_id(conn, "Produits laitiers")?;
    let conserves = category_id(conn, "Conserves")?;
    let nettoyage = category_id(conn, "Nettoyage")?;
    let snacks = category_id(conn, "Snacks")?;
    let hygiene = category_id(conn, "Hygiène")?;

    let product_rows = [
        (
            "Coca-Cola 1L", Some("كوكا كولا ١ لتر"), boissons,
            12000, Some(11000), 7500, 19.0, 48.0, 12.0, false,
            vec![("6130000000011", 1i64, Some("Unité")), ("6130000000018", 6, Some("Carton x6"))],
        ),
        (
            "Eau minérale Ifri 1.5L", Some("ماء معدني إفري"), boissons,
            5000, Some(4500), 3000, 19.0, 96.0, 24.0, false,
            vec![("6130000000028", 1, Some("Unité")), ("6130000000029", 6, Some("Pack x6"))],
        ),
        (
            "Lait Soummam 1L", Some("حليب سومام"), laitiers,
            11000, None, 8500, 9.0, 40.0, 12.0, true,
            vec![("6130000000035", 1, Some("Unité"))],
        ),
        (
            "Yaourt Danone 125g", Some("ياغورت دانون"), laitiers,
            3500, None, 2300, 9.0, 60.0, 18.0, true,
            vec![("6130000000042", 1, Some("Unité"))],
        ),
        (
            "Couscous Sim 1kg", Some("كسكس سيم ١ كغ"), conserves,
            14000, Some(13000), 10500, 19.0, 30.0, 8.0, false,
            vec![("6130000000059", 1, Some("Unité"))],
        ),
        (
            "Huile Elio 5L", Some("زيت إليو ٥ لتر"), conserves,
            68000, Some(65000), 58000, 19.0, 18.0, 4.0, false,
            vec![("6130000000066", 1, Some("Bidon"))],
        ),
        (
            "Sucre blanc 1kg", Some("سكر أبيض ١ كغ"), conserves,
            8500, None, 7000, 19.0, 50.0, 12.0, false,
            vec![("6130000000073", 1, Some("Unité"))],
        ),
        (
            "Café Bonal 250g", Some("قهوة بونال"), conserves,
            22000, None, 17500, 19.0, 24.0, 6.0, false,
            vec![("6130000000080", 1, Some("Unité"))],
        ),
        (
            "Pâtes Randa 500g", Some("معكرونة رندة"), conserves,
            7000, None, 5000, 19.0, 45.0, 10.0, false,
            vec![("6130000000097", 1, Some("Unité"))],
        ),
        (
            "Détergent Tide 3kg", Some("تيد ٣ كغ"), nettoyage,
            32000, None, 27000, 19.0, 16.0, 4.0, false,
            vec![("6130000000103", 1, Some("Unité"))],
        ),
        (
            "Savon Dove 100g", Some("صابون دوف"), hygiene,
            8000, None, 5500, 19.0, 36.0, 8.0, false,
            vec![("6130000000110", 1, Some("Unité"))],
        ),
        (
            "Chips Lay's 90g", Some("شيبس ليز"), snacks,
            9000, None, 6000, 19.0, 54.0, 12.0, false,
            vec![("6130000000127", 1, Some("Unité"))],
        ),
    ];

    let mut product_ids: Vec<i64> = Vec::new();
    for (
        name_fr,
        name_ar,
        category,
        price_retail,
        price_wholesale,
        cost_price,
        vat_rate,
        opening_stock,
        min_stock,
        track_expiry,
        barcodes,
    ) in product_rows
    {
        let product = catalog::create_product(
            conn,
            CreateProductInput {
                name_ar: name_ar.map(str::to_string),
                name_fr: name_fr.to_string(),
                category_id: category,
                unit_type: "unit".to_string(),
                price_retail,
                price_wholesale,
                cost_price,
                vat_rate,
                min_stock,
                track_expiry,
                is_active: true,
                opening_stock,
                barcodes: barcodes
                    .into_iter()
                    .map(|(barcode, units, label)| crate::models::BarcodeInput {
                        barcode: barcode.to_string(),
                        units_per_barcode: units,
                        label: label.map(str::to_string),
                    })
                    .collect(),
            },
            actor.id,
            Some(device_id),
        )?;
        product_ids.push(product.id);
    }

    let supplier_one = inventory::create_supplier(
        conn,
        SupplierInput {
            name: "SARL Nord Distribution".to_string(),
            phone: Some("0550 12 34 56".to_string()),
            is_active: true,
        },
        actor.id,
        Some(device_id),
    )?;
    let supplier_two = inventory::create_supplier(
        conn,
        SupplierInput {
            name: "Ets El Baraka".to_string(),
            phone: Some("0661 98 76 54".to_string()),
            is_active: true,
        },
        actor.id,
        Some(device_id),
    )?;

    inventory::create_purchase(
        conn,
        actor,
        device_id,
        CreatePurchaseInput {
            supplier_id: supplier_one.id,
            reference: Some("FA-2026-0184".to_string()),
            paid_amount: 250000,
            items: vec![
                PurchaseItemInput {
                    product_id: product_ids[0],
                    quantity: 24.0,
                    unit_cost: 7500,
                    expiry_date: None,
                },
                PurchaseItemInput {
                    product_id: product_ids[1],
                    quantity: 48.0,
                    unit_cost: 3000,
                    expiry_date: None,
                },
                PurchaseItemInput {
                    product_id: product_ids[2],
                    quantity: 18.0,
                    unit_cost: 8500,
                    expiry_date: Some(db::date_from_today(5)),
                },
                PurchaseItemInput {
                    product_id: product_ids[3],
                    quantity: 24.0,
                    unit_cost: 2300,
                    expiry_date: Some(db::date_from_today(12)),
                },
            ],
        },
    )?;

    inventory::create_purchase(
        conn,
        actor,
        device_id,
        CreatePurchaseInput {
            supplier_id: supplier_two.id,
            reference: Some("BL-8842".to_string()),
            paid_amount: 0,
            items: vec![
                PurchaseItemInput {
                    product_id: product_ids[9],
                    quantity: 12.0,
                    unit_cost: 27000,
                    expiry_date: None,
                },
                PurchaseItemInput {
                    product_id: product_ids[10],
                    quantity: 24.0,
                    unit_cost: 5500,
                    expiry_date: None,
                },
            ],
        },
    )?;

    let ahmed = customers::create_customer(
        conn,
        CustomerInput {
            name: "Ahmed Benali".to_string(),
            phone: Some("0770 11 22 33".to_string()),
            credit_limit: Some(500000),
            is_active: true,
        },
        actor.id,
        Some(device_id),
    )?;
    let fatima = customers::create_customer(
        conn,
        CustomerInput {
            name: "Fatima Zerrouki".to_string(),
            phone: Some("0555 44 55 66".to_string()),
            credit_limit: Some(300000),
            is_active: true,
        },
        actor.id,
        Some(device_id),
    )?;
    let _karim = customers::create_customer(
        conn,
        CustomerInput {
            name: "Karim Meziane".to_string(),
            phone: Some("0666 77 88 99".to_string()),
            credit_limit: None,
            is_active: true,
        },
        actor.id,
        Some(device_id),
    )?;

    let demo_sales: Vec<(i64, Vec<(usize, f64)>, &str, Option<i64>)> = vec![
        (6, vec![(0, 3.0), (3, 2.0), (11, 2.0)], "cash", None),
        (5, vec![(1, 6.0), (4, 1.0), (8, 2.0)], "cib", None),
        (4, vec![(2, 2.0), (3, 4.0), (7, 1.0)], "cash", None),
        (3, vec![(0, 2.0), (9, 1.0), (10, 1.0)], "edahabia", Some(ahmed.id)),
        (2, vec![(1, 4.0), (5, 1.0), (6, 2.0)], "cash", None),
        (1, vec![(11, 3.0), (3, 2.0), (8, 1.0)], "baridimob", None),
        (0, vec![(0, 1.0), (2, 1.0), (4, 1.0), (7, 1.0)], "cash", None),
        (0, vec![(1, 2.0), (11, 1.0)], "credit", Some(fatima.id)),
    ];

    for (offset, basket, method, customer_id) in demo_sales {
        let items = basket
            .iter()
            .map(|(index, quantity)| SaleItemInput {
                product_id: product_ids[*index],
                quantity: *quantity,
            })
            .collect::<Vec<_>>();
        let sale = sales::create_sale(
            conn,
            &cashier,
            device_id,
            CreateSaleInput {
                items,
                price_tier: "retail".to_string(),
                discount: 0,
                payment_method: method.to_string(),
                customer_id,
                cash_given: if method == "cash" {
                    Some(1_000_000)
                } else {
                    None
                },
            },
        )?;
        let date = (Local::now().date_naive() - Duration::days(offset))
            .format("%Y-%m-%d")
            .to_string();
        let created_at = format!("{date} {:02}:{:02}:00", 9 + (offset % 8), 10 + (offset * 7) % 45);
        conn.execute(
            "UPDATE sales SET created_at = ?1 WHERE id = ?2",
            params![created_at, sale.id],
        )?;
        conn.execute(
            "UPDATE stock_movements SET created_at = ?1 WHERE sale_id = ?2",
            params![created_at, sale.id],
        )?;
        conn.execute(
            "UPDATE payments SET created_at = ?1 WHERE sale_id = ?2",
            params![created_at, sale.id],
        )?;
        conn.execute(
            "UPDATE customer_ledger SET created_at = ?1 WHERE sale_id = ?2",
            params![created_at, sale.id],
        )?;
    }

    customers::record_payment(
        conn,
        ahmed.id,
        "cash",
        50000,
        Some("Acompte sur crédit"),
        cashier.id,
        Some(device_id),
    )?;

    Ok("Demo catalogue, suppliers, purchases, customers and sales loaded.".to_string())
}
