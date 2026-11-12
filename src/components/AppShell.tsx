import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Boxes,
  Clock,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  ReceiptText,
  ScanLine,
  Settings,
  ShieldCheck,
  Store,
  Sun,
  Truck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate, roleLabel } from "../lib/format";
import type { Role } from "../lib/types";
import { Avatar, cn } from "./ui";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Operations",
    items: [
      {
        to: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        roles: ["owner", "manager"],
      },
      {
        to: "/pos",
        label: "Point of sale",
        icon: ScanLine,
        roles: ["owner", "manager", "cashier"],
      },
      {
        to: "/sales",
        label: "Sales",
        icon: ReceiptText,
        roles: ["owner", "manager", "cashier"],
      },
      {
        to: "/customers",
        label: "Customers & credit",
        icon: Users,
        roles: ["owner", "manager", "cashier"],
      },
    ],
  },
  {
    label: "Inventory",
    items: [
      {
        to: "/products",
        label: "Products",
        icon: Package,
        roles: ["owner", "manager", "stock_worker"],
      },
      {
        to: "/inventory",
        label: "Stock control",
        icon: Boxes,
        roles: ["owner", "manager", "stock_worker"],
      },
      {
        to: "/purchases",
        label: "Purchases",
        icon: Truck,
        roles: ["owner", "manager", "stock_worker"],
      },
    ],
  },
  {
    label: "Insights",
    items: [
      {
        to: "/reports",
        label: "Reports",
        icon: BarChart3,
        roles: ["owner", "manager"],
      },
      {
        to: "/shifts",
        label: "Shifts & cash",
        icon: Clock,
        roles: ["owner", "manager", "cashier"],
      },
    ],
  },
  {
    label: "Administration",
    items: [
      { to: "/team", label: "Team", icon: ShieldCheck, roles: ["owner"] },
      { to: "/settings", label: "Settings", icon: Settings, roles: ["owner"] },
    ],
  },
];

const allItems = navGroups.flatMap((group) => group.items);

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      return localStorage.getItem("inventory-theme") === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    try {
      localStorage.setItem("inventory-theme", theme);
    } catch {
      /* no-op */
    }
  }, [theme]);

  return {
    theme,
    toggle: () => setTheme((current) => (current === "dark" ? "light" : "dark")),
  };
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isSellingRole = user?.role === "owner" || user?.role === "manager" || user?.role === "cashier";

  const settingsQuery = useQuery({
    queryKey: ["shop-settings"],
    queryFn: api.getShopSettings,
    staleTime: 60_000,
  });

  const shiftQuery = useQuery({
    queryKey: ["shift", "totals"],
    queryFn: api.currentShiftTotals,
    enabled: isSellingRole,
    staleTime: 15_000,
  });

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const currentItem = allItems.find((item) => location.pathname.startsWith(item.to));
  const shopName = settingsQuery.data?.shopName ?? "Ma Superette";
  const openShift = shiftQuery.data?.current ?? null;

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Signed out");
      navigate("/login", { replace: true });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => user && item.roles.includes(user.role)),
    }))
    .filter((group) => group.items.length > 0);

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-ink">
      <div className="flex h-[68px] shrink-0 items-center gap-3 border-b border-white/[0.06] px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#1fb394] to-[#0b6b59] text-white shadow-[0_8px_20px_-8px_rgba(31,179,148,0.8)]">
          <Store className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold tracking-[-0.01em] text-white">
            {shopName}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-[0.13em] text-white/35">
            Superette manager
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white md:hidden"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="scroll-thin flex-1 overflow-y-auto px-3 py-4">
        {visibleGroups.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="mb-1.5 px-3 text-[9.5px] font-bold uppercase tracking-[0.16em] text-white/28">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "group flex items-center gap-2.5 rounded-xl px-3 py-2 text-[12.5px] font-medium transition-all",
                      isActive
                        ? "bg-white/[0.09] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                        : "text-white/52 hover:bg-white/[0.045] hover:text-white/90",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        className={cn(
                          "h-4 w-4 shrink-0 transition-colors",
                          isActive ? "text-[#4adebc]" : "text-white/38 group-hover:text-white/70",
                        )}
                      />
                      <span className="truncate">{item.label}</span>
                      {isActive ? (
                        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#4adebc]" />
                      ) : null}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-white/[0.06] p-3">
        <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.045] px-3 py-2.5">
          <Avatar
            name={user?.fullName ?? "User"}
            className="h-8 w-8 bg-white/10 text-white/90"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-white/90">{user?.fullName}</p>
            <p className="text-[10px] text-white/35">{user ? roleLabel(user.role) : ""}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Sign out"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 transition hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-2 px-1 text-center text-[9.5px] font-medium tracking-wide text-white/22">
          Offline-first · local SQLite
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-app">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] md:block">{sidebar}</aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[268px] animate-slide-in">{sidebar}</div>
        </div>
      ) : null}

      <div className="md:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-[60px] items-center gap-3 border-b border-line bg-card/85 px-4 backdrop-blur-md sm:px-6 lg:px-7">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-app hover:text-ink md:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-4.5 w-4.5" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold tracking-[-0.01em] text-ink">
              {currentItem?.label ?? "Inventory Manager"}
            </p>
            <p className="hidden text-[10.5px] text-faint sm:block">
              {new Intl.DateTimeFormat("en-GB", {
                weekday: "long",
                day: "2-digit",
                month: "long",
                year: "numeric",
              }).format(new Date())}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            {isSellingRole ? (
              <NavLink
                to="/shifts"
                className={cn(
                  "hidden items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition sm:flex",
                  openShift
                    ? "border-success/25 bg-success-soft text-success"
                    : "border-line bg-app text-muted hover:text-ink",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    openShift ? "bg-success" : "bg-faint",
                  )}
                />
                {openShift ? "Shift open" : "No shift"}
              </NavLink>
            ) : null}

            <span className="hidden items-center gap-1.5 rounded-full bg-app px-2.5 py-1.5 text-[10.5px] font-semibold text-muted lg:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Local · offline
            </span>

            <button
              type="button"
              onClick={toggle}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="flex h-8.5 w-8.5 items-center justify-center rounded-lg text-muted transition hover:bg-app hover:text-ink"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <div className="mx-1 hidden h-6 w-px bg-line sm:block" />

            <div className="hidden items-center gap-2 sm:flex">
              <Avatar name={user?.fullName ?? "User"} className="h-7.5 w-7.5 text-[10px]" />
              <div className="leading-tight">
                <p className="max-w-[120px] truncate text-[11.5px] font-semibold text-ink">
                  {user?.fullName}
                </p>
                <p className="text-[9.5px] font-medium text-faint">
                  {user ? roleLabel(user.role) : ""}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-8.5 w-8.5 items-center justify-center rounded-lg text-muted transition hover:bg-danger-soft hover:text-danger"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1560px] px-4 py-5 sm:px-6 lg:px-7 lg:py-6">
          <Outlet />
          <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-[10.5px] text-faint">
            <span>{shopName} · Inventory Manager</span>
            <span>Local data · {formatDate(new Date().toISOString())}</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
