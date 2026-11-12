use serde::{Deserialize, Serialize};

pub const ROLES: [&str; 4] = ["owner", "manager", "cashier", "stock_worker"];
pub const UNIT_TYPES: [&str; 2] = ["unit", "weight"];
pub const PAYMENT_METHODS: [&str; 5] = ["cash", "cib", "edahabia", "baridimob", "credit"];
pub const PRICE_TIERS: [&str; 2] = ["retail", "wholesale"];

pub fn is_one_of(value: &str, allowed: &[&str]) -> bool {
    allowed.contains(&value)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: i64,
    pub full_name: String,
    pub username: String,
    pub role: String,
    pub is_active: bool,
    pub has_pin: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUserInput {
    pub full_name: String,
    pub username: String,
    pub password: String,
    pub pin: Option<String>,
    pub role: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUserInput {
    pub full_name: String,
    pub username: String,
    pub role: String,
    pub is_active: bool,
    pub password: Option<String>,
    pub pin: Option<String>,
    pub clear_pin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShopSettings {
    pub id: i64,
    pub shop_name: String,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub rc: Option<String>,
    pub nif: Option<String>,
    pub nis: Option<String>,
    pub ai: Option<String>,
    pub vat_enabled: bool,
    pub stamp_duty_enabled: bool,
    pub default_language: String,
    pub receipt_footer: Option<String>,
    pub allow_negative_stock: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShopSettingsInput {
    pub shop_name: String,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub rc: Option<String>,
    pub nif: Option<String>,
    pub nis: Option<String>,
    pub ai: Option<String>,
    pub vat_enabled: bool,
    pub stamp_duty_enabled: bool,
    pub default_language: String,
    pub receipt_footer: Option<String>,
    pub allow_negative_stock: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: i64,
    pub name_ar: Option<String>,
    pub name_fr: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryInput {
    pub name_ar: Option<String>,
    pub name_fr: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductBarcode {
    pub id: i64,
    pub barcode: String,
    pub units_per_barcode: i64,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BarcodeInput {
    pub barcode: String,
    pub units_per_barcode: i64,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Product {
    pub id: i64,
    pub name_ar: Option<String>,
    pub name_fr: String,
    pub category_id: Option<i64>,
    pub category_name: Option<String>,
    pub unit_type: String,
    pub price_retail: i64,
    pub price_wholesale: Option<i64>,
    pub cost_price: i64,
    pub vat_rate: f64,
    pub stock_quantity: f64,
    pub min_stock: f64,
    pub track_expiry: bool,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
    pub barcodes: Vec<ProductBarcode>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProductInput {
    pub name_ar: Option<String>,
    pub name_fr: String,
    pub category_id: Option<i64>,
    pub unit_type: String,
    pub price_retail: i64,
    pub price_wholesale: Option<i64>,
    pub cost_price: i64,
    pub vat_rate: f64,
    pub min_stock: f64,
    pub track_expiry: bool,
    pub is_active: bool,
    pub opening_stock: f64,
    pub barcodes: Vec<BarcodeInput>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProductInput {
    pub name_ar: Option<String>,
    pub name_fr: String,
    pub category_id: Option<i64>,
    pub unit_type: String,
    pub price_retail: i64,
    pub price_wholesale: Option<i64>,
    pub cost_price: i64,
    pub vat_rate: f64,
    pub min_stock: f64,
    pub track_expiry: bool,
    pub is_active: bool,
    pub barcodes: Vec<BarcodeInput>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub product: Product,
    pub units_per_barcode: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Customer {
    pub id: i64,
    pub name: String,
    pub phone: Option<String>,
    pub credit_limit: Option<i64>,
    pub is_active: bool,
    pub created_at: String,
    pub balance: i64,
    pub has_overdue: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerInput {
    pub name: String,
    pub phone: Option<String>,
    pub credit_limit: Option<i64>,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerLedgerEntry {
    pub id: String,
    pub customer_id: i64,
    pub entry_type: String,
    pub amount: i64,
    pub sale_id: Option<String>,
    pub receipt_number: Option<String>,
    pub payment_method: Option<String>,
    pub note: Option<String>,
    pub user_name: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerStatement {
    pub customer: Customer,
    pub balance: i64,
    pub entries: Vec<CustomerLedgerEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleItem {
    pub id: String,
    pub product_id: i64,
    pub product_name: String,
    pub product_name_ar: Option<String>,
    pub quantity: f64,
    pub unit_price: i64,
    pub unit_cost: i64,
    pub vat_rate: f64,
    pub line_total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Payment {
    pub id: String,
    pub sale_id: String,
    pub method: String,
    pub amount: i64,
    pub cash_given: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sale {
    pub id: String,
    pub sale_type: String,
    pub original_sale_id: Option<String>,
    pub receipt_number: String,
    pub device_seq: i64,
    pub user_id: i64,
    pub user_name: String,
    pub shift_id: Option<i64>,
    pub customer_id: Option<i64>,
    pub customer_name: Option<String>,
    pub price_tier: String,
    pub subtotal: i64,
    pub discount: i64,
    pub vat_total: i64,
    pub stamp_duty: i64,
    pub total: i64,
    pub created_offline: bool,
    pub created_at: String,
    pub items: Vec<SaleItem>,
    pub payments: Vec<Payment>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleItemInput {
    pub product_id: i64,
    pub quantity: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSaleInput {
    pub items: Vec<SaleItemInput>,
    pub price_tier: String,
    pub discount: i64,
    pub payment_method: String,
    pub customer_id: Option<i64>,
    pub cash_given: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockMovement {
    pub id: String,
    pub product_id: i64,
    pub product_name: String,
    pub movement_type: String,
    pub quantity: f64,
    pub reason: Option<String>,
    pub user_name: Option<String>,
    pub sale_id: Option<String>,
    pub purchase_id: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StockAdjustmentInput {
    pub product_id: i64,
    pub movement_type: String,
    pub quantity_delta: f64,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Supplier {
    pub id: i64,
    pub name: String,
    pub phone: Option<String>,
    pub is_active: bool,
    pub balance: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupplierInput {
    pub name: String,
    pub phone: Option<String>,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseItem {
    pub id: i64,
    pub product_id: i64,
    pub product_name: String,
    pub quantity: f64,
    pub unit_cost: i64,
    pub line_total: i64,
    pub expiry_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Purchase {
    pub id: i64,
    pub supplier_id: i64,
    pub supplier_name: String,
    pub user_id: i64,
    pub user_name: String,
    pub reference: Option<String>,
    pub total: i64,
    pub paid_amount: i64,
    pub created_at: String,
    pub items: Vec<PurchaseItem>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseItemInput {
    pub product_id: i64,
    pub quantity: f64,
    pub unit_cost: i64,
    pub expiry_date: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePurchaseInput {
    pub supplier_id: i64,
    pub reference: Option<String>,
    pub paid_amount: i64,
    pub items: Vec<PurchaseItemInput>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpiringBatch {
    pub id: i64,
    pub product_id: i64,
    pub product_name: String,
    pub quantity_remaining: f64,
    pub expiry_date: Option<String>,
    pub received_at: String,
    pub days_left: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Shift {
    pub id: i64,
    pub user_id: i64,
    pub user_name: String,
    pub device_id: String,
    pub opened_at: String,
    pub closed_at: Option<String>,
    pub opening_cash: i64,
    pub expected_cash: i64,
    pub counted_cash: Option<i64>,
    pub difference: Option<i64>,
    pub cash_in: i64,
    pub cash_out: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CashMovement {
    pub id: i64,
    pub shift_id: i64,
    pub movement_type: String,
    pub amount: i64,
    pub reason: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashMovementInput {
    pub movement_type: String,
    pub amount: i64,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShiftTotals {
    pub current: Option<Shift>,
    pub cash_in: i64,
    pub cash_out: i64,
    pub cash_sales: i64,
    pub expected_cash: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    pub id: i64,
    pub user_name: Option<String>,
    pub action: String,
    pub entity: String,
    pub entity_id: Option<String>,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupFile {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseInfo {
    pub license_id: String,
    pub plan: String,
    pub issued_at: String,
    pub expires_at: String,
    pub last_seen_date: String,
    pub days_remaining: i64,
    pub enforced: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub db_path: String,
    pub backup_dir: String,
    pub device_id: String,
    pub device_name: String,
    pub receipt_prefix: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSummary {
    pub revenue: i64,
    pub profit: i64,
    pub transactions: i64,
    pub items_sold: f64,
    pub average_basket: i64,
    pub credit_sales: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesPoint {
    pub date: String,
    pub label: String,
    pub revenue: i64,
    pub profit: i64,
    pub transactions: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductPerformance {
    pub product_id: i64,
    pub product_name: String,
    pub quantity_sold: f64,
    pub revenue: i64,
    pub profit: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MethodTotal {
    pub method: String,
    pub amount: i64,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Dashboard {
    pub today: DashboardSummary,
    pub month: DashboardSummary,
    pub revenue_series: Vec<SeriesPoint>,
    pub low_stock: Vec<Product>,
    pub out_of_stock: Vec<Product>,
    pub expiring: Vec<ExpiringBatch>,
    pub recent_sales: Vec<Sale>,
    pub credit_outstanding: i64,
    pub supplier_debt: i64,
    pub stock_value: i64,
    pub customer_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportData {
    pub period: String,
    pub revenue: i64,
    pub profit: i64,
    pub transactions: i64,
    pub items_sold: f64,
    pub average_basket: i64,
    pub returns_total: i64,
    pub revenue_series: Vec<SeriesPoint>,
    pub top_products: Vec<ProductPerformance>,
    pub lowest_products: Vec<ProductPerformance>,
    pub payment_methods: Vec<MethodTotal>,
    pub stock_value: i64,
    pub low_stock: Vec<Product>,
    pub out_of_stock: Vec<Product>,
    pub expiring: Vec<ExpiringBatch>,
    pub credit_outstanding: i64,
    pub supplier_debt: i64,
    pub debtors: Vec<Customer>,
    pub suppliers: Vec<Supplier>,
}
