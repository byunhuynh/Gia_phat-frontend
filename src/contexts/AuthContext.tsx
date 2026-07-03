import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { User } from "../types";
import { API_BASE } from "../constants";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  fetchProfile: () => Promise<void>;
  handleLogout: () => void;
  forceLogout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

interface AuthProviderProps {
  children: React.ReactNode;
  onForceLogout?: () => void;
}

const buildUser = (data: Record<string, unknown>): User => ({
  ...(data as User),
  fullName: data.full_name as string,
  avatar:
    (data.avatar as string) ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(
      data.full_name as string,
    )}&background=0ea5e9&color=fff`,
});

export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  onForceLogout,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchingRef = React.useRef(false);

  const fetchProfile = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    const token =
      localStorage.getItem("access_token") ||
      sessionStorage.getItem("access_token");

    if (!token) {
      setUser(null);
      setLoading(false);
      fetchingRef.current = false;
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setUser(buildUser(data));
        return;
      }

      // Rate limit — don't logout, just fail silently
      if (res.status === 429) return;

      if (res.status === 401) {
        const refreshToken = localStorage.getItem("refresh_token");
        if (!refreshToken) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          setUser(null);
          return;
        }

        const refreshRes = await fetch(`${API_BASE}/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!refreshRes.ok) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          setUser(null);
          return;
        }

        const { access_token } = await refreshRes.json();
        localStorage.setItem("access_token", access_token);

        const retryRes = await fetch(`${API_BASE}/me`, {
          headers: { Authorization: `Bearer ${access_token}` },
        });

        if (retryRes.ok) {
          const data = await retryRes.json();
          setUser(buildUser(data));
        } else {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          setUser(null);
        }
      }
    } catch (err) {
      console.error("Auth error:", err);
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setUser(null);
  }, []);

  const forceLogout = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setUser(null);
    onForceLogout?.();
  }, [onForceLogout]);

  // Session checker — runs every 15s when user is active
  const checkSession = useCallback(async () => {
    const token = localStorage.getItem("access_token");
    const refreshToken = localStorage.getItem("refresh_token");
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      if (res.ok) return;

      if (res.status === 401 && refreshToken) {
        const refreshRes = await fetch(`${API_BASE}/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!refreshRes.ok) {
          forceLogout();
          return;
        }

        const { access_token } = await refreshRes.json();
        localStorage.setItem("access_token", access_token);
      }
    } catch (err) {
      console.error("Session check failed:", err);
    }
  }, [forceLogout]);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") checkSession();
    }, 15000);
    return () => clearInterval(interval);
  }, [user, checkSession]);

  return (
    <AuthContext.Provider
      value={{ user, loading, setUser, fetchProfile, handleLogout, forceLogout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
