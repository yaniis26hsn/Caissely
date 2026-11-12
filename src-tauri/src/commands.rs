use tauri::State;

use crate::catalog;
use crate::customers;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::inventory;
use crate::models::*;
use crate::reports;
use crate::sales;
use crate::settings;
use crate::shifts;
use crate::state::{lock_db, require_roles, session_user, set_session, AppState};
use crate::users;

const OWNER: &[&str] = &["owner"];
const OWNER_MANAGER: &[&str] = &["owner", "manager"];
const STOCK_ROLES: &[&str] = &["owner", "manager", "stock_worker"];
const SELLING_ROLES: &[&str] = &["owner", "manager", "cashier"];
const CUSTOMER_ROLES: &[&str] = &["owner", "manager", "cashier"];

#[tauri::command]
pub fn login(
    state: State<'_, AppState>,
    username: String,
    password: String,
) -> AppResult<User> {
    let user = {
        let conn = lock_db(&state)?;
        users::authenticate(&conn, &username, &password, Some(&state.device_id))?
    };
    set_session(&state, Some(user.clone()))?;
    Ok(user)
}

#[tauri::command]
pub fn login_with_pin(state: State<'_, AppState>, pin: String) -> AppResult<User> {
    let user = {
        let conn = lock_db(&state)?;
        users::authenticate_pin(&conn, &pin, Some(&state.device_id))?
    };
    set_session(&state, Some(user.clone()))?;
    Ok(user)
}

#[tauri::command]
pub fn current_session(state: State<'_, AppState>) -> Option<User> {
    state.session.lock().ok().and_then(|guard| guard.clone())
}

#[tauri::command]
pub fn logout(state: State<'_, AppState>) -> AppResult<()> {
    let user = session_user(&state).ok();
    if let Some(user) = user {
        if let Ok(conn) = state.db.lock() {
            let _ = db::log_audit(
                &conn,
                Some(user.id),
                Some(&state.device_id),
                "logout",
                "users",
                Some(&user.id.to_string()),
                None,
                None,
            );
        }
    }
    set_session(&state, None)
}

#[tauri::command]
pub fn change_password(
    state: State<'_, AppState>,
    current_password: String,
    new_password: String,
) -> AppResult<()> {
    let user = session_user(&state)?;
    let conn = lock_db(&state)?;
    users::change_password(
        &conn,
        user.id,
        &current_password,
        &new_password,
        Some(&state.device_id),
    )
}

#[tauri::command]
pub fn change_pin(
    state: State<'_, AppState>,
    current_password: String,
    pin: Option<String>,
) -> AppResult<()> {
    let user = session_user(&state)?;
    let conn = lock_db(&state)?;
    users::change_pin(
        &conn,
        user.id,
        &current_password,
        pin,
        Some(&state.device_id),
    )
}

#[tauri::command]
pub fn list_users(state: State<'_, AppState>) -> AppResult<Vec<User>> {
    require_roles(&state, OWNER)?;
    let conn = lock_db(&state)?;
    users::list_users(&conn)
}

#[tauri::command]
pub fn create_user(state: State<'_, AppState>, input: CreateUserInput) -> AppResult<User> {
    let actor = require_roles(&state, OWNER)?;
    let conn = lock_db(&state)?;
    users::create_user(&conn, input, actor.id, Some(&state.device_id))
}

#[tauri::command]
pub fn update_user(
    state: State<'_, AppState>,
    id: i64,
    input: UpdateUserInput,
) -> AppResult<User> {
    let actor = require_roles(&state, OWNER)?;
    let updated = {
        let conn = lock_db(&state)?;
        users::update_user(&conn, id, input, actor.id, Some(&state.device_id))?
    };
    if updated.id == actor.id {
        set_session(&state, Some(updated.clone()))?;
    }
    Ok(updated)
}

#[tauri::command]
pub fn get_shop_settings(state: State<'_, AppState>) -> AppResult<ShopSettings> {
    session_user(&state)?;
    let conn = lock_db(&state)?;
    db::get_shop_settings(&conn)
}

#[tauri::command]
pub fn update_shop_settings(
    state: State<'_, AppState>,
    input: ShopSettingsInput,
) -> AppResult<ShopSettings> {
    let actor = require_roles(&state, OWNER)?;
    let conn = lock_db(&state)?;
    settings::update_settings(&conn, input, actor.id, Some(&state.device_id))
}

#[tauri::command]
pub fn get_app_info(state: State<'_, AppState>) -> AppResult<AppInfo> {
    session_user(&state)?;
    let conn = lock_db(&state)?;
    db::app_info(
        &conn,
        &state.db_path.to_string_lossy(),
        &state.backup_dir.to_string_lossy(),
        &state.device_id,
    )
}

#[tauri::command]
pub fn get_license_info(state: State<'_, AppState>) -> AppResult<LicenseInfo> {
    session_user(&state)?;
    let conn = lock_db(&state)?;
    let info = db::license_info(&conn)?;
    db::update_last_seen(&conn)?;
    Ok(info)
}

#[tauri::command]
pub fn list_backups(state: State<'_, AppState>) -> AppResult<Vec<BackupFile>> {
    require_roles(&state, OWNER)?;
    settings::list_backups(&state.backup_dir)
}

#[tauri::command]
pub fn backup_database(state: State<'_, AppState>) -> AppResult<BackupFile> {
    let actor = require_roles(&state, OWNER)?;
    let conn = lock_db(&state)?;
    settings::backup_database(
        &conn,
        &state.db_path,
        &state.backup_dir,
        actor.id,
        Some(&state.device_id),
    )
}

#[tauri::command]
pub fn list_audit(state: State<'_, AppState>, limit: Option<i64>) -> AppResult<Vec<AuditEntry>> {
    require_roles(&state, OWNER)?;
    let conn = lock_db(&state)?;
    db::list_audit(&conn, limit.unwrap_or(100))
}

#[tauri::command]
pub fn load_demo_data(state: State<'_, AppState>) -> AppResult<String> {
    let actor = require_roles(&state, OWNER)?;
    let mut conn = lock_db(&state)?;
    settings::load_demo_data(&mut conn, &actor, &state.device_id)
}

#[tauri::command]
pub fn list_categories(
    state: State<'_, AppState>,
    include_inactive: Option<bool>,
) -> AppResult<Vec<Category>> {
    session_user(&state)?;
    let conn = lock_db(&state)?;
    catalog::list_categories(&conn, include_inactive.unwrap_or(false))
}

#[tauri::command]
pub fn create_category(
    state: State<'_, AppState>,
    input: CategoryInput,
) -> AppResult<Category> {
    let actor = require_roles(&state, OWNER_MANAGER)?;
    let conn = lock_db(&state)?;
    catalog::create_category(&conn, input, actor.id, Some(&state.device_id))
}

#[tauri::command]
pub fn update_category(
    state: State<'_, AppState>,
    id: i64,
    input: CategoryInput,
) -> AppResult<Category> {
    let actor = require_roles(&state, OWNER_MANAGER)?;
    let conn = lock_db(&state)?;
    catalog::update_category(&conn, id, input, actor.id, Some(&state.device_id))
}

#[tauri::command]
pub fn list_products(
    state: State<'_, AppState>,
    search: Option<String>,
    category_id: Option<i64>,
    stock: Option<String>,
    include_inactive: Option<bool>,
) -> AppResult<Vec<Product>> {
    session_user(&state)?;
    let conn = lock_db(&state)?;
    catalog::list_products(
        &conn,
        search.as_deref(),
        category_id,
        stock.as_deref(),
        include_inactive.unwrap_or(false),
    )
}

#[tauri::command]
pub fn get_product(state: State<'_, AppState>, id: i64) -> AppResult<Product> {
    session_user(&state)?;
    let conn = lock_db(&state)?;
    catalog::get_product(&conn, id)
}

#[tauri::command]
pub fn find_product_by_barcode(
    state: State<'_, AppState>,
    barcode: String,
) -> AppResult<ScanResult> {
    session_user(&state)?;
    let conn = lock_db(&state)?;
    catalog::find_product_by_barcode(&conn, &barcode)
}

#[tauri::command]
pub fn create_product(
    state: State<'_, AppState>,
    input: CreateProductInput,
) -> AppResult<Product> {
    let actor = require_roles(&state, OWNER_MANAGER)?;
    let mut conn = lock_db(&state)?;
    catalog::create_product(&mut conn, input, actor.id, Some(&state.device_id))
}

#[tauri::command]
pub fn update_product(
    state: State<'_, AppState>,
    id: i64,
    input: UpdateProductInput,
) -> AppResult<Product> {
    let actor = require_roles(&state, OWNER_MANAGER)?;
    let mut conn = lock_db(&state)?;
    catalog::update_product(&mut conn, id, input, actor.id, Some(&state.device_id))
}

#[tauri::command]
pub fn set_product_active(
    state: State<'_, AppState>,
    id: i64,
    active: bool,
) -> AppResult<Product> {
    let actor = require_roles(&state, OWNER_MANAGER)?;
    let conn = lock_db(&state)?;
    catalog::set_product_active(&conn, id, active, actor.id, Some(&state.device_id))
}

#[tauri::command]
pub fn list_stock_movements(
    state: State<'_, AppState>,
    product_id: Option<i64>,
    movement_type: Option<String>,
    limit: Option<i64>,
) -> AppResult<Vec<StockMovement>> {
    require_roles(&state, STOCK_ROLES)?;
    let conn = lock_db(&state)?;
    inventory::list_stock_movements(
        &conn,
        product_id,
        movement_type.as_deref(),
        limit.unwrap_or(150),
    )
}

#[tauri::command]
pub fn adjust_stock(
    state: State<'_, AppState>,
    input: StockAdjustmentInput,
) -> AppResult<Product> {
    let actor = require_roles(&state, STOCK_ROLES)?;
    let mut conn = lock_db(&state)?;
    inventory::adjust_stock(&mut conn, &actor, &state.device_id, input)
}

#[tauri::command]
pub fn list_expiring_batches(
    state: State<'_, AppState>,
    days: Option<i64>,
) -> AppResult<Vec<ExpiringBatch>> {
    require_roles(&state, STOCK_ROLES)?;
    let conn = lock_db(&state)?;
    inventory::list_expiring_batches(&conn, days.unwrap_or(30))
}

#[tauri::command]
pub fn list_suppliers(
    state: State<'_, AppState>,
    include_inactive: Option<bool>,
) -> AppResult<Vec<Supplier>> {
    require_roles(&state, STOCK_ROLES)?;
    let conn = lock_db(&state)?;
    inventory::list_suppliers(&conn, include_inactive.unwrap_or(false))
}

#[tauri::command]
pub fn create_supplier(
    state: State<'_, AppState>,
    input: SupplierInput,
) -> AppResult<Supplier> {
    let actor = require_roles(&state, OWNER_MANAGER)?;
    let conn = lock_db(&state)?;
    inventory::create_supplier(&conn, input, actor.id, Some(&state.device_id))
}

#[tauri::command]
pub fn update_supplier(
    state: State<'_, AppState>,
    id: i64,
    input: SupplierInput,
) -> AppResult<Supplier> {
    let actor = require_roles(&state, OWNER_MANAGER)?;
    let conn = lock_db(&state)?;
    inventory::update_supplier(&conn, id, input, actor.id, Some(&state.device_id))
}

#[tauri::command]
pub fn list_purchases(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> AppResult<Vec<Purchase>> {
    require_roles(&state, STOCK_ROLES)?;
    let conn = lock_db(&state)?;
    inventory::list_purchases(&conn, limit.unwrap_or(100))
}

#[tauri::command]
pub fn get_purchase(state: State<'_, AppState>, id: i64) -> AppResult<Purchase> {
    require_roles(&state, STOCK_ROLES)?;
    let conn = lock_db(&state)?;
    inventory::get_purchase(&conn, id)
}

#[tauri::command]
pub fn create_purchase(
    state: State<'_, AppState>,
    input: CreatePurchaseInput,
) -> AppResult<Purchase> {
    let actor = require_roles(&state, STOCK_ROLES)?;
    let mut conn = lock_db(&state)?;
    inventory::create_purchase(&mut conn, &actor, &state.device_id, input)
}

#[tauri::command]
pub fn list_customers(
    state: State<'_, AppState>,
    search: Option<String>,
    include_inactive: Option<bool>,
    only_debtors: Option<bool>,
) -> AppResult<Vec<Customer>> {
    require_roles(&state, CUSTOMER_ROLES)?;
    let conn = lock_db(&state)?;
    customers::list_customers(
        &conn,
        search.as_deref(),
        include_inactive.unwrap_or(false),
        only_debtors.unwrap_or(false),
    )
}

#[tauri::command]
pub fn get_customer_statement(
    state: State<'_, AppState>,
    id: i64,
) -> AppResult<CustomerStatement> {
    require_roles(&state, CUSTOMER_ROLES)?;
    let conn = lock_db(&state)?;
    customers::customer_statement(&conn, id)
}

#[tauri::command]
pub fn create_customer(
    state: State<'_, AppState>,
    input: CustomerInput,
) -> AppResult<Customer> {
    let actor = require_roles(&state, CUSTOMER_ROLES)?;
    let conn = lock_db(&state)?;
    customers::create_customer(&conn, input, actor.id, Some(&state.device_id))
}

#[tauri::command]
pub fn update_customer(
    state: State<'_, AppState>,
    id: i64,
    input: CustomerInput,
) -> AppResult<Customer> {
    let actor = require_roles(&state, OWNER_MANAGER)?;
    let conn = lock_db(&state)?;
    customers::update_customer(&conn, id, input, actor.id, Some(&state.device_id))
}

#[tauri::command]
pub fn record_customer_payment(
    state: State<'_, AppState>,
    customer_id: i64,
    method: String,
    amount: i64,
    note: Option<String>,
) -> AppResult<Customer> {
    let actor = require_roles(&state, CUSTOMER_ROLES)?;
    let conn = lock_db(&state)?;
    customers::record_payment(
        &conn,
        customer_id,
        &method,
        amount,
        note.as_deref(),
        actor.id,
        Some(&state.device_id),
    )
}

#[tauri::command]
pub fn create_sale(
    state: State<'_, AppState>,
    input: CreateSaleInput,
) -> AppResult<Sale> {
    let actor = require_roles(&state, SELLING_ROLES)?;
    let mut conn = lock_db(&state)?;
    sales::create_sale(&mut conn, &actor, &state.device_id, input)
}

#[tauri::command]
pub fn list_sales(
    state: State<'_, AppState>,
    period: Option<String>,
    worker_id: Option<i64>,
    limit: Option<i64>,
) -> AppResult<Vec<Sale>> {
    let actor = require_roles(&state, SELLING_ROLES)?;
    let worker_filter = if actor.role == "cashier" {
        Some(actor.id)
    } else {
        worker_id
    };
    let conn = lock_db(&state)?;
    sales::list_sales(
        &conn,
        period.as_deref().unwrap_or("all"),
        worker_filter,
        limit.unwrap_or(100),
    )
}

#[tauri::command]
pub fn get_sale(state: State<'_, AppState>, id: String) -> AppResult<Sale> {
    let actor = require_roles(&state, SELLING_ROLES)?;
    let conn = lock_db(&state)?;
    let sale = sales::get_sale(&conn, &id)?;
    if actor.role == "cashier" && sale.user_id != actor.id {
        return Err(AppError::new("You can only view your own sales."));
    }
    Ok(sale)
}

#[tauri::command]
pub fn return_sale(state: State<'_, AppState>, sale_id: String) -> AppResult<Sale> {
    let actor = require_roles(&state, OWNER_MANAGER)?;
    let mut conn = lock_db(&state)?;
    sales::return_sale(&mut conn, &actor, &state.device_id, &sale_id)
}

#[tauri::command]
pub fn current_shift_totals(state: State<'_, AppState>) -> AppResult<ShiftTotals> {
    let actor = require_roles(&state, SELLING_ROLES)?;
    let conn = lock_db(&state)?;
    shifts::current_shift_totals(&conn, actor.id, &state.device_id)
}

#[tauri::command]
pub fn open_shift(state: State<'_, AppState>, opening_cash: i64) -> AppResult<Shift> {
    let actor = require_roles(&state, SELLING_ROLES)?;
    let conn = lock_db(&state)?;
    shifts::open_shift(&conn, actor.id, &state.device_id, opening_cash)
}

#[tauri::command]
pub fn close_shift(state: State<'_, AppState>, counted_cash: i64) -> AppResult<Shift> {
    let actor = require_roles(&state, SELLING_ROLES)?;
    let conn = lock_db(&state)?;
    shifts::close_shift(&conn, actor.id, &state.device_id, counted_cash)
}

#[tauri::command]
pub fn add_cash_movement(
    state: State<'_, AppState>,
    input: CashMovementInput,
) -> AppResult<Shift> {
    let actor = require_roles(&state, SELLING_ROLES)?;
    let conn = lock_db(&state)?;
    shifts::add_cash_movement(&conn, actor.id, &state.device_id, input)
}

#[tauri::command]
pub fn list_shifts(state: State<'_, AppState>, limit: Option<i64>) -> AppResult<Vec<Shift>> {
    let actor = require_roles(&state, SELLING_ROLES)?;
    let conn = lock_db(&state)?;
    let mut rows = shifts::list_shifts(&conn, limit.unwrap_or(50))?;
    if actor.role == "cashier" {
        rows.retain(|shift| shift.user_id == actor.id);
    }
    Ok(rows)
}

#[tauri::command]
pub fn list_cash_movements(
    state: State<'_, AppState>,
    shift_id: i64,
) -> AppResult<Vec<CashMovement>> {
    require_roles(&state, SELLING_ROLES)?;
    let conn = lock_db(&state)?;
    shifts::list_cash_movements(&conn, shift_id)
}

#[tauri::command]
pub fn get_dashboard(state: State<'_, AppState>) -> AppResult<Dashboard> {
    require_roles(&state, OWNER_MANAGER)?;
    let conn = lock_db(&state)?;
    reports::dashboard(&conn)
}

#[tauri::command]
pub fn get_reports(
    state: State<'_, AppState>,
    period: Option<String>,
) -> AppResult<ReportData> {
    require_roles(&state, OWNER_MANAGER)?;
    let conn = lock_db(&state)?;
    reports::reports(&conn, period.as_deref().unwrap_or("month"))
}

#[tauri::command]
pub fn export_sales_csv(
    state: State<'_, AppState>,
    period: Option<String>,
) -> AppResult<String> {
    let actor = require_roles(&state, OWNER_MANAGER)?;
    let conn = lock_db(&state)?;
    let path = reports::export_sales_csv(
        &conn,
        period.as_deref().unwrap_or("month"),
        &state.export_dir,
    )?;
    db::log_audit(
        &conn,
        Some(actor.id),
        Some(&state.device_id),
        "sales_exported",
        "sales",
        None,
        None,
        Some(&format!("{{\"path\":\"{}\"}}", path.replace('\\', "\\\\"))),
    )?;
    Ok(path)
}
