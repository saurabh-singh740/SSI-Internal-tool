import axios from 'axios';

// API base URL:
//   Unified deploy (backend serves this build): leave VITE_API_URL unset → uses relative /api
//   Separate deploy (frontend on Vercel/Netlify, backend on Render):
//     set VITE_API_URL=https://your-backend.onrender.com in frontend/.env.production
//
// Local dev: Vite proxy forwards /api → backend (see vite.config.ts server.proxy).
// No env var needed locally — the proxy handles it.
const baseURL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const api = axios.create({
  baseURL,
  headers:         { 'Content-Type': 'application/json' },
  withCredentials: true,
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    const url: string = error.config?.url ?? '';

    // /auth/session is the session-check probe (always returns 200, so this
    // guard is just a safety net for /auth/me direct calls by other components).
    const isSessionProbe = url.includes('/auth/session') || url.includes('/auth/me');

    // Avoid redirect storms: don't navigate if already on the login page.
    const alreadyOnLogin = window.location.pathname === '/login';

    if (status === 401 && !isSessionProbe && !alreadyOnLogin) {
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

export default api;
