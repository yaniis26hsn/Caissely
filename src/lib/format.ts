import type { PaymentMethod, Role, UnitType } from "./types";

const moneyFormatter = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

const quantityFormatter = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

export function formatMoney(centimes: number | null | undefined): string {
  const value = (centimes ?? 0) / 100;
  return `${moneyFormatter.format(value)} DA`;
}

export function formatMoneyValue(centimes: number | null | undefined): string {
  return moneyFormatter.format((centimes ?? 0) / 100);
}

export function formatInteger(value: number | null | undefined): string {
  return integerFormatter.format(value ?? 0);
}

export function formatQuantity(value: number | null | undefined): string {
  return quantityFormatter.format(value ?? 0);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function parseMoneyInput(value: string): number {
  if (!value) return 0;
  const normalized = value
    .replace(/\s/g, "")
    .replace(/[^\d.,-]/g, "")
    .replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

export function centsToInput(centimes: number | null | undefined): string {
  if (centimes === null || centimes === undefined) return "";
  const value = centimes / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function parseQuantityInput(value: string): number {
  if (!value) return 0;
  const parsed = Number.parseFloat(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 1000) / 1000;
}

function parseDbDate(value: string): Date {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);
  if (!Number.isNaN(date.getTime())) return date;
  return new Date(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = parseDbDate(value.length > 10 ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = parseDbDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${formatDate(value)}, ${new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)}`;
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = parseDbDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDayLabel(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(date);
}

export function todayISO(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function addDaysISO(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function roleLabel(role: Role | string): string {
  switch (role) {
    case "owner":
      return "Owner";
    case "manager":
      return "Manager";
    case "cashier":
      return "Cashier";
    case "stock_worker":
      return "Stock worker";
    default:
      return role;
  }
}

export function roleDescription(role: Role | string): string {
  switch (role) {
    case "owner":
      return "Full access, team, settings and backups.";
    case "manager":
      return "Selling, catalogue, purchasing, reports and returns.";
    case "cashier":
      return "Point of sale, own sales, customer credit and shift.";
    case "stock_worker":
      return "Stock, products, suppliers and purchase deliveries.";
    default:
      return "";
  }
}

export function unitLabel(unit: UnitType | string): string {
  return unit === "weight" ? "Weight (kg)" : "Unit";
}

export function shortUnit(unit: UnitType | string): string {
  return unit === "weight" ? "kg" : "pcs";
}

export function paymentLabel(method: PaymentMethod | string | null | undefined): string {
  switch (method) {
    case "cash":
      return "Cash";
    case "cib":
      return "CIB";
    case "edahabia":
      return "Edahabia";
    case "baridimob":
      return "BaridiMob";
    case "credit":
      return "Store credit";
    default:
      return method ?? "—";
  }
}

export function movementLabel(type: string): string {
  switch (type) {
    case "purchase":
      return "Purchase";
    case "sale":
      return "Sale";
    case "customer_return":
      return "Customer return";
    case "supplier_return":
      return "Supplier return";
    case "loss":
      return "Loss";
    case "expiry":
      return "Expired";
    case "adjustment":
      return "Adjustment";
    default:
      return type;
  }
}

export function ledgerLabel(type: string): string {
  switch (type) {
    case "credit_sale":
      return "Credit sale";
    case "payment":
      return "Payment";
    case "adjustment":
      return "Adjustment";
    default:
      return type;
  }
}

export function stockState(product: {
  stockQuantity: number;
  minStock: number;
  unitType: string;
}): "out" | "low" | "ok" {
  if (product.stockQuantity <= 0) return "out";
  if (product.stockQuantity <= product.minStock) return "low";
  return "ok";
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function truncate(value: string, length = 42): string {
  return value.length > length ? `${value.slice(0, length)}…` : value;
}
