import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  authApi,
  setAuthToken,
  clearAuthToken,
  devicesApi,
  setUnauthorizedHandler,
  DEVICE_TOKEN_KEY,
} from "@/lib/api";

interface User {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  role: string;
}

interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: User | null;
  signIn: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Best-effort device registration — never blocks or fails a login. */
async function registerThisDevice(force = false): Promise<void> {
  try {
    // One row per login session: skip while this browser already holds a token
    // (cleared on logout, so the next login registers a fresh device). A forced
    // register first drops any stale token so it can never 401 the request.
    if (force) localStorage.removeItem(DEVICE_TOKEN_KEY);
    else if (localStorage.getItem(DEVICE_TOKEN_KEY)) return;
    const ua = navigator.userAgent || "Web";
    const platform = ua.includes("Windows")
      ? "Windows"
      : ua.includes("Android")
        ? "Android"
        : ua.includes("iPhone")
          ? "iOS"
          : "Web";
    const data = await devicesApi.register({
      deviceName: ua.slice(0, 80) || "Web",
      platform,
      appVersion: "1.0.0",
    });
    localStorage.setItem(DEVICE_TOKEN_KEY, data.deviceToken);
  } catch (err) {
    console.warn("Device registration failed (continuing without one)", err);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const revokedHandled = useRef(false);

  const checkAuth = useCallback(async () => {
    try {
      const userData = await authApi.me();
      setUser(userData);
      // Token restored — make sure this browser is a registered device so the
      // X-Device-Token header (revocation kill-switch) is attached.
      void registerThisDevice();
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // 401 interceptor: a revoked device must be told why it was logged out.
  useEffect(() => {
    setUnauthorizedHandler((err) => {
      if (!/revoked/i.test(err.message)) return;
      if (revokedHandled.current) return;
      revokedHandled.current = true;
      toast.error("This device has been revoked by an administrator.");
      try {
        void authApi.logout().catch(() => {
          /* the device is already dead server-side */
        });
      } catch {
        /* ignore */
      }
      clearAuthToken();
      localStorage.removeItem(DEVICE_TOKEN_KEY);
      setUser(null);
      setIsLoading(false);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const signIn = async (identifier: string, password: string) => {
    setIsLoading(true);
    try {
      const result = await authApi.login(identifier, password);
      setAuthToken(result.token);
      setUser(result.user);
      revokedHandled.current = false;
      void registerThisDevice(true);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout errors
    } finally {
      clearAuthToken();
      localStorage.removeItem(DEVICE_TOKEN_KEY);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isAuthenticated: !!user,
        user,
        signIn,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
