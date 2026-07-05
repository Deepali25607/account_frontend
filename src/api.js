import axios from "axios";
import { API_BASE_URL } from "./config";

// baseURL is derived from the deployment base path (see config.js), so the same
// build works under "/", "/account/", etc. and always hits the same-origin API
// that nginx proxies to the backend.
const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A dropped/expired session is surfaced as an EVENT, never a hard redirect.
// A `location.href` here would full-reload the SPA and wipe the in-memory auth
// state (the cause of the login → bounce-to-login loop). Instead AuthProvider
// listens for this event and the route guards navigate via React Router.
export const AUTH_EXPIRED_EVENT = "auth:expired";

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    return Promise.reject(err);
  }
);

export default api;
