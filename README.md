# Inventory Manager — Superette Edition

An offline-first desktop application for Algerian superettes and épiceries. It manages the
catalogue, point of sale, stock movements, supplier deliveries, customer credit, shifts, reports,
settings and backups entirely on the shop computer.

Built with **Tauri 2**, **Rust**, **SQLite**, **React 19**, **TypeScript**, **Vite** and
**Tailwind CSS 4**. No internet connection is required at runtime.

---

## Highlights

- **Local SQLite database** with WAL mode, foreign keys and transactional writes.
- **Algerian dinar** everywhere: money is stored as integer centimes and displayed as `DA`.
- **Immutable sales** — confirmed receipts are never edited. A full return creates a linked
  return entry that restores stock and reverses payment/credit effects.
- **Customer credit book** with credit limits, partial repayments, statements and overdue flags.
- **Stock traceability** — every change is an auditable stock movement with user, time and reason.
- **Expiry batches** for dairy, juice and other tracked products.
- **Purchases** update stock, cost prices and supplier balances.
- **Shifts and cash control** with opening float, cash in/out, expected vs counted cash.
- **Role-based access** enforced in Rust, not only in the UI.
- **Audit log** for sign-ins, sales, stock changes, settings and team changes.
- **Manual local backups** and CSV sales export.
- Light and dark themes, English UI, French/Arabic product names and receipt language options.

---

## Requirements

- Windows 10/11 (the primary target), macOS or Linux.
- [Node.js](https://nodejs.org/) 20 or newer and npm.
- [Rust](https://www.rust-lang.org/tools/install) 1.77.2 or newer with Cargo.
- On Windows: **Microsoft Edge WebView2 Runtime** (preinstalled on current Windows versions) and
  the **Visual Studio C++ Build Tools**.
- On Linux: the usual Tauri system dependencies (`webkit2gtk`, `libappindicator`, etc.).

---

## Getting started

```bash
npm install
npm run app
```

`npm run app` starts the Vite dev server and launches the Tauri desktop window.

### Production build

```bash
npm run app:build
```

Installers are written to `src-tauri/target/release/bundle/`.

### Frontend-only and backend checks

```bash
npm run build                 # TypeScript check + Vite production build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

---

## First sign-in

The database is created automatically on first launch and seeded with:

| Field | Value |
|---|---|
| Shop | `Ma Superette` |
| Username | `owner` |
| Password | `owner123` |
| PIN | `1234` |
| Device | `Main PC` (receipt prefix `PC`) |

Change these credentials in **Settings → Security** after the first sign-in.

Optional demo data can be loaded from **Settings → Data & backups** while the product catalogue
is empty. It creates sample products, suppliers and customers, plus:

| Demo account | Username | Password | PIN |
|---|---|---|---|
| Cashier | `cashier` | `cashier123` | `1111` |
| Stock worker | `stock` | `stock123` | `2222` |

Disable or delete demo accounts before using the app in a real shop.

---

## Where the data lives

| Data | Path |
|---|---|
| Database | `%APPDATA%\com.inventorymanager.superette\inventory.db` |
| Backups | `%APPDATA%\com.inventorymanager.superette\backups\` |
| CSV exports | `%APPDATA%\com.inventorymanager.superette\exports\` |

On macOS/Linux the same files live under the platform application-data directory. The exact paths
are shown in **Settings → About**, with copy buttons.

> The database is **not** encrypted. Protect the Windows account and keep backups on a USB drive or
> another machine. There is no cloud sync.

---

## Roles

| Role | Main permissions |
|---|---|
| **Owner** | Everything: catalogue, stock, purchases, sales, returns, credit, reports, team, settings, backups, audit, licence. |
| **Manager** | Catalogue, stock, purchases, sales, returns, credit, reports. No team, settings, backups, audit or licence. |
| **Cashier** | Point of sale, own sales, customer creation, credit payments, own shifts. No discounts, cost prices, products, purchases or reports. |
| **Stock worker** | Products, stock movements, purchases, suppliers, expiry batches. Cannot sell or see reports. |

Role checks are implemented in the Rust command layer. The React UI hides unavailable pages as a
second layer of defence.

---

## Main screens

- **Dashboard** — today/month revenue and profit, credit exposure, stock value, low stock,
  expiring batches and recent sales.
- **Point of sale** — barcode scanning/search, category filters, retail/wholesale pricing,
  weighted products, discounts (manager/owner), cash/CIB/Edahabia/BaridiMob/credit payments,
  cash change, printable receipt.
- **Sales** — receipt history, filters, full-sale returns, CSV export.
- **Products** — catalogue, barcodes, categories, prices, minimum stock, expiry tracking,
  archive/restore.
- **Stock control** — stock levels, movement log, expiring batches, manual adjustments with reason.
- **Purchases** — suppliers, deliveries, paid/remaining amounts, cost price updates, expiry dates.
- **Customers & credit** — balances, credit limits, statements, partial payments, overdue flags.
- **Reports** — revenue/profit trend, payment mix, top and slow products, credit, supplier debt,
  stock alerts, expiring batches.
- **Shifts & cash** — open/close shifts, cash in/out, expected drawer and variance.
- **Team** — accounts, roles, PINs, activation, password resets.
- **Settings** — shop identity, tax/receipt options, language, stock policy, password/PIN,
  backups, demo data, audit log, licence and application paths.

---

## Business rules

- All monetary values are **integer centimes**. The frontend parses `DA` input and sends cents.
- Quantities are `REAL` values rounded to three decimals; unit products require whole quantities.
- Stock cannot go negative unless **Settings → Tax & receipt → Allow negative stock** is enabled.
- Sales snapshot product names, unit prices, unit costs and VAT rates at checkout.
- A full return creates a new `return` sale linked to the original. The original remains unchanged.
- Credit sales create a positive ledger entry; payments create a negative entry.
- VAT is included in the final total and split at the sale's VAT rate when VAT is enabled.
- Stamp duty is a fixed `1.00 DA` added to cash sales when enabled.
- Every shift belongs to one user and one device. Sales without a shift remain valid.
- Audit entries record the actor, action, entity, old value and new value where applicable.

---

## Project structure

```text
src/                      React frontend
  components/             Layout and shared UI primitives
  lib/                    API wrappers, types, formatting, auth
  pages/                  One component per screen
src-tauri/
  src/
    auth.rs               Argon2 password/PIN hashing and validation
    catalog.rs            Products, barcodes and categories
    customers.rs          Credit book and payments
    db.rs                 Schema, seed data, settings, audit, periods
    inventory.rs          Stock movements, purchases and suppliers
    sales.rs              Sale/return creation and receipt assembly
    shifts.rs             Shifts and cash movements
    reports.rs            Dashboard and report aggregation
    settings.rs           Settings, backups and demo data
    users.rs              Accounts and authentication
    state.rs              Local session and connection helpers
    commands.rs           Tauri command layer and role gates
    lib.rs                App setup, command registration, backend tests
  capabilities/           Tauri permissions
  tauri.conf.json         Window, CSP and bundle configuration
  icons/                  Generated application icons
```

---

## Tests

The Rust backend contains integration-style tests that run against an in-memory SQLite database:

- seeded owner authentication;
- sale creation, stock decrement and oversell rejection;
- credit sale ledger updates;
- full-sale return restoring stock;
- VAT and settings updates.

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

---

## Known limitations

This is a complete desktop MVP, not the full commercial roadmap in `PROJECT.md`. The following
items are **not** implemented yet:

- phone/PWA **power-cut mode**, camera scanning and local Wi-Fi sync;
- multi-device replication and conflict resolution;
- partial line-level returns (only full-sale returns are supported);
- hold/resume sale;
- PDF reports and Excel export (CSV export is available);
- automatic scheduled backups, encrypted backups and the restore wizard;
- recording later supplier payments (only the paid amount at delivery is captured);
- expense tracking, label printing and customer reminder messaging;
- licence activation/enforcement (the licence panel is informational).

Local data has no cloud copy. Create backups regularly from **Settings → Data & backups**.
