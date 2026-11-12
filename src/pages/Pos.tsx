import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Banknote,
  BookOpen,
  CreditCard,
  Minus,
  Plus,
  Printer,
  ReceiptText,
  ScanLine,
  Smartphone,
  Trash2,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";

import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  centsToInput,
  formatMoney,
  formatQuantity,
  paymentLabel,
  parseMoneyInput,
  parseQuantityInput,
  shortUnit,
  stockState,
} from "../lib/format";
import type { PaymentMethod, PriceTier, Product, Sale } from "../lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBlock,
  Field,
  InlineNote,
  Input,
  LoadingBlock,
  Modal,
  Segmented,
  Select,
  cn,
} from "../components/ui";

interface CartLine {
  product: Product;
  quantity: string;
}

const paymentMethods: Array<{ value: PaymentMethod; label: string; icon: LucideIcon }> = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "cib", label: "CIB", icon: CreditCard },
  { value: "edahabia", label: "Edahabia", icon: CreditCard },
  { value: "baridimob", label: "BaridiMob", icon: Smartphone },
  { value: "credit", label: "Credit", icon: BookOpen },
];

const quickCash = [100_00, 500_00, 1000_00, 2000_00];

export default function PosPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | "all">("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [priceTier, setPriceTier] = useState<PriceTier>("retail");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [customerId, setCustomerId] = useState<string>("");
  const [discount, setDiscount] = useState("");
  const [cashGiven, setCashGiven] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Sale | null>(null);

  const productsQuery = useQuery({ queryKey: ["products", "pos"], queryFn: () => api.listProducts() });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: () => api.listCategories() });
  const customersQuery = useQuery({
    queryKey: ["customers", "pos"],
    queryFn: () => api.listCustomers({ onlyDebtors: false }),
  });
  const settingsQuery = useQuery({ queryKey: ["shop-settings"], queryFn: api.getShopSettings });
  const shiftQuery = useQuery({
    queryKey: ["shift", "totals"],
    queryFn: api.currentShiftTotals,
  });

  const canDiscount = user?.role === "owner" || user?.role === "manager";
  const allowNegative = settingsQuery.data?.allowNegativeStock ?? false;
  const stampDutyEnabled = settingsQuery.data?.stampDutyEnabled ?? false;

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (productsQuery.data ?? []).filter((product) => {
      if (categoryId !== "all" && product.categoryId !== categoryId) return false;
      if (!term) return true;
      return (
        product.nameFr.toLowerCase().includes(term) ||
        (product.nameAr ?? "").toLowerCase().includes(term) ||
        product.barcodes.some((barcode) => barcode.barcode.includes(term))
      );
    });
  }, [productsQuery.data, search, categoryId]);

  const quantityOf = (line: CartLine) => parseQuantityInput(line.quantity);
  const subtotal = cart.reduce((sum, line) => {
    const unitPrice =
      priceTier === "wholesale" ? line.product.priceWholesale ?? line.product.priceRetail : line.product.priceRetail;
    return sum + Math.round(unitPrice * quantityOf(line));
  }, 0);
  const discountCents = canDiscount ? Math.min(parseMoneyInput(discount), subtotal) : 0;
  const stampDuty = stampDutyEnabled && paymentMethod === "cash" ? 100 : 0;
  const total = Math.max(0, subtotal - discountCents + stampDuty);
  const cashGivenCents = parseMoneyInput(cashGiven);
  const change = cashGivenCents - total;
  const itemCount = cart.reduce((sum, line) => sum + quantityOf(line), 0);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const addProduct = (product: Product, quantity = 1) => {
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) {
        return current.map((line) =>
          line.product.id === product.id
            ? { ...line, quantity: String(Number((quantityOf(line) + quantity).toFixed(3))) }
            : line,
        );
      }
      return [...current, { product, quantity: String(quantity) }];
    });
  };

  const setLineQuantity = (productId: number, value: string) => {
    setCart((current) =>
      current.map((line) => (line.product.id === productId ? { ...line, quantity: value } : line)),
    );
  };

  const stepLine = (line: CartLine, direction: 1 | -1) => {
    const current = quantityOf(line);
    const step = line.product.unitType === "weight" ? 0.5 : 1;
    const next = Math.max(0, Number((current + step * direction).toFixed(3)));
    if (next === 0) {
      setCart((items) => items.filter((item) => item.product.id !== line.product.id));
    } else {
      setLineQuantity(line.product.id, String(next));
    }
  };

  const blurQuantity = (line: CartLine) => {
    let value = quantityOf(line);
    if (line.product.unitType === "unit") value = Math.max(0, Math.round(value));
    else value = Math.max(0, Number(value.toFixed(3)));
    if (value === 0) {
      setCart((items) => items.filter((item) => item.product.id !== line.product.id));
    } else {
      setLineQuantity(line.product.id, String(value));
    }
  };

  const removeLine = (productId: number) => {
    setCart((items) => items.filter((item) => item.product.id !== productId));
  };

  const clearSale = () => {
    setCart([]);
    setDiscount("");
    setCashGiven("");
    setCustomerId("");
    setPaymentMethod("cash");
    setPriceTier("retail");
    searchRef.current?.focus();
  };

  const submitSearch = async (event: FormEvent) => {
    event.preventDefault();
    const term = search.trim();
    if (!term) return;
    try {
      const scan = await api.findProductByBarcode(term);
      addProduct(scan.product, Math.max(1, scan.unitsPerBarcode));
      setSearch("");
      toast.success(`Added ${scan.product.nameFr}`);
    } catch {
      if (filteredProducts.length === 1) {
        addProduct(filteredProducts[0]);
        setSearch("");
      }
    }
  };

  const selectPayment = (method: PaymentMethod) => {
    setPaymentMethod(method);
    if (method === "cash" && !cashGiven) {
      setCashGiven(centsToInput(total));
    }
  };

  const validate = (): string | null => {
    const validLines = cart.filter((line) => quantityOf(line) > 0);
    if (validLines.length === 0) return "Add at least one product.";
    for (const line of validLines) {
      if (line.product.unitType === "unit" && !Number.isInteger(quantityOf(line))) {
        return `${line.product.nameFr} is sold by unit and needs a whole quantity.`;
      }
      if (!allowNegative && quantityOf(line) > line.product.stockQuantity + 0.0005) {
        return `Not enough stock for ${line.product.nameFr}. Available ${formatQuantity(
          line.product.stockQuantity,
        )}.`;
      }
    }
    if (paymentMethod === "credit" && !customerId) {
      return "Choose a customer for a credit sale.";
    }
    if (paymentMethod === "cash") {
      if (!cashGiven) return "Enter the cash amount received.";
      if (cashGivenCents < total) return "Cash received is less than the total.";
    }
    if (subtotal === 0) return "The sale total is zero.";
    return null;
  };

  const checkout = async () => {
    const problem = validate();
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    try {
      const sale = await api.createSale({
        items: cart
          .filter((line) => quantityOf(line) > 0)
          .map((line) => ({
            productId: line.product.id,
            quantity: quantityOf(line),
          })),
        priceTier,
        discount: discountCents,
        paymentMethod,
        customerId: customerId ? Number(customerId) : null,
        cashGiven: paymentMethod === "cash" ? cashGivenCents : null,
      });
      setReceipt(sale);
      queryClient.invalidateQueries();
      setCart([]);
      setDiscount("");
      setCashGiven("");
      setCustomerId("");
      setPaymentMethod("cash");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const products = filteredProducts;
  const loading = productsQuery.isLoading || categoriesQuery.isLoading || settingsQuery.isLoading;
  const currentShift = shiftQuery.data?.current;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.03em] text-ink">
            Point of sale
          </h1>
          <p className="mt-1 text-[12.5px] text-muted">
            {currentShift
              ? `Shift open since ${currentShift.openedAt.slice(11, 16)} · opening cash ${formatMoney(
                  currentShift.openingCash,
                )}`
              : "No shift open — sales are still saved locally."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!currentShift ? (
            <Link to="/shifts">
              <Button variant="secondary" size="sm">
                Open a shift
              </Button>
            </Link>
          ) : null}
          <Segmented<PriceTier>
            value={priceTier}
            onChange={setPriceTier}
            options={[
              { value: "retail", label: "Retail" },
              { value: "wholesale", label: "Wholesale" },
            ]}
          />
        </div>
      </div>

      {!allowNegative ? (
        <div className="mb-3">
          <InlineNote tone="info">
            Selling is blocked when stock is insufficient. Override this only in Settings → Stock
            policy if your shop allows negative stock.
          </InlineNote>
        </div>
      ) : null}

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="overflow-hidden">
          <div className="border-b border-line p-3">
            <form onSubmit={submitSearch}>
              <div className="relative">
                <ScanLine className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand" />
                <Input
                  ref={searchRef}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Scan a barcode, or search products by name…"
                  className="h-11 pl-10 pr-10 text-[13px]"
                  autoComplete="off"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      searchRef.current?.focus();
                    }}
                    className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-faint hover:bg-app hover:text-ink"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </form>
            <div className="scroll-thin mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
              <button
                type="button"
                onClick={() => setCategoryId("all")}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition",
                  categoryId === "all"
                    ? "bg-ink text-white dark:bg-white dark:text-ink"
                    : "bg-app text-muted hover:text-ink",
                )}
              >
                All products
              </button>
              {(categoriesQuery.data ?? []).map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setCategoryId(category.id)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition",
                    categoryId === category.id
                      ? "bg-ink text-white dark:bg-white dark:text-ink"
                      : "bg-app text-muted hover:text-ink",
                  )}
                >
                  {category.nameFr}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <LoadingBlock label="Loading catalogue…" />
          ) : productsQuery.isError ? (
            <div className="p-4">
              <ErrorBlock message="The product catalogue could not be loaded." />
            </div>
          ) : products.length === 0 ? (
            <EmptyState
              icon={ScanLine}
              title={search ? "No products match this search" : "The catalogue is empty"}
              description={
                search
                  ? "Try another name or barcode, or clear the filters."
                  : "Add products first, or load the demo catalogue from Settings."
              }
              action={
                <Link to="/products">
                  <Button size="sm" variant="secondary">
                    Open products
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="scroll-thin grid max-h-[calc(100vh-250px)] grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3 xl:grid-cols-4">
              {products.map((product) => {
                const state = stockState(product);
                const disabled = !allowNegative && product.stockQuantity <= 0;
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addProduct(product)}
                    disabled={disabled}
                    className="group flex min-h-[104px] flex-col rounded-xl border border-line bg-card p-3 text-left transition hover:border-brand/50 hover:bg-brand-soft/30 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <div className="flex w-full items-start justify-between gap-1.5">
                      <p className="line-clamp-2 text-[11.5px] font-semibold leading-snug text-ink">
                        {product.nameFr}
                      </p>
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-app text-faint transition group-hover:bg-brand group-hover:text-brand-ink">
                        <Plus className="h-3 w-3" />
                      </span>
                    </div>
                    {product.nameAr ? (
                      <p dir="rtl" className="mt-0.5 line-clamp-1 text-[10px] text-faint">
                        {product.nameAr}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[10px] text-faint">{product.categoryName ?? "—"}</p>
                    )}
                    <div className="mt-auto flex w-full items-end justify-between gap-1 pt-2">
                      <span className="num text-[12.5px] font-semibold text-brand">
                        {formatMoney(
                          priceTier === "wholesale"
                            ? product.priceWholesale ?? product.priceRetail
                            : product.priceRetail,
                        )}
                      </span>
                      <Badge
                        tone={state === "out" ? "danger" : state === "low" ? "warning" : "neutral"}
                      >
                        {formatQuantity(product.stockQuantity)} {shortUnit(product.unitType)}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="lg:sticky lg:top-[76px]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <h2 className="text-[13.5px] font-semibold text-ink">Current sale</h2>
              <p className="text-[10.5px] text-faint">
                {cart.length} line{cart.length === 1 ? "" : "s"} · {formatQuantity(itemCount)} items
              </p>
            </div>
            {cart.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={clearSale} icon={Trash2}>
                Clear
              </Button>
            ) : null}
          </div>

          <div className="scroll-thin max-h-[330px] overflow-y-auto">
            {cart.length === 0 ? (
              <EmptyState
                icon={Wallet}
                compact
                title="The cart is empty"
                description="Scan a barcode or tap a product to start a sale."
              />
            ) : (
              <div className="divide-y divide-line/70">
                {cart.map((line) => {
                  const quantity = quantityOf(line);
                  const unitPrice =
                    priceTier === "wholesale"
                      ? line.product.priceWholesale ?? line.product.priceRetail
                      : line.product.priceRetail;
                  const overStock =
                    !allowNegative && quantity > line.product.stockQuantity + 0.0005;
                  return (
                    <div key={line.product.id} className="px-4 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[11.5px] font-semibold text-ink">
                            {line.product.nameFr}
                          </p>
                          <p className="num text-[10px] text-faint">
                            {formatMoney(unitPrice)} / {shortUnit(line.product.unitType)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(line.product.id)}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-faint hover:bg-danger-soft hover:text-danger"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => stepLine(line, -1)}
                            className="flex h-6.5 w-6.5 items-center justify-center rounded-md border border-line text-muted hover:bg-app hover:text-ink"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <input
                            value={line.quantity}
                            onChange={(event) => setLineQuantity(line.product.id, event.target.value)}
                            onBlur={() => blurQuantity(line)}
                            inputMode="decimal"
                            className={cn(
                              "num h-6.5 w-14 rounded-md border border-line bg-card px-1 text-center text-[11px] font-semibold text-ink outline-none focus:border-brand",
                              overStock && "border-danger text-danger",
                            )}
                            aria-label={`Quantity for ${line.product.nameFr}`}
                          />
                          <button
                            type="button"
                            onClick={() => stepLine(line, 1)}
                            className="flex h-6.5 w-6.5 items-center justify-center rounded-md border border-line text-muted hover:bg-app hover:text-ink"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <span className="num text-[12px] font-semibold text-ink">
                          {formatMoney(Math.round(unitPrice * quantity))}
                        </span>
                      </div>
                      {overStock ? (
                        <p className="mt-1 text-[9.5px] font-medium text-danger">
                          Only {formatQuantity(line.product.stockQuantity)} in stock.
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-line p-4">
            <div className="space-y-2.5">
              <Field label="Customer">
                <Select
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                  className="h-9 text-xs"
                >
                  <option value="">Walk-in customer</option>
                  {(customersQuery.data ?? []).map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                      {customer.balance > 0 ? ` · owes ${formatMoney(customer.balance)}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>

              <div>
                <p className="field-label">Payment method</p>
                <div className="grid grid-cols-5 gap-1">
                  {paymentMethods.map((method) => (
                    <button
                      key={method.value}
                      type="button"
                      onClick={() => selectPayment(method.value)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[9px] font-semibold transition",
                        paymentMethod === method.value
                          ? "border-brand bg-brand-soft text-brand"
                          : "border-line text-muted hover:border-line-strong hover:text-ink",
                      )}
                      title={paymentLabel(method.value)}
                    >
                      <method.icon className="h-3.5 w-3.5" />
                      <span className="truncate">{method.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {canDiscount ? (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Discount (DA)">
                    <Input
                      value={discount}
                      onChange={(event) => setDiscount(event.target.value)}
                      placeholder="0"
                      inputMode="decimal"
                      className="h-9 text-xs"
                    />
                  </Field>
                  <div className="flex items-end pb-2">
                    <p className="text-[10px] leading-tight text-faint">
                      Cashiers cannot discount. Manager/owner only.
                    </p>
                  </div>
                </div>
              ) : null}

              {paymentMethod === "cash" ? (
                <div>
                  <Field label="Cash received (DA)">
                    <Input
                      value={cashGiven}
                      onChange={(event) => setCashGiven(event.target.value)}
                      placeholder={centsToInput(total)}
                      inputMode="decimal"
                      className="h-9 text-xs"
                    />
                  </Field>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {quickCash.map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() =>
                          setCashGiven(
                            centsToInput(parseMoneyInput(cashGiven || "0") + amount),
                          )
                        }
                        className="rounded-md bg-app px-2 py-1 text-[9.5px] font-semibold text-muted transition hover:text-ink"
                      >
                        +{formatMoney(amount)}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCashGiven(centsToInput(total))}
                      className="rounded-md bg-brand-soft px-2 py-1 text-[9.5px] font-semibold text-brand"
                    >
                      Exact
                    </button>
                  </div>
                  {cashGiven ? (
                    <div className="mt-1.5 flex items-center justify-between text-[11px]">
                      <span className="text-muted">Change due</span>
                      <span
                        className={cn(
                          "num font-semibold",
                          change < 0 ? "text-danger" : "text-success",
                        )}
                      >
                        {formatMoney(Math.max(0, change))}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : paymentMethod === "credit" ? (
                <div className="rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-[10.5px] leading-relaxed text-warning">
                  The full total will be added to the selected customer&apos;s credit balance.
                </div>
              ) : null}

              {paymentMethod === "credit" && !customerId ? (
                <p className="text-[10px] font-medium text-danger">
                  Select a customer above to sell on credit.
                </p>
              ) : null}
            </div>

            <div className="mt-4 space-y-1.5 border-t border-line pt-3 text-[11.5px]">
              <div className="flex justify-between text-muted">
                <span>Subtotal</span>
                <span className="num font-medium text-ink">{formatMoney(subtotal)}</span>
              </div>
              {discountCents > 0 ? (
                <div className="flex justify-between text-warning">
                  <span>Discount</span>
                  <span className="num font-medium">−{formatMoney(discountCents)}</span>
                </div>
              ) : null}
              {stampDuty > 0 ? (
                <div className="flex justify-between text-muted">
                  <span>Stamp duty</span>
                  <span className="num font-medium text-ink">{formatMoney(stampDuty)}</span>
                </div>
              ) : null}
              <div className="flex items-end justify-between pt-1">
                <span className="text-[12px] font-semibold text-ink">Total</span>
                <span className="num text-[22px] font-semibold tracking-[-0.03em] text-ink">
                  {formatMoney(total)}
                </span>
              </div>
            </div>

            <Button
              size="lg"
              fullWidth
              className="mt-3"
              loading={busy}
              icon={busy ? undefined : ReceiptText}
              onClick={checkout}
              disabled={cart.length === 0}
            >
              {busy ? "Saving sale…" : "Complete sale"}
            </Button>
            <p className="mt-2 text-center text-[9.5px] text-faint">
              Confirmed sales are immutable. Returns create a linked entry.
            </p>
          </div>
        </Card>
      </div>

      <Modal
        open={receipt !== null}
        onClose={() => {
          setReceipt(null);
          setTimeout(() => searchRef.current?.focus(), 50);
        }}
        title="Sale completed"
        description={receipt ? `Receipt ${receipt.receiptNumber} saved locally.` : undefined}
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              icon={Printer}
              onClick={() => window.print()}
              className="no-print"
            >
              Print receipt
            </Button>
            <Button
              onClick={() => {
                setReceipt(null);
                setTimeout(() => searchRef.current?.focus(), 50);
              }}
            >
              New sale
            </Button>
          </>
        }
      >
        {receipt ? (
          <div className="print-area">
            <div className="rounded-xl border border-line bg-app/40 p-4">
              <div className="text-center">
                <p className="text-[14px] font-semibold text-ink">
                  {settingsQuery.data?.shopName ?? "Ma Superette"}
                </p>
                {settingsQuery.data?.address ? (
                  <p className="text-[10px] text-muted">{settingsQuery.data.address}</p>
                ) : null}
                {settingsQuery.data?.phone ? (
                  <p className="text-[10px] text-muted">Tel {settingsQuery.data.phone}</p>
                ) : null}
                <p className="mt-2 text-[10px] text-faint">Receipt {receipt.receiptNumber}</p>
                <p className="text-[10px] text-faint">{receipt.createdAt}</p>
              </div>
              <div className="my-3 border-t border-dashed border-line" />
              <div className="space-y-2">
                {receipt.items.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-2 text-[10.5px]">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{item.productName}</p>
                      <p className="text-faint">
                        {formatQuantity(item.quantity)} × {formatMoney(item.unitPrice)}
                      </p>
                    </div>
                    <span className="num font-medium text-ink">{formatMoney(item.lineTotal)}</span>
                  </div>
                ))}
              </div>
              <div className="my-3 border-t border-dashed border-line" />
              <div className="space-y-1 text-[10.5px]">
                <div className="flex justify-between text-muted">
                  <span>Subtotal</span>
                  <span className="num">{formatMoney(receipt.subtotal)}</span>
                </div>
                {receipt.discount > 0 ? (
                  <div className="flex justify-between text-muted">
                    <span>Discount</span>
                    <span className="num">−{formatMoney(receipt.discount)}</span>
                  </div>
                ) : null}
                {receipt.vatTotal > 0 ? (
                  <div className="flex justify-between text-muted">
                    <span>VAT included</span>
                    <span className="num">{formatMoney(receipt.vatTotal)}</span>
                  </div>
                ) : null}
                {receipt.stampDuty > 0 ? (
                  <div className="flex justify-between text-muted">
                    <span>Stamp duty</span>
                    <span className="num">{formatMoney(receipt.stampDuty)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between pt-1 text-[13px] font-semibold text-ink">
                  <span>Total</span>
                  <span className="num">{formatMoney(receipt.total)}</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>{paymentLabel(receipt.payments[0]?.method)}</span>
                  <span className="num">{formatMoney(receipt.payments[0]?.amount)}</span>
                </div>
                {receipt.payments[0]?.method === "cash" && receipt.payments[0]?.cashGiven ? (
                  <>
                    <div className="flex justify-between text-muted">
                      <span>Cash received</span>
                      <span className="num">{formatMoney(receipt.payments[0].cashGiven)}</span>
                    </div>
                    <div className="flex justify-between font-medium text-success">
                      <span>Change</span>
                      <span className="num">
                        {formatMoney(
                          Math.max(0, (receipt.payments[0].cashGiven ?? 0) - receipt.total),
                        )}
                      </span>
                    </div>
                  </>
                ) : null}
              </div>
              <p className="mt-4 text-center text-[9.5px] text-faint">
                {settingsQuery.data?.receiptFooter ?? "Thank you for your visit."}
              </p>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
