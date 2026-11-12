export type Role = "owner" | "manager" | "cashier" | "stock_worker";
export type UnitType = "unit" | "weight";
export type MovementType =
  | "purchase"
  | "sale"
  | "customer_return"
  | "supplier_return"
  | "loss"
  | "expiry"
  | "adjustment";
export type SaleType = "sale" | "return";
export type PaymentMethod = "cash" | "cib" | "edahabia" | "baridimob" | "credit";
export type PriceTier = "retail" | "wholesale";

export interface User {
  id: number;
  fullName: string;
  username: string;
  role: Role;
  isActive: boolean;
  hasPin: boolean;
  createdAt: string;
}

export interface CreateUserInput {
  fullName: string;
  username: string;
  password: string;
  pin?: string | null;
  role: Role;
}

export interface UpdateUserInput {
  fullName: string;
  username: string;
  role: Role;
  isActive: boolean;
  password?: string | null;
  pin?: string | null;
  clearPin: boolean;
}

export interface ShopSettings {
  id: number;
  shopName: string;
  address?: string | null;
  phone?: string | null;
  rc?: string | null;
  nif?: string | null;
  nis?: string | null;
  ai?: string | null;
  vatEnabled: boolean;
  stampDutyEnabled: boolean;
  defaultLanguage: string;
  receiptFooter?: string | null;
  allowNegativeStock: boolean;
}

export interface ShopSettingsInput {
  shopName: string;
  address?: string | null;
  phone?: string | null;
  rc?: string | null;
  nif?: string | null;
  nis?: string | null;
  ai?: string | null;
  vatEnabled: boolean;
  stampDutyEnabled: boolean;
  defaultLanguage: string;
  receiptFooter?: string | null;
  allowNegativeStock: boolean;
}

export interface Category {
  id: number;
  nameAr?: string | null;
  nameFr: string;
  isActive: boolean;
}

export interface CategoryInput {
  nameAr?: string | null;
  nameFr: string;
  isActive: boolean;
}

export interface ProductBarcode {
  id: number;
  barcode: string;
  unitsPerBarcode: number;
  label?: string | null;
}

export interface BarcodeInput {
  barcode: string;
  unitsPerBarcode: number;
  label?: string | null;
}

export interface Product {
  id: number;
  nameAr?: string | null;
  nameFr: string;
  categoryId?: number | null;
  categoryName?: string | null;
  unitType: UnitType;
  priceRetail: number;
  priceWholesale?: number | null;
  costPrice: number;
  vatRate: number;
  stockQuantity: number;
  minStock: number;
  trackExpiry: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  barcodes: ProductBarcode[];
}

export interface CreateProductInput {
  nameAr?: string | null;
  nameFr: string;
  categoryId?: number | null;
  unitType: UnitType;
  priceRetail: number;
  priceWholesale?: number | null;
  costPrice: number;
  vatRate: number;
  minStock: number;
  trackExpiry: boolean;
  isActive: boolean;
  openingStock: number;
  barcodes: BarcodeInput[];
}

export interface UpdateProductInput {
  nameAr?: string | null;
  nameFr: string;
  categoryId?: number | null;
  unitType: UnitType;
  priceRetail: number;
  priceWholesale?: number | null;
  costPrice: number;
  vatRate: number;
  minStock: number;
  trackExpiry: boolean;
  isActive: boolean;
  barcodes: BarcodeInput[];
}

export interface ScanResult {
  product: Product;
  unitsPerBarcode: number;
}

export interface Customer {
  id: number;
  name: string;
  phone?: string | null;
  creditLimit?: number | null;
  isActive: boolean;
  createdAt: string;
  balance: number;
  hasOverdue: boolean;
}

export interface CustomerInput {
  name: string;
  phone?: string | null;
  creditLimit?: number | null;
  isActive: boolean;
}

export interface CustomerLedgerEntry {
  id: string;
  customerId: number;
  entryType: "credit_sale" | "payment" | "adjustment";
  amount: number;
  saleId?: string | null;
  receiptNumber?: string | null;
  paymentMethod?: string | null;
  note?: string | null;
  userName?: string | null;
  createdAt: string;
}

export interface CustomerStatement {
  customer: Customer;
  balance: number;
  entries: CustomerLedgerEntry[];
}

export interface SaleItem {
  id: string;
  productId: number;
  productName: string;
  productNameAr?: string | null;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  vatRate: number;
  lineTotal: number;
}

export interface Payment {
  id: string;
  saleId: string;
  method: PaymentMethod;
  amount: number;
  cashGiven?: number | null;
  createdAt: string;
}

export interface Sale {
  id: string;
  saleType: SaleType;
  originalSaleId?: string | null;
  receiptNumber: string;
  deviceSeq: number;
  userId: number;
  userName: string;
  shiftId?: number | null;
  customerId?: number | null;
  customerName?: string | null;
  priceTier: PriceTier;
  subtotal: number;
  discount: number;
  vatTotal: number;
  stampDuty: number;
  total: number;
  createdOffline: boolean;
  createdAt: string;
  items: SaleItem[];
  payments: Payment[];
}

export interface SaleItemInput {
  productId: number;
  quantity: number;
}

export interface CreateSaleInput {
  items: SaleItemInput[];
  priceTier: PriceTier;
  discount: number;
  paymentMethod: PaymentMethod;
  customerId?: number | null;
  cashGiven?: number | null;
}

export interface StockMovement {
  id: string;
  productId: number;
  productName: string;
  movementType: MovementType;
  quantity: number;
  reason?: string | null;
  userName?: string | null;
  saleId?: string | null;
  purchaseId?: number | null;
  createdAt: string;
}

export interface StockAdjustmentInput {
  productId: number;
  movementType: MovementType;
  quantityDelta: number;
  reason?: string | null;
}

export interface Supplier {
  id: number;
  name: string;
  phone?: string | null;
  isActive: boolean;
  balance: number;
}

export interface SupplierInput {
  name: string;
  phone?: string | null;
  isActive: boolean;
}

export interface PurchaseItem {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  expiryDate?: string | null;
}

export interface Purchase {
  id: number;
  supplierId: number;
  supplierName: string;
  userId: number;
  userName: string;
  reference?: string | null;
  total: number;
  paidAmount: number;
  createdAt: string;
  items: PurchaseItem[];
}

export interface PurchaseItemInput {
  productId: number;
  quantity: number;
  unitCost: number;
  expiryDate?: string | null;
}

export interface CreatePurchaseInput {
  supplierId: number;
  reference?: string | null;
  paidAmount: number;
  items: PurchaseItemInput[];
}

export interface ExpiringBatch {
  id: number;
  productId: number;
  productName: string;
  quantityRemaining: number;
  expiryDate?: string | null;
  receivedAt: string;
  daysLeft: number;
}

export interface Shift {
  id: number;
  userId: number;
  userName: string;
  deviceId: string;
  openedAt: string;
  closedAt?: string | null;
  openingCash: number;
  expectedCash: number;
  countedCash?: number | null;
  difference?: number | null;
  cashIn: number;
  cashOut: number;
}

export interface CashMovement {
  id: number;
  shiftId: number;
  movementType: "cash_in" | "cash_out";
  amount: number;
  reason: string;
  createdAt: string;
}

export interface CashMovementInput {
  movementType: "cash_in" | "cash_out";
  amount: number;
  reason: string;
}

export interface ShiftTotals {
  current?: Shift | null;
  cashIn: number;
  cashOut: number;
  cashSales: number;
  expectedCash: number;
}

export interface AuditEntry {
  id: number;
  userName?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  createdAt: string;
}

export interface BackupFile {
  name: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
}

export interface LicenseInfo {
  licenseId: string;
  plan: string;
  issuedAt: string;
  expiresAt: string;
  lastSeenDate: string;
  daysRemaining: number;
  enforced: boolean;
}

export interface AppInfo {
  version: string;
  dbPath: string;
  backupDir: string;
  deviceId: string;
  deviceName: string;
  receiptPrefix: string;
}

export interface DashboardSummary {
  revenue: number;
  profit: number;
  transactions: number;
  itemsSold: number;
  averageBasket: number;
  creditSales: number;
}

export interface SeriesPoint {
  date: string;
  label: string;
  revenue: number;
  profit: number;
  transactions: number;
}

export interface ProductPerformance {
  productId: number;
  productName: string;
  quantitySold: number;
  revenue: number;
  profit: number;
}

export interface MethodTotal {
  method: PaymentMethod;
  amount: number;
  count: number;
}

export interface Dashboard {
  today: DashboardSummary;
  month: DashboardSummary;
  revenueSeries: SeriesPoint[];
  lowStock: Product[];
  outOfStock: Product[];
  expiring: ExpiringBatch[];
  recentSales: Sale[];
  creditOutstanding: number;
  supplierDebt: number;
  stockValue: number;
  customerCount: number;
}

export interface ReportData {
  period: string;
  revenue: number;
  profit: number;
  transactions: number;
  itemsSold: number;
  averageBasket: number;
  returnsTotal: number;
  revenueSeries: SeriesPoint[];
  topProducts: ProductPerformance[];
  lowestProducts: ProductPerformance[];
  paymentMethods: MethodTotal[];
  stockValue: number;
  lowStock: Product[];
  outOfStock: Product[];
  expiring: ExpiringBatch[];
  creditOutstanding: number;
  supplierDebt: number;
  debtors: Customer[];
  suppliers: Supplier[];
}
