import { useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BookOpen,
  CircleDollarSign,
  Pencil,
  Phone,
  Plus,
  ReceiptText,
  TriangleAlert,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";

import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  centsToInput,
  formatDate,
  formatDateTime,
  formatMoney,
  ledgerLabel,
  parseMoneyInput,
  paymentLabel,
} from "../lib/format";
import type { Customer, CustomerLedgerEntry } from "../lib/types";
import {
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  ErrorBlock,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  ProgressBar,
  SearchInput,
  StatCard,
  Switch,
  cn,
} from "../components/ui";

export default function CustomersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [onlyDebtors, setOnlyDebtors] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [statementId, setStatementId] = useState<number | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<Customer | null>(null);

  const canEdit = user?.role === "owner" || user?.role === "manager";

  const customersQuery = useQuery({
    queryKey: ["customers", deferredSearch, onlyDebtors, includeInactive],
    queryFn: () =>
      api.listCustomers({
        search: deferredSearch || null,
        onlyDebtors,
        includeInactive,
      }),
  });

  const summaryQuery = useQuery({
    queryKey: ["customers", "summary"],
    queryFn: () => api.listCustomers({}),
  });

  const statementQuery = useQuery({
    queryKey: ["customer-statement", statementId],
    queryFn: () => api.getCustomerStatement(statementId as number),
    enabled: statementId !== null,
  });

  const customers = customersQuery.data ?? [];
  const allCustomers = summaryQuery.data ?? [];
  const stats = useMemo(() => {
    const outstanding = allCustomers.reduce(
      (sum, customer) => sum + Math.max(0, customer.balance),
      0,
    );
    const debtors = allCustomers.filter((customer) => customer.balance > 0).length;
    const overdue = allCustomers.filter((customer) => customer.hasOverdue).length;
    return { outstanding, debtors, overdue };
  }, [allCustomers]);

  const openStatement = (customer: Customer) => setStatementId(customer.id);
  const statementCustomer = statementQuery.data?.customer ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Customer credit book"
        title="Customers & credit"
        description="Track who owes what, record repayments and keep the shop's credit book accurate."
        actions={
          <Button
            icon={UserPlus}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            New customer
          </Button>
        }
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Total outstanding credit"
          value={formatMoney(stats.outstanding)}
          hint={`${stats.debtors} customers with an open balance`}
          icon={CircleDollarSign}
          tone="warning"
        />
        <StatCard
          label="Active customers"
          value={String(allCustomers.length)}
          hint="Accounts available for credit sales"
          icon={Users}
          tone="brand"
        />
        <StatCard
          label="Overdue accounts"
          value={String(stats.overdue)}
          hint="Credit older than 30 days with an open balance"
          icon={TriangleAlert}
          tone={stats.overdue > 0 ? "danger" : "success"}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-line p-3">
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or phone…"
            containerClassName="w-full sm:w-64"
          />
          <label className="flex items-center gap-2 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={onlyDebtors}
              onChange={(event) => setOnlyDebtors(event.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--brand)]"
            />
            Only customers who owe
          </label>
          <label className="flex items-center gap-2 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(event) => setIncludeInactive(event.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--brand)]"
            />
            Show inactive
          </label>
          <div className="ml-auto">
            <Badge tone="neutral">{customers.length} accounts</Badge>
          </div>
        </div>

        {customersQuery.isLoading ? (
          <LoadingBlock />
        ) : customersQuery.isError ? (
          <div className="p-4">
            <ErrorBlock message="Could not load customers." />
          </div>
        ) : customers.length === 0 ? (
          <EmptyState
            icon={Users}
            title={onlyDebtors ? "No customer owes money" : "No customers yet"}
            description={
              onlyDebtors
                ? "Turn off the debtor filter to see all accounts."
                : "Create a customer to sell on credit and keep a repayment ledger."
            }
            action={
              !onlyDebtors ? (
                <Button
                  size="sm"
                  icon={UserPlus}
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  New customer
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th className="text-right">Balance owed</th>
                  <th>Credit limit</th>
                  <th>Standing</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => {
                  const limitUsage =
                    customer.creditLimit && customer.creditLimit > 0
                      ? (Math.max(0, customer.balance) / customer.creditLimit) * 100
                      : null;
                  return (
                    <tr
                      key={customer.id}
                      className="cursor-pointer"
                      onClick={() => openStatement(customer)}
                    >
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-[10px] font-bold text-brand">
                            {customer.name
                              .split(/\s+/)
                              .slice(0, 2)
                              .map((part) => part[0])
                              .join("")}
                          </span>
                          <div>
                            <p className="text-[11.5px] font-semibold text-ink">{customer.name}</p>
                            <p className="text-[9.5px] text-faint">
                              Since {formatDate(customer.createdAt)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="text-[11px] text-muted">
                        {customer.phone ? (
                          <span className="flex items-center gap-1">
                            <Phone className="h-2.5 w-2.5" />
                            {customer.phone}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="num text-right">
                        <span
                          className={cn(
                            "text-[12px] font-semibold",
                            customer.balance > 0 ? "text-warning" : "text-success",
                          )}
                        >
                          {formatMoney(Math.max(0, customer.balance))}
                        </span>
                      </td>
                      <td>
                        {customer.creditLimit ? (
                          <div className="w-28">
                            <div className="flex justify-between text-[9px] text-faint">
                              <span>{formatMoney(customer.creditLimit)}</span>
                              {limitUsage !== null ? (
                                <span>{Math.round(Math.min(100, limitUsage))}%</span>
                              ) : null}
                            </div>
                            <ProgressBar
                              className="mt-1"
                              value={Math.min(100, limitUsage ?? 0)}
                              tone={
                                (limitUsage ?? 0) >= 100
                                  ? "danger"
                                  : (limitUsage ?? 0) >= 75
                                    ? "warning"
                                    : "brand"
                              }
                            />
                          </div>
                        ) : (
                          <span className="text-[10px] text-faint">No limit</span>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {customer.hasOverdue ? (
                            <Badge tone="danger">Overdue</Badge>
                          ) : customer.balance > 0 ? (
                            <Badge tone="warning">Open credit</Badge>
                          ) : (
                            <Badge tone="success">Clear</Badge>
                          )}
                          {!customer.isActive ? <Badge tone="neutral">Inactive</Badge> : null}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          {customer.balance > 0 ? (
                            <Button
                              variant="soft"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                setPaymentTarget(customer);
                              }}
                            >
                              Payment
                            </Button>
                          ) : null}
                          {canEdit ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setEditing(customer);
                                setFormOpen(true);
                              }}
                              className="flex h-7 w-7 items-center justify-center rounded-md text-faint transition hover:bg-app hover:text-ink"
                              title="Edit customer"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CustomerFormModal
        open={formOpen}
        customer={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={() => {
          setFormOpen(false);
          setEditing(null);
          queryClient.invalidateQueries();
        }}
      />

      <PaymentModal
        customer={paymentTarget}
        onClose={() => setPaymentTarget(null)}
        onSaved={() => {
          setPaymentTarget(null);
          queryClient.invalidateQueries();
        }}
      />

      <Drawer
        open={statementId !== null}
        onClose={() => setStatementId(null)}
        title={statementCustomer?.name ?? "Customer statement"}
        description={
          statementCustomer
            ? `${statementCustomer.phone ?? "No phone"} · credit limit ${
                statementCustomer.creditLimit ? formatMoney(statementCustomer.creditLimit) : "none"
              }`
            : undefined
        }
        width="lg"
        footer={
          statementCustomer ? (
            <>
              {canEdit ? (
                <Button
                  variant="secondary"
                  icon={Pencil}
                  onClick={() => {
                    setEditing(statementCustomer);
                    setStatementId(null);
                    setFormOpen(true);
                  }}
                >
                  Edit
                </Button>
              ) : null}
              {statementCustomer.balance > 0 ? (
                <Button icon={Wallet} onClick={() => setPaymentTarget(statementCustomer)}>
                  Record payment
                </Button>
              ) : null}
            </>
          ) : null
        }
      >
        {statementQuery.isLoading ? (
          <LoadingBlock />
        ) : statementQuery.isError ? (
          <ErrorBlock message="Could not load the customer statement." />
        ) : statementQuery.data ? (
          <div>
            <div className="rounded-xl border border-line bg-gradient-to-br from-app to-brand-soft/40 p-4">
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-faint">
                Outstanding balance
              </p>
              <p className="num mt-1 text-[28px] font-semibold tracking-[-0.03em] text-ink">
                {formatMoney(Math.max(0, statementQuery.data.balance))}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone={statementQuery.data.balance > 0 ? "warning" : "success"}>
                  {statementQuery.data.balance > 0 ? "Balance due" : "Account clear"}
                </Badge>
                {statementCustomer?.hasOverdue ? <Badge tone="danger">Overdue</Badge> : null}
                {statementCustomer?.creditLimit ? (
                  <span className="text-[10px] text-muted">
                    Limit {formatMoney(statementCustomer.creditLimit)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
                Ledger ({statementQuery.data.entries.length})
              </p>
              <BookOpen className="h-3.5 w-3.5 text-faint" />
            </div>
            {statementQuery.data.entries.length === 0 ? (
              <EmptyState
                compact
                icon={ReceiptText}
                title="No ledger entries"
                description="Credit sales and repayments will appear here."
              />
            ) : (
              <div className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line">
                {statementQuery.data.entries.map((entry: CustomerLedgerEntry) => (
                  <div key={entry.id} className="px-3.5 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Badge
                            tone={
                              entry.entryType === "payment"
                                ? "success"
                                : entry.entryType === "credit_sale"
                                  ? "warning"
                                  : "info"
                            }
                          >
                            {ledgerLabel(entry.entryType)}
                          </Badge>
                          {entry.receiptNumber ? (
                            <span className="num text-[10px] font-medium text-muted">
                              {entry.receiptNumber}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[10.5px] text-muted">
                          {entry.note ?? "—"}
                          {entry.paymentMethod ? ` · ${paymentLabel(entry.paymentMethod)}` : ""}
                        </p>
                        <p className="text-[9.5px] text-faint">
                          {formatDateTime(entry.createdAt)}
                          {entry.userName ? ` · ${entry.userName}` : ""}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "num shrink-0 text-[12px] font-semibold",
                          entry.amount > 0 ? "text-warning" : "text-success",
                        )}
                      >
                        {entry.amount > 0 ? "+" : ""}
                        {formatMoney(Math.abs(entry.amount))}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-[10px] leading-relaxed text-faint">
              Positive entries increase the amount owed; payments reduce it. Credit returns from
              sales appear as adjustments.
            </p>
          </div>
        ) : null}
      </Drawer>
    </>
  );
}

function CustomerFormModal({
  open,
  customer,
  onClose,
  onSaved,
}: {
  open: boolean;
  customer: Customer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(customer?.name ?? "");
    setPhone(customer?.phone ?? "");
    setCreditLimit(customer?.creditLimit ? centsToInput(customer.creditLimit) : "");
    setIsActive(customer?.isActive ?? true);
    setBusy(false);
  }, [open, customer]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Customer name is required.");
      return;
    }
    setBusy(true);
    try {
      const input = {
        name: name.trim(),
        phone: phone.trim() || null,
        creditLimit: creditLimit.trim() ? parseMoneyInput(creditLimit) : null,
        isActive,
      };
      if (customer) {
        await api.updateCustomer(customer.id, input);
        toast.success("Customer updated");
      } else {
        await api.createCustomer(input);
        toast.success("Customer created");
      }
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={customer ? "Edit customer" : "New customer"}
      description="Credit sales are allowed up to the credit limit when one is set."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => formRef.current?.requestSubmit()}>
            {customer ? "Save changes" : "Create customer"}
          </Button>
        </>
      }
    >
      <form ref={formRef} onSubmit={submit} className="space-y-3.5">
        <Field label="Full name" required>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ahmed Benali"
            autoFocus
          />
        </Field>
        <Field label="Phone">
          <Input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="0770 11 22 33"
          />
        </Field>
        <Field label="Credit limit (DA)" hint="Leave blank for no limit.">
          <Input
            value={creditLimit}
            onChange={(event) => setCreditLimit(event.target.value)}
            inputMode="decimal"
            placeholder="5000"
          />
        </Field>
        <div className="rounded-xl border border-line p-3">
          <Switch
            checked={isActive}
            onChange={setIsActive}
            label="Active account"
            description="Inactive customers cannot buy on credit."
          />
        </div>
        {customer ? (
          <p className="rounded-lg bg-app px-3 py-2 text-[10.5px] text-muted">
            Current balance: <span className="font-semibold text-ink">{formatMoney(customer.balance)}</span>
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

function PaymentModal({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [method, setMethod] = useState("cash");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!customer) return;
    setMethod("cash");
    setAmount(customer.balance > 0 ? centsToInput(customer.balance) : "");
    setNote("");
    setBusy(false);
  }, [customer]);

  const amountCents = parseMoneyInput(amount);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!customer) return;
    if (amountCents <= 0) {
      toast.error("Enter a payment amount.");
      return;
    }
    if (amountCents > customer.balance) {
      toast.error("Payment exceeds the outstanding balance.");
      return;
    }
    setBusy(true);
    try {
      await api.recordCustomerPayment(customer.id, method, amountCents, note.trim() || null);
      toast.success("Payment recorded");
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={customer !== null}
      onClose={onClose}
      title="Record a customer payment"
      description={customer ? `${customer.name} · balance ${formatMoney(customer.balance)}` : undefined}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => formRef.current?.requestSubmit()}>
            Record payment
          </Button>
        </>
      }
    >
      <form ref={formRef} onSubmit={submit} className="space-y-3.5">
        <Field label="Amount received (DA)" required>
          <Input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            autoFocus
          />
        </Field>
        <Field label="Payment method">
          <select
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            className="text-input"
          >
            <option value="cash">Cash</option>
            <option value="cib">CIB</option>
            <option value="edahabia">Edahabia</option>
            <option value="baridimob">BaridiMob</option>
          </select>
        </Field>
        <Field label="Note">
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Part payment, settled in full…"
          />
        </Field>
        {amountCents > 0 && customer ? (
          <div className="rounded-lg bg-app px-3 py-2 text-[10.5px] text-muted">
            Remaining after payment:{" "}
            <span className="num font-semibold text-ink">
              {formatMoney(Math.max(0, customer.balance - amountCents))}
            </span>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
