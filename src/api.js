import axios from "axios";

// Same-origin "/api" works for both Vite dev (proxied) and Capacitor builds
// when VITE_API_URL points at the deployed backend.
const baseURL = (import.meta.env.VITE_API_URL || "") + "/api";

const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      if (location.pathname !== "/login") location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
