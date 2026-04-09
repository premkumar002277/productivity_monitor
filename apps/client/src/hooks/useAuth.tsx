import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import { apiUrl } from "../api/http";
import type { AuthResponse, AuthTokens, AuthUser } from "../types/api";

type StoredSession = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
};

type RequestOptions = RequestInit & {
  auth?: boolean;
};

type AuthContextValue = {
  user: AuthUser | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  login: (payload: { email: string; password: string }) => Promise<AuthUser>;
  register: (payload: {
    name: string;
    email: string;
    password: string;
    department?: string | null;
    role?: AuthUser["role"];
  }) => Promise<AuthUser>;
  logout: () => Promise<void>;
  apiFetch: <T>(path: string, options?: RequestOptions) => Promise<T>;
};

const STORAGE_KEY = "workwatch.auth";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function parseErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string") {
    return payload.message;
  }

  return fallback;
}

function loadStoredSession(): StoredSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    throw new Error(parseErrorMessage(payload, `Request failed with status ${response.status}`));
  }

  return payload as T;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<StoredSession | null>(() => loadStoredSession());
  const sessionRef = useRef<StoredSession | null>(session);
  const refreshInFlightRef = useRef<Promise<StoredSession | null> | null>(null);

  useEffect(() => {
    sessionRef.current = session;

    if (typeof window === "undefined") {
      return;
    }

    if (session) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      return;
    }

    window.localStorage.removeItem(STORAGE_KEY);
  }, [session]);

  const storeAuthResponse = useCallback((response: AuthResponse) => {
    const nextSession = {
      user: response.user,
      accessToken: response.tokens.accessToken,
      refreshToken: response.tokens.refreshToken,
    };

    setSession(nextSession);
    return nextSession;
  }, []);

  const refreshTokens = useCallback(async () => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const currentSession = sessionRef.current;

    if (!currentSession?.refreshToken) {
      setSession(null);
      return null;
    }

    refreshInFlightRef.current = fetch(apiUrl("/api/auth/refresh"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refreshToken: currentSession.refreshToken,
      }),
    })
      .then((response) => parseResponse<AuthResponse>(response))
      .then((response) => storeAuthResponse(response))
      .catch(() => {
        setSession(null);
        return null;
      })
      .finally(() => {
        refreshInFlightRef.current = null;
      });

    return refreshInFlightRef.current;
  }, [storeAuthResponse]);

  const apiFetch = useCallback(
    async <T,>(path: string, options: RequestOptions = {}) => {
      const { auth = true, headers, ...rest } = options;
      const currentSession = sessionRef.current;
      const preparedHeaders = new Headers(headers);

      if (!preparedHeaders.has("Content-Type") && rest.body && !(rest.body instanceof FormData)) {
        preparedHeaders.set("Content-Type", "application/json");
      }

      if (auth && currentSession?.accessToken) {
        preparedHeaders.set("Authorization", `Bearer ${currentSession.accessToken}`);
      }

      let response = await fetch(apiUrl(path), {
        ...rest,
        headers: preparedHeaders,
      });

      if (response.status === 401 && auth && currentSession?.refreshToken) {
        const refreshedSession = await refreshTokens();

        if (refreshedSession?.accessToken) {
          preparedHeaders.set("Authorization", `Bearer ${refreshedSession.accessToken}`);
          response = await fetch(apiUrl(path), {
            ...rest,
            headers: preparedHeaders,
          });
        }
      }

      return parseResponse<T>(response);
    },
    [refreshTokens],
  );

  const login = useCallback(
    async (payload: { email: string; password: string }) => {
      const response = await apiFetch<AuthResponse>("/api/auth/login", {
        auth: false,
        method: "POST",
        body: JSON.stringify(payload),
      });

      return storeAuthResponse(response).user;
    },
    [apiFetch, storeAuthResponse],
  );

  const register = useCallback(
    async (payload: {
      name: string;
      email: string;
      password: string;
      department?: string | null;
      role?: AuthUser["role"];
    }) => {
      const response = await apiFetch<AuthResponse>("/api/auth/register", {
        auth: false,
        method: "POST",
        body: JSON.stringify(payload),
      });

      return storeAuthResponse(response).user;
    },
    [apiFetch, storeAuthResponse],
  );

  const logout = useCallback(async () => {
    const currentSession = sessionRef.current;

    if (currentSession?.refreshToken) {
      try {
        await apiFetch("/api/auth/logout", {
          auth: false,
          method: "POST",
          body: JSON.stringify({ refreshToken: currentSession.refreshToken }),
        });
      } catch {
        // Best effort only.
      }
    }

    setSession(null);
  }, [apiFetch]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      tokens: session
        ? {
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
          }
        : null,
      isAuthenticated: Boolean(session?.accessToken),
      login,
      register,
      logout,
      apiFetch,
    }),
    [apiFetch, login, logout, register, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
