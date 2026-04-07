import axios from 'axios';

// Unified deployment: frontend and backend are served from the same Render
// domain.  All API calls use the relative path /api — no environment variable
// needed, no cross-domain cookie complexity.
//
// Local dev: Vite proxies /api → http://localhost:5001 (or the Render backend).
// See the server.proxy block in vite.config.ts.
const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    const url: string = error.config?.url ?? '';

    // /auth/me is the session-check probe — a 401 from it is expected when the
    // user has no cookie and is handled by AuthContext's catch branch.
    // Redirecting here would cause a full-page reload loop because the reload
    // re-mounts AuthProvider, which calls /auth/me again, which 401s again.
    const isSessionProbe = url.includes('/auth/me');

    // Avoid redirect storms: don't navigate if already on the login page.
    const alreadyOnLogin = window.location.pathname === '/login';

    if (status === 401 && !isSessionProbe && !alreadyOnLogin) {
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

export default api;