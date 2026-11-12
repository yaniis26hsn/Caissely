import { invoke } from "@tauri-apps/api/core";

import type {
  AppInfo,
  AuditEntry,
  BackupFile,
  BarcodeInput,
  CashMovement,
  CashMovementInput,
  Category,
  CategoryInput,
  CreateProductInput,
  CreatePurchaseInput,
  CreateSaleInput,
  CreateUserInput,
  Customer,
  CustomerInput,
  CustomerStatement,
  Dashboard,
  ExpiringBatch,
  LicenseInfo,
  Product,
  Purchase,
  ReportData,
  Sale,
  ScanResult,
  Shift,
  ShiftTotals,
  ShopSettings,
  ShopSettingsInput,
  StockAdjustmentInput,
  StockMovement,
  Supplier,
  SupplierInput,
  UpdateProductInput,
  UpdateUserInput,
  User,
} from "./types";

export const api = {
  // Session
  login: (username: string, password: string) =>
    invoke<User>("login", { username, password }),
  loginWithPin: (pin: string) => invoke<User>("login_with_pin", { pin }),
  currentSession: () => invoke<User | null>("current_session"),
  logout: () => invoke<void>("logout"),
  changePassword: (currentPassword: string, newPassword: string) =>
    invoke<void>("change_password", { currentPassword, newPassword }),
  changePin: (currentPassword: string, pin: string | null) =>
    invoke<void>("change_pin", { currentPassword, pin }),

  // Team
  listUsers: () => invoke<User[]>("list_users"),
  createUser: (input: CreateUserInput) => invoke<User>("create_user", { input }),
  updateUser: (id: number, input: UpdateUserInput) =>
    invoke<User>("update_user", { id, input }),

  // Settings
  getShopSettings: () => invoke<ShopSettings>("get_shop_settings"),
  updateShopSettings: (input: ShopSettingsInput) =>
    invoke<ShopSettings>("update_shop_settings", { input }),
  getAppInfo: () => invoke<AppInfo>("get_app_info"),
  getLicenseInfo: () => invoke<LicenseInfo>("get_license_info"),
  listBackups: () => invoke<BackupFile[]>("list_backups"),
  backupDatabase: () => invoke<BackupFile>("backup_database"),
  listAudit: (limit?: number) => invoke<AuditEntry[]>("list_audit", { limit }),
  loadDemoData: () => invoke<string>("load_demo_data"),

  // Catalogue
  listCategories: (includeInactive?: boolean) =>
    invoke<Category[]>("list_categories", { includeInactive }),
  createCategory: (input: CategoryInput) => invoke<Category>("create_category", { input }),
  updateCategory: (id: number, input: CategoryInput) =>
    invoke<Category>("update_category", { id, input }),
  listProducts: (options?: {
    search?: string | null;
    categoryId?: number | null;
    stock?: string | null;
    includeInactive?: boolean;
  }) =>
    invoke<Product[]>("list_products", {
      search: options?.search ?? null,
      categoryId: options?.categoryId ?? null,
      stock: options?.stock ?? null,
      includeInactive: options?.includeInactive ?? false,
    }),
  getProduct: (id: number) => invoke<Product>("get_product", { id }),
  findProductByBarcode: (barcode: string) =>
    invoke<ScanResult>("find_product_by_barcode", { barcode }),
  createProduct: (input: CreateProductInput) =>
    invoke<Product>("create_product", { input }),
  updateProduct: (id: number, input: UpdateProductInput) =>
    invoke<Product>("update_product", { id, input }),
  setProductActive: (id: number, active: boolean) =>
    invoke<Product>("set_product_active", { id, active }),

  // Inventory
  listStockMovements: (options?: {
    productId?: number | null;
    movementType?: string | null;
    limit?: number;
  }) =>
    invoke<StockMovement[]>("list_stock_movements", {
      productId: options?.productId ?? null,
      movementType: options?.movementType ?? null,
      limit: options?.limit ?? 150,
    }),
  adjustStock: (input: StockAdjustmentInput) =>
    invoke<Product>("adjust_stock", { input }),
  listExpiringBatches: (days?: number) =>
    invoke<ExpiringBatch[]>("list_expiring_batches", { days }),
  listSuppliers: (includeInactive?: boolean) =>
    invoke<Supplier[]>("list_suppliers", { includeInactive }),
  createSupplier: (input: SupplierInput) =>
    invoke<Supplier>("create_supplier", { input }),
  updateSupplier: (id: number, input: SupplierInput) =>
    invoke<Supplier>("update_supplier", { id, input }),
  listPurchases: (limit?: number) => invoke<Purchase[]>("list_purchases", { limit }),
  getPurchase: (id: number) => invoke<Purchase>("get_purchase", { id }),
  createPurchase: (input: CreatePurchaseInput) =>
    invoke<Purchase>("create_purchase", { input }),

  // Customers
  listCustomers: (options?: {
    search?: string | null;
    includeInactive?: boolean;
    onlyDebtors?: boolean;
  }) =>
    invoke<Customer[]>("list_customers", {
      search: options?.search ?? null,
      includeInactive: options?.includeInactive ?? false,
      onlyDebtors: options?.onlyDebtors ?? false,
    }),
  getCustomerStatement: (id: number) =>
    invoke<CustomerStatement>("get_customer_statement", { id }),
  createCustomer: (input: CustomerInput) => invoke<Customer>("create_customer", { input }),
  updateCustomer: (id: number, input: CustomerInput) =>
    invoke<Customer>("update_customer", { id, input }),
  recordCustomerPayment: (
    customerId: number,
    method: string,
    amount: number,
    note?: string | null,
  ) =>
    invoke<Customer>("record_customer_payment", {
      customerId,
      method,
      amount,
      note,
    }),

  // Sales
  createSale: (input: CreateSaleInput) => invoke<Sale>("create_sale", { input }),
  listSales: (options?: { period?: string; workerId?: number | null; limit?: number }) =>
    invoke<Sale[]>("list_sales", {
      period: options?.period ?? "all",
      workerId: options?.workerId ?? null,
      limit: options?.limit ?? 100,
    }),
  getSale: (id: string) => invoke<Sale>("get_sale", { id }),
  returnSale: (saleId: string) => invoke<Sale>("return_sale", { saleId }),

  // Shifts
  currentShiftTotals: () => invoke<ShiftTotals>("current_shift_totals"),
  openShift: (openingCash: number) => invoke<Shift>("open_shift", { openingCash }),
  closeShift: (countedCash: number) => invoke<Shift>("close_shift", { countedCash }),
  addCashMovement: (input: CashMovementInput) =>
    invoke<Shift>("add_cash_movement", { input }),
  listShifts: (limit?: number) => invoke<Shift[]>("list_shifts", { limit }),
  listCashMovements: (shiftId: number) =>
    invoke<CashMovement[]>("list_cash_movements", { shiftId }),

  // Reports
  getDashboard: () => invoke<Dashboard>("get_dashboard"),
  getReports: (period?: string) => invoke<ReportData>("get_reports", { period }),
  exportSalesCsv: (period?: string) => invoke<string>("export_sales_csv", { period }),
};

export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Something went wrong. Please try again.";
}
