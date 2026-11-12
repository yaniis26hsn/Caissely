import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarClock,
  Copy,
  Database,
  Download,
  FileText,
  History,
  Info,
  KeyRound,
  Languages,
  Lock,
  Percent,
  RefreshCw,
  Store,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  formatBytes,
  formatDate,
  formatDateTime,
  roleLabel,
} from "../lib/format";
import type { AuditEntry, BackupFile, ShopSettingsInput } from "../lib/types";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorBlock,
  Field,
  InlineNote,
  Input,
  LoadingBlock,
  PageHeader,
  Select,
  Switch,
  Textarea,
  cn,
} from "../components/ui";

type Tab = "profile" | "tax" | "security" | "data" | "audit" | "about";

const tabs: Array<{ value: Tab; label: string; icon: LucideIcon }> = [
  { value: "profile", label: "Shop profile", icon: Store },
  { value: "tax", label: "Tax & receipt", icon: Percent },
  { value: "security", label: "Security", icon: Lock },
  { value: "data", label: "Data & backups", icon: Database },
  { value: "audit", label: "Audit log", icon: History },
  { value: "about", label: "About", icon: Info },
];

function emptyForm(): ShopSettingsInput {
  return {
    shopName: "",
    address: null,
    phone: null,
    rc: null,
    nif: null,
    nis: null,
    ai: null,
    vatEnabled: false,
    stampDutyEnabled: false,
    defaultLanguage: "fr",
    receiptFooter: null,
    allowNegativeStock: false,
  };
}

function SettingsTabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[12px] font-semibold transition",
        active
          ? "bg-brand-soft text-brand"
          : "text-muted hover:bg-app hover:text-ink",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line/70 py-2.5 last:border-0">
      <span className="text-[11px] font-medium text-muted">{label}</span>
      <span className="max-w-full text-right text-[11.5px] font-medium text-ink">
        {children}
      </span>
    </div>
  );
}

function CopyPathButton({ value }: { value: string }) {
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast.success("Path copied");
        } catch {
          toast.error("Could not copy the path");
        }
      }}
      className="ml-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-faint transition hover:bg-app hover:text-ink"
      title="Copy path"
    >
      <Copy className="h-3 w-3" />
    </button>
  );
}

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("profile");
  const [form, setForm] = useState<ShopSettingsInput>(emptyForm);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["shop-settings"],
    queryFn: api.getShopSettings,
  });

  const appInfoQuery = useQuery({
    queryKey: ["app-info"],
    queryFn: api.getAppInfo,
  });

  const licenseQuery = useQuery({
    queryKey: ["license-info"],
    queryFn: api.getLicenseInfo,
  });

  const backupsQuery = useQuery({
    queryKey: ["backups"],
    queryFn: api.listBackups,
  });

  const auditQuery = useQuery({
    queryKey: ["audit"],
    queryFn: () => api.listAudit(150),
    enabled: tab === "audit",
  });

  useEffect(() => {
    const settings = settingsQuery.data;
    if (!settings) return;
    setForm({
      shopName: settings.shopName,
      address: settings.address ?? null,
      phone: settings.phone ?? null,
      rc: settings.rc ?? null,
      nif: settings.nif ?? null,
      nis: settings.nis ?? null,
      ai: settings.ai ?? null,
      vatEnabled: settings.vatEnabled,
      stampDutyEnabled: settings.stampDutyEnabled,
      defaultLanguage: settings.defaultLanguage,
      receiptFooter: settings.receiptFooter ?? null,
      allowNegativeStock: settings.allowNegativeStock,
    });
  }, [settingsQuery.data]);

  const backups = backupsQuery.data ?? [];
  const audit = auditQuery.data ?? [];

  const totalBackupSize = useMemo(
    () => backups.reduce((sum, backup) => sum + backup.sizeBytes, 0),
    [backups],
  );

  const setText = (
    key: "shopName" | "address" | "phone" | "rc" | "nif" | "nis" | "ai" | "receiptFooter",
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      [key]: key === "shopName" ? value : value.trim() ? value : null,
    }));
  };

  const saveSettings = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!form.shopName.trim()) {
      toast.error("Shop name is required.");
      return;
    }
    setSettingsBusy(true);
    try {
      await api.updateShopSettings({
        ...form,
        shopName: form.shopName.trim(),
        address: form.address?.trim() || null,
        phone: form.phone?.trim() || null,
        rc: form.rc?.trim() || null,
        nif: form.nif?.trim() || null,
        nis: form.nis?.trim() || null,
        ai: form.ai?.trim() || null,
        receiptFooter: form.receiptFooter?.trim() || null,
      });
      await queryClient.invalidateQueries({ queryKey: ["shop-settings"] });
      toast.success("Shop settings saved");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSettingsBusy(false);
    }
  };

  const createBackup = async () => {
    setBackupBusy(true);
    try {
      const backup = await api.backupDatabase();
      await queryClient.invalidateQueries({ queryKey: ["backups"] });
      toast.success("Backup created", { description: backup.path });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBackupBusy(false);
    }
  };

  const runDemoData = async () => {
    setDemoBusy(true);
    try {
      const message = await api.loadDemoData();
      await queryClient.invalidateQueries();
      setDemoOpen(false);
      toast.success("Demo data loaded", { description: message });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDemoBusy(false);
    }
  };

  if (settingsQuery.isLoading) {
    return (
      <>
        <PageHeader eyebrow="Administration" title="Settings" />
        <LoadingBlock label="Loading shop settings…" />
      </>
    );
  }

  if (settingsQuery.isError || !settingsQuery.data) {
    return (
      <>
        <PageHeader eyebrow="Administration" title="Settings" />
        <ErrorBlock message="Could not load shop settings. Only an owner can manage settings." />
      </>
    );
  }

  const settings = settingsQuery.data;

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Settings"
        description="Shop identity, tax behaviour, security, local backups and the audit trail — all stored on this machine."
        actions={
          <>
            <Button
              variant="secondary"
              icon={RefreshCw}
              onClick={() => {
                queryClient.invalidateQueries();
              }}
            >
              Refresh
            </Button>
            <Button icon={Download} onClick={createBackup} loading={backupBusy}>
              Backup now
            </Button>
          </>
        }
      />

      <div className="grid items-start gap-3 lg:grid-cols-[210px_minmax(0,1fr)]">
        <Card className="p-1.5 lg:sticky lg:top-[76px]">
          <div className="scroll-thin flex gap-1 overflow-x-auto lg:flex-col">
            {tabs.map((item) => (
              <SettingsTabButton
                key={item.value}
                active={tab === item.value}
                icon={item.icon}
                label={item.label}
                onClick={() => setTab(item.value)}
              />
            ))}
          </div>
        </Card>

        <div className="min-w-0">
          {tab === "profile" ? (
            <form onSubmit={saveSettings} className="space-y-3">
              <Card>
                <CardHeader
                  title="Shop identity"
                  description="Printed on receipts and shown across the application."
                />
                <div className="grid gap-3 p-4 sm:grid-cols-2">
                  <Field label="Shop name" required>
                    <Input
                      value={form.shopName}
                      onChange={(event) => setText("shopName", event.target.value)}
                      placeholder="Ma Superette"
                    />
                  </Field>
                  <Field label="Phone">
                    <Input
                      value={form.phone ?? ""}
                      onChange={(event) => setText("phone", event.target.value)}
                      placeholder="0550 12 34 56"
                    />
                  </Field>
                  <Field label="Address" className="sm:col-span-2">
                    <Input
                      value={form.address ?? ""}
                      onChange={(event) => setText("address", event.target.value)}
                      placeholder="12 rue Didouche Mourad, Alger"
                    />
                  </Field>
                  <Field label="RC (commercial register)">
                    <Input
                      value={form.rc ?? ""}
                      onChange={(event) => setText("rc", event.target.value)}
                      placeholder="16/00-1234567 B 18"
                    />
                  </Field>
                  <Field label="NIF">
                    <Input
                      value={form.nif ?? ""}
                      onChange={(event) => setText("nif", event.target.value)}
                      placeholder="000216012345678"
                    />
                  </Field>
                  <Field label="NIS">
                    <Input
                      value={form.nis ?? ""}
                      onChange={(event) => setText("nis", event.target.value)}
                      placeholder="000216012345678"
                    />
                  </Field>
                  <Field label="AI (article identifier)">
                    <Input
                      value={form.ai ?? ""}
                      onChange={(event) => setText("ai", event.target.value)}
                      placeholder="000216012345678"
                    />
                  </Field>
                </div>
              </Card>

              <div className="flex items-center justify-between gap-3">
                <p className="text-[10.5px] text-faint">
                  Changes apply to new receipts. Past sales keep their original snapshot.
                </p>
                <Button type="submit" loading={settingsBusy}>
                  Save settings
                </Button>
              </div>
            </form>
          ) : null}

          {tab === "tax" ? (
            <form onSubmit={saveSettings} className="space-y-3">
              <Card>
                <CardHeader
                  title="Tax & receipt"
                  description="VAT is included in displayed prices. Adjust these options with your accountant."
                />
                <div className="space-y-4 p-4">
                  <Switch
                    checked={form.vatEnabled}
                    onChange={(value) =>
                      setForm((current) => ({ ...current, vatEnabled: value }))
                    }
                    label="Enable VAT on sales"
                    description="When enabled, each product's VAT rate is used to split the VAT portion of the sale total."
                  />
                  <Switch
                    checked={form.stampDutyEnabled}
                    onChange={(value) =>
                      setForm((current) => ({ ...current, stampDutyEnabled: value }))
                    }
                    label="Apply stamp duty on cash payments"
                    description="Adds a fixed 1.00 DA stamp duty to cash sales, shown as a separate receipt line."
                  />
                  <Switch
                    checked={form.allowNegativeStock}
                    onChange={(value) =>
                      setForm((current) => ({ ...current, allowNegativeStock: value }))
                    }
                    label="Allow negative stock"
                    description="Off by default. Only enable this if you need to sell items before recording their delivery."
                  />

                  <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
                    <Field
                      label="Receipt language"
                      hint="Used for the receipt footer and default document labels."
                    >
                      <Select
                        value={form.defaultLanguage}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            defaultLanguage: event.target.value,
                          }))
                        }
                      >
                        <option value="fr">French</option>
                        <option value="ar">Arabic</option>
                        <option value="en">English</option>
                      </Select>
                    </Field>
                    <Field label="Receipt footer" className="sm:col-span-2">
                      <Textarea
                        value={form.receiptFooter ?? ""}
                        onChange={(event) => setText("receiptFooter", event.target.value)}
                        placeholder="Thank you for your visit. Keep your receipt."
                        rows={3}
                      />
                    </Field>
                  </div>
                </div>
              </Card>

              <InlineNote tone="info">
                VAT and stamp duty are recorded on each sale at the moment of checkout. Changing
                settings never rewrites past receipts.
              </InlineNote>

              <div className="flex items-center justify-end">
                <Button type="submit" loading={settingsBusy}>
                  Save settings
                </Button>
              </div>
            </form>
          ) : null}

          {tab === "security" ? (
            <div className="grid gap-3 xl:grid-cols-2">
              <PasswordCard />
              <PinCard
                hasPin={user?.hasPin ?? false}
                onPinChanged={(hasPin) => {
                  if (user) updateUser({ ...user, hasPin });
                }}
              />
              <Card className="xl:col-span-2">
                <CardHeader
                  title="Signed in as"
                  description="Sensitive changes are recorded in the audit log."
                />
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">
                    {user?.fullName
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join("")}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-semibold text-ink">{user?.fullName}</p>
                    <p className="text-[10.5px] text-faint">
                      @{user?.username} · {user ? roleLabel(user.role) : ""}
                    </p>
                  </div>
                  <Badge tone="brand" className="ml-auto">
                    Session active
                  </Badge>
                </div>
              </Card>
            </div>
          ) : null}

          {tab === "data" ? (
            <div className="space-y-3">
              <InlineNote tone="warning">
                Your database lives only on this computer. No cloud sync exists — copy backups to a
                USB drive or another machine regularly, especially before reinstalling Windows.
              </InlineNote>

              <Card>
                <CardHeader
                  title="Local backups"
                  description={`${backups.length} backup${backups.length === 1 ? "" : "s"} · ${formatBytes(
                    totalBackupSize,
                  )} total`}
                  action={
                    <Button
                      size="sm"
                      icon={Download}
                      onClick={createBackup}
                      loading={backupBusy}
                    >
                      Create backup
                    </Button>
                  }
                />
                {backupsQuery.isLoading ? (
                  <LoadingBlock label="Reading backup folder…" />
                ) : backupsQuery.isError ? (
                  <div className="p-4">
                    <ErrorBlock message="Could not read the backup folder." />
                  </div>
                ) : backups.length === 0 ? (
                  <EmptyState
                    icon={Database}
                    compact
                    title="No backups yet"
                    description="Create your first backup now. It copies the SQLite file next to the application data."
                  />
                ) : (
                  <div className="divide-y divide-line/70">
                    {backups.map((backup: BackupFile) => (
                      <div key={backup.path} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-app text-faint">
                          <FileText className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-[11px] font-medium text-ink">
                            {backup.name}
                          </p>
                          <p className="truncate text-[9.5px] text-faint">{backup.path}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="num text-[10.5px] font-semibold text-ink">
                            {formatBytes(backup.sizeBytes)}
                          </p>
                          <p className="text-[9px] text-faint">
                            {formatDateTime(backup.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card>
                <CardHeader
                  title="Demo data"
                  description="Creates sample products, suppliers and customers for training."
                  action={<TriangleAlert className="h-4 w-4 text-warning" />}
                />
                <div className="space-y-3 p-4">
                  <p className="text-[11.5px] leading-relaxed text-muted">
                    Demo data can only be loaded when the product catalogue is empty. It adds an
                    Algerian superette catalogue and creates two extra demo accounts:
                  </p>
                  <div className="grid gap-2 text-[11px] sm:grid-cols-2">
                    <div className="rounded-xl border border-line bg-app/40 px-3 py-2">
                      <p className="font-semibold text-ink">Cashier</p>
                      <p className="text-faint">
                        cashier / <span className="font-mono">cashier123</span> · PIN{" "}
                        <span className="font-mono">1111</span>
                      </p>
                    </div>
                    <div className="rounded-xl border border-line bg-app/40 px-3 py-2">
                      <p className="font-semibold text-ink">Stock worker</p>
                      <p className="text-faint">
                        stock / <span className="font-mono">stock123</span> · PIN{" "}
                        <span className="font-mono">2222</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] text-faint">
                      Demo accounts are real accounts on this device — disable them before
                      production use.
                    </p>
                    <Button
                      variant="secondary"
                      icon={Database}
                      onClick={() => setDemoOpen(true)}
                    >
                      Load demo data
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          ) : null}

          {tab === "audit" ? (
            <Card className="overflow-hidden">
              <CardHeader
                title="Audit log"
                description="Who changed what, when — the latest 150 entries."
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={RefreshCw}
                    onClick={() => auditQuery.refetch()}
                    loading={auditQuery.isFetching}
                  >
                    Refresh
                  </Button>
                }
              />
              {auditQuery.isLoading ? (
                <LoadingBlock />
              ) : auditQuery.isError ? (
                <div className="p-4">
                  <ErrorBlock message="Could not load the audit log." />
                </div>
              ) : audit.length === 0 ? (
                <EmptyState
                  icon={History}
                  title="No audit entries yet"
                  description="Sign-ins, sales, stock adjustments and settings changes are recorded here."
                />
              ) : (
                <div className="scroll-thin max-h-[70vh] overflow-y-auto">
                  <table className="table-base">
                    <thead className="sticky top-0 bg-card">
                      <tr>
                        <th>When</th>
                        <th>User</th>
                        <th>Action</th>
                        <th>Entity</th>
                        <th>Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.map((entry: AuditEntry) => (
                        <tr key={entry.id}>
                          <td className="whitespace-nowrap text-[10.5px] text-muted">
                            {formatDateTime(entry.createdAt)}
                          </td>
                          <td className="text-[11px] text-ink">{entry.userName ?? "System"}</td>
                          <td>
                            <Badge
                              tone={
                                entry.action.includes("delete") ||
                                entry.action.includes("deactivate") ||
                                entry.action === "logout"
                                  ? "warning"
                                  : entry.action.includes("create") ||
                                      entry.action === "login"
                                    ? "success"
                                    : "neutral"
                              }
                            >
                              {entry.action}
                            </Badge>
                          </td>
                          <td className="text-[10.5px] text-muted">
                            {entry.entity}
                            {entry.entityId ? ` #${entry.entityId}` : ""}
                          </td>
                          <td
                            className="max-w-[320px] truncate text-[10px] text-faint"
                            title={entry.newValue ?? entry.oldValue ?? ""}
                          >
                            {entry.newValue ?? entry.oldValue ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ) : null}

          {tab === "about" ? (
            <div className="space-y-3">
              <Card>
                <CardHeader
                  title="Application & device"
                  description="Technical details for support and backups."
                />
                {appInfoQuery.isLoading ? (
                  <LoadingBlock />
                ) : appInfoQuery.isError || !appInfoQuery.data ? (
                  <div className="p-4">
                    <ErrorBlock message="Could not read application information." />
                  </div>
                ) : (
                  <div className="px-4 py-1">
                    <InfoRow label="Version">
                      <span className="font-mono">{appInfoQuery.data.version}</span>
                    </InfoRow>
                    <InfoRow label="Device">
                      <span>
                        {appInfoQuery.data.deviceName}{" "}
                        <span className="font-mono text-faint">
                          ({appInfoQuery.data.deviceId.slice(0, 8)}…)
                        </span>
                      </span>
                    </InfoRow>
                    <InfoRow label="Receipt prefix">
                      <span className="font-mono">{appInfoQuery.data.receiptPrefix}</span>
                    </InfoRow>
                    <InfoRow label="Database path">
                      <span className="flex items-center justify-end">
                        <span className="break-all font-mono text-[10.5px]">
                          {appInfoQuery.data.dbPath}
                        </span>
                        <CopyPathButton value={appInfoQuery.data.dbPath} />
                      </span>
                    </InfoRow>
                    <InfoRow label="Backup folder">
                      <span className="flex items-center justify-end">
                        <span className="break-all font-mono text-[10.5px]">
                          {appInfoQuery.data.backupDir}
                        </span>
                        <CopyPathButton value={appInfoQuery.data.backupDir} />
                      </span>
                    </InfoRow>
                  </div>
                )}
              </Card>

              <Card>
                <CardHeader
                  title="Licence"
                  description="Offline licence stored in the local database."
                  action={
                    <Badge
                      tone={
                        licenseQuery.data?.enforced
                          ? (licenseQuery.data?.daysRemaining ?? 0) > 0
                            ? "success"
                            : "danger"
                          : "neutral"
                      }
                      dot
                    >
                      {licenseQuery.data?.enforced
                        ? (licenseQuery.data?.daysRemaining ?? 0) > 0
                          ? "Active"
                          : "Expired"
                        : "Not enforced"}
                    </Badge>
                  }
                />
                {licenseQuery.isLoading ? (
                  <LoadingBlock />
                ) : licenseQuery.isError || !licenseQuery.data ? (
                  <div className="p-4">
                    <ErrorBlock message="Could not read licence information." />
                  </div>
                ) : (
                  <div className="px-4 py-1">
                    <InfoRow label="Plan">
                      <Badge tone="brand">{licenseQuery.data.plan}</Badge>
                    </InfoRow>
                    <InfoRow label="Licence ID">
                      <span className="font-mono">{licenseQuery.data.licenseId}</span>
                    </InfoRow>
                    <InfoRow label="Issued">
                      {formatDate(licenseQuery.data.issuedAt)}
                    </InfoRow>
                    <InfoRow label="Expires">
                      {formatDate(licenseQuery.data.expiresAt)}
                    </InfoRow>
                    <InfoRow label="Days remaining">
                      <span
                        className={cn(
                          "num font-semibold",
                          (licenseQuery.data.daysRemaining ?? 0) <= 0
                            ? "text-danger"
                            : (licenseQuery.data.daysRemaining ?? 0) <= 30
                              ? "text-warning"
                              : "text-success",
                        )}
                      >
                        {licenseQuery.data.daysRemaining}
                      </span>
                    </InfoRow>
                    <InfoRow label="Last seen">
                      {formatDate(licenseQuery.data.lastSeenDate)}
                    </InfoRow>
                  </div>
                )}
              </Card>

              <Card>
                <CardHeader title="About this application" />
                <div className="flex items-start gap-3 p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#25c3a2] to-[#0b6b59] text-white">
                    <Store className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-[12.5px] font-semibold text-ink">
                      Inventory Manager · Superette edition
                    </p>
                    <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-muted">
                      A local-first desktop application built with Tauri, Rust, SQLite and React.
                      It works entirely offline and stores all money as integer centimes in
                      Algerian dinars. Sales are immutable; corrections create linked return
                      entries.
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={demoOpen}
        onClose={() => setDemoOpen(false)}
        onConfirm={runDemoData}
        loading={demoBusy}
        title="Load demo data?"
        description="This inserts sample categories, products, suppliers and customers. The catalogue must be empty first."
        confirmLabel="Load demo data"
      >
        <div className="space-y-2 text-[11.5px] leading-relaxed text-muted">
          <p>
            Existing users, settings, sales and purchases are not deleted. Demo products and
            accounts can be archived or disabled afterwards.
          </p>
          <p className="flex items-start gap-1.5 text-warning">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Do not load demo data into a shop that is already operating.
          </p>
        </div>
      </ConfirmDialog>
    </>
  );
}

function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword.length < 8) {
      toast.error("The new password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("The new passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Change password"
        description="Used with your username to sign in."
        action={<KeyRound className="h-4 w-4 text-faint" />}
      />
      <form onSubmit={submit} className="space-y-3 p-4">
        <Field label="Current password" required>
          <Input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
          />
        </Field>
        <Field label="New password" required hint="Minimum 8 characters.">
          <Input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirm new password" required>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Button type="submit" loading={busy} className="w-full">
          Update password
        </Button>
      </form>
    </Card>
  );
}

function PinCard({
  hasPin,
  onPinChanged,
}: {
  hasPin: boolean;
  onPinChanged: (hasPin: boolean) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{4,8}$/.test(pin)) {
      toast.error("The PIN must be 4 to 8 digits.");
      return;
    }
    setBusy(true);
    try {
      await api.changePin(currentPassword, pin);
      setCurrentPassword("");
      setPin("");
      onPinChanged(true);
      toast.success("PIN updated");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const removePin = async () => {
    if (!currentPassword) {
      toast.error("Enter your current password first.");
      return;
    }
    setBusy(true);
    try {
      await api.changePin(currentPassword, null);
      setCurrentPassword("");
      setPin("");
      onPinChanged(false);
      toast.success("PIN removed");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Quick sign-in PIN"
        description="A short numeric code for the register keypad."
        action={<Lock className="h-4 w-4 text-faint" />}
      />
      <form onSubmit={submit} className="space-y-3 p-4">
        <Field label="Current password" required hint="Required to change or remove your PIN.">
          <Input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
          />
        </Field>
        <Field
          label={hasPin ? "New PIN" : "Set a PIN"}
          required
          hint="4 to 8 digits. Avoid obvious sequences like 1234 in production."
        >
          <Input
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="••••"
            inputMode="numeric"
            autoComplete="off"
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={busy} className="flex-1">
            {hasPin ? "Update PIN" : "Set PIN"}
          </Button>
          {hasPin ? (
            <Button
              type="button"
              variant="secondary"
              onClick={removePin}
              disabled={busy}
            >
              Remove PIN
            </Button>
          ) : null}
        </div>
        <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-faint">
          <Languages className="mt-0.5 h-3 w-3 shrink-0" />
          PIN sign-in is convenient on a shared register. Use a unique PIN per person; every login
          is audited.
        </p>
      </form>
    </Card>
  );
}
