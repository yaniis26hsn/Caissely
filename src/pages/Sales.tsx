import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Download,
  Eye,
  Printer,
  ReceiptText,
  RotateCcw,
  Search,
  ShieldCheck,
} from "lucide-react";

import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  formatDateTime,
  formatInteger,
  formatMoney,
  formatQuantity,
  paymentLabel,
} from "../lib/format";
import type { Sale } from "../lib/types";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  SearchInput,
  Segmented,
  Select,
  StatCard,
  cn,
} from "../components/ui";

type Period = "today" | "week" | "month" | "all";

const periodOptions: Array<{ value: Period; label: string }> = [
  { value: "today", label: "Today" },
  { value: "week", label: "7 days" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
];

export default function SalesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<Period>("today");
  const [search, setSearch] = useState("");
  const [workerId, setWorkerId] = useState<string>("");
  const [selected, setSelected] = useState<Sale | null>(null);
  const [returning, setReturning] = useState<Sale | null>(null);
  const [busy, setBusy] = useState(false);

  const canManage = user?.role === "owner" || user?.role === "manager";
  const isOwner = user?.role === "owner";

  const salesQuery = useQuery({
    queryKey: ["sales", period, workerId],
    queryFn: () =>
      api.listSales({
        period,
        workerId: workerId ? Number(workerId) : null,
        limit: 200,
      }),
  });

  const reportQuery = useQuery({
    queryKey: ["reports", period],
    queryFn: () => api.getReports(period),
    enabled: canManage,
  });

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: api.listUsers,
    enabled: isOwner,
  });

  const sales = salesQuery.data ?? [];
  const returnedIds = useMemo(
    () =>
      new Set(
        sales
          .filter((sale) => sale.saleType === "return" && sale.originalSaleId)
          .map((sale) => sale.originalSaleId as string),
      ),
    [sales],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return sales;
    return sales.filter((sale) =>
      [
        sale.receiptNumber,
        sale.customerName ?? "",
        sale.userName,
        String(sale.total / 100),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [sales, search]);

  const handleExport = async () => {
    try {
      const path = await api.exportSalesCsv(period);
      toast.success("Sales exported", { description: path });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const confirmReturn = async () => {
    if (!returning) return;
    setBusy(true);
    try {
      const result = await api.returnSale(returning.id);
      toast.success(`Return ${result.receiptNumber} recorded`);
      setReturning(null);
      setSelected(null);
      queryClient.invalidateQueries();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Sales history"
        title="Sales & receipts"
        description="Every confirmed sale is immutable. Returns are linked entries that restore stock and reverse payments."
        actions={
          canManage ? (
            <>
              <Button variant="secondary" icon={Download} onClick={handleExport}>
                Export CSV
              </Button>
              <Segmented<Period> value={period} onChange={setPeriod} options={periodOptions} />
            </>
          ) : (
            <Segmented<Period> value={period} onChange={setPeriod} options={periodOptions} />
          )
        }
      />

      {canManage ? (
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <StatCard
            label={`Net revenue · ${period === "today" ? "today" : period === "week" ? "7 days" : period === "month" ? "this month" : "all time"}`}
            value={formatMoney(reportQuery.data?.revenue ?? 0)}
            hint={`${formatInteger(reportQuery.data?.transactions ?? 0)} transactions`}
            icon={ReceiptText}
          />
          <StatCard
            label="Average basket"
            value={formatMoney(reportQuery.data?.averageBasket ?? 0)}
            hint={`${formatQuantity(reportQuery.data?.itemsSold ?? 0)} items sold`}
            icon={Eye}
            tone="info"
          />
          <StatCard
            label="Returns"
            value={formatMoney(reportQuery.data?.returnsTotal ?? 0)}
            hint="Return entries in this period"
            icon={RotateCcw}
            tone="warning"
          />
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-line p-3">
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search receipt, customer or cashier…"
            containerClassName="w-full sm:w-72"
          />
          {isOwner ? (
            <Select
              value={workerId}
              onChange={(event) => setWorkerId(event.target.value)}
              className="h-9 w-full text-xs sm:w-48"
            >
              <option value="">All team members</option>
              {(usersQuery.data ?? []).map((member) => (
                <option key={member.id} value={member.id}>
                  {member.fullName}
                </option>
              ))}
            </Select>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <Badge tone="neutral">{filtered.length} receipts</Badge>
            {salesQuery.isFetching ? (
              <span className="text-[10px] text-faint">Refreshing…</span>
            ) : null}
          </div>
        </div>

        {salesQuery.isLoading ? (
          <LoadingBlock />
        ) : salesQuery.isError ? (
          <div className="p-4">
            <ErrorBlock message="Could not load sales." />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="No sales in this period"
            description="Try a wider period or clear the search."
          />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Date & time</th>
                  <th>Customer</th>
                  <th>Cashier</th>
                  <th>Payment</th>
                  <th>Items</th>
                  <th className="text-right">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((sale) => {
                  const method = sale.payments[0]?.method;
                  return (
                    <tr key={sale.id} className="cursor-pointer" onClick={() => setSelected(sale)}>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span className="num text-[11.5px] font-semibold text-ink">
                            {sale.receiptNumber}
                          </span>
                          {sale.saleType === "return" ? <Badge tone="danger">Return</Badge> : null}
                          {sale.originalSaleId && returnedIds.has(sale.originalSaleId) ? (
                            <Badge tone="warning">Of return</Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap text-[11px] text-muted">
                        {formatDateTime(sale.createdAt)}
                      </td>
                      <td className="text-[11.5px] text-ink">
                        {sale.customerName ?? <span className="text-faint">Walk-in</span>}
                      </td>
                      <td className="text-[11.5px] text-muted">{sale.userName}</td>
                      <td>
                        <Badge
                          tone={
                            method === "credit"
                              ? "warning"
                              : method === "cash"
                                ? "success"
                                : "info"
                          }
                        >
                          {paymentLabel(method)}
                        </Badge>
                      </td>
                      <td className="num text-[11px] text-muted">{sale.items.length}</td>
                      <td
                        className={cn(
                          "num whitespace-nowrap text-right text-[12px] font-semibold",
                          sale.saleType === "return" ? "text-danger" : "text-ink",
                        )}
                      >
                        {sale.saleType === "return" ? "−" : ""}
                        {formatMoney(sale.total)}
                      </td>
                      <td className="text-right">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md text-faint">
                          <Eye className="h-3.5 w-3.5" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? `Receipt ${selected.receiptNumber}` : "Receipt"}
        description={selected ? formatDateTime(selected.createdAt) : undefined}
        width="lg"
        footer={
          selected ? (
            <>
              <Button variant="secondary" icon={Printer} onClick={() => window.print()}>
                Print
              </Button>
              {canManage && selected.saleType === "sale" && !returnedIds.has(selected.id) ? (
                <Button
                  variant="danger"
                  icon={RotateCcw}
                  onClick={() => setReturning(selected)}
                >
                  Return full sale
                </Button>
              ) : null}
            </>
          ) : null
        }
      >
        {selected ? (
          <div className="print-area">
            <div className="flex items-start justify-between gap-3 rounded-xl border border-line bg-app/40 p-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
                  Receipt
                </p>
                <p className="num text-[18px] font-semibold text-ink">{selected.receiptNumber}</p>
                <p className="mt-0.5 text-[11px] text-muted">{formatDateTime(selected.createdAt)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {selected.saleType === "return" ? (
                  <Badge tone="danger">Return entry</Badge>
                ) : returnedIds.has(selected.id) ? (
                  <Badge tone="warning">Returned</Badge>
                ) : (
                  <Badge tone="success">Completed</Badge>
                )}
                <Badge tone="info">{selected.priceTier === "wholesale" ? "Wholesale" : "Retail"}</Badge>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[11.5px]">
              <div>
                <dt className="text-[9.5px] font-semibold uppercase tracking-wide text-faint">Customer</dt>
                <dd className="mt-0.5 text-ink">{selected.customerName ?? "Walk-in customer"}</dd>
              </div>
              <div>
                <dt className="text-[9.5px] font-semibold uppercase tracking-wide text-faint">Cashier</dt>
                <dd className="mt-0.5 text-ink">{selected.userName}</dd>
              </div>
              <div>
                <dt className="text-[9.5px] font-semibold uppercase tracking-wide text-faint">Payment</dt>
                <dd className="mt-0.5 text-ink">{paymentLabel(selected.payments[0]?.method)}</dd>
              </div>
              <div>
                <dt className="text-[9.5px] font-semibold uppercase tracking-wide text-faint">Shift</dt>
                <dd className="mt-0.5 text-ink">
                  {selected.shiftId ? `#${selected.shiftId}` : "No shift"}
                </dd>
              </div>
            </dl>

            <div className="mt-4">
              <p className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-wide text-faint">
                Items
              </p>
              <div className="overflow-hidden rounded-xl border border-line">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Unit</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <p className="text-[11.5px] font-medium text-ink">{item.productName}</p>
                          {item.productNameAr ? (
                            <p dir="rtl" className="text-[10px] text-faint">
                              {item.productNameAr}
                            </p>
                          ) : null}
                        </td>
                        <td className="num text-right text-[11px]">{formatQuantity(item.quantity)}</td>
                        <td className="num text-right text-[11px]">{formatMoney(item.unitPrice)}</td>
                        <td className="num text-right text-[11.5px] font-medium">
                          {formatMoney(item.lineTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 space-y-1.5 border-t border-line pt-3 text-[11.5px]">
              <div className="flex justify-between text-muted">
                <span>Subtotal</span>
                <span className="num">{formatMoney(selected.subtotal)}</span>
              </div>
              {selected.discount > 0 ? (
                <div className="flex justify-between text-muted">
                  <span>Discount</span>
                  <span className="num">−{formatMoney(selected.discount)}</span>
                </div>
              ) : null}
              {selected.vatTotal > 0 ? (
                <div className="flex justify-between text-muted">
                  <span>VAT included</span>
                  <span className="num">{formatMoney(selected.vatTotal)}</span>
                </div>
              ) : null}
              {selected.stampDuty > 0 ? (
                <div className="flex justify-between text-muted">
                  <span>Stamp duty</span>
                  <span className="num">{formatMoney(selected.stampDuty)}</span>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-line pt-1.5 text-[14px] font-semibold text-ink">
                <span>Total</span>
                <span className="num">{formatMoney(selected.total)}</span>
              </div>
              {selected.payments.map((payment) => (
                <div key={payment.id} className="flex justify-between text-muted">
                  <span>{paymentLabel(payment.method)}</span>
                  <span className="num">{formatMoney(payment.amount)}</span>
                </div>
              ))}
            </div>

            {selected.originalSaleId ? (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-app px-3 py-2 text-[10.5px] text-muted">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                Linked to original sale {selected.originalSaleId.slice(0, 8)}… Stock and payment
                effects are reversed on this return entry.
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={returning !== null}
        onClose={() => setReturning(null)}
        onConfirm={confirmReturn}
        loading={busy}
        destructive
        title="Return this entire sale?"
        description="This creates a linked return entry. Stock is restored and cash/credit effects are reversed. The original sale stays in history."
        confirmLabel="Record full return"
      >
        {returning ? (
          <div className="rounded-xl border border-line bg-app/50 p-3.5 text-[11.5px]">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-ink">{returning.receiptNumber}</span>
              <span className="num font-semibold text-ink">{formatMoney(returning.total)}</span>
            </div>
            <p className="mt-1 text-muted">
              {returning.items.length} items · {returning.customerName ?? "Walk-in customer"} ·{" "}
              {paymentLabel(returning.payments[0]?.method)}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-[10.5px] text-warning">
              <Search className="h-3 w-3" /> This action cannot be undone from the interface.
            </p>
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
