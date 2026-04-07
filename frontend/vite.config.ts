import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
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
      // Point this at your local backend (npm run dev in /backend) or at the
      // Render service if you don't want to run the backend locally.
      '/api': {
        target: 'http://localhost:5002',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../backend/public'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Core React runtime — must be in its own chunk so every lazy page
          // can share the same singleton without re-bundling it.
          if (id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router-dom/') ||
              id.includes('node_modules/scheduler/')) {
            return 'vendor-react';
          }
          // Data-fetching layer
          if (id.includes('node_modules/@tanstack/')) {
            return 'vendor-query';
          }
          // Form validation — only pulled in on pages that use forms
          if (id.includes('node_modules/react-hook-form') ||
              id.includes('node_modules/@hookform/') ||
              id.includes('node_modules/zod/')) {
            return 'vendor-forms';
          }
          // jsPDF is large (~230 KB minified) — isolate it so it's only
          // downloaded when the user visits a page that generates PDFs.
          if (id.includes('node_modules/jspdf') ||
              id.includes('node_modules/jsPDF')) {
            return 'vendor-pdf';
          }
          // Icon + utility libraries
          if (id.includes('node_modules/lucide-react') ||
              id.includes('node_modules/clsx') ||
              id.includes('node_modules/tailwind-merge')) {
            return 'vendor-ui';
          }
        },
      },
    },
  },
});