import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "./api";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!localStorage.getItem("token")) { setMe(null); setLoading(false); return; }
    try {
      const { data } = await api.get("/auth/me");
      setMe(data);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("token", data.token);
    setMe(data);
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    localStorage.setItem("token", data.token);
    setMe(data);
  };

  const logout = () => { localStorage.removeItem("token"); setMe(null); location.href = "/login"; };

  // convenience: feature flags for the current tier
  const can = (feature) => !!me?.features?.[feature];

  return (
    <AuthCtx.Provider value={{ me, loading, login, register, logout, refresh, can }}>
      {children}
    </AuthCtx.Provider>
  );
}
