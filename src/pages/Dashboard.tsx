import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  PackageX,
  Plus,
  ReceiptText,
  RefreshCw,
  TrendingUp,
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

import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  formatDate,
  formatDateTime,
  formatInteger,
  formatMoney,
  formatMoneyValue,
  formatQuantity,
  paymentLabel,
  shortUnit,
} from "../lib/format";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  StatCard,
} from "../components/ui";

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-card px-3 py-2 shadow-[var(--shadow-lifted)]">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-faint">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} className="num flex items-center gap-2 text-[11.5px] text-ink">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted">{entry.dataKey === "revenue" ? "Revenue" : "Profit"}</span>
          <span className="ml-auto font-semibold">{formatMoney(Number(entry.value) * 100)}</span>
        </p>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: api.getDashboard,
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = user?.fullName.split(" ")[0] ?? "there";

  if (dashboard.isLoading) {
    return (
      <>
        <PageHeader title={`${greeting}, ${firstName}`} description="Here is how the shop is doing." />
        <LoadingBlock label="Preparing today's numbers…" />
      </>
    );
  }

  if (dashboard.isError || !dashboard.data) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <ErrorBlock message="Could not load the dashboard. Try refreshing." />
      </>
    );
  }

  const data = dashboard.data;
  const series = data.revenueSeries.map((point) => ({
    ...point,
    revenue: point.revenue / 100,
    profit: point.profit / 100,
  }));

  return (
    <>
      <PageHeader
        eyebrow={formatDate(new Date().toISOString())}
        title={`${greeting}, ${firstName}`}
        description="A live view of sales, stock health and customer credit — stored on this machine."
        actions={
          <>
            <Button
              variant="secondary"
              icon={RefreshCw}
              onClick={() => dashboard.refetch()}
              loading={dashboard.isFetching}
            >
              Refresh
            </Button>
            <Link to="/pos">
              <Button icon={Plus}>New sale</Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue today"
          value={formatMoney(data.today.revenue)}
          hint={`${formatInteger(data.today.transactions)} transactions · ${formatQuantity(
            data.today.itemsSold,
          )} items`}
          icon={Wallet}
          tone="brand"
        />
        <StatCard
          label="Profit today"
          value={formatMoney(data.today.profit)}
          hint={`Average basket ${formatMoney(data.today.averageBasket)}`}
          icon={TrendingUp}
          tone="success"
        />
        <StatCard
          label="Credit outstanding"
          value={formatMoney(data.creditOutstanding)}
          hint={`${formatInteger(data.customerCount)} active customer accounts`}
          icon={CircleDollarSign}
          tone="warning"
        />
        <StatCard
          label="Stock value at cost"
          value={formatMoney(data.stockValue)}
          hint={`Supplier debt ${formatMoney(data.supplierDebt)}`}
          icon={PackageX}
          tone="info"
        />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHeader
            title="Revenue & profit"
            description="Last 14 days, returns deducted"
            action={
              <div className="flex items-center gap-3 text-[10.5px] font-medium text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-brand" /> Revenue
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-info" /> Profit
                </span>
              </div>
            }
          />
          <div className="h-[272px] px-2 py-4 sm:px-3">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 6, right: 12, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
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
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--brand)"
                  strokeWidth={2}
                  fill="url(#revenueFill)"
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
          <CardHeader
            title="This month"
            description="Cumulative performance"
            action={
              <Link
                to="/reports"
                className="flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
              >
                Reports <ArrowRight className="h-3 w-3" />
              </Link>
            }
          />
          <div className="p-4">
            <div className="rounded-xl bg-gradient-to-br from-brand to-brand-strong p-4 text-brand-ink">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] opacity-70">
                Monthly revenue
              </p>
              <p className="num mt-1 text-[26px] font-semibold tracking-[-0.035em]">
                {formatMoney(data.month.revenue)}
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-white/20 pt-2.5 text-[10.5px]">
                <span className="opacity-70">Profit {formatMoney(data.month.profit)}</span>
                <span className="opacity-70">{formatInteger(data.month.transactions)} sales</span>
              </div>
            </div>
            <dl className="mt-3 space-y-2.5">
              {[
                ["Average basket", formatMoney(data.month.averageBasket)],
                ["Items sold", formatQuantity(data.month.itemsSold)],
                ["Credit sales this month", formatMoney(data.month.creditSales)],
                ["Supplier debt", formatMoney(data.supplierDebt)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 text-[11.5px]">
                  <dt className="text-muted">{label}</dt>
                  <dd className="num font-semibold text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-12">
        <Card className="xl:col-span-6">
          <CardHeader
            title="Recent sales"
            description="Latest activity on this register"
            action={
              <Link
                to="/sales"
                className="flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
              >
                All sales <ArrowRight className="h-3 w-3" />
              </Link>
            }
          />
          {data.recentSales.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              compact
              title="No sales yet"
              description="Your first sale will appear here."
              action={
                <Link to="/pos">
                  <Button size="sm" icon={Plus}>
                    Start selling
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="divide-y divide-line/70">
              {data.recentSales.map((sale) => (
                <div key={sale.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-app text-faint">
                    <ReceiptText className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink">
                      {sale.receiptNumber}
                      {sale.saleType === "return" ? (
                        <Badge tone="danger">Return</Badge>
                      ) : null}
                    </p>
                    <p className="truncate text-[10px] text-faint">
                      {sale.customerName ?? "Walk-in customer"} · {sale.items.length} item
                      {sale.items.length === 1 ? "" : "s"} · {paymentLabel(sale.payments[0]?.method)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="num text-[12px] font-semibold text-ink">{formatMoney(sale.total)}</p>
                    <p className="text-[9.5px] text-faint">{formatDateTime(sale.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader
            title="Low stock"
            description="At or below minimum"
            action={<Badge tone={data.lowStock.length > 0 ? "warning" : "neutral"}>{data.lowStock.length}</Badge>}
          />
          {data.lowStock.length === 0 ? (
            <EmptyState compact title="Stock looks healthy" description="No product is below its minimum." />
          ) : (
            <div className="divide-y divide-line/70">
              {data.lowStock.map((product) => (
                <div key={product.id} className="px-4 py-2.5">
                  <p className="truncate text-[11.5px] font-medium text-ink">{product.nameFr}</p>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
                    <span className="text-faint">{product.categoryName ?? "Uncategorised"}</span>
                    <span className="num font-semibold text-warning">
                      {formatQuantity(product.stockQuantity)} / {formatQuantity(product.minStock)}{" "}
                      {shortUnit(product.unitType)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-line px-4 py-2.5">
            <Link
              to="/inventory"
              className="flex items-center justify-between text-[10.5px] font-semibold text-brand hover:underline"
            >
              Manage stock <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader
            title="Expiring soon"
            description="Batches within 30 days"
            action={
              <Badge tone={data.expiring.length > 0 ? "danger" : "neutral"}>
                {data.expiring.length}
              </Badge>
            }
          />
          {data.expiring.length === 0 ? (
            <EmptyState compact title="Nothing expiring" description="No tracked batch expires soon." />
          ) : (
            <div className="divide-y divide-line/70">
              {data.expiring.map((batch) => (
                <div key={batch.id} className="px-4 py-2.5">
                  <p className="truncate text-[11.5px] font-medium text-ink">{batch.productName}</p>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
                    <span className="flex items-center gap-1 text-faint">
                      <CalendarDays className="h-2.5 w-2.5" />
                      {batch.expiryDate ? formatDate(batch.expiryDate) : "—"}
                    </span>
                    <Badge tone={batch.daysLeft <= 7 ? "danger" : "warning"}>
                      {batch.daysLeft <= 0 ? "Expired" : `${batch.daysLeft} d`}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-line px-4 py-2.5">
            <Link
              to="/inventory"
              className="flex items-center justify-between text-[10.5px] font-semibold text-brand hover:underline"
            >
              Review batches <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </Card>
      </div>

      <p className="mt-4 text-center text-[10px] text-faint">
        All amounts in Algerian dinars. Sales are immutable; corrections create return entries.
      </p>
    </>
  );
}
