import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight,
  BookOpen,
  CreditCard,
  Eye,
  EyeOff,
  KeyRound,
  Delete,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Store,
  WifiOff,
} from "lucide-react";

import { errorMessage } from "../lib/api";
import { homeForRole, useAuth } from "../lib/auth";
import { Button, cn, Field, Input } from "../components/ui";

type Mode = "password" | "pin";

export default function LoginPage() {
  const { login, loginWithPin } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enter = (role: Parameters<typeof homeForRole>[0]) => {
    navigate(homeForRole(role), { replace: true });
  };

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const user = await login(username.trim(), password);
      toast.success(`Welcome back, ${user.fullName.split(" ")[0]}`);
      enter(user.role);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const submitPin = async (value?: string) => {
    const candidate = value ?? pin;
    if (busy) return;
    if (candidate.length < 4) {
      setError("Enter at least 4 digits.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const user = await loginWithPin(candidate);
      toast.success(`Welcome back, ${user.fullName.split(" ")[0]}`);
      enter(user.role);
    } catch (cause) {
      setError(errorMessage(cause));
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  const pressDigit = (digit: string) => {
    if (pin.length >= 8) return;
    setError(null);
    setPin((current) => current + digit);
  };

  const fillDemo = () => {
    setUsername("owner");
    setPassword("owner123");
    setError(null);
  };

  return (
    <div className="grid min-h-screen bg-app lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-sidebar p-10 text-white lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.13]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.28) 1px, transparent 1px)",
            backgroundSize: "46px 46px",
            maskImage: "radial-gradient(ellipse at 30% 20%, black, transparent 78%)",
          }}
        />
        <div className="pointer-events-none absolute -right-32 -top-24 h-[430px] w-[430px] rounded-full bg-[#18a88b]/25 blur-[90px]" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 h-[420px] w-[420px] rounded-full bg-[#0e7c66]/25 blur-[100px]" />

        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#25c3a2] to-[#0b6b59] shadow-[0_14px_34px_-10px_rgba(37,195,162,0.85)]">
            <Store className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[15px] font-semibold tracking-[-0.02em]">Inventory Manager</p>
            <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-white/40">
              Superette · Épicerie edition
            </p>
          </div>
        </div>

        <div className="relative my-auto max-w-[520px] py-12">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold text-[#8ff0dc]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#4adebc]" />
            Works without internet
          </div>
          <h1 className="text-[42px] font-semibold leading-[1.08] tracking-[-0.045em]">
            Run your superette,
            <br />
            <span className="text-[#7be6d0]">even when the power goes out.</span>
          </h1>
          <p className="mt-5 max-w-[440px] text-[13.5px] leading-relaxed text-white/55">
            Point of sale, stock, supplier deliveries and the customer credit book — all on this
            computer, all in Algerian dinars.
          </p>

          <div className="mt-9 grid max-w-[460px] grid-cols-2 gap-2.5">
            {[
              { icon: WifiOff, label: "100% offline" },
              { icon: CreditCard, label: "Cash, CIB, Edahabia" },
              { icon: BookOpen, label: "Credit book" },
              { icon: ShieldCheck, label: "Immutable sales" },
            ].map((feature) => (
              <div
                key={feature.label}
                className="flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-3"
              >
                <feature.icon className="h-4 w-4 shrink-0 text-[#68e0c7]" />
                <span className="text-[11.5px] font-medium text-white/75">{feature.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center justify-between border-t border-white/[0.08] pt-5 text-[10.5px] text-white/30">
          <span>Local data · automatic backups</span>
          <span>Algeria · DZD</span>
        </div>
      </section>

      <section className="flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-14">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-brand-ink">
              <Store className="h-4.5 w-4.5" />
            </span>
            <span className="text-sm font-semibold text-ink">Inventory Manager</span>
          </div>
          <div className="ml-auto flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 text-[10.5px] font-semibold text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Offline · licence locale
          </div>
        </div>

        <div className="my-auto mx-auto w-full max-w-[400px] py-10">
          <div className="mb-7">
            <h2 className="text-[26px] font-semibold tracking-[-0.035em] text-ink">
              {mode === "password" ? "Sign in to your shop" : "Quick PIN access"}
            </h2>
            <p className="mt-1.5 text-[12.5px] text-muted">
              {mode === "password"
                ? "Use your account credentials to open the register."
                : "Tap your PIN on the keypad — ideal for busy counters."}
            </p>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-line bg-card p-1">
            <button
              type="button"
              onClick={() => {
                setMode("password");
                setError(null);
              }}
              className={cn(
                "rounded-lg py-2 text-[12px] font-semibold transition",
                mode === "password" ? "bg-brand-soft text-brand" : "text-muted hover:text-ink",
              )}
            >
              Password
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("pin");
                setError(null);
              }}
              className={cn(
                "rounded-lg py-2 text-[12px] font-semibold transition",
                mode === "pin" ? "bg-brand-soft text-brand" : "text-muted hover:text-ink",
              )}
            >
              PIN code
            </button>
          </div>

          {error ? (
            <div className="mb-4 rounded-xl border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-[11.5px] font-medium leading-relaxed text-danger">
              {error}
            </div>
          ) : null}

          {mode === "password" ? (
            <form onSubmit={submitPassword} className="space-y-4">
              <Field label="Username">
                <Input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="owner"
                  autoFocus
                  autoComplete="username"
                />
              </Field>
              <Field label="Password">
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-faint hover:text-ink"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </Field>
              <Button
                type="submit"
                size="lg"
                fullWidth
                loading={busy}
                icon={busy ? undefined : LockKeyhole}
              >
                {busy ? "Signing in…" : "Open the register"}
              </Button>
            </form>
          ) : (
            <div>
              <div className="mb-5 flex h-14 items-center justify-center gap-2.5 rounded-2xl border border-line bg-card">
                {Array.from({ length: 6 }).map((_, index) => (
                  <span
                    key={index}
                    className={cn(
                      "h-2.5 w-2.5 rounded-full transition-all",
                      index < pin.length ? "scale-110 bg-brand" : "bg-line-strong",
                    )}
                  />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => pressDigit(digit)}
                    disabled={busy}
                    className="h-13 rounded-xl border border-line bg-card text-[18px] font-semibold text-ink shadow-sm transition hover:bg-app active:scale-[0.97] disabled:opacity-50"
                  >
                    {digit}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setPin("");
                    setError(null);
                  }}
                  disabled={busy}
                  className="h-13 rounded-xl text-[11px] font-semibold text-danger transition hover:bg-danger-soft disabled:opacity-50"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => pressDigit("0")}
                  disabled={busy}
                  className="h-13 rounded-xl border border-line bg-card text-[18px] font-semibold text-ink shadow-sm transition hover:bg-app active:scale-[0.97] disabled:opacity-50"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => setPin((value) => value.slice(0, -1))}
                  disabled={busy}
                  className="flex h-13 items-center justify-center rounded-xl text-muted transition hover:bg-app hover:text-ink disabled:opacity-50"
                  aria-label="Delete digit"
                >
                  <Delete className="h-5 w-5" />
                </button>
              </div>
              <Button
                size="lg"
                fullWidth
                className="mt-3"
                loading={busy}
                icon={busy ? undefined : KeyRound}
                onClick={() => submitPin()}
              >
                {busy ? "Checking…" : "Unlock register"}
              </Button>
            </div>
          )}

          <div className="mt-6 rounded-xl border border-line bg-card p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold text-ink">First run? Use the seeded owner</p>
                <p className="mt-0.5 text-[10.5px] text-muted">
                  Username <span className="font-mono text-ink">owner</span> · password{" "}
                  <span className="font-mono text-ink">owner123</span> · PIN{" "}
                  <span className="font-mono text-ink">1234</span>
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={fillDemo} className="shrink-0">
                Fill
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[9.5px] text-faint">
              <ShieldCheck className="h-3 w-3" />
              Change these credentials in Settings after your first sign-in.
            </p>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[400px] text-center text-[10px] text-faint">
          Inventory Manager · Tauri + SQLite · {new Date().getFullYear()}
        </div>
      </section>
    </div>
  );
}
