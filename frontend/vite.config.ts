import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        // In development /api/* is forwarded to the backend.
        // Override VITE_PROXY_TARGET in frontend/.env if your backend runs
        // on a different port or you want to proxy to the Render backend.
        '/api': {
          target: env.VITE_PROXY_TARGET || 'http://localhost:5002',
          changeOrigin: true,
        },
      },
    },
    build: {
      // Monorepo unified deploy: frontend build lands in backend/public/
      // so Express serves it as static files on the same origin.
      outDir: path.resolve(__dirname, '../backend/public'),
      emptyOutDir: true,
      // Disable the module-preload polyfill — it injects an inline <script> that
      // violates Content-Security-Policy script-src 'self'.  All browsers we target
      // (Chrome 66+, Firefox 115+, Safari 16.4+) support modulepreload natively.
      modulePreload: { polyfill: false },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router-dom/') ||
              id.includes('node_modules/scheduler/')
            ) return 'vendor-react';

            if (id.includes('node_modules/@tanstack/')) return 'vendor-query';

            if (
              id.includes('node_modules/react-hook-form') ||
              id.includes('node_modules/@hookform/') ||
              id.includes('node_modules/zod/')
            ) return 'vendor-forms';

            if (
              id.includes('node_modules/jspdf') ||
              id.includes('node_modules/jsPDF')
            ) return 'vendor-pdf';

            if (
              id.includes('node_modules/lucide-react') ||
              id.includes('node_modules/clsx') ||
              id.includes('node_modules/tailwind-merge')
            ) return 'vendor-ui';
          },
        },
      },
    },
  };
});
