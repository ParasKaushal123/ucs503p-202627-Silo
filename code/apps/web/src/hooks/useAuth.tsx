"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/lib/api";
import type { AuthUser } from "@/lib/types";

type AuthState = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refresh: () => void;
};

const AuthContext = createContext<AuthState>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  refresh: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMe = () => {
    setIsLoading(true);
    api
      .getMe()
      .then(setUser)
      .catch(() => setUser({ authenticated: false }))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchMe();
  }, []);

  const isAuthenticated = user?.authenticated === true;

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated, refresh: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
