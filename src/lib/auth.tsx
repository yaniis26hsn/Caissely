import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "./api";
import type { User } from "./types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  loginWithPin: (pin: string) => Promise<User>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api
      .currentSession()
      .then((session) => {
        if (mounted) setUser(session);
      })
      .catch(() => {
        if (mounted) setUser(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const session = await api.login(username, password);
    setUser(session);
    return session;
  }, []);

  const loginWithPin = useCallback(async (pin: string) => {
    const session = await api.loginWithPin(pin);
    setUser(session);
    return session;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      queryClient.clear();
    }
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      loginWithPin,
      logout,
      updateUser: setUser,
    }),
    [user, loading, login, loginWithPin, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}

export function canAccess(role: User["role"] | undefined, allowed: User["role"][]): boolean {
  if (!role) return false;
  return allowed.includes(role);
}

export function homeForRole(role: User["role"]): string {
  switch (role) {
    case "owner":
    case "manager":
      return "/dashboard";
    case "cashier":
      return "/pos";
    case "stock_worker":
      return "/inventory";
    default:
      return "/pos";
  }
}
