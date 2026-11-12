import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarDays,
  Eye,
  PackagePlus,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  Truck,
} from "lucide-react";

import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  centsToInput,
  formatDate,
  formatDateTime,
  formatMoney,
  formatQuantity,
  parseMoneyInput,
  parseQuantityInput,
  shortUnit,
  todayISO,
} from "../lib/format";
import type { Product, Purchase, Supplier } from "../lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBlock,
  Field,
  Input,
  InlineNote,
  LoadingBlock,
  Modal,
  PageHeader,
  Segmented,
  Select,
  StatCard,
  Switch,
} from "../components/ui";

type Tab = "purchases" | "suppliers";

interface PurchaseLine {
  productId: string;
  quantity: string;
  unitCost: string;
  expiryDate: string;
}

const emptyLine: PurchaseLine = {
  productId: "",
  quantity: "1",
  unitCost: "",
  expiryDate: "",
};

export default function PurchasesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("purchases");
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [detail, setDetail] = useState<Purchase | null>(null);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const canManageSuppliers = user?.role === "owner" || user?.role === "manager";

  const purchasesQuery = useQuery({
    queryKey: ["purchases"],
    queryFn: () => api.listPurchases(200),
  });
  const suppliersQuery = useQuery({
    queryKey: ["suppliers", "all"],
    queryFn: () => api.listSuppliers(true),
  });
  const productsQuery = useQuery({
    queryKey: ["products", "purchases"],
    queryFn: () => api.listProducts({ includeInactive: false }),
  });

  const purchases = purchasesQuery.data ?? [];
  const suppliers = suppliersQuery.data ?? [];
  const products = productsQuery.data ?? [];

  const supplierDebt = suppliers.reduce(
    (sum, supplier) => sum + Math.max(0, supplier.balance),
    0,
  );
  const paidTotal = purchases.reduce((sum, purchase) => sum + purchase.paidAmount, 0);
  const purchasedTotal = purchases.reduce((sum, purchase) => sum + purchase.total, 0);

  return (
    <>
      <PageHeader
        eyebrow="Purchasing"
        title="Purchases & suppliers"
        description="Receive supplier deliveries, update cost prices and keep a payable balance for every supplier."
        actions={
          <>
            {canManageSuppliers ? (
              <Button
                variant="secondary"
                icon={Truck}
                onClick={() => {
                  setEditingSupplier(null);
                  setSupplierOpen(true);
                }}
              >
                New supplier
              </Button>
            ) : null}
            <Button
              icon={PackagePlus}
              onClick={() => setPurchaseOpen(true)}
              disabled={suppliers.length === 0}
            >
              New purchase
            </Button>
          </>
        }
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Purchases recorded"
          value={formatMoney(purchasedTotal)}
          hint={`${purchases.length} deliveries`}
          icon={Receipt}
        />
        <StatCard
          label="Paid to suppliers"
          value={formatMoney(paidTotal)}
          hint={`Outstanding ${formatMoney(Math.max(0, purchasedTotal - paidTotal))}`}
          icon={Truck}
          tone="success"
        />
        <StatCard
          label="Supplier debt"
          value={formatMoney(supplierDebt)}
          hint={`${suppliers.filter((supplier) => supplier.balance > 0).length} suppliers with a balance`}
          icon={CalendarDays}
          tone="warning"
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "purchases", label: "Purchase history" },
            { value: "suppliers", label: "Suppliers" },
          ]}
        />
        {suppliers.length === 0 ? (
          <span className="text-[11px] text-warning">
            Add a supplier before recording a purchase.
          </span>
        ) : null}
      </div>

      {tab === "purchases" ? (
        <Card className="overflow-hidden">
          {purchasesQuery.isLoading ? (
            <LoadingBlock />
          ) : purchasesQuery.isError ? (
            <div className="p-4">
              <ErrorBlock message="Could not load purchases." />
            </div>
          ) : purchases.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="No purchases yet"
              description={
                suppliers.length === 0
                  ? "Create a supplier first, then record your first delivery."
                  : "Record your first delivery to add stock and supplier payable."
              }
              action={
                suppliers.length > 0 ? (
                  <Button size="sm" icon={PackagePlus} onClick={() => setPurchaseOpen(true)}>
                    New purchase
                  </Button>
                ) : null
              }
            />
          ) : (
            <div className="scroll-thin overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Date</th>
                    <th>Supplier</th>
                    <th className="text-right">Items</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Paid</th>
                    <th className="text-right">Balance</th>
                    <th>By</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((purchase) => {
                    const balance = purchase.total - purchase.paidAmount;
                    return (
                      <tr key={purchase.id}>
                        <td>
                          <span className="num text-[11.5px] font-semibold text-ink">
                            {purchase.reference || `#${purchase.id}`}
                          </span>
                          <p className="text-[9.5px] text-faint">Purchase #{purchase.id}</p>
                        </td>
                        <td className="whitespace-nowrap text-[10.5px] text-muted">
                          {formatDateTime(purchase.createdAt)}
                        </td>
                        <td className="text-[11.5px] text-ink">{purchase.supplierName}</td>
                        <td className="num text-right text-[11px] text-muted">
                          {purchase.items.length}
                        </td>
                        <td className="num text-right text-[11.5px] font-semibold text-ink">
                          {formatMoney(purchase.total)}
                        </td>
                        <td className="num text-right text-[11px] text-muted">
                          {formatMoney(purchase.paidAmount)}
                        </td>
                        <td className="num text-right text-[11px]">
                          <span className={balance > 0 ? "font-semibold text-warning" : "text-success"}>
                            {formatMoney(balance)}
                          </span>
                        </td>
                        <td className="text-[10.5px] text-muted">{purchase.userName}</td>
                        <td className="text-right">
                          <button
                            type="button"
                            onClick={() => setDetail(purchase)}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-faint transition hover:bg-app hover:text-ink"
                            title="View purchase"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {suppliersQuery.isLoading ? (
            <LoadingBlock />
          ) : suppliers.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="No suppliers yet"
              description="Add the wholesalers and distributors your shop buys from."
              action={
                canManageSuppliers ? (
                  <Button
                    size="sm"
                    icon={Plus}
                    onClick={() => {
                      setEditingSupplier(null);
                      setSupplierOpen(true);
                    }}
                  >
                    Add supplier
                  </Button>
                ) : null
              }
            />
          ) : (
            <div className="scroll-thin overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Phone</th>
                    <th className="text-right">Balance owed</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((supplier) => (
                    <tr key={supplier.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-app text-faint">
                            <Truck className="h-3.5 w-3.5" />
                          </span>
                          <span className="text-[11.5px] font-semibold text-ink">{supplier.name}</span>
                        </div>
                      </td>
                      <td className="text-[11px] text-muted">{supplier.phone ?? "—"}</td>
                      <td className="num text-right text-[11.5px]">
                        <span
                          className={
                            supplier.balance > 0 ? "font-semibold text-warning" : "text-success"
                          }
                        >
                          {formatMoney(Math.max(0, supplier.balance))}
                        </span>
                      </td>
                      <td>
                        <Badge tone={supplier.isActive ? "success" : "neutral"}>
                          {supplier.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="text-right">
                        {canManageSuppliers ? (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSupplier(supplier);
                              setSupplierOpen(true);
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-faint transition hover:bg-app hover:text-ink"
                            title="Edit supplier"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        ) : (
                          <span className="text-[10px] text-faint">View only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <div className="mt-3">
        <InlineNote tone="info">
          Receiving a purchase increases stock, creates expiry batches when relevant and updates the
          product cost price. Unpaid amounts remain as supplier debt.
        </InlineNote>
      </div>

      <PurchaseFormModal
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        products={products}
        suppliers={suppliers.filter((supplier) => supplier.isActive)}
        onSaved={(purchase) => {
          setPurchaseOpen(false);
          setDetail(purchase);
          queryClient.invalidateQueries();
        }}
      />

      <SupplierFormModal
        open={supplierOpen}
        supplier={editingSupplier}
        onClose={() => {
          setSupplierOpen(false);
          setEditingSupplier(null);
        }}
        onSaved={() => {
          setSupplierOpen(false);
          setEditingSupplier(null);
          queryClient.invalidateQueries();
        }}
      />

      <PurchaseDetailModal purchase={detail} onClose={() => setDetail(null)} />
    </>
  );
}

function PurchaseFormModal({
  open,
  onClose,
  products,
  suppliers,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  suppliers: Supplier[];
  onSaved: (purchase: Purchase) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [supplierId, setSupplierId] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<PurchaseLine[]>([{ ...emptyLine }]);
  const [paidAmount, setPaidAmount] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSupplierId("");
    setReference("");
    setLines([{ ...emptyLine }]);
    setPaidAmount("");
    setBusy(false);
  }, [open]);

  const updateLine = (index: number, patch: Partial<PurchaseLine>) => {
    setLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    );
  };

  const lineCost = (line: PurchaseLine) =>
    Math.round(parseQuantityInput(line.quantity) * parseMoneyInput(line.unitCost));
  const total = lines.reduce((sum, line) => sum + lineCost(line), 0);
  const paidCents = parseMoneyInput(paidAmount);
  const hasExpiry = lines.some((line) => {
    const product = products.find((item) => item.id === Number(line.productId));
    return Boolean(line.expiryDate) || Boolean(product?.trackExpiry);
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supplierId) {
      toast.error("Choose a supplier.");
      return;
    }
    const validLines = lines.filter(
      (line) => line.productId && parseQuantityInput(line.quantity) > 0,
    );
    if (validLines.length === 0) {
      toast.error("Add at least one product.");
      return;
    }
    if (paidCents > total) {
      toast.error("Paid amount cannot exceed the purchase total.");
      return;
    }
    setBusy(true);
    try {
      const purchase = await api.createPurchase({
        supplierId: Number(supplierId),
        reference: reference.trim() || null,
        paidAmount: paidCents,
        items: validLines.map((line) => ({
          productId: Number(line.productId),
          quantity: parseQuantityInput(line.quantity),
          unitCost: parseMoneyInput(line.unitCost),
          expiryDate: line.expiryDate || null,
        })),
      });
      toast.success(`Purchase #${purchase.id} recorded`);
      onSaved(purchase);
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
      title="New purchase delivery"
      description="Stock is received immediately and cost prices are updated."
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => formRef.current?.requestSubmit()}>
            Record purchase
          </Button>
        </>
      }
    >
      <form ref={formRef} onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Supplier" required>
            <Select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
              <option value="">Choose a supplier…</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Supplier reference" hint="Invoice or delivery note number.">
            <Input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="FA-2026-0184"
            />
          </Field>
          <Field label="Paid now (DA)" hint={`Purchase total ${formatMoney(total)}`}>
            <div className="flex gap-1.5">
              <Input
                value={paidAmount}
                onChange={(event) => setPaidAmount(event.target.value)}
                inputMode="decimal"
                placeholder="0"
                className="flex-1"
              />
              <Button
                variant="secondary"
                size="md"
                onClick={() => setPaidAmount(centsToInput(total))}
                title="Pay the full total"
              >
                Full
              </Button>
            </div>
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12px] font-semibold text-ink">Received products</p>
            <Button
              variant="secondary"
              size="sm"
              icon={Plus}
              onClick={() => setLines((current) => [...current, { ...emptyLine }])}
            >
              Add line
            </Button>
          </div>
          <div className="space-y-2">
            {lines.map((line, index) => {
              const product = products.find((item) => item.id === Number(line.productId));
              return (
                <div
                  key={index}
                  className="rounded-xl border border-line bg-app/30 p-2.5"
                >
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_90px_110px_140px_34px]">
                    <Select
                      value={line.productId}
                      onChange={(event) => {
                        const selected = products.find(
                          (item) => item.id === Number(event.target.value),
                        );
                        updateLine(index, {
                          productId: event.target.value,
                          unitCost:
                            line.unitCost || (selected ? centsToInput(selected.costPrice) : ""),
                        });
                      }}
                      className="h-9 text-xs"
                    >
                      <option value="">Choose a product…</option>
                      {products.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nameFr}
                        </option>
                      ))}
                    </Select>
                    <Input
                      value={line.quantity}
                      onChange={(event) => updateLine(index, { quantity: event.target.value })}
                      placeholder="Qty"
                      inputMode="decimal"
                      className="h-9 text-xs"
                      title="Quantity"
                    />
                    <Input
                      value={line.unitCost}
                      onChange={(event) => updateLine(index, { unitCost: event.target.value })}
                      placeholder="Unit cost DA"
                      inputMode="decimal"
                      className="h-9 text-xs"
                      title="Unit cost in dinars"
                    />
                    <Input
                      type="date"
                      value={line.expiryDate}
                      onChange={(event) => updateLine(index, { expiryDate: event.target.value })}
                      className="h-9 text-xs"
                      title="Expiry date (optional)"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setLines((current) =>
                          current.length === 1
                            ? [{ ...emptyLine }]
                            : current.filter((_, lineIndex) => lineIndex !== index),
                        )
                      }
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-faint transition hover:bg-danger-soft hover:text-danger"
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-faint">
                    <span>
                      {product
                        ? `Current stock ${formatQuantity(product.stockQuantity)} ${shortUnit(
                            product.unitType,
                          )} · cost ${formatMoney(product.costPrice)}`
                        : "Choose a product to see stock"}
                      {hasExpiry && product?.trackExpiry && !line.expiryDate ? (
                        <span className="ml-1 font-medium text-warning">
                          · expiry date recommended
                        </span>
                      ) : null}
                    </span>
                    <span className="num font-semibold text-ink">{formatMoney(lineCost(line))}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="ml-auto w-full max-w-xs rounded-xl border border-line bg-card p-3 text-[11.5px]">
          <div className="flex justify-between text-muted">
            <span>Total</span>
            <span className="num text-[14px] font-semibold text-ink">{formatMoney(total)}</span>
          </div>
          <div className="mt-1 flex justify-between text-muted">
            <span>Paid now</span>
            <span className="num font-medium text-ink">{formatMoney(paidCents)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-line pt-1 text-muted">
            <span>Remaining debt</span>
            <span className="num font-semibold text-warning">
              {formatMoney(Math.max(0, total - paidCents))}
            </span>
          </div>
        </div>

        <p className="flex items-center gap-1.5 text-[10px] text-faint">
          <CalendarDays className="h-3 w-3" />
          Expiry dates are optional. They create batches used by the expiring-batches report.
        </p>
      </form>
    </Modal>
  );
}

function PurchaseDetailModal({
  purchase,
  onClose,
}: {
  purchase: Purchase | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={purchase !== null}
      onClose={onClose}
      title={purchase ? `Purchase ${purchase.reference || `#${purchase.id}`}` : "Purchase"}
      description={purchase ? `${purchase.supplierName} · ${formatDateTime(purchase.createdAt)}` : undefined}
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {purchase ? (
        <div>
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-app/40 p-3.5 text-[11.5px] sm:grid-cols-4">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-faint">Supplier</p>
              <p className="mt-0.5 font-medium text-ink">{purchase.supplierName}</p>
            </div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-faint">Recorded by</p>
              <p className="mt-0.5 font-medium text-ink">{purchase.userName}</p>
            </div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-faint">Total</p>
              <p className="num mt-0.5 font-semibold text-ink">{formatMoney(purchase.total)}</p>
            </div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-faint">Paid</p>
              <p className="num mt-0.5 font-medium text-ink">{formatMoney(purchase.paidAmount)}</p>
            </div>
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border border-line">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Unit cost</th>
                  <th>Expiry</th>
                  <th className="text-right">Line total</th>
                </tr>
              </thead>
              <tbody>
                {purchase.items.map((item) => (
                  <tr key={item.id}>
                    <td className="text-[11.5px] font-medium text-ink">{item.productName}</td>
                    <td className="num text-right text-[11px]">{formatQuantity(item.quantity)}</td>
                    <td className="num text-right text-[11px]">{formatMoney(item.unitCost)}</td>
                    <td className="text-[10.5px] text-muted">
                      {item.expiryDate ? formatDate(item.expiryDate) : "—"}
                    </td>
                    <td className="num text-right text-[11.5px] font-medium">
                      {formatMoney(item.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 ml-auto w-full max-w-xs space-y-1 text-[11.5px]">
            <div className="flex justify-between text-muted">
              <span>Total</span>
              <span className="num font-semibold text-ink">{formatMoney(purchase.total)}</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Paid</span>
              <span className="num text-ink">{formatMoney(purchase.paidAmount)}</span>
            </div>
            <div className="flex justify-between border-t border-line pt-1 text-muted">
              <span>Remaining debt</span>
              <span className="num font-semibold text-warning">
                {formatMoney(purchase.total - purchase.paidAmount)}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function SupplierFormModal({
  open,
  supplier,
  onClose,
  onSaved,
}: {
  open: boolean;
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(supplier?.name ?? "");
    setPhone(supplier?.phone ?? "");
    setIsActive(supplier?.isActive ?? true);
    setBusy(false);
  }, [open, supplier]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Supplier name is required.");
      return;
    }
    setBusy(true);
    try {
      const input = {
        name: name.trim(),
        phone: phone.trim() || null,
        isActive,
      };
      if (supplier) {
        await api.updateSupplier(supplier.id, input);
        toast.success("Supplier updated");
      } else {
        await api.createSupplier(input);
        toast.success("Supplier created");
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
      title={supplier ? "Edit supplier" : "New supplier"}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => formRef.current?.requestSubmit()}>
            {supplier ? "Save changes" : "Create supplier"}
          </Button>
        </>
      }
    >
      <form ref={formRef} onSubmit={submit} className="space-y-3.5">
        <Field label="Supplier name" required>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="SARL Nord Distribution"
            autoFocus
          />
        </Field>
        <Field label="Phone">
          <Input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="0550 12 34 56"
          />
        </Field>
        <div className="rounded-xl border border-line p-3">
          <Switch
            checked={isActive}
            onChange={setIsActive}
            label="Active supplier"
            description="Inactive suppliers cannot receive new purchases."
          />
        </div>
      </form>
    </Modal>
  );
}
