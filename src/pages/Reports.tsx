import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Download,
  PackageX,
  RotateCcw,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api, errorMessage } from "../lib/api";
import {
  formatDate,
  formatInteger,
  formatMoney,
  formatQuantity,
  paymentLabel,
  shortUnit,
} from "../lib/format";
import type { ReportData } from "../lib/types";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  ProgressBar,
  Segmented,
  StatCard,
} from "../components/ui";

type Period = "today" | "week" | "month" | "all";

const periodOptions: Array<{ value: Period; label: string }> = [
  { value: "today", label: "Today" },
  { value: "week", label: "7 days" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
];

function ReportTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-card px-3 py-2 shadow-[var(--shadow-lifted)]">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-faint">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} className="num flex items-center gap-2 text-[11.5px]">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted">{entry.dataKey === "revenue" ? "Revenue" : "Profit"}</span>
          <span className="ml-auto font-semibold text-ink">
            {formatMoney(Number(entry.value) * 100)}
          </span>
        </p>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [exporting, setExporting] = useState(false);

  const reportQuery = useQuery({
    queryKey: ["reports", period],
    queryFn: () => api.getReports(period),
  });

  const data: ReportData | undefined = reportQuery.data;
  const series = (data?.revenueSeries ?? []).map((point) => ({
    ...point,
    revenue: point.revenue / 100,
    profit: point.profit / 100,
  }));

  const handleExport = async () => {
    setExporting(true);
    try {
      const path = await api.exportSalesCsv(period);
      toast.success("CSV export created", { description: path });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  const paymentTotal = (data?.paymentMethods ?? []).reduce(
    (sum, method) => sum + Math.max(0, method.amount),
    0,
  );

  return (
    <>
      <PageHeader
        eyebrow="Analysis"
        title="Reports"
        description="Revenue, profit, product performance, payment mix, stock alerts and credit exposure."
        actions={
          <>
            <Button variant="secondary" icon={Download} onClick={handleExport} loading={exporting}>
              Export CSV
            </Button>
            <Segmented<Period> value={period} onChange={setPeriod} options={periodOptions} />
          </>
        }
      />

      {reportQuery.isLoading ? (
        <LoadingBlock label="Building the report…" />
      ) : reportQuery.isError || !data ? (
        <ErrorBlock message="Could not build this report." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Net revenue"
              value={formatMoney(data.revenue)}
              hint={`${formatInteger(data.transactions)} sales · returns deducted`}
              icon={Wallet}
              tone="brand"
            />
            <StatCard
              label="Gross profit"
              value={formatMoney(data.profit)}
              hint={`Margin ${data.revenue > 0 ? Math.round((data.profit / data.revenue) * 100) : 0}%`}
              icon={TrendingUp}
              tone="success"
            />
            <StatCard
              label="Average basket"
              value={formatMoney(data.averageBasket)}
              hint={`${formatQuantity(data.itemsSold)} items sold`}
              icon={BarChart3}
              tone="info"
            />
            <StatCard
              label="Returns"
              value={formatMoney(data.returnsTotal)}
              hint="Full-sale returns in this period"
              icon={RotateCcw}
              tone="warning"
            />
          </div>

          <div className="mt-3 grid gap-3 xl:grid-cols-12">
            <Card className="xl:col-span-8">
              <CardHeader
                title="Revenue & profit trend"
                description={`Daily totals · ${data.revenueSeries.length} day window`}
                action={
                  <div className="flex items-center gap-3 text-[10px] font-medium text-muted">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-brand" /> Revenue
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-info" /> Profit
                    </span>
                  </div>
                }
              />
              <div className="h-[300px] px-2 py-4 sm:px-3">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={series} margin={{ top: 6, right: 12, bottom: 0, left: -12 }}>
                    <defs>
                      <linearGradient id="reportRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.26} />
                        <stop offset="100%" stopColor="var(--brand)" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="var(--line)"
                      strokeOpacity={0.8}
                    />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 10, fill: "var(--faint)" }}
                      interval="preserveStartEnd"
                      minTickGap={18}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 10, fill: "var(--faint)" }}
                      tickFormatter={(value) =>
                        value >= 1000 ? `${Math.round(value / 1000)}k` : String(Math.round(value))
                      }
                      width={44}
                    />
                    <Tooltip content={<ReportTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="var(--brand)"
                      strokeWidth={2}
                      fill="url(#reportRevenue)"
                      activeDot={{ r: 3.5, strokeWidth: 2, fill: "var(--card)" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="profit"
                      stroke="var(--info)"
                      strokeWidth={1.5}
                      dot={false}
                      strokeDasharray="4 3"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="xl:col-span-4">
              <CardHeader title="Payment mix" description="Net amounts by method" />
              <div className="p-4">
                {data.paymentMethods.length === 0 ? (
                  <EmptyState compact title="No payments yet" />
                ) : (
                  <div className="space-y-3">
                    {data.paymentMethods.map((method) => (
                      <div key={method.method}>
                        <div className="flex items-center justify-between text-[11.5px]">
                          <span className="font-medium text-ink">
                            {paymentLabel(method.method)}
                          </span>
                          <span className="num font-semibold text-ink">
                            {formatMoney(method.amount)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <ProgressBar
                            value={paymentTotal > 0 ? (method.amount / paymentTotal) * 100 : 0}
                            tone={method.method === "credit" ? "warning" : "brand"}
                            className="flex-1"
                          />
                          <span className="w-10 text-right text-[9px] text-faint">
                            {paymentTotal > 0
                              ? `${Math.round((method.amount / paymentTotal) * 100)}%`
                              : "0%"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[9.5px] text-faint">
                          {formatInteger(method.count)} sale{method.count === 1 ? "" : "s"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-line px-4 py-3">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted">Stock value at cost</span>
                  <span className="num font-semibold text-ink">{formatMoney(data.stockValue)}</span>
                </div>
              </div>
            </Card>
          </div>

          <div className="mt-3 grid gap-3 xl:grid-cols-12">
            <Card className="xl:col-span-6">
              <CardHeader
                title="Top products"
                description="Best sellers by quantity in this period"
                action={<Badge tone="brand">{data.topProducts.length}</Badge>}
              />
              {data.topProducts.length === 0 ? (
                <EmptyState compact icon={PackageX} title="No product sales yet" />
              ) : (
                <div className="scroll-thin overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th className="text-right">Qty</th>
                        <th className="text-right">Revenue</th>
                        <th className="text-right">Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topProducts.map((product) => (
                        <tr key={product.productId}>
                          <td className="text-[11.5px] font-medium text-ink">{product.productName}</td>
                          <td className="num text-right text-[11px]">
                            {formatQuantity(product.quantitySold)}
                          </td>
                          <td className="num text-right text-[11px]">{formatMoney(product.revenue)}</td>
                          <td className="num text-right text-[11px] font-semibold text-success">
                            {formatMoney(product.profit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="xl:col-span-6">
              <CardHeader
                title="Slow movers"
                description="Lowest sold quantities, excluding zero-sale products"
              />
              {data.lowestProducts.length === 0 ? (
                <EmptyState compact title="Not enough sales data" />
              ) : (
                <div className="scroll-thin overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th className="text-right">Qty</th>
                        <th className="text-right">Revenue</th>
                        <th className="text-right">Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lowestProducts.map((product) => (
                        <tr key={product.productId}>
                          <td className="text-[11.5px] font-medium text-ink">{product.productName}</td>
                          <td className="num text-right text-[11px]">
                            {formatQuantity(product.quantitySold)}
                          </td>
                          <td className="num text-right text-[11px]">{formatMoney(product.revenue)}</td>
                          <td className="num text-right text-[11px]">{formatMoney(product.profit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <div className="mt-3 grid gap-3 xl:grid-cols-12">
            <Card className="xl:col-span-4">
              <CardHeader
                title="Customer credit"
                description={`Outstanding ${formatMoney(data.creditOutstanding)}`}
                action={<Users className="h-4 w-4 text-faint" />}
              />
              {data.debtors.length === 0 ? (
                <EmptyState compact title="No customer debt" />
              ) : (
                <div className="divide-y divide-line/70">
                  {data.debtors.map((debtor) => (
                    <div key={debtor.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-[11.5px] font-medium text-ink">{debtor.name}</p>
                        <p className="text-[9.5px] text-faint">{debtor.phone ?? "No phone"}</p>
                      </div>
                      <div className="text-right">
                        <p className="num text-[11.5px] font-semibold text-warning">
                          {formatMoney(Math.max(0, debtor.balance))}
                        </p>
                        {debtor.hasOverdue ? (
                          <Badge tone="danger">Overdue</Badge>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="xl:col-span-4">
              <CardHeader
                title="Supplier debt"
                description={`Outstanding ${formatMoney(data.supplierDebt)}`}
                action={<Truck className="h-4 w-4 text-faint" />}
              />
              {data.suppliers.length === 0 ? (
                <EmptyState compact title="No supplier balance" />
              ) : (
                <div className="divide-y divide-line/70">
                  {data.suppliers.map((supplier) => (
                    <div key={supplier.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-[11.5px] font-medium text-ink">{supplier.name}</p>
                        <p className="text-[9.5px] text-faint">{supplier.phone ?? "No phone"}</p>
                      </div>
                      <span className="num text-[11.5px] font-semibold text-warning">
                        {formatMoney(Math.max(0, supplier.balance))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="xl:col-span-4">
              <CardHeader
                title="Stock alerts"
                description={`${data.lowStock.length} low · ${data.outOfStock.length} out`}
                action={<PackageX className="h-4 w-4 text-faint" />}
              />
              {data.lowStock.length === 0 && data.outOfStock.length === 0 ? (
                <EmptyState compact title="Stock is healthy" />
              ) : (
                <div className="divide-y divide-line/70">
                  {[...data.outOfStock, ...data.lowStock].slice(0, 8).map((product, index) => {
                    const out = product.stockQuantity <= 0;
                    return (
                      <div
                        key={`${product.id}-${index}`}
                        className="flex items-center justify-between gap-2 px-4 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[11.5px] font-medium text-ink">{product.nameFr}</p>
                          <p className="text-[9.5px] text-faint">
                            min {formatQuantity(product.minStock)} {shortUnit(product.unitType)}
                          </p>
                        </div>
                        <span
                          className={`num text-[11px] font-semibold ${
                            out ? "text-danger" : "text-warning"
                          }`}
                        >
                          {formatQuantity(product.stockQuantity)} {shortUnit(product.unitType)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {data.expiring.length > 0 ? (
            <Card className="mt-3 overflow-hidden">
              <CardHeader
                title="Expiring batches"
                description="Next 30 days"
                action={<Badge tone="warning">{data.expiring.length}</Badge>}
              />
              <div className="scroll-thin overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Expiry</th>
                      <th className="text-right">Remaining</th>
                      <th>Received</th>
                      <th>Days left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.expiring.map((batch) => (
                      <tr key={batch.id}>
                        <td className="text-[11.5px] font-medium text-ink">{batch.productName}</td>
                        <td className="text-[11px] text-muted">{formatDate(batch.expiryDate)}</td>
                        <td className="num text-right text-[11px]">
                          {formatQuantity(batch.quantityRemaining)}
                        </td>
                        <td className="text-[10.5px] text-faint">{formatDate(batch.receivedAt)}</td>
                        <td>
                          <Badge tone={batch.daysLeft <= 0 ? "danger" : "warning"}>
                            {batch.daysLeft <= 0 ? "Expired" : `${batch.daysLeft} days`}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-faint">
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              Period: {data.period} · generated locally
            </span>
            <span className="flex items-center gap-1">
              <ArrowRight className="h-3 w-3" />
              CSV contains sale-line detail in dinars.
            </span>
          </div>
        </>
      )}
    </>
  );
}
