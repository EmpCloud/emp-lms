import { create } from "zustand";

export interface AuthUser {
  empcloudUserId: number;
  empcloudOrgId: number;
  role: string;
  email: string;
  firstName: string;
  lastName: string;
  orgName: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  login: (user: AuthUser, tokens: { accessToken: string; refreshToken: string }) => void;
  logout: () => void;
  loadFromStorage: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,

  login: (user, tokens) => {
    localStorage.setItem("access_token", tokens.accessToken);
    localStorage.setItem("refresh_token", tokens.refreshToken);
    localStorage.setItem("user", JSON.stringify(user));
    set({ user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
    window.location.href = "/login";
  },

  loadFromStorage: () => {
    const token = localStorage.getItem("access_token");
    const userStr = localStorage.getItem("user");
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        set({ user, accessToken: token, refreshToken: localStorage.getItem("refresh_token"), isAuthenticated: true });
      } catch {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("user");
      }
    }
  },
}));

export function extractSSOToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  const ssoToken = params.get("sso_token");
  if (!ssoToken) return null;
  const url = new URL(window.location.href);
  url.searchParams.delete("sso_token");
  window.history.replaceState({}, "", url.pathname + url.hash);
  return ssoToken;
}

export function isLoggedIn(): boolean {
  return !!localStorage.getItem("access_token");
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function getToken(): string | null {
  return localStorage.getItem("access_token");
}
