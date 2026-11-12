import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BadgeCheck,
  KeyRound,
  Pencil,
  Plus,
  Shield,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";

import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate, roleDescription, roleLabel } from "../lib/format";
import type { Role, User } from "../lib/types";
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
  Select,
  StatCard,
  Switch,
  cn,
} from "../components/ui";

const roles: Array<{ value: Role; label: string }> = [
  { value: "owner", label: "Owner" },
  { value: "manager", label: "Manager" },
  { value: "cashier", label: "Cashier" },
  { value: "stock_worker", label: "Stock worker" },
];

const roleTone: Record<string, "brand" | "info" | "success" | "warning" | "neutral"> = {
  owner: "brand",
  manager: "info",
  cashier: "success",
  stock_worker: "warning",
};

export default function TeamPage() {
  const { user, updateUser } = useAuth();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const usersQuery = useQuery({ queryKey: ["users"], queryFn: api.listUsers });
  const users = usersQuery.data ?? [];

  const activeCount = users.filter((member) => member.isActive).length;
  const roleCounts = roles.map((role) => ({
    ...role,
    count: users.filter((member) => member.role === role.value).length,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Team & access"
        description="Create one account per person. Roles control what each person can see and do."
        actions={
          <Button
            icon={Plus}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            New team member
          </Button>
        }
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Team members"
          value={String(users.length)}
          hint={`${activeCount} active accounts`}
          icon={Users}
        />
        {roleCounts.map((role) => (
          <StatCard
            key={role.value}
            label={role.label}
            value={String(role.count)}
            hint={roleDescription(role.value)}
            icon={role.value === "owner" ? ShieldCheck : UserRound}
            tone={role.value === "owner" ? "brand" : role.value === "manager" ? "info" : "neutral"}
          />
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Accounts"
          description="Deactivated accounts stay in history but cannot sign in."
          action={<Badge tone="neutral">{users.length}</Badge>}
        />
        {usersQuery.isLoading ? (
          <LoadingBlock />
        ) : usersQuery.isError ? (
          <div className="p-4">
            <ErrorBlock message="Could not load the team." />
          </div>
        ) : users.length === 0 ? (
          <EmptyState icon={Users} title="No accounts" />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>PIN</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-[10px] font-bold text-brand">
                          {member.fullName
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((part) => part[0])
                            .join("")}
                        </span>
                        <div>
                          <p className="text-[11.5px] font-semibold text-ink">
                            {member.fullName}
                            {member.id === user?.id ? (
                              <span className="ml-1.5 text-[9px] font-medium text-brand">you</span>
                            ) : null}
                          </p>
                          <p className="text-[9.5px] text-faint">ID #{member.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="font-mono text-[11px] text-muted">{member.username}</td>
                    <td>
                      <Badge tone={roleTone[member.role] ?? "neutral"}>
                        {roleLabel(member.role)}
                      </Badge>
                    </td>
                    <td>
                      {member.hasPin ? (
                        <span className="flex items-center gap-1 text-[10.5px] text-success">
                          <KeyRound className="h-3 w-3" />
                          Set
                        </span>
                      ) : (
                        <span className="text-[10.5px] text-faint">None</span>
                      )}
                    </td>
                    <td>
                      <Badge tone={member.isActive ? "success" : "danger"} dot>
                        {member.isActive ? "Active" : "Disabled"}
                      </Badge>
                    </td>
                    <td className="text-[10.5px] text-muted">{formatDate(member.createdAt)}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(member);
                          setFormOpen(true);
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-faint transition hover:bg-app hover:text-ink"
                        title="Edit account"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader title="Role boundaries" description="Enforced in the Rust backend, not just the UI." />
          <div className="divide-y divide-line/70">
            {roles.map((role) => (
              <div key={role.value} className="flex items-start gap-3 px-4 py-3">
                <span
                  className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                    role.value === "owner"
                      ? "bg-brand-soft text-brand"
                      : "bg-app text-muted",
                  )}
                >
                  <Shield className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[11.5px] font-semibold text-ink">{role.label}</p>
                  <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
                    {roleDescription(role.value)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Account guidance" />
          <div className="space-y-3 p-4">
            <InlineNote tone="info">
              Passwords are hashed with Argon2. PINs are also hashed and can be used for fast
              sign-in on the register.
            </InlineNote>
            <InlineNote tone="warning">
              At least one active owner must remain. You cannot demote or deactivate your own
              account.
            </InlineNote>
            <InlineNote tone="success">
              Cashiers see only their own sales and shifts. Stock workers cannot sell or access
              financial reports.
            </InlineNote>
            <div className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5">
              <BadgeCheck className="h-4 w-4 text-brand" />
              <p className="text-[10.5px] leading-relaxed text-muted">
                Every account change is recorded in the audit log.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <UserFormModal
        open={formOpen}
        member={editing}
        selfId={user?.id ?? null}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={(saved) => {
          if (saved.id === user?.id) updateUser(saved);
          setFormOpen(false);
          setEditing(null);
          queryClient.invalidateQueries();
        }}
      />
    </>
  );
}

function UserFormModal({
  open,
  member,
  selfId,
  onClose,
  onSaved,
}: {
  open: boolean;
  member: User | null;
  selfId: number | null;
  onClose: () => void;
  onSaved: (user: User) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<Role>("cashier");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [clearPin, setClearPin] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);

  const isSelf = member !== null && member.id === selfId;

  useEffect(() => {
    if (!open) return;
    setFullName(member?.fullName ?? "");
    setUsername(member?.username ?? "");
    setRole(member?.role ?? "cashier");
    setPassword("");
    setPin("");
    setClearPin(false);
    setIsActive(member?.isActive ?? true);
    setBusy(false);
  }, [open, member]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!fullName.trim()) {
      toast.error("Full name is required.");
      return;
    }
    if (!username.trim()) {
      toast.error("Username is required.");
      return;
    }
    if (!member && password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password && password.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (pin && !/^\d{4,8}$/.test(pin)) {
      toast.error("PIN must be 4 to 8 digits.");
      return;
    }

    setBusy(true);
    try {
      let saved: User;
      if (member) {
        saved = await api.updateUser(member.id, {
          fullName: fullName.trim(),
          username: username.trim(),
          role,
          isActive,
          password: password.trim() ? password : null,
          pin: pin.trim() ? pin : null,
          clearPin,
        });
        toast.success("Account updated");
      } else {
        saved = await api.createUser({
          fullName: fullName.trim(),
          username: username.trim(),
          password,
          pin: pin || null,
          role,
        });
        toast.success("Account created");
      }
      onSaved(saved);
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
      title={member ? `Edit ${member.fullName}` : "New team member"}
      description={
        member
          ? "Leave password and PIN blank to keep the current values."
          : "Create credentials the person will use to sign in."
      }
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => formRef.current?.requestSubmit()}>
            {member ? "Save changes" : "Create account"}
          </Button>
        </>
      }
    >
      <form ref={formRef} onSubmit={submit} className="space-y-3.5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" required>
            <Input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Maya Bennett"
              autoFocus
            />
          </Field>
          <Field label="Username" required hint="Letters, digits, dots, dashes, underscores.">
            <Input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="maya"
              autoComplete="off"
            />
          </Field>
        </div>

        <Field label="Role" required>
          <Select value={role} onChange={(event) => setRole(event.target.value as Role)} disabled={isSelf}>
            {roles.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label} — {roleDescription(item.value)}
              </option>
            ))}
          </Select>
          {isSelf ? (
            <p className="mt-1 text-[10px] text-warning">
              You cannot change your own role or deactivate yourself.
            </p>
          ) : null}
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={member ? "New password" : "Password"}
            required={!member}
            hint={member ? "Leave blank to keep current." : "Minimum 8 characters."}
          >
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={member ? "••••••••" : "At least 8 characters"}
              autoComplete="new-password"
            />
          </Field>
          <Field label={member ? "New PIN" : "PIN (optional)"} hint="4 to 8 digits. Used for quick sign-in.">
            <Input
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              placeholder={member?.hasPin ? "Keep current PIN" : "1234"}
              inputMode="numeric"
              disabled={clearPin}
            />
          </Field>
        </div>

        {member ? (
          <div className="space-y-2.5 rounded-xl border border-line p-3">
            <Switch
              checked={isActive}
              onChange={setIsActive}
              disabled={isSelf}
              label="Account active"
              description="Disabled accounts cannot sign in."
            />
            {member.hasPin ? (
              <Switch
                checked={clearPin}
                onChange={setClearPin}
                label="Remove PIN"
                description="Force password sign-in for this account."
              />
            ) : null}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
