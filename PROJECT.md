# Inventory_Manager — Superette / Épicerie Edition (Algeria)

An **offline-first desktop + phone application** to manage stock, sales and customer credit for Algerian superettes and épiceries. It keeps working during **internet outages and power cuts**, which are daily problems for small shops.

> **Status:** prototype → commercial product. Sold as a **yearly paid license** to shop owners.

---

## Table of contents

1. [Vision and problem](#1-vision-and-problem)
2. [Target customer](#2-target-customer)
3. [Users and roles](#3-users-and-roles)
4. [Core features (MVP)](#4-core-features-mvp)
5. [Power-cut mode: phone as a barcode scanner and till](#5-power-cut-mode-phone-as-a-barcode-scanner-and-till)
6. [Algerian-specific features](#6-algerian-specific-features)
7. [Compliance (legal and tax)](#7-compliance-legal-and-tax)
8. [Licensing: yearly license with offline activation](#8-licensing-yearly-license-with-offline-activation)
9. [Tech stack and architecture](#9-tech-stack-and-architecture)
10. [Database model](#10-database-model)
11. [Business rules](#11-business-rules)
12. [Business model and go-to-market](#12-business-model-and-go-to-market)
13. [Roadmap](#13-roadmap)
14. [Risks and open questions](#14-risks-and-open-questions)

---

## 1. Vision and problem

Most superette owners in Algeria still use:

* paper notebooks (the "cahier" for credit),
* Excel sheets or nothing at all,
* manual stock counting, with no idea which products sell best or what is running out.

Typical pain points:

| Problem | Consequence |
|---|---|
| Electricity is cut during opening hours | Till and PC stop, sales are slowed or lost, mistakes are made on paper |
| Unreliable internet | Cloud software is unusable |
| Credit sales ("crédit") tracked on paper | Forgotten or disputed debts |
| Employee theft or errors | Cash and stock don't match, no traceability |
| No idea of stock levels or expiry dates | Out-of-stock bestsellers, expired goods thrown away |
| Pressure to be tax-compliant | Owners fear fines and don't know what their software must do |

**Our answer:** a fast, simple, local application that works with **zero internet**, survives **power cuts**, and is built around how Algerian shops actually operate.

---

## 2. Target customer

**First niche: superettes and épiceries** (small grocery and general food shops, 1 to 5 staff).

Why this niche first:

* Large number of shops, all with the same needs (barcodes, fast sales, credit, expiry).
* Daily high-volume sales, so the owner feels the value immediately.
* Easy to explain: *"the app made for épiceries"*.

Other niches (hardware, cosmetics, phone shops, bakeries) come **after** the product is proven.

---

## 3. Users and roles

| Role | Permissions |
|---|---|
| **Owner / Admin** | Everything: products, prices, cost prices, reports, employees, backups, settings, license |
| **Manager** (optional) | Products, stock, purchases, reports. No access to license and critical settings |
| **Cashier** | Create sales, view products, record customer payments. **Cannot** change prices, delete products or see cost prices and profit |
| **Stock worker** | Receive deliveries, adjust stock (with a reason), run inventory counts. **Cannot** make sales or see revenue |

* Every user has a login (PIN for fast cashier switching, password for admin).
* Accounts can be activated or deactivated.
* **Every action is logged** (who, what, when).

---

## 4. Core features (MVP)

### A. Product catalog

Each product has:

* Name (Arabic and/or French)
* Category (drinks, dairy, canned goods, cleaning, etc.)
* Barcode(s). A product can have several (unit and carton)
* Selling price **retail (détail)** and **wholesale (gros)**
* Cost price (visible to owner/manager only)
* Unit type: **unit**, **pack**, **carton**, or **weight (kg/g)**
* Conversion between units (e.g. 1 carton = 24 units)
* Stock quantity and **minimum stock level** (alert threshold)
* **Expiry date / batches** (optional, recommended for dairy, juice, etc.)
* VAT rate (see compliance)

Actions: add, edit, archive (not hard delete, to keep history), search by name or barcode, filter by category and stock status (in stock / low / out).

### B. Stock tracking

Stock **increases** with: delivery from supplier, customer return, manual correction (with reason).
Stock **decreases** with: sale, supplier return, loss/damage/expiry (with reason), manual correction (with reason).

* Stock can **never go negative** (configurable warning for owners who sell before entering deliveries).
* Every movement is stored in a **stock movement history** (type, quantity, user, date, reference).
* **Inventory count mode:** count shelves with a scanner, compare with the system, and apply differences with a reason.

### C. Sales (the till)

* Scan barcode (USB scanner or phone camera), or search by name.
* Fast keyboard-first interface, built for speed.
* Quantity, discount (permission-controlled), weight-based items.
* Payment: **cash**, **card (CIB / Edahabia)**, **mobile (BaridiMob)**, or **credit (crédit)**. These are recorded as the method used. The app does not process the payment itself.
* Cash given and change calculation.
* Print or save the receipt (thermal 58/80 mm), or skip printing.
* **Hold / resume** a sale (customer forgot their wallet).
* Returns and refunds (permission-controlled and logged).

### D. Customer credit book (crédit)

* Customers with name and phone number.
* Credit limit per customer (optional).
* Record credit sales, **partial payments**, and full settlement.
* Customer statement (what they owe, history).
* List of debtors, sorted by amount and age.
* Reminder list to call or message (manual at first).

### E. Suppliers and purchases

* Suppliers list with phone number.
* Record deliveries (purchase invoice or delivery note) → stock increases and cost price updates.
* Track **what the owner owes suppliers** and payments made.

### F. Cash register management (shifts)

* Open a shift with the starting cash amount.
* Close the shift: the cashier counts the cash, the system shows **expected vs. counted** and the difference.
* Cash in / out (e.g. paying a delivery driver from the till), with a reason.

### G. Dashboard

* Today: sales count, revenue, estimated profit (owner only), cash vs. credit.
* Month: revenue, best and worst sellers.
* **Alerts:** low stock, out of stock, products **close to expiry**, customers with overdue debts.

### H. Reports

* Daily and monthly sales reports.
* Product performance (top / bottom sellers).
* Profit by product and category (owner only).
* Stock valuation.
* Credit report (total owed by customers and to suppliers).
* Export to **PDF and Excel/CSV**.

### I. Backup and restore

* **Automatic local backup** (daily and after each shift closing), encrypted.
* One-click backup to **USB drive**.
* Optional backup to Google Drive or another cloud when internet is available.
* Simple restore wizard. Losing data is the owner's biggest fear.

---

## 5. Power-cut mode: phone as a barcode scanner and till

This is the **key differentiator** of the product. When electricity is cut, the PC, screen, router and printer usually stop. The shop must keep selling.

### Scenario

1. Power goes out. The PC is off (or on a UPS for a few minutes).
2. The owner or cashier opens the **phone app** (installable web app / PWA, or a lightweight mobile app).
3. They scan products with the phone camera and the sale total is calculated.
4. The sale is **saved on the phone**, with no internet and no PC needed.
5. When power returns, the phone **syncs automatically** with the PC over the local Wi-Fi. Stock and sales update on the main app.

### Design decisions

* The phone needs its **own local copy of the catalog** (products, barcodes, prices, stock snapshot). It must **not depend** on the PC being on, because the PC may be the thing that lost power.
* Sales made on the phone are stored locally (e.g. IndexedDB / SQLite) with a **unique ID per sale** to avoid duplicates when syncing.
* **Sync happens over the local network** (PC and phone on the same Wi-Fi). No cloud is required.
* Normal mode (power on): the phone can also act as a **wireless barcode scanner** connected to the PC till.
* Conflict rule: if the same product was sold on both devices while disconnected, stock is recalculated from **movement history**, not overwritten. If stock goes negative after sync, the app flags it for the owner to review rather than blocking silently.
* Phone camera scanning: use a barcode library (e.g. ZXing / the browser `BarcodeDetector` where available).
* Receipts in power-cut mode: show on screen or send by message. Printing is not expected.
* **Recommended hardware advice for customers:** a small UPS for the PC and router, which also protects data from corruption during sudden cuts.

### Data safety

* The database uses **transactions** (SQLite WAL mode), so a sudden power loss during a sale cannot corrupt the data.
* The phone data is protected by a PIN, since it holds sales and prices.

---

## 6. Algerian-specific features

* **Languages:** Arabic (full RTL support) and French, switchable per user. Wording should be natural for shop owners (Darija-friendly terms where appropriate).
* **Currency:** Algerian dinar (DA), with centimes handled correctly.
* **Credit book (crédit)** as a first-class feature (section 4.D).
* **Retail / wholesale pricing (détail / gros).**
* **Weight-based sales** (kg / g) and multiple units (unit, pack, carton).
* **Expiry date tracking** for food.
* **Payment methods:** cash, CIB, Edahabia, BaridiMob, credit.
* **Thermal printer and barcode scanner support** (ESC/POS, USB HID scanners).
* **Business identifiers on invoices:** RC, NIF, NIS, AI (see compliance).
* **Works on modest and older PCs** (see tech stack notes about Windows versions).

---

## 7. Compliance (legal and tax)

> ⚠️ **Important:** the information below is a working summary, **not legal or tax advice**. Rules change (the Finance Law changes every year). **Before launching, validate every point with an Algerian accountant or tax advisor** and read the current text of the law.

### 7.1 Software and cash-register systems

* The **2026 Finance Law** introduces a requirement for VAT-liable businesses that record sales (made without issuing an invoice) through a **software or cash-register system**: they must present a **commitment from the software publisher** or the **certificate referred to in article 51 bis**.
* **Consequence for us:** as the publisher, we may need to provide a signed **publisher commitment / conformity attestation** to each customer, and the software must meet whatever technical conditions the law and its implementing texts define.
* **To do before launch:**
  * [ ] Obtain the exact text of the article and its implementing decrees or instructions.
  * [ ] Ask an accountant or the tax administration what the "engagement de l'éditeur" must contain and whether the software or the publisher needs registration or certification.
  * [ ] Design the software so that **sales records cannot be silently altered or deleted** (see below).

### 7.2 Design rules that support compliance (anti-fraud and traceability)

* Sales are **immutable**: no editing or deleting a confirmed sale. Corrections are made through **returns / cancellation entries** that reference the original.
* **Sequential, gap-free numbering** of receipts and invoices.
* Full **audit log** of sensitive actions (price changes, cancellations, discounts, stock corrections, user changes).
* **Timestamps** from the system, with detection of suspicious clock changes.
* Ability to **export all sales data** (CSV / PDF) for the owner or the tax administration.
* Data retention: keep records for the legally required period (to confirm with the advisor).

### 7.3 Taxes on sales (to verify)

* **VAT (TVA):** commonly 19% (standard) and 9% (reduced) rates, and some products exempt. Make the rate **configurable per product** and don't hard-code values.
* **Stamp duty (droit de timbre)** may apply to cash payments on invoices. Make it configurable.
* Many small shops are under the **IFU (flat-rate tax regime)** and may not charge VAT on receipts. The app must support **VAT enabled or disabled** per shop.
* Invoices (not simple receipts) must show the business identifiers: **RC, NIF, NIS, AI**.

### 7.4 Electronic payments

* TPE (payment terminals) are being made mandatory in more and more sectors. The app does **not** integrate with TPE at the MVP stage, but it must **record the payment method** so the owner's books match their bank and terminal reports.

### 7.5 Personal data

* The app stores customer names and phone numbers (credit book). Keep this data **local**, minimal, and protected. Check obligations under Algerian personal data protection law (Law 18-07) with the advisor.

### 7.6 Business side (for the seller)

* Register the activity properly (auto-entrepreneur / company status) before selling.
* Prepare a **license agreement (EULA)**, a **refund policy** and a **commercial invoice** for each sale of the software itself.

---

## 8. Licensing: yearly license with offline activation

**Goal:** protect revenue against piracy **without requiring internet**, and **never hold the owner's data hostage**.

### 8.1 Principles

* One license = **one shop** (limited number of devices, e.g. 1 PC + N phones), valid for **1 year**.
* Activation and renewal must work **fully offline**, because many shops have unreliable internet.
* The license is a **digitally signed file/code**, verified by the app locally.
* **Public key** is embedded in the app. The **private key** never leaves the vendor's machine.

### 8.2 Offline activation flow

1. On first launch, the app generates a **machine fingerprint** (hash of stable hardware identifiers) and shows an **Activation Request Code** (also as a QR code).
2. The owner sends this code to the vendor (WhatsApp, phone, in person).
3. The vendor verifies payment and generates a **License Code** (signed with Ed25519 or similar), containing:
   * license ID, shop name,
   * machine fingerprint,
   * plan / features, device limit,
   * issue date and **expiry date**.
4. The owner types or pastes the License Code (or scans a QR). The app verifies the signature and the fingerprint, then activates.
5. **Renewal** works the same way: a new signed code extends the expiry date.

### 8.3 Expiry behavior (be fair)

* **30-day warning** before expiry, then a visible countdown.
* **Grace period** (e.g. 15 to 30 days) after expiry with full function and reminders.
* After the grace period: the app goes to **read-only / export mode**. The owner can still **view, export and back up all their data**, but cannot record new sales until renewal.
* Never delete or lock data. This builds trust and avoids legal and reputation problems.

### 8.4 Anti-tampering (reasonable, not paranoid)

* Verify the signature on every start.
* Detect **system clock rollback** (store a "last seen date" in a protected form).
* Bind the license to the machine, with a **controlled transfer** process (vendor re-issues a code if the PC is replaced).
* Obfuscate and harden the release build, and keep license checks in several places.
* Accept that **no protection is perfect.** The goal is to make honest renewal easier than cracking, and to sell value (support, updates, trust) rather than rely on locks alone.

### 8.5 Vendor tooling (needed from day one)

* A small **license generator** tool (CLI or small admin app) with a secure private key.
* A **customer registry** (shop, phone, license ID, expiry date, renewal reminders), in a simple spreadsheet at the start.

---

## 9. Tech stack and architecture

### Chosen stack

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | **Tauri** | Small, fast, low memory, good for modest PCs |
| Backend logic | **Rust** | Speed, safety, ideal for license and crypto logic |
| Database | **SQLite** (WAL mode, via `rusqlite` or `sqlx`) | Local, reliable, power-cut-safe with transactions, zero server |
| Frontend | React or Svelte (+ TypeScript) | Fast UI development, RTL support |
| Phone app | **PWA** (installable web app) with local storage and camera scanning | No app store needed, easy to install, works offline |
| Local sync | Small HTTP/WebSocket server inside the desktop app on the local network | No internet required |
| Printing | ESC/POS thermal printing | Standard for receipt printers |
| Crypto | Ed25519 signatures for licenses | Small, fast, secure |

### Architecture overview

```
┌──────────────────────────── Shop (no internet needed) ────────────────────────────┐
│                                                                                    │
│   ┌───────────── PC (Tauri app) ─────────────┐        ┌──── Phone (PWA) ────┐      │
│   │  UI (React/Svelte)                        │  local │  Local catalog copy │      │
│   │  Rust core: sales, stock, credit, license │◄──────►│  Camera scanning    │      │
│   │  SQLite database (WAL, encrypted backups) │  Wi-Fi │  Offline sales queue│      │
│   │  Local sync server                        │  sync  │  PIN-protected      │      │
│   └──────────────┬────────────────────────────┘        └─────────────────────┘      │
│                  │ USB scanner, thermal printer, cash drawer                        │
└──────────────────┴─────────────────────────────────────────────────────────────────┘
        Optional (when internet available): cloud backup, updates
```

### Technical notes and cautions

* **Windows versions:** Tauri uses WebView2. Windows 7 and 8 are **not** well supported. Many small shops still have old PCs, so **test on real old hardware early**. If this is a blocker, consider an alternative UI approach for those machines.
* **Performance target:** product search under 100 ms, adding an item to a sale under 50 ms, on a modest PC.
* **Auto-update:** manual offline update packages (USB or download) must be supported, not just online updates.
* **Phone sync security:** pair the phone with the PC (pairing code), and encrypt local-network traffic where possible.
* The stack remains **open to change** if testing shows a problem (for example the WebView2 limitation).

---

## 10. Database model

Main tables (simplified). The previous model (`MPD.png`) should be updated to match this.

| Table | Purpose and key fields |
|---|---|
| `users` | id, name, role, pin_hash / password_hash, active |
| `shop_settings` | shop name, RC, NIF, NIS, AI, address, phone, VAT enabled, default VAT rates, language, receipt footer |
| `categories` | id, name_ar, name_fr |
| `products` | id, name_ar, name_fr, category_id, unit_type, selling_price_retail, selling_price_wholesale, cost_price, vat_rate, min_stock, active |
| `product_barcodes` | id, product_id, barcode, unit_factor (e.g. carton = 24) |
| `stock_batches` | id, product_id, quantity, expiry_date, received_at (for expiry tracking) |
| `stock_movements` | id, product_id, type (sale, purchase, return, loss, adjustment), quantity, reason, user_id, ref_id, created_at |
| `sales` | id, **receipt_number (sequential)**, user_id, shift_id, customer_id (nullable), total, discount, payment_status, device_id, created_at |
| `sale_items` | id, sale_id, product_id, quantity, unit_price, vat_rate |
| `payments` | id, sale_id / customer_id, method (cash, CIB, Edahabia, BaridiMob, credit), amount, created_at |
| `customers` | id, name, phone, credit_limit |
| `customer_ledger` | id, customer_id, type (credit_sale, payment), amount, ref_id, created_at |
| `suppliers` | id, name, phone |
| `purchases` / `purchase_items` | supplier delivery documents and items |
| `supplier_ledger` | what the owner owes and pays |
| `shifts` | id, user_id, opened_at, closed_at, opening_cash, expected_cash, counted_cash, difference |
| `cash_movements` | id, shift_id, type (in/out), amount, reason |
| `audit_log` | id, user_id, action, entity, old_value, new_value, created_at |
| `license` | license_code, expiry_date, fingerprint, last_seen_date |
| `sync_log` | device_id, last_sync_at, pending count (phone ↔ PC sync) |

---

## 11. Business rules

* Stock can **never go negative** without an explicit owner-level override.
* Every sale **reduces stock automatically**, inside one database transaction.
* **Confirmed sales are immutable.** Corrections happen only through returns / cancellation entries.
* Receipt numbers are **sequential with no gaps**.
* Only authorized roles can change prices, cost prices, discounts and users.
* Every sensitive action is written to the **audit log**.
* A sale made with credit must be linked to a **customer**.
* Cashiers cannot see **cost price or profit**.
* The app must stay **fast** (like a real cash register), even with tens of thousands of products and sales.

---

## 12. Business model and go-to-market

### Pricing model

* **Yearly license** per shop (price to be defined after testing with first customers).
* Possible tiers:
  * **Basic:** 1 PC, core features.
  * **Standard:** + credit book, reports, phone mode (power-cut mode).
  * **Pro:** more devices and priority support.
* **Optional paid services** (often the main extra income):
  * Installation and setup.
  * Import of the owner's existing products from Excel.
  * Staff training.
  * Hardware bundle (barcode scanner, thermal printer, cash drawer, UPS).
  * Annual support contract.

### Go-to-market steps

1. **Validate:** visit 5 to 10 superettes, watch how they work, and show the prototype. Ask what they would pay.
2. **Pilot:** give 2 to 3 shops free (or discounted) use in exchange for feedback and testimonials.
3. **Sell locally first** (your own city/region), with in-person demos. Trust and word of mouth matter most in this market.
4. **Offer a free trial** (time-limited or limited number of products).
5. **Support channel:** WhatsApp / phone support in Arabic, French and Darija.
6. **Referral:** a discount or free month for owners who bring another shop.

### Payment collection (for you)

* Cash, bank transfer (CCP / bank), or mobile payment (BaridiMob). Always issue an invoice or receipt for the software sale.

---

## 13. Roadmap

### Phase 0: Validation (before heavy coding)
* [ ] Interview 5 to 10 superette owners
* [ ] Validate compliance requirements with an accountant
* [ ] Test Tauri on old PCs (Windows 10, and 7/8 if relevant)

### Phase 1: MVP (core till and stock)
* [ ] Products, barcodes, categories (Arabic and French)
* [ ] Sales screen with scanner and keyboard flow
* [ ] Stock movements, low-stock alerts
* [ ] Users and roles, audit log
* [ ] Receipts (thermal printer)
* [ ] Local backup and restore
* [ ] License system (offline activation, expiry, grace period)

### Phase 2: Algerian differentiators
* [ ] Customer credit book
* [ ] Suppliers and purchases
* [ ] Shifts and cash-up
* [ ] Expiry tracking and alerts
* [ ] **Phone power-cut mode and local sync**
* [ ] Reports and PDF/Excel export
* [ ] Invoices with RC / NIF / NIS / AI, VAT options

### Phase 3: Growth
* [ ] Publisher compliance documents (per legal advice)
* [ ] Owner remote view (optional cloud sync)
* [ ] Multi-shop support
* [ ] More niches (hardware, cosmetics, phones)
* [ ] Integration with payment terminals (if feasible)

---

## 14. Risks and open questions

| Risk / question | Mitigation |
|---|---|
| Compliance requirements for software publishers are unclear or change | Validate early with an accountant, design for traceability from the start |
| Old Windows versions not supported by WebView2 | Test early, define minimum supported OS clearly |
| Piracy and license sharing | Machine binding, signed licenses, sell support and updates as value |
| Owners reluctant to pay yearly | Show value (credit book, power-cut mode), offer a trial and clear renewal reminders |
| Data loss damages reputation | Automatic encrypted backups, transactions, power-cut-safe database |
| Phone ↔ PC sync conflicts | Unique sale IDs, rebuild stock from movements, flag anomalies for review |
| Support workload grows with customers | Good documentation, in-app help, a simple remote support process |
| Users are not tech-savvy | Very simple UI, PIN login, Arabic/French, short onboarding |

---

## License

Commercial software. All rights reserved. Distributed under a yearly paid license (see EULA).
