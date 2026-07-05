import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api, { AUTH_EXPIRED_EVENT } from "./api";

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

  // A 401 from any request clears the token and fires AUTH_EXPIRED_EVENT — we
  // drop the in-memory session so the route guards send the user to /login via
  // React Router (no page reload, no lost state).
  useEffect(() => {
    const onExpired = () => setMe(null);
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

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

  // Clear state only — the route guards render <Navigate to={login}> in
  // response, keeping everything inside React Router (base-path safe).
  const logout = () => { localStorage.removeItem("token"); setMe(null); };

  // convenience: feature flags for the current tier
  const can = (feature) => !!me?.features?.[feature];

  return (
    <AuthCtx.Provider value={{ me, loading, login, register, logout, refresh, can }}>
      {children}
    </AuthCtx.Provider>
  );
}
