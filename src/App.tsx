import { Navigate, Route, Routes } from "react-router-dom";
import { Store } from "lucide-react";

import AppShell from "./components/AppShell";
import { useAuth, homeForRole } from "./lib/auth";
import type { Role } from "./lib/types";
import LoginPage from "./pages/Login";
import DashboardPage from "./pages/Dashboard";
import PosPage from "./pages/Pos";
import SalesPage from "./pages/Sales";
import ProductsPage from "./pages/Products";
import InventoryPage from "./pages/Inventory";
import PurchasesPage from "./pages/Purchases";
import CustomersPage from "./pages/Customers";
import ReportsPage from "./pages/Reports";
import ShiftsPage from "./pages/Shifts";
import TeamPage from "./pages/Team";
import SettingsPage from "./pages/Settings";

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-app">
      <div className="flex h-12 w-12 animate-pulse items-center justify-center rounded-2xl bg-brand text-brand-ink">
        <Store className="h-6 w-6" />
      </div>
      <p className="text-xs font-medium text-muted">Opening your shop…</p>
    </div>
  );
}

function Protected({
  roles,
  children,
}: {
  roles?: Role[];
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={homeForRole(user.role)} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          loading ? (
            <FullScreenLoader />
          ) : user ? (
            <Navigate to={homeForRole(user.role)} replace />
          ) : (
            <LoginPage />
          )
        }
      />
      <Route
        element={
          <Protected>
            <AppShell />
          </Protected>
        }
      >
        <Route
          index
          element={
            <Navigate
              to={user ? homeForRole(user.role) : "/login"}
              replace
            />
          }
        />
        <Route
          path="/dashboard"
          element={
            <Protected roles={["owner", "manager"]}>
              <DashboardPage />
            </Protected>
          }
        />
        <Route
          path="/pos"
          element={
            <Protected roles={["owner", "manager", "cashier"]}>
              <PosPage />
            </Protected>
          }
        />
        <Route
          path="/sales"
          element={
            <Protected roles={["owner", "manager", "cashier"]}>
              <SalesPage />
            </Protected>
          }
        />
        <Route
          path="/products"
          element={
            <Protected roles={["owner", "manager", "stock_worker"]}>
              <ProductsPage />
            </Protected>
          }
        />
        <Route
          path="/inventory"
          element={
            <Protected roles={["owner", "manager", "stock_worker"]}>
              <InventoryPage />
            </Protected>
          }
        />
        <Route
          path="/purchases"
          element={
            <Protected roles={["owner", "manager", "stock_worker"]}>
              <PurchasesPage />
            </Protected>
          }
        />
        <Route
          path="/customers"
          element={
            <Protected roles={["owner", "manager", "cashier"]}>
              <CustomersPage />
            </Protected>
          }
        />
        <Route
          path="/reports"
          element={
            <Protected roles={["owner", "manager"]}>
              <ReportsPage />
            </Protected>
          }
        />
        <Route
          path="/shifts"
          element={
            <Protected roles={["owner", "manager", "cashier"]}>
              <ShiftsPage />
            </Protected>
          }
        />
        <Route
          path="/team"
          element={
            <Protected roles={["owner"]}>
              <TeamPage />
            </Protected>
          }
        />
        <Route
          path="/settings"
          element={
            <Protected roles={["owner"]}>
              <SettingsPage />
            </Protected>
          }
        />
        <Route
          path="*"
          element={<Navigate to={user ? homeForRole(user.role) : "/login"} replace />}
        />
      </Route>
    </Routes>
  );
}
