import { useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  Barcode,
  Layers,
  Package,
  Pencil,
  Plus,
  SearchX,
  Trash2,
} from "lucide-react";

import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  centsToInput,
  formatMoney,
  formatQuantity,
  parseMoneyInput,
  parseQuantityInput,
  shortUnit,
  stockState,
  unitLabel,
} from "../lib/format";
import type {
  BarcodeInput,
  Category,
  CreateProductInput,
  Product,
  UpdateProductInput,
} from "../lib/types";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBlock,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Switch,
  cn,
} from "../components/ui";

interface BarcodeRow {
  barcode: string;
  unitsPerBarcode: string;
  label: string;
}

interface ProductFormProps {
  open: boolean;
  product: Product | null;
  categories: Category[];
  onClose: () => void;
}

function ProductFormModal({ open, product, categories, onClose }: ProductFormProps) {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [nameFr, setNameFr] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [unitType, setUnitType] = useState<"unit" | "weight">("unit");
  const [priceRetail, setPriceRetail] = useState("");
  const [priceWholesale, setPriceWholesale] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [vatRate, setVatRate] = useState("0");
  const [minStock, setMinStock] = useState("0");
  const [openingStock, setOpeningStock] = useState("0");
  const [trackExpiry, setTrackExpiry] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [barcodes, setBarcodes] = useState<BarcodeRow[]>([
    { barcode: "", unitsPerBarcode: "1", label: "" },
  ]);

  useEffect(() => {
    if (!open) return;
    setNameFr(product?.nameFr ?? "");
    setNameAr(product?.nameAr ?? "");
    setCategoryId(product?.categoryId ? String(product.categoryId) : "");
    setUnitType(product?.unitType ?? "unit");
    setPriceRetail(product ? centsToInput(product.priceRetail) : "");
    setPriceWholesale(product?.priceWholesale ? centsToInput(product.priceWholesale) : "");
    setCostPrice(product ? centsToInput(product.costPrice) : "");
    setVatRate(product ? String(product.vatRate) : "0");
    setMinStock(product ? String(product.minStock) : "0");
    setOpeningStock("0");
    setTrackExpiry(product?.trackExpiry ?? false);
    setIsActive(product?.isActive ?? true);
    setBarcodes(
      product && product.barcodes.length > 0
        ? product.barcodes.map((barcode) => ({
            barcode: barcode.barcode,
            unitsPerBarcode: String(barcode.unitsPerBarcode),
            label: barcode.label ?? "",
          }))
        : [{ barcode: "", unitsPerBarcode: "1", label: "" }],
    );
  }, [open, product]);

  const addBarcodeRow = () =>
    setBarcodes((current) => [...current, { barcode: "", unitsPerBarcode: "1", label: "" }]);

  const updateBarcodeRow = (index: number, patch: Partial<BarcodeRow>) =>
    setBarcodes((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );

  const removeBarcodeRow = (index: number) =>
    setBarcodes((current) => current.filter((_, rowIndex) => rowIndex !== index));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!nameFr.trim()) {
      toast.error("French product name is required.");
      return;
    }
    const cleanBarcodes: BarcodeInput[] = barcodes
      .filter((row) => row.barcode.trim())
      .map((row) => ({
        barcode: row.barcode.trim(),
        unitsPerBarcode: Math.max(1, Math.round(Number(row.unitsPerBarcode) || 1)),
        label: row.label.trim() || null,
      }));
    const uniqueBarcodes = new Set(cleanBarcodes.map((barcode) => barcode.barcode));
    if (uniqueBarcodes.size !== cleanBarcodes.length) {
      toast.error("The same barcode is listed twice.");
      return;
    }

    const base: UpdateProductInput = {
      nameFr: nameFr.trim(),
      nameAr: nameAr.trim() || null,
      categoryId: categoryId ? Number(categoryId) : null,
      unitType,
      priceRetail: parseMoneyInput(priceRetail),
      priceWholesale: priceWholesale.trim() ? parseMoneyInput(priceWholesale) : null,
      costPrice: parseMoneyInput(costPrice),
      vatRate: Math.max(0, Math.min(100, Number(vatRate) || 0)),
      minStock: parseQuantityInput(minStock),
      trackExpiry,
      isActive,
      barcodes: cleanBarcodes,
    };

    setBusy(true);
    try {
      if (product) {
        await api.updateProduct(product.id, base);
        toast.success("Product updated");
      } else {
        const input: CreateProductInput = {
          ...base,
          openingStock: parseQuantityInput(openingStock),
        };
        await api.createProduct(input);
        toast.success("Product created");
      }
      queryClient.invalidateQueries();
      onClose();
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
      title={product ? "Edit product" : "New product"}
      description={
        product
          ? "Changing prices or names does not alter past sale lines."
          : "Add a product to the catalogue. Opening stock is recorded as an adjustment."
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => formRef.current?.requestSubmit()}>
            {product ? "Save changes" : "Create product"}
          </Button>
        </>
      }
    >
      <form ref={formRef} onSubmit={submit} className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name (French)" required>
            <Input value={nameFr} onChange={(event) => setNameFr(event.target.value)} placeholder="Coca-Cola 1L" />
          </Field>
          <Field label="Name (Arabic)">
            <Input
              dir="rtl"
              value={nameAr}
              onChange={(event) => setNameAr(event.target.value)}
              placeholder="كوكا كولا"
            />
          </Field>
          <Field label="Category">
            <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">Uncategorised</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.nameFr}
                  {!category.isActive ? " (inactive)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Unit type" hint="Weight products are sold by kg with decimal quantities.">
            <Select
              value={unitType}
              onChange={(event) => setUnitType(event.target.value as "unit" | "weight")}
            >
              <option value="unit">Unit — pieces, bottles, packs</option>
              <option value="weight">Weight — kg / g</option>
            </Select>
          </Field>
        </div>

        <div className="rounded-xl border border-line bg-app/40 p-3.5">
          <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-faint">
            Pricing (in dinars)
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Retail price" required>
              <Input
                value={priceRetail}
                onChange={(event) => setPriceRetail(event.target.value)}
                inputMode="decimal"
                placeholder="120"
              />
            </Field>
            <Field label="Wholesale price">
              <Input
                value={priceWholesale}
                onChange={(event) => setPriceWholesale(event.target.value)}
                inputMode="decimal"
                placeholder="110"
              />
            </Field>
            <Field label="Cost price" required>
              <Input
                value={costPrice}
                onChange={(event) => setCostPrice(event.target.value)}
                inputMode="decimal"
                placeholder="75"
              />
            </Field>
            <Field label="VAT rate (%)">
              <Input
                value={vatRate}
                onChange={(event) => setVatRate(event.target.value)}
                inputMode="decimal"
                placeholder="19"
              />
            </Field>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Minimum stock" hint="Used for low-stock alerts.">
            <Input
              value={minStock}
              onChange={(event) => setMinStock(event.target.value)}
              inputMode="decimal"
            />
          </Field>
          {!product ? (
            <Field label="Opening stock" hint="Recorded as an opening adjustment.">
              <Input
                value={openingStock}
                onChange={(event) => setOpeningStock(event.target.value)}
                inputMode="decimal"
              />
            </Field>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-line p-3">
            <Switch
              checked={trackExpiry}
              onChange={setTrackExpiry}
              label="Track expiry dates"
              description="Purchases will request an expiry date and batches can be monitored."
            />
          </div>
          <div className="rounded-xl border border-line p-3">
            <Switch
              checked={isActive}
              onChange={setIsActive}
              label="Active for selling"
              description="Archived products stay in history but cannot be sold."
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-[12px] font-semibold text-ink">Barcodes</p>
              <p className="text-[10.5px] text-muted">
                A product can have several barcodes (single unit, pack of 6, carton).
              </p>
            </div>
            <Button variant="secondary" size="sm" icon={Plus} onClick={addBarcodeRow}>
              Add barcode
            </Button>
          </div>
          <div className="space-y-2">
            {barcodes.map((row, index) => (
              <div key={index} className="grid gap-2 rounded-xl border border-line p-2.5 sm:grid-cols-[1fr_110px_1fr_34px]">
                <Input
                  value={row.barcode}
                  onChange={(event) => updateBarcodeRow(index, { barcode: event.target.value })}
                  placeholder="Barcode"
                  className="h-9 font-mono text-xs"
                />
                <Input
                  value={row.unitsPerBarcode}
                  onChange={(event) =>
                    updateBarcodeRow(index, { unitsPerBarcode: event.target.value })
                  }
                  placeholder="Units"
                  inputMode="numeric"
                  className="h-9 text-xs"
                  title="Units per barcode"
                />
                <Input
                  value={row.label}
                  onChange={(event) => updateBarcodeRow(index, { label: event.target.value })}
                  placeholder="Label (Carton x12)"
                  className="h-9 text-xs"
                />
                <button
                  type="button"
                  onClick={() => removeBarcodeRow(index)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-faint transition hover:bg-danger-soft hover:text-danger"
                  aria-label="Remove barcode"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}

function CategoriesModal({
  open,
  onClose,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  categories: Category[];
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Category | null>(null);
  const [nameFr, setNameFr] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setEditing(null);
    setNameFr("");
    setNameAr("");
    setIsActive(true);
  };

  const startEdit = (category: Category) => {
    setEditing(category);
    setNameFr(category.nameFr);
    setNameAr(category.nameAr ?? "");
    setIsActive(category.isActive);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!nameFr.trim()) {
      toast.error("French category name is required.");
      return;
    }
    setBusy(true);
    try {
      const input = {
        nameFr: nameFr.trim(),
        nameAr: nameAr.trim() || null,
        isActive,
      };
      if (editing) {
        await api.updateCategory(editing.id, input);
        toast.success("Category updated");
      } else {
        await api.createCategory(input);
        toast.success("Category created");
      }
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      reset();
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
      title="Categories"
      description="Categories help organise the POS grid and reports."
      size="md"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <form onSubmit={save} className="rounded-xl border border-line bg-app/40 p-3.5">
        <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-faint">
          {editing ? `Edit ${editing.nameFr}` : "New category"}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            value={nameFr}
            onChange={(event) => setNameFr(event.target.value)}
            placeholder="French name"
            className="h-9 text-xs"
          />
          <Input
            dir="rtl"
            value={nameAr}
            onChange={(event) => setNameAr(event.target.value)}
            placeholder="الاسم العربي"
            className="h-9 text-xs"
          />
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--brand)]"
            />
            Active
          </label>
          <div className="flex gap-2">
            {editing ? (
              <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" size="sm" loading={busy}>
              {editing ? "Update" : "Add category"}
            </Button>
          </div>
        </div>
      </form>

      <div className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line">
        {categories.length === 0 ? (
          <EmptyState compact title="No categories yet" />
        ) : (
          categories.map((category) => (
            <div key={category.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-app text-faint">
                <Layers className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11.5px] font-medium text-ink">{category.nameFr}</p>
                <p dir="rtl" className="text-[10px] text-faint">
                  {category.nameAr ?? "—"}
                </p>
              </div>
              <Badge tone={category.isActive ? "success" : "neutral"}>
                {category.isActive ? "Active" : "Inactive"}
              </Badge>
              <button
                type="button"
                onClick={() => startEdit(category)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-faint hover:bg-app hover:text-ink"
                aria-label={`Edit ${category.nameFr}`}
              >
                <Pencil className="h-3 w-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}

export default function ProductsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [categoryId, setCategoryId] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<string>("all");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);

  const canEdit = user?.role === "owner" || user?.role === "manager";

  const productsQuery = useQuery({
    queryKey: ["products", deferredSearch, categoryId, stockFilter, includeInactive],
    queryFn: () =>
      api.listProducts({
        search: deferredSearch || null,
        categoryId: categoryId === "all" ? null : Number(categoryId),
        stock: stockFilter === "all" ? null : stockFilter,
        includeInactive,
      }),
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories", "all"],
    queryFn: () => api.listCategories(true),
  });

  const categories = categoriesQuery.data ?? [];
  const products = productsQuery.data ?? [];

  const stats = useMemo(() => {
    const low = products.filter((product) => stockState(product) === "low").length;
    const out = products.filter((product) => stockState(product) === "out").length;
    return { low, out, total: products.length };
  }, [products]);

  const toggleArchive = async () => {
    if (!archiveTarget) return;
    setBusy(true);
    try {
      await api.setProductActive(archiveTarget.id, !archiveTarget.isActive);
      toast.success(archiveTarget.isActive ? "Product archived" : "Product restored");
      setArchiveTarget(null);
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Catalogue"
        title="Products"
        description="Manage prices, barcodes, stock thresholds and expiry tracking. All prices are stored in centimes."
        actions={
          canEdit ? (
            <>
              <Button variant="secondary" icon={Layers} onClick={() => setCategoriesOpen(true)}>
                Categories
              </Button>
              <Button
                icon={Plus}
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                New product
              </Button>
            </>
          ) : null
        }
      />

      <Card className="mb-3">
        <div className="flex flex-wrap items-center gap-2.5 p-3">
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or barcode…"
            containerClassName="w-full sm:w-64"
          />
          <Select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="h-9 w-full text-xs sm:w-44"
          >
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.nameFr}
              </option>
            ))}
          </Select>
          <Select
            value={stockFilter}
            onChange={(event) => setStockFilter(event.target.value)}
            className="h-9 w-full text-xs sm:w-36"
          >
            <option value="all">Any stock</option>
            <option value="in">In stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </Select>
          <label className="flex items-center gap-2 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(event) => setIncludeInactive(event.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--brand)]"
            />
            Show archived
          </label>
          <div className="ml-auto flex items-center gap-1.5">
            <Badge tone="neutral">{stats.total} products</Badge>
            {stats.low > 0 ? <Badge tone="warning">{stats.low} low</Badge> : null}
            {stats.out > 0 ? <Badge tone="danger">{stats.out} out</Badge> : null}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {productsQuery.isLoading ? (
          <LoadingBlock />
        ) : productsQuery.isError ? (
          <div className="p-4">
            <ErrorBlock message="Could not load products." />
          </div>
        ) : products.length === 0 ? (
          <EmptyState
            icon={search ? SearchX : Package}
            title={search ? "No matching products" : "No products yet"}
            description={
              search
                ? "Try a different name, barcode or filter."
                : canEdit
                  ? "Create your first product, or load demo data from Settings."
                  : "Ask an owner or manager to add products."
            }
            action={
              canEdit && !search ? (
                <Button
                  size="sm"
                  icon={Plus}
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  New product
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Unit</th>
                  <th className="text-right">Retail</th>
                  <th className="text-right">Wholesale</th>
                  <th className="text-right">Cost</th>
                  <th className="text-right">Stock</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const state = stockState(product);
                  return (
                    <tr key={product.id}>
                      <td>
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-app text-faint">
                            <Package className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[11.5px] font-semibold text-ink">
                              {product.nameFr}
                            </p>
                            <p
                              dir="rtl"
                              className="truncate text-[10px] text-faint"
                              title={product.nameAr ?? ""}
                            >
                              {product.nameAr ?? product.categoryName ?? "—"}
                            </p>
                            {product.barcodes.length > 0 ? (
                              <p className="mt-0.5 flex items-center gap-1 font-mono text-[9px] text-faint">
                                <Barcode className="h-2.5 w-2.5" />
                                {product.barcodes[0].barcode}
                                {product.barcodes.length > 1
                                  ? ` +${product.barcodes.length - 1}`
                                  : ""}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="text-[11px] text-muted">{product.categoryName ?? "—"}</td>
                      <td className="text-[10.5px] text-muted">{unitLabel(product.unitType)}</td>
                      <td className="num text-right text-[11.5px] font-semibold text-ink">
                        {formatMoney(product.priceRetail)}
                      </td>
                      <td className="num text-right text-[11px] text-muted">
                        {product.priceWholesale ? formatMoney(product.priceWholesale) : "—"}
                      </td>
                      <td className="num text-right text-[11px] text-muted">
                        {formatMoney(product.costPrice)}
                      </td>
                      <td className="num text-right">
                        <span
                          className={cn(
                            "font-semibold",
                            state === "out"
                              ? "text-danger"
                              : state === "low"
                                ? "text-warning"
                                : "text-ink",
                          )}
                        >
                          {formatQuantity(product.stockQuantity)}
                        </span>
                        <span className="ml-1 text-[9.5px] text-faint">
                          {shortUnit(product.unitType)}
                        </span>
                        <p className="text-[9px] text-faint">
                          min {formatQuantity(product.minStock)}
                        </p>
                      </td>
                      <td>
                        <div className="flex flex-col items-start gap-1">
                          <Badge
                            tone={
                              !product.isActive
                                ? "neutral"
                                : state === "out"
                                  ? "danger"
                                  : state === "low"
                                    ? "warning"
                                    : "success"
                            }
                          >
                            {!product.isActive
                              ? "Archived"
                              : state === "out"
                                ? "Out"
                                : state === "low"
                                  ? "Low"
                                  : "In stock"}
                          </Badge>
                          {product.trackExpiry ? (
                            <span className="text-[9px] text-faint">Expiry tracked</span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          {canEdit ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditing(product);
                                  setFormOpen(true);
                                }}
                                className="flex h-7 w-7 items-center justify-center rounded-md text-faint transition hover:bg-app hover:text-ink"
                                title="Edit product"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setArchiveTarget(product)}
                                className={cn(
                                  "flex h-7 w-7 items-center justify-center rounded-md text-faint transition hover:bg-app",
                                  product.isActive ? "hover:text-warning" : "hover:text-success",
                                )}
                                title={product.isActive ? "Archive product" : "Restore product"}
                              >
                                {product.isActive ? (
                                  <Archive className="h-3 w-3" />
                                ) : (
                                  <ArchiveRestore className="h-3 w-3" />
                                )}
                              </button>
                            </>
                          ) : (
                            <span className="text-[10px] text-faint">View only</span>
                          )}
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

      <ProductFormModal
        open={formOpen}
        product={editing}
        categories={categories}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />

      <CategoriesModal
        open={categoriesOpen}
        onClose={() => setCategoriesOpen(false)}
        categories={categories}
      />

      <ConfirmDialog
        open={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        onConfirm={toggleArchive}
        loading={busy}
        destructive={archiveTarget?.isActive}
        title={archiveTarget?.isActive ? "Archive this product?" : "Restore this product?"}
        description={
          archiveTarget?.isActive
            ? "The product disappears from the POS and stock lists, but stays in all past sale lines."
            : "The product will be available for sale again with its current stock."
        }
        confirmLabel={archiveTarget?.isActive ? "Archive" : "Restore"}
      >
        {archiveTarget ? (
          <p className="rounded-lg bg-app px-3 py-2 text-[11.5px] font-medium text-ink">
            {archiveTarget.nameFr}
          </p>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
