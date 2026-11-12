import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Clock,
  LockKeyhole,
  Plus,
  ReceiptText,
  Scale,
  Wallet,
} from "lucide-react";

import { api, errorMessage } from "../lib/api";
import {
  centsToInput,
  formatDateTime,
  formatMoney,
  parseMoneyInput,
} from "../lib/format";
import type { CashMovement } from "../lib/types";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorBlock,
  Field,
  Input,
  InlineNote,
  LoadingBlock,
  Modal,
  PageHeader,
  Segmented,
  StatCard,
  cn,
} from "../components/ui";

export default function ShiftsPage() {
  const queryClient = useQueryClient();
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [movementModal, setMovementModal] = useState<"cash_in" | "cash_out" | null>(null);

  const totalsQuery = useQuery({
    queryKey: ["shift", "totals"],
    queryFn: api.currentShiftTotals,
  });
  const shiftsQuery = useQuery({
    queryKey: ["shifts"],
    queryFn: () => api.listShifts(50),
  });

  const current = totalsQuery.data?.current ?? null;
  const movementsQuery = useQuery({
    queryKey: ["cash-movements", current?.id],
    queryFn: () => api.listCashMovements(current?.id as number),
    enabled: current !== null,
  });

  const shifts = shiftsQuery.data ?? [];
  const movements = movementsQuery.data ?? [];

  const refresh = () => queryClient.invalidateQueries();

  return (
    <>
      <PageHeader
        eyebrow="Cash control"
        title="Shifts & cash"
        description="Open a shift with a starting float, track cash in and out, then close by counting the drawer."
        actions={
          current ? (
            <>
              <Button
                variant="secondary"
                icon={Plus}
                onClick={() => setMovementModal("cash_in")}
              >
                Cash movement
              </Button>
              <Button icon={LockKeyhole} onClick={() => setCloseModal(true)}>
                Close shift
              </Button>
            </>
          ) : (
            <Button icon={Wallet} onClick={() => setOpenModal(true)}>
              Open shift
            </Button>
          )
        }
      />

      <div className="grid gap-3 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHeader
            title={current ? `Shift #${current.id} is open` : "No open shift"}
            description={
              current
                ? `${current.userName} · ${current.deviceId.slice(0, 8)}… · opened ${formatDateTime(
                    current.openedAt,
                  )}`
                : "Sales can be recorded without a shift, but cash reconciliation needs one."
            }
            action={
              <Badge tone={current ? "success" : "neutral"} dot>
                {current ? "Open" : "Closed"}
              </Badge>
            }
          />
          {totalsQuery.isLoading ? (
            <LoadingBlock />
          ) : totalsQuery.isError ? (
            <div className="p-4">
              <ErrorBlock message="Could not load the current shift." />
            </div>
          ) : current ? (
            <div className="p-4">
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Opening cash", formatMoney(current.openingCash), "Float at start"],
                  ["Cash sales", formatMoney(totalsQuery.data?.cashSales ?? 0), "Net of returns"],
                  ["Cash in / out", `${formatMoney(current.cashIn)} / ${formatMoney(current.cashOut)}`, "Manual movements"],
                  ["Expected drawer", formatMoney(totalsQuery.data?.expectedCash ?? 0), "Before counting"],
                ].map(([label, value, hint]) => (
                  <div key={label} className="rounded-xl border border-line bg-app/40 p-3">
                    <p className="text-[9.5px] font-semibold uppercase tracking-wide text-faint">
                      {label}
                    </p>
                    <p className="num mt-1 text-[15px] font-semibold text-ink">{value}</p>
                    <p className="mt-0.5 text-[9.5px] text-faint">{hint}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
                  Cash movements during this shift
                </p>
                <div className="flex gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={ArrowDownLeft}
                    onClick={() => setMovementModal("cash_in")}
                  >
                    Cash in
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={ArrowUpRight}
                    onClick={() => setMovementModal("cash_out")}
                  >
                    Cash out
                  </Button>
                </div>
              </div>
              {movementsQuery.isLoading ? (
                <LoadingBlock label="Loading movements…" />
              ) : movements.length === 0 ? (
                <EmptyState
                  compact
                  icon={Banknote}
                  title="No manual cash movements"
                  description="Cash drops, change brought in or petty expenses appear here."
                />
              ) : (
                <div className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line">
                  {movements.map((movement: CashMovement) => (
                    <div key={movement.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <span
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-lg",
                          movement.movementType === "cash_in"
                            ? "bg-success-soft text-success"
                            : "bg-danger-soft text-danger",
                        )}
                      >
                        {movement.movementType === "cash_in" ? (
                          <ArrowDownLeft className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11.5px] font-medium text-ink">{movement.reason}</p>
                        <p className="text-[9.5px] text-faint">
                          {formatDateTime(movement.createdAt)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "num text-[12px] font-semibold",
                          movement.movementType === "cash_in" ? "text-success" : "text-danger",
                        )}
                      >
                        {movement.movementType === "cash_in" ? "+" : "−"}
                        {formatMoney(movement.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              icon={Wallet}
              title="Open a shift to start the day"
              description="Enter the cash float in the drawer. Sales and cash payments will be linked to this shift."
              action={
                <Button icon={Wallet} onClick={() => setOpenModal(true)}>
                  Open shift
                </Button>
              }
            />
          )}
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader title="Reconciliation" description="How expected cash is built" />
          <div className="p-4">
            <div className="space-y-2.5 text-[11.5px]">
              <div className="flex justify-between text-muted">
                <span>Opening float</span>
                <span className="num font-medium text-ink">{formatMoney(current?.openingCash ?? 0)}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Cash sales (net)</span>
                <span className="num font-medium text-success">
                  +{formatMoney(totalsQuery.data?.cashSales ?? 0)}
                </span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Cash in</span>
                <span className="num font-medium text-success">
                  +{formatMoney(totalsQuery.data?.cashIn ?? 0)}
                </span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Cash out</span>
                <span className="num font-medium text-danger">
                  −{formatMoney(totalsQuery.data?.cashOut ?? 0)}
                </span>
              </div>
              <div className="flex items-end justify-between border-t border-line pt-2.5">
                <span className="text-[12px] font-semibold text-ink">Expected in drawer</span>
                <span className="num text-[19px] font-semibold text-ink">
                  {formatMoney(totalsQuery.data?.expectedCash ?? 0)}
                </span>
              </div>
            </div>

            <div className="my-4 h-px bg-line" />
            <div className="flex items-start gap-2 rounded-xl bg-app px-3 py-2.5">
              <Scale className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
              <p className="text-[10.5px] leading-relaxed text-muted">
                At close, count the physical drawer. The difference is stored on the shift and
                audited — the system never adjusts cash automatically.
              </p>
            </div>
            {current ? (
              <Button
                variant="secondary"
                fullWidth
                className="mt-3"
                icon={LockKeyhole}
                onClick={() => setCloseModal(true)}
              >
                Count & close shift
              </Button>
            ) : null}
          </div>
        </Card>
      </div>

      <Card className="mt-3 overflow-hidden">
        <CardHeader
          title="Shift history"
          description="Closed shifts keep the counted cash and the difference."
          action={<Badge tone="neutral">{shifts.length}</Badge>}
        />
        {shiftsQuery.isLoading ? (
          <LoadingBlock />
        ) : shifts.length === 0 ? (
          <EmptyState compact icon={Clock} title="No shifts yet" />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Shift</th>
                  <th>Cashier</th>
                  <th>Opened</th>
                  <th>Closed</th>
                  <th className="text-right">Opening</th>
                  <th className="text-right">Expected</th>
                  <th className="text-right">Counted</th>
                  <th className="text-right">Difference</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((shift) => (
                  <tr key={shift.id}>
                    <td className="num text-[11px] font-semibold text-ink">#{shift.id}</td>
                    <td className="text-[11.5px] text-ink">{shift.userName}</td>
                    <td className="whitespace-nowrap text-[10.5px] text-muted">
                      {formatDateTime(shift.openedAt)}
                    </td>
                    <td className="whitespace-nowrap text-[10.5px] text-muted">
                      {shift.closedAt ? formatDateTime(shift.closedAt) : "—"}
                    </td>
                    <td className="num text-right text-[11px]">{formatMoney(shift.openingCash)}</td>
                    <td className="num text-right text-[11px]">{formatMoney(shift.expectedCash)}</td>
                    <td className="num text-right text-[11px]">
                      {shift.countedCash !== null && shift.countedCash !== undefined
                        ? formatMoney(shift.countedCash)
                        : "—"}
                    </td>
                    <td className="num text-right text-[11px]">
                      {shift.difference !== null && shift.difference !== undefined ? (
                        <span
                          className={cn(
                            "font-semibold",
                            shift.difference === 0
                              ? "text-success"
                              : shift.difference < 0
                                ? "text-danger"
                                : "text-warning",
                          )}
                        >
                          {shift.difference > 0 ? "+" : ""}
                          {formatMoney(shift.difference)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <Badge tone={shift.closedAt ? "neutral" : "success"} dot>
                        {shift.closedAt ? "Closed" : "Open"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-3">
        <InlineNote tone="info">
          A shift belongs to one cashier on this device. Sales without a shift are still valid but
          won&apos;t appear in a drawer reconciliation.
        </InlineNote>
      </div>

      <OpenShiftModal
        open={openModal}
        onClose={() => setOpenModal(false)}
        onSaved={() => {
          setOpenModal(false);
          refresh();
        }}
      />
      <CloseShiftModal
        open={closeModal}
        expected={totalsQuery.data?.expectedCash ?? 0}
        onClose={() => setCloseModal(false)}
        onSaved={() => {
          setCloseModal(false);
          refresh();
        }}
      />
      <CashMovementModal
        type={movementModal}
        onClose={() => setMovementModal(null)}
        onSaved={() => {
          setMovementModal(null);
          refresh();
        }}
      />
    </>
  );
}

function OpenShiftModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [openingCash, setOpeningCash] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOpeningCash("");
    setBusy(false);
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.openShift(parseMoneyInput(openingCash));
      toast.success("Shift opened");
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
      title="Open a shift"
      description="Count the cash float currently in the drawer."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => formRef.current?.requestSubmit()}>
            Open shift
          </Button>
        </>
      }
    >
      <form ref={formRef} onSubmit={submit} className="space-y-4">
        <Field label="Opening cash (DA)" hint="Notes and coins available for change.">
          <Input
            value={openingCash}
            onChange={(event) => setOpeningCash(event.target.value)}
            inputMode="decimal"
            placeholder="0"
            autoFocus
          />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {[5000, 10000, 20000, 50000].map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => setOpeningCash(String(amount))}
              className="rounded-lg bg-app px-2.5 py-1.5 text-[10.5px] font-semibold text-muted hover:text-ink"
            >
              {formatMoney(amount * 100)}
            </button>
          ))}
        </div>
        <InlineNote tone="info">
          Only one open shift is allowed per user on this device.
        </InlineNote>
      </form>
    </Modal>
  );
}

function CloseShiftModal({
  open,
  expected,
  onClose,
  onSaved,
}: {
  open: boolean;
  expected: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [countedCash, setCountedCash] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCountedCash(centsToInput(expected));
    setBusy(false);
  }, [open, expected]);

  const counted = parseMoneyInput(countedCash);
  const difference = counted - expected;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.closeShift(counted);
      toast.success("Shift closed", {
        description: `Difference ${formatMoney(difference)}`,
      });
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
      title="Close the shift"
      description="Enter the physical cash counted in the drawer."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => formRef.current?.requestSubmit()}>
            Close shift
          </Button>
        </>
      }
    >
      <form ref={formRef} onSubmit={submit} className="space-y-3.5">
        <div className="rounded-xl border border-line bg-app/40 p-3.5">
          <div className="flex justify-between text-[11.5px]">
            <span className="text-muted">Expected in drawer</span>
            <span className="num font-semibold text-ink">{formatMoney(expected)}</span>
          </div>
        </div>
        <Field label="Counted cash (DA)" required>
          <Input
            value={countedCash}
            onChange={(event) => setCountedCash(event.target.value)}
            inputMode="decimal"
            autoFocus
          />
        </Field>
        <div
          className={cn(
            "flex items-center justify-between rounded-xl px-3.5 py-3 text-[11.5px]",
            difference === 0
              ? "bg-success-soft text-success"
              : difference < 0
                ? "bg-danger-soft text-danger"
                : "bg-warning-soft text-warning",
          )}
        >
          <span className="font-medium">Difference</span>
          <span className="num text-[15px] font-semibold">
            {difference > 0 ? "+" : ""}
            {formatMoney(difference)}
          </span>
        </div>
        <InlineNote tone="warning">
          A non-zero difference is stored and audited. Recount before closing if possible.
        </InlineNote>
      </form>
    </Modal>
  );
}

function CashMovementModal({
  type,
  onClose,
  onSaved,
}: {
  type: "cash_in" | "cash_out" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!type) return;
    setAmount("");
    setReason("");
    setBusy(false);
  }, [type]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!type) return;
    const cents = parseMoneyInput(amount);
    if (cents <= 0) {
      toast.error("Enter an amount greater than zero.");
      return;
    }
    if (!reason.trim()) {
      toast.error("A reason is required.");
      return;
    }
    setBusy(true);
    try {
      await api.addCashMovement({
        movementType: type,
        amount: cents,
        reason: reason.trim(),
      });
      toast.success(type === "cash_in" ? "Cash added to shift" : "Cash removed from shift");
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={type !== null}
      onClose={onClose}
      title={type === "cash_in" ? "Cash in" : "Cash out"}
      description={
        type === "cash_in"
          ? "Add cash to the drawer (change brought in, owner deposit…)."
          : "Remove cash from the drawer (supplier paid cash, petty expense…)."
      }
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => formRef.current?.requestSubmit()}>
            Record movement
          </Button>
        </>
      }
    >
      <form ref={formRef} onSubmit={submit} className="space-y-3.5">
        <Field label="Amount (DA)" required>
          <Input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            autoFocus
          />
        </Field>
        <Field label="Reason" required>
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={type === "cash_in" ? "Change brought in" : "Bread supplier paid cash"}
          />
        </Field>
      </form>
    </Modal>
  );
}
