import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CalendarClock,
  ClipboardList,
  History,
  PackageX,
  SlidersHorizontal,
  TriangleAlert,
  Wallet,
} from "lucide-react";

import { api, errorMessage } from "../lib/api";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatQuantity,
  movementLabel,
  parseQuantityInput,
  shortUnit,
  stockState,
  unitLabel,
} from "../lib/format";
import type { ExpiringBatch, MovementType, Product } from "../lib/types";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorBlock,
  Field,
  InlineNote,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  SearchInput,
  Segmented,
  Select,
  StatCard,
  cn,
} from "../components/ui";

type Tab = "levels" | "movements" | "expiring";

const manualTypes: Array<{ value: MovementType; label: string; sign: "out" | "in" | "both" }> = [
  { value: "loss", label: "Loss / breakage", sign: "out" },
  { value: "expiry", label: "Expired products", sign: "out" },
  { value: "supplier_return", label: "Return to supplier", sign: "out" },
  { value: "customer_return", label: "Customer return", sign: "in" },
  { value: "adjustment", label: "Stock count adjustment", sign: "both" },
];

const movementTone: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  purchase: "success",
  sale: "info",
  customer_return: "success",
  supplier_return: "warning",
  loss: "danger",
  expiry: "danger",
  adjustment: "neutral",
};

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("levels");
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [movementProduct, setMovementProduct] = useState("");
  const [movementType, setMovementType] = useState("");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ product: Product; type: MovementType; quantity: number } | null>(
    null,
  );

  const productsQuery = useQuery({
    queryKey: ["products", "inventory"],
    queryFn: () => api.listProducts({ includeInactive: false }),
  });
  const movementsQuery = useQuery({
    queryKey: ["stock-movements", movementProduct, movementType],
    queryFn: () =>
      api.listStockMovements({
        productId: movementProduct ? Number(movementProduct) : null,
        movementType: movementType || null,
        limit: 300,
      }),
  });
  const expiringQuery = useQuery({
    queryKey: ["expiring", 60],
    queryFn: () => api.listExpiringBatches(60),
  });

  const products = productsQuery.data ?? [];
  const movements = movementsQuery.data ?? [];
  const expiring = expiringQuery.data ?? [];

  const stats = useMemo(() => {
    const stockValue = products.reduce(
      (sum, product) => sum + product.stockQuantity * product.costPrice,
      0,
    );
    const low = products.filter((product) => stockState(product) === "low").length;
    const out = products.filter((product) => stockState(product) === "out").length;
    return { stockValue: Math.round(stockValue), low, out };
  }, [products]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
      if (stockFilter !== "all" && stockState(product) !== stockFilter) return false;
      if (!term) return true;
      return (
        product.nameFr.toLowerCase().includes(term) ||
        (product.nameAr ?? "").toLowerCase().includes(term) ||
        product.barcodes.some((barcode) => barcode.barcode.includes(term))
      );
    });
  }, [products, search, stockFilter]);

  const openAdjust = (product?: Product, type: MovementType = "loss", quantity = 0) => {
    if (product) setPrefill({ product, type, quantity });
    else setPrefill(null);
    setAdjustOpen(true);
  };

  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title="Stock control"
        description="Every stock change is written to an immutable movement log. Adjustments need a reason and are audited."
        actions={
          <Button icon={SlidersHorizontal} onClick={() => openAdjust()}>
            Record stock change
          </Button>
        }
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Stock value at cost"
          value={formatMoney(stats.stockValue)}
          hint={`${products.length} active products`}
          icon={Wallet}
        />
        <StatCard label="Low stock" value={String(stats.low)} hint="At or below minimum" icon={TriangleAlert} tone="warning" />
        <StatCard label="Out of stock" value={String(stats.out)} hint="Cannot sell unless override" icon={PackageX} tone="danger" />
        <StatCard
          label="Expiring within 60 days"
          value={String(expiring.length)}
          hint="Tracked batches with remaining quantity"
          icon={CalendarClock}
          tone="info"
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "levels", label: "Stock levels" },
            { value: "movements", label: "Movement log" },
            { value: "expiring", label: "Expiring batches" },
          ]}
        />
        {tab === "levels" ? (
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products…"
              containerClassName="w-full sm:w-56"
            />
            <Select
              value={stockFilter}
              onChange={(event) => setStockFilter(event.target.value)}
              className="h-9 w-36 text-xs"
            >
              <option value="all">Any stock</option>
              <option value="in">Healthy</option>
              <option value="low">Low</option>
              <option value="out">Out</option>
            </Select>
          </div>
        ) : null}
      </div>

      {tab === "levels" ? (
        <Card className="overflow-hidden">
          {productsQuery.isLoading ? (
            <LoadingBlock />
          ) : productsQuery.isError ? (
            <div className="p-4">
              <ErrorBlock message="Could not load stock levels." />
            </div>
          ) : filteredProducts.length === 0 ? (
            <EmptyState icon={Boxes} title="No products match" description="Change the search or filter." />
          ) : (
            <div className="scroll-thin overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Unit</th>
                    <th className="text-right">On hand</th>
                    <th className="text-right">Minimum</th>
                    <th className="text-right">Cost value</th>
                    <th>Status</th>
                    <th className="text-right">Adjust</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => {
                    const state = stockState(product);
                    return (
                      <tr key={product.id}>
                        <td>
                          <p className="text-[11.5px] font-semibold text-ink">{product.nameFr}</p>
                          <p className="text-[10px] text-faint">{product.nameAr ?? product.categoryName ?? "—"}</p>
                        </td>
                        <td className="text-[11px] text-muted">{product.categoryName ?? "—"}</td>
                        <td className="text-[10.5px] text-muted">{unitLabel(product.unitType)}</td>
                        <td className="num text-right">
                          <span
                            className={cn(
                              "text-[12.5px] font-semibold",
                              state === "out" ? "text-danger" : state === "low" ? "text-warning" : "text-ink",
                            )}
                          >
                            {formatQuantity(product.stockQuantity)}
                          </span>{" "}
                          <span className="text-[9.5px] text-faint">
                            {shortUnit(product.unitType)}
                          </span>
                        </td>
                        <td className="num text-right text-[11px] text-muted">
                          {formatQuantity(product.minStock)}
                        </td>
                        <td className="num text-right text-[11px] text-muted">
                          {formatMoney(Math.round(product.stockQuantity * product.costPrice))}
                        </td>
                        <td>
                          <Badge
                            tone={state === "out" ? "danger" : state === "low" ? "warning" : "success"}
                          >
                            {state === "out" ? "Out" : state === "low" ? "Low" : "Healthy"}
                          </Badge>
                        </td>
                        <td className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => openAdjust(product)}>
                            Adjust
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {tab === "movements" ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-faint" />
              <span className="text-[12px] font-semibold text-ink">All stock movements</span>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <Select
                value={movementProduct}
                onChange={(event) => setMovementProduct(event.target.value)}
                className="h-9 w-48 text-xs"
              >
                <option value="">All products</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.nameFr}
                  </option>
                ))}
              </Select>
              <Select
                value={movementType}
                onChange={(event) => setMovementType(event.target.value)}
                className="h-9 w-40 text-xs"
              >
                <option value="">All types</option>
                {[
                  "purchase",
                  "sale",
                  "customer_return",
                  "supplier_return",
                  "loss",
                  "expiry",
                  "adjustment",
                ].map((type) => (
                  <option key={type} value={type}>
                    {movementLabel(type)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {movementsQuery.isLoading ? (
            <LoadingBlock />
          ) : movementsQuery.isError ? (
            <ErrorBlock message="Could not load movements." />
          ) : movements.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No movements" description="Stock changes will be logged here." />
          ) : (
            <div className="scroll-thin overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Product</th>
                    <th>Type</th>
                    <th className="text-right">Change</th>
                    <th>Reason</th>
                    <th>By</th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement) => (
                    <tr key={movement.id}>
                      <td className="whitespace-nowrap text-[10.5px] text-muted">
                        {formatDateTime(movement.createdAt)}
                      </td>
                      <td className="text-[11.5px] font-medium text-ink">{movement.productName}</td>
                      <td>
                        <Badge tone={movementTone[movement.movementType] ?? "neutral"}>
                          {movementLabel(movement.movementType)}
                        </Badge>
                      </td>
                      <td
                        className={cn(
                          "num text-right text-[11.5px] font-semibold",
                          movement.quantity < 0 ? "text-danger" : "text-success",
                        )}
                      >
                        {movement.quantity > 0 ? "+" : ""}
                        {formatQuantity(movement.quantity)}
                      </td>
                      <td className="max-w-[260px] truncate text-[11px] text-muted" title={movement.reason ?? ""}>
                        {movement.reason ?? "—"}
                      </td>
                      <td className="text-[11px] text-muted">{movement.userName ?? "—"}</td>
                      <td className="text-[10px] text-faint">
                        {movement.saleId
                          ? `Sale ${movement.saleId.slice(0, 8)}…`
                          : movement.purchaseId
                            ? `Purchase #${movement.purchaseId}`
                            : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {tab === "expiring" ? (
        <Card className="overflow-hidden">
          <CardHeader
            title="Expiring batches"
            description="Batches with an expiry date in the next 60 days, earliest first."
            action={<Badge tone={expiring.length > 0 ? "warning" : "neutral"}>{expiring.length}</Badge>}
          />
          {expiringQuery.isLoading ? (
            <LoadingBlock />
          ) : expiring.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No expiring batches"
              description="Enable expiry tracking on products and enter expiry dates when receiving purchases."
            />
          ) : (
            <div className="scroll-thin overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Expiry</th>
                    <th className="text-right">Remaining</th>
                    <th>Received</th>
                    <th>Status</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {expiring.map((batch: ExpiringBatch) => {
                    const product = products.find((item) => item.id === batch.productId);
                    return (
                      <tr key={batch.id}>
                        <td className="text-[11.5px] font-medium text-ink">{batch.productName}</td>
                        <td className="text-[11px] text-muted">{formatDate(batch.expiryDate)}</td>
                        <td className="num text-right text-[11.5px]">
                          {formatQuantity(batch.quantityRemaining)}
                          {product ? ` ${shortUnit(product.unitType)}` : ""}
                        </td>
                        <td className="text-[10.5px] text-faint">{formatDate(batch.receivedAt)}</td>
                        <td>
                          <Badge tone={batch.daysLeft <= 0 ? "danger" : batch.daysLeft <= 7 ? "warning" : "neutral"}>
                            {batch.daysLeft <= 0 ? "Expired" : `${batch.daysLeft} days left`}
                          </Badge>
                        </td>
                        <td className="text-right">
                          {product ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                openAdjust(product, "expiry", batch.quantityRemaining)
                              }
                            >
                              Record expiry
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      <div className="mt-3">
        <InlineNote tone="info">
          Sales and purchases update stock automatically. Use manual adjustments only for counts,
          breakage, expiry or supplier returns — every entry records the user, time and reason.
        </InlineNote>
      </div>

      <AdjustStockModal
        open={adjustOpen}
        onClose={() => {
          setAdjustOpen(false);
          setPrefill(null);
        }}
        products={products}
        prefill={prefill}
        onSaved={() => {
          queryClient.invalidateQueries();
          setAdjustOpen(false);
          setPrefill(null);
        }}
      />
    </>
  );
}

function AdjustStockModal({
  open,
  onClose,
  products,
  prefill,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  prefill: { product: Product; type: MovementType; quantity: number } | null;
  onSaved: () => void;
}) {
  const [productId, setProductId] = useState("");
  const [movementType, setMovementType] = useState<MovementType>("loss");
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const selectedConfig = manualTypes.find((type) => type.value === movementType);
  const resolvedSign =
    selectedConfig?.sign === "both" ? direction : selectedConfig?.sign ?? "out";

  // Sync prefill whenever the modal opens with new context.
  const prefillKey = prefill ? `${prefill.product.id}-${prefill.type}-${prefill.quantity}` : "none";
  useEffect(() => {
    if (!open) return;
    setProductId(prefill ? String(prefill.product.id) : "");
    setMovementType(prefill?.type ?? "loss");
    setDirection("out");
    setQuantity(prefill && prefill.quantity > 0 ? String(prefill.quantity) : "");
    setReason("");
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefillKey]);

  const selectedProduct = products.find((product) => product.id === Number(productId));
  const parsedQuantity = parseQuantityInput(quantity);
  const delta = (resolvedSign === "in" ? 1 : -1) * parsedQuantity;
  const resultingStock = selectedProduct ? selectedProduct.stockQuantity + delta : 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedProduct) {
      toast.error("Choose a product.");
      return;
    }
    if (parsedQuantity <= 0) {
      toast.error("Quantity must be greater than zero.");
      return;
    }
    if (!reason.trim()) {
      toast.error("A reason is required.");
      return;
    }
    setBusy(true);
    try {
      await api.adjustStock({
        productId: selectedProduct.id,
        movementType,
        quantityDelta: delta,
        reason: reason.trim(),
      });
      toast.success("Stock movement recorded");
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
      title="Record a stock change"
      description="This writes a stock movement and updates the product quantity."
      size="md"
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
        <Field label="Product" required>
          <Select value={productId} onChange={(event) => setProductId(event.target.value)}>
            <option value="">Choose a product…</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.nameFr} · {formatQuantity(product.stockQuantity)} {shortUnit(product.unitType)} in stock
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Movement type" required>
            <Select
              value={movementType}
              onChange={(event) => {
                setMovementType(event.target.value as MovementType);
                setDirection("out");
              }}
            >
              {manualTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Direction">
            <Select
              value={resolvedSign}
              onChange={(event) => setDirection(event.target.value as "out" | "in")}
              disabled={selectedConfig?.sign !== "both"}
            >
              <option value="out">Remove from stock (−)</option>
              <option value="in">Add to stock (+)</option>
            </Select>
          </Field>
        </div>

        <Field
          label={`Quantity (${selectedProduct ? shortUnit(selectedProduct.unitType) : "units"})`}
          required
          hint={
            selectedProduct
              ? `${formatQuantity(selectedProduct.stockQuantity)} in stock now → ${formatQuantity(
                  Math.max(0, resultingStock),
                )} after this entry`
              : "Choose a product to see the resulting stock."
          }
        >
          <Input
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            inputMode="decimal"
            placeholder="0"
          />
        </Field>

        {selectedProduct && resultingStock < 0 ? (
          <InlineNote tone="danger">
            This adjustment would make stock negative. It will be rejected unless negative stock
            is allowed in Settings.
          </InlineNote>
        ) : null}

        <Field label="Reason" required>
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Broken bottle, stock count, expired milk…"
          />
        </Field>

        <div className="flex items-center gap-2 rounded-xl bg-app px-3 py-2 text-[10.5px] text-muted">
          {resolvedSign === "in" ? (
            <ArrowDownToLine className="h-3.5 w-3.5 text-success" />
          ) : (
            <ArrowUpFromLine className="h-3.5 w-3.5 text-danger" />
          )}
          The movement log stores {resolvedSign === "in" ? "+" : "−"}
          {formatQuantity(parsedQuantity)} for this product, with your name and the time.
        </div>
      </form>
    </Modal>
  );
}
