import { storage } from "@/src/utils/storage";

const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
const TOKEN_KEY = "aa_token";
const GUEST_KEY = "aa_guest";

export async function getToken() {
  return storage.secureGet<string>(TOKEN_KEY, "");
}
export async function setToken(token: string) {
  return storage.secureSet(TOKEN_KEY, token);
}
export async function clearToken() {
  return storage.secureRemove(TOKEN_KEY);
}
export async function getGuestFlag() {
  return storage.secureGet<string>(GUEST_KEY, "");
}
export async function setGuestFlag() {
  return storage.secureSet(GUEST_KEY, "1");
}
export async function clearGuestFlag() {
  return storage.secureRemove(GUEST_KEY);
}

async function request(path: string, options: any = {}) {
  const token = await getToken();
  const headers: any = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api${path}`, { ...options, headers });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const detail = (data && data.detail) || `Request failed (${res.status})`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data;
}

export const api = {
  get: (p: string) => request(p),
  post: (p: string, body?: any) => request(p, { method: "POST", body: JSON.stringify(body || {}) }),
  put: (p: string, body?: any) => request(p, { method: "PUT", body: JSON.stringify(body || {}) }),
  del: (p: string) => request(p, { method: "DELETE" }),
};
