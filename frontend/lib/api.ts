import axios from "axios";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

/* ── Token helpers ─────────────────────────────────────────────── */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("lexis_token");
}

export function setToken(token: string): void {
  localStorage.setItem("lexis_token", token);
}

export function clearToken(): void {
  localStorage.removeItem("lexis_token");
  localStorage.removeItem("lexis_user");
}

export function getUser(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("lexis_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setUser(user: Record<string, unknown>): void {
  localStorage.setItem("lexis_user", JSON.stringify(user));
}

/* ── Attach JWT on every request ───────────────────────────────── */
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/* ── Redirect to /login on 401 ─────────────────────────────────── */
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      clearToken();
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

/* ── Auth API ───────────────────────────────────────────────────── */
export interface AuthPayload {
  token: string;
  user: Record<string, unknown>;
}

export const auth = {
  login: (email: string, password: string) =>
    api.post<AuthPayload>("/auth/login", { email, password }),

  register: (name: string, email: string, password: string) =>
    api.post<AuthPayload>("/auth/register", { name, email, password }),

  google: (credential: string) =>
    api.post<AuthPayload>("/auth/google", { credential }),

  me: () => api.get<{ user: Record<string, unknown> }>("/auth/me"),
};

/* ── Rooms API ──────────────────────────────────────────────────── */
export const rooms = {
  create: (name: string, aiPrompt?: string, aiEnabled?: boolean) =>
    api.post("/rooms", { name, aiPrompt, aiEnabled }),

  list: () => api.get("/rooms/my"),

  // Join by code first (adds user as member if not already)
  join: (code: string) => api.post("/rooms/join", { code }),

  // Get LK token — backend expects { roomId } in body
  token: (code: string) => api.post("/rooms/token", { roomId: code }),

  get: (identifier: string) => api.get(`/rooms/${identifier}`),
};

/* ── Calls API ──────────────────────────────────────────────────── */
export const calls = {
  get: (id: string) => api.get(`/calls/${id}`),
  list: () => api.get("/calls"),
};

/* ── Analytics API ──────────────────────────────────────────────── */
export const analytics = {
  me: () => api.get("/users/analytics"),
};
