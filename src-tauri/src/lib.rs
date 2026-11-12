mod auth;
mod catalog;
mod commands;
mod customers;
mod db;
mod error;
mod inventory;
mod models;
mod reports;
mod sales;
mod settings;
mod shifts;
mod state;
mod users;

use std::fs;
use std::sync::Mutex;
use std::time::Duration;

use rusqlite::Connection;
use tauri::Manager;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&data_dir)?;

            let db_path = data_dir.join("inventory.db");
            let backup_dir = data_dir.join("backups");
            let export_dir = data_dir.join("exports");
            fs::create_dir_all(&backup_dir)?;
            fs::create_dir_all(&export_dir)?;

            let conn = Connection::open(&db_path)?;
            conn.busy_timeout(Duration::from_secs(5))?;
            conn.pragma_update(None, "journal_mode", "WAL")?;
            conn.pragma_update(None, "synchronous", "NORMAL")?;
            let device_id = db::init_db(&conn)?;

            app.manage(AppState {
                db: Mutex::new(conn),
                session: Mutex::new(None),
                db_path,
                backup_dir,
                export_dir,
                device_id,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::login,
            commands::login_with_pin,
            commands::current_session,
            commands::logout,
            commands::change_password,
            commands::change_pin,
            commands::list_users,
            commands::create_user,
            commands::update_user,
            commands::get_shop_settings,
            commands::update_shop_settings,
            commands::get_app_info,
            commands::get_license_info,
            commands::list_backups,
            commands::backup_database,
            commands::list_audit,
            commands::load_demo_data,
            commands::list_categories,
            commands::create_category,
            commands::update_category,
            commands::list_products,
            commands::get_product,
            commands::find_product_by_barcode,
            commands::create_product,
            commands::update_product,
            commands::set_product_active,
            commands::list_stock_movements,
            commands::adjust_stock,
            commands::list_expiring_batches,
            commands::list_suppliers,
            commands::create_supplier,
            commands::update_supplier,
            commands::list_purchases,
            commands::get_purchase,
            commands::create_purchase,
            commands::list_customers,
            commands::get_customer_statement,
            commands::create_customer,
            commands::update_customer,
            commands::record_customer_payment,
            commands::create_sale,
            commands::list_sales,
            commands::get_sale,
            commands::return_sale,
            commands::current_shift_totals,
            commands::open_shift,
            commands::close_shift,
            commands::add_cash_movement,
            commands::list_shifts,
            commands::list_cash_movements,
            commands::get_dashboard,
            commands::get_reports,
            commands::export_sales_csv,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Inventory Manager");
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        BarcodeInput, CreateProductInput, CreateSaleInput, CustomerInput, SaleItemInput,
        ShopSettingsInput,
    };

    fn test_connection() -> (Connection, String) {
        let conn = Connection::open_in_memory().expect("in-memory database");
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        let device_id = db::init_db(&conn).expect("schema");
        (conn, device_id)
    }

    fn owner(conn: &Connection) -> models::User {
        users::authenticate(conn, "owner", "owner123", None).expect("owner login")
    }

    fn product(conn: &mut Connection, owner_id: i64) -> models::Product {
        catalog::create_product(
            conn,
            CreateProductInput {
                name_ar: None,
                name_fr: "Test Cola".to_string(),
                category_id: None,
                unit_type: "unit".to_string(),
                price_retail: 15000,
                price_wholesale: Some(13000),
                cost_price: 9000,
                vat_rate: 19.0,
                min_stock: 3.0,
                track_expiry: false,
                is_active: true,
                opening_stock: 10.0,
                barcodes: vec![BarcodeInput {
                    barcode: "1234567890123".to_string(),
                    units_per_barcode: 1,
                    label: None,
                }],
            },
            owner_id,
            None,
        )
        .expect("product created")
    }

    #[test]
    fn seeded_owner_can_authenticate() {
        let (conn, _) = test_connection();
        let user = owner(&conn);
        assert_eq!(user.role, "owner");
        assert!(users::authenticate(&conn, "owner", "wrong", None).is_err());
    }

    #[test]
    fn sale_decrements_stock_and_rejects_oversell() {
        let (mut conn, device_id) = test_connection();
        let owner = owner(&conn);
        let product = product(&mut conn, owner.id);

        let sale = sales::create_sale(
            &mut conn,
            &owner,
            &device_id,
            CreateSaleInput {
                items: vec![SaleItemInput {
                    product_id: product.id,
                    quantity: 3.0,
                }],
                price_tier: "retail".to_string(),
                discount: 0,
                payment_method: "cash".to_string(),
                customer_id: None,
                cash_given: Some(50000),
            },
        )
        .expect("sale created");

        assert_eq!(sale.total, 45000);
        assert!(sale.receipt_number.starts_with("PC-"));
        assert_eq!(catalog::get_product(&conn, product.id).unwrap().stock_quantity, 7.0);

        let oversell = sales::create_sale(
            &mut conn,
            &owner,
            &device_id,
            CreateSaleInput {
                items: vec![SaleItemInput {
                    product_id: product.id,
                    quantity: 8.0,
                }],
                price_tier: "retail".to_string(),
                discount: 0,
                payment_method: "cash".to_string(),
                customer_id: None,
                cash_given: Some(50000),
            },
        );
        assert!(oversell.is_err());
    }

    #[test]
    fn credit_sale_updates_customer_ledger() {
        let (mut conn, device_id) = test_connection();
        let owner = owner(&conn);
        let product = product(&mut conn, owner.id);
        let customer = customers::create_customer(
            &conn,
            CustomerInput {
                name: "Ahmed".to_string(),
                phone: None,
                credit_limit: Some(100000),
                is_active: true,
            },
            owner.id,
            None,
        )
        .unwrap();

        sales::create_sale(
            &mut conn,
            &owner,
            &device_id,
            CreateSaleInput {
                items: vec![SaleItemInput {
                    product_id: product.id,
                    quantity: 2.0,
                }],
                price_tier: "retail".to_string(),
                discount: 0,
                payment_method: "credit".to_string(),
                customer_id: Some(customer.id),
                cash_given: None,
            },
        )
        .unwrap();

        let statement = customers::customer_statement(&conn, customer.id).unwrap();
        assert_eq!(statement.balance, 30000);
        assert_eq!(statement.entries.len(), 1);
    }

    #[test]
    fn return_sale_restores_stock() {
        let (mut conn, device_id) = test_connection();
        let owner = owner(&conn);
        let product = product(&mut conn, owner.id);

        let sale = sales::create_sale(
            &mut conn,
            &owner,
            &device_id,
            CreateSaleInput {
                items: vec![SaleItemInput {
                    product_id: product.id,
                    quantity: 4.0,
                }],
                price_tier: "retail".to_string(),
                discount: 0,
                payment_method: "cash".to_string(),
                customer_id: None,
                cash_given: Some(100000),
            },
        )
        .unwrap();

        sales::return_sale(&mut conn, &owner, &device_id, &sale.id).unwrap();
        assert_eq!(catalog::get_product(&conn, product.id).unwrap().stock_quantity, 10.0);
        assert!(sales::return_sale(&mut conn, &owner, &device_id, &sale.id).is_err());
    }

    #[test]
    fn settings_update_and_vat_sale() {
        let (mut conn, device_id) = test_connection();
        let owner = owner(&conn);
        let product = product(&mut conn, owner.id);
        let settings = db::get_shop_settings(&conn).unwrap();
        settings::update_settings(
            &conn,
            ShopSettingsInput {
                shop_name: "Test Shop".to_string(),
                address: None,
                phone: None,
                rc: None,
                nif: None,
                nis: None,
                ai: None,
                vat_enabled: true,
                stamp_duty_enabled: false,
                default_language: "fr".to_string(),
                receipt_footer: None,
                allow_negative_stock: settings.allow_negative_stock,
            },
            owner.id,
            None,
        )
        .unwrap();

        let sale = sales::create_sale(
            &mut conn,
            &owner,
            &device_id,
            CreateSaleInput {
                items: vec![SaleItemInput {
                    product_id: product.id,
                    quantity: 1.0,
                }],
                price_tier: "retail".to_string(),
                discount: 0,
                payment_method: "cash".to_string(),
                customer_id: None,
                cash_given: Some(20000),
            },
        )
        .unwrap();
        assert!(sale.vat_total > 0);
        assert_eq!(sale.total, 15000);
    }
}
