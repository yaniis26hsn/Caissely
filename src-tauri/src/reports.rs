use std::fs;
use std::io::Write;
use std::path::Path;

use chrono::{Duration, Local};
use rusqlite::{params, Connection};

use crate::catalog;
use crate::customers;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::inventory;
use crate::models::{
    Dashboard, DashboardSummary, MethodTotal, ProductPerformance, ReportData, SeriesPoint,
};
use crate::sales;

fn money(value: f64) -> i64 {
    value.round() as i64
}

fn summary(conn: &Connection, clause: &str) -> AppResult<DashboardSummary> {
    let transactions: i64 = conn.query_row(
        &format!(
            "SELECT COALESCE(SUM(CASE WHEN s.type = 'sale' THEN 1 ELSE 0 END), 0)
             FROM sales s WHERE {clause}"
        ),
        [],
        |row| row.get(0),
    )?;

    let revenue: i64 = conn.query_row(
        &format!(
            "SELECT COALESCE(SUM(CASE WHEN s.type = 'return' THEN -s.total ELSE s.total END), 0)
             FROM sales s WHERE {clause}"
        ),
        [],
        |row| row.get(0),
    )?;

    let profit: f64 = conn.query_row(
        &format!(
            "SELECT COALESCE(SUM((si.quantity * (si.unit_price - si.unit_cost)) *
                CASE WHEN s.type = 'return' THEN -1 ELSE 1 END), 0)
             FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE {clause}"
        ),
        [],
        |row| row.get(0),
    )?;

    let items_sold: f64 = conn.query_row(
        &format!(
            "SELECT COALESCE(SUM(si.quantity * CASE WHEN s.type = 'return' THEN -1 ELSE 1 END), 0)
             FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE {clause}"
        ),
        [],
        |row| row.get(0),
    )?;

    let credit_sales: i64 = conn.query_row(
        &format!(
            "SELECT COALESCE(SUM(CASE WHEN s.type = 'return' THEN -p.amount ELSE p.amount END), 0)
             FROM payments p JOIN sales s ON s.id = p.sale_id
             WHERE {clause} AND p.method = 'credit'"
        ),
        [],
        |row| row.get(0),
    )?;

    Ok(DashboardSummary {
        revenue,
        profit: money(profit),
        transactions,
        items_sold: (items_sold * 1000.0).round() / 1000.0,
        average_basket: if transactions > 0 {
            revenue / transactions
        } else {
            0
        },
        credit_sales,
    })
}

pub fn revenue_series(conn: &Connection, days: i64) -> AppResult<Vec<SeriesPoint>> {
    let days = days.clamp(1, 90);
    let end = Local::now().date_naive();
    let start = end - Duration::days(days - 1);
    let start_text = start.format("%Y-%m-%d").to_string();

    let mut revenue_map: std::collections::HashMap<String, (i64, i64)> =
        std::collections::HashMap::new();
    let mut statement = conn.prepare(
        "SELECT date(s.created_at) AS day,
                COALESCE(SUM(CASE WHEN s.type = 'return' THEN -s.total ELSE s.total END), 0) AS revenue,
                COALESCE(SUM(CASE WHEN s.type = 'sale' THEN 1 ELSE 0 END), 0) AS transactions
         FROM sales s WHERE date(s.created_at) >= ?1 GROUP BY day",
    )?;
    let rows = statement.query_map(params![start_text], |row| {
        Ok((
            row.get::<_, String>(0)?,
            (row.get::<_, i64>(1)?, row.get::<_, i64>(2)?),
        ))
    })?;
    for row in rows {
        let (day, values) = row?;
        revenue_map.insert(day, values);
    }

    let mut profit_map: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
    let mut statement = conn.prepare(
        "SELECT date(s.created_at) AS day,
                COALESCE(SUM((si.quantity * (si.unit_price - si.unit_cost)) *
                    CASE WHEN s.type = 'return' THEN -1 ELSE 1 END), 0) AS profit
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE date(s.created_at) >= ?1 GROUP BY day",
    )?;
    let rows = statement.query_map(params![start_text], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
    })?;
    for row in rows {
        let (day, profit) = row?;
        profit_map.insert(day, profit);
    }

    let mut series = Vec::new();
    for offset in 0..days {
        let date = start + Duration::days(offset);
        let key = date.format("%Y-%m-%d").to_string();
        let (revenue, transactions) = revenue_map.get(&key).copied().unwrap_or((0, 0));
        let profit = profit_map.get(&key).copied().unwrap_or(0.0);
        series.push(SeriesPoint {
            date: key,
            label: db::format_date_label(date),
            revenue,
            profit: money(profit),
            transactions,
        });
    }
    Ok(series)
}

pub fn dashboard(conn: &Connection) -> AppResult<Dashboard> {
    let today = summary(conn, db::period_clause("today"))?;
    let month = summary(conn, db::period_clause("month"))?;

    let mut low_stock = catalog::list_products(conn, None, None, Some("low"), false)?;
    low_stock.truncate(8);
    let mut out_of_stock = catalog::list_products(conn, None, None, Some("out"), false)?;
    out_of_stock.truncate(8);
    let mut expiring = inventory::list_expiring_batches(conn, 30)?;
    expiring.truncate(8);

    let recent_sales = sales::list_sales(conn, "all", None, 6)?;

    let credit_outstanding: i64 = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM customer_ledger",
        [],
        |row| row.get(0),
    )?;
    let supplier_debt: i64 = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM supplier_ledger",
        [],
        |row| row.get(0),
    )?;
    let stock_value: f64 = conn.query_row(
        "SELECT COALESCE(SUM(stock_quantity * cost_price), 0) FROM products WHERE is_active = 1",
        [],
        |row| row.get(0),
    )?;
    let customer_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM customers WHERE is_active = 1",
        [],
        |row| row.get(0),
    )?;

    Ok(Dashboard {
        today,
        month,
        revenue_series: revenue_series(conn, 14)?,
        low_stock,
        out_of_stock,
        expiring,
        recent_sales,
        credit_outstanding: credit_outstanding.max(0),
        supplier_debt: supplier_debt.max(0),
        stock_value: money(stock_value),
        customer_count,
    })
}

fn product_performance(
    conn: &Connection,
    clause: &str,
    ascending: bool,
) -> AppResult<Vec<ProductPerformance>> {
    let order = if ascending { "quantity_sold ASC" } else { "quantity_sold DESC" };
    let mut statement = conn.prepare(&format!(
        "SELECT p.id, p.name_fr,
                COALESCE(SUM(si.quantity * CASE WHEN s.type = 'return' THEN -1 ELSE 1 END), 0) AS quantity_sold,
                COALESCE(SUM(si.quantity * si.unit_price *
                    CASE WHEN s.type = 'return' THEN -1 ELSE 1 END), 0) AS revenue,
                COALESCE(SUM(si.quantity * (si.unit_price - si.unit_cost) *
                    CASE WHEN s.type = 'return' THEN -1 ELSE 1 END), 0) AS profit
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         JOIN products p ON p.id = si.product_id
         WHERE {clause}
         GROUP BY p.id, p.name_fr
         HAVING quantity_sold > 0
         ORDER BY {order}, p.name_fr COLLATE NOCASE LIMIT 5"
    ))?;
    let rows = statement.query_map([], |row| {
        Ok(ProductPerformance {
            product_id: row.get(0)?,
            product_name: row.get(1)?,
            quantity_sold: row.get(2)?,
            revenue: money(row.get::<_, f64>(3)?),
            profit: money(row.get::<_, f64>(4)?),
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn payment_methods(conn: &Connection, clause: &str) -> AppResult<Vec<MethodTotal>> {
    let mut statement = conn.prepare(&format!(
        "SELECT p.method,
                COALESCE(SUM(CASE WHEN s.type = 'return' THEN -p.amount ELSE p.amount END), 0) AS amount,
                COALESCE(SUM(CASE WHEN s.type = 'sale' THEN 1 ELSE 0 END), 0) AS count
         FROM payments p JOIN sales s ON s.id = p.sale_id
         WHERE {clause} GROUP BY p.method ORDER BY amount DESC"
    ))?;
    let rows = statement.query_map([], |row| {
        Ok(MethodTotal {
            method: row.get(0)?,
            amount: row.get(1)?,
            count: row.get(2)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn reports(conn: &Connection, period: &str) -> AppResult<ReportData> {
    let period = db::normalize_period(period);
    let clause = db::period_clause(period);
    let summary = summary(conn, clause)?;

    let returns_total: i64 = conn.query_row(
        &format!(
            "SELECT COALESCE(SUM(s.total), 0) FROM sales s WHERE {clause} AND s.type = 'return'"
        ),
        [],
        |row| row.get(0),
    )?;

    let stock_value: f64 = conn.query_row(
        "SELECT COALESCE(SUM(stock_quantity * cost_price), 0) FROM products WHERE is_active = 1",
        [],
        |row| row.get(0),
    )?;

    let mut low_stock = catalog::list_products(conn, None, None, Some("low"), false)?;
    low_stock.truncate(10);
    let mut out_of_stock = catalog::list_products(conn, None, None, Some("out"), false)?;
    out_of_stock.truncate(10);

    let credit_outstanding: i64 = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM customer_ledger",
        [],
        |row| row.get(0),
    )?;
    let supplier_debt: i64 = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM supplier_ledger",
        [],
        |row| row.get(0),
    )?;

    let mut debtors = customers::list_customers(conn, None, false, true)?;
    debtors.truncate(10);
    let mut suppliers = inventory::list_suppliers(conn, false)?;
    suppliers.retain(|supplier| supplier.balance > 0);
    suppliers.sort_by(|left, right| right.balance.cmp(&left.balance));
    suppliers.truncate(10);

    Ok(ReportData {
        period: period.to_string(),
        revenue: summary.revenue,
        profit: summary.profit,
        transactions: summary.transactions,
        items_sold: summary.items_sold,
        average_basket: summary.average_basket,
        returns_total,
        revenue_series: revenue_series(conn, db::chart_days(period))?,
        top_products: product_performance(conn, clause, false)?,
        lowest_products: product_performance(conn, clause, true)?,
        payment_methods: payment_methods(conn, clause)?,
        stock_value: money(stock_value),
        low_stock,
        out_of_stock,
        expiring: inventory::list_expiring_batches(conn, 30)?,
        credit_outstanding: credit_outstanding.max(0),
        supplier_debt: supplier_debt.max(0),
        debtors,
        suppliers,
    })
}

fn csv_escape(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') || value.contains('\r') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

pub fn export_sales_csv(conn: &Connection, period: &str, export_dir: &Path) -> AppResult<String> {
    let period = db::normalize_period(period);
    let clause = db::period_clause(period);
    fs::create_dir_all(export_dir)?;
    let filename = format!(
        "sales-{}-{}.csv",
        period,
        Local::now().format("%Y%m%d-%H%M%S")
    );
    let path = export_dir.join(filename);

    let mut statement = conn.prepare(&format!(
        "SELECT s.receipt_number, s.created_at, s.type, u.full_name AS cashier,
                COALESCE(c.name, '') AS customer,
                COALESCE((SELECT p.method FROM payments p WHERE p.sale_id = s.id LIMIT 1), '') AS method,
                p.name_fr AS product_name, si.quantity, si.unit_price, si.unit_cost,
                si.line_total, s.subtotal, s.discount, s.vat_total, s.stamp_duty, s.total,
                s.customer_id
         FROM sales s
         JOIN sale_items si ON si.sale_id = s.id
         JOIN products p ON p.id = si.product_id
         JOIN users u ON u.id = s.user_id
         LEFT JOIN customers c ON c.id = s.customer_id
         WHERE {clause}
         ORDER BY s.created_at ASC, s.rowid ASC"
    ))?;
    let rows = statement.query_map([], |row| {
        Ok(vec![
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
            format!("{:.3}", row.get::<_, f64>(7)?),
            format!("{:.2}", row.get::<_, i64>(8)? as f64 / 100.0),
            format!("{:.2}", row.get::<_, i64>(9)? as f64 / 100.0),
            format!("{:.2}", row.get::<_, i64>(10)? as f64 / 100.0),
            format!("{:.2}", row.get::<_, i64>(11)? as f64 / 100.0),
            format!("{:.2}", row.get::<_, i64>(12)? as f64 / 100.0),
            format!("{:.2}", row.get::<_, i64>(13)? as f64 / 100.0),
            format!("{:.2}", row.get::<_, i64>(14)? as f64 / 100.0),
            format!("{:.2}", row.get::<_, i64>(15)? as f64 / 100.0),
            row.get::<_, Option<i64>>(16)?.map(|value| value.to_string()).unwrap_or_default(),
        ])
    })?;

    let mut file = fs::File::create(&path).map_err(AppError::from)?;
    writeln!(
        file,
        "Receipt,Date,Type,Cashier,Customer,Payment,Product,Quantity,UnitPriceDA,UnitCostDA,LineTotalDA,SubtotalDA,DiscountDA,VATDA,StampDutyDA,TotalDA,CustomerId"
    )?;
    for row in rows {
        let values = row?;
        let line = values
            .iter()
            .map(|value| csv_escape(value))
            .collect::<Vec<_>>()
            .join(",");
        writeln!(file, "{line}")?;
    }
    Ok(path.to_string_lossy().to_string())
}
