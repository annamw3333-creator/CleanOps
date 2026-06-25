import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { api, setToken, clearToken, getToken } from "@/src/api";

type User = {
  user_id: string;
  email: string;
  name: string;
  role: "cleaner" | "company_owner" | "client" | "owner_cleaner" | "admin";
  tier?: "free" | "pro" | "business";
  ads_enabled?: boolean;
  avatar?: string;
  phone?: string;
  bio?: string;
  qualifications?: string[];
  hourly_rate?: number;
  auto_accept?: boolean;
  experience_summary?: string;
  portfolio?: string[];
  availability?: string[];
  profile_complete?: boolean;
  completed_count?: number;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, role: string) => Promise<void>;
  loginWithGoogle: (role?: string) => Promise<void>;
  loginAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
};

const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) { setUser(null); setLoading(false); return; }
    try {
      const res = await api.get("/auth/me");
      setUser(res.user);
    } catch {
      await clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email: string, password: string) => {
    const res = await api.post("/auth/login", { email, password });
    await setToken(res.token);
    setUser(res.user);
  };

  const register = async (email: string, password: string, name: string, role: string) => {
    const res = await api.post("/auth/register", { email, password, name, role });
    await setToken(res.token);
    setUser(res.user);
  };

  const loginWithGoogle = async (role?: string) => {
    const redirectUrl =
      Platform.OS === "web" ? window.location.origin + "/" : Linking.createURL("auth");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    if (Platform.OS === "web") {
      window.location.href = authUrl;
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    if (result.type !== "success" || !result.url) return;
    const url = result.url;
    const hash = url.includes("#") ? url.split("#")[1] : url.split("?")[1] || "";
    const params = new URLSearchParams(hash);
    const sessionId = params.get("session_id");
    if (!sessionId) return;
    const res = await api.post("/auth/google", { session_id: sessionId, role });
    await setToken(res.token);
    setUser(res.user);
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    await clearToken();
    setUser(null);
  };

  const loginAsGuest = async () => {
    const res = await api.post("/auth/guest", {});
    await setToken(res.token);
    setUser(res.user);
  };

  return (
    <Ctx.Provider value={{ user, loading, login, register, loginWithGoogle, loginAsGuest, logout, refresh, setUser }}>
      {children}
    </Ctx.Provider>
  );
}
