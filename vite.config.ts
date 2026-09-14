import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import offlineServiceWorker from './scripts/build-offline.mjs';

// Works at /, a project page, and locally. CI supplies the exact repository base.
const base = process.env.BASE_PATH || '/creator-autoedit/';
export default defineConfig({
  base,
  plugins: [react(), tailwind(), offlineServiceWorker({ base }), {
    name: 'development-csp', apply: 'serve',
    // Vite HMR has an inline refresh preamble and a WebSocket. Production retains its CSP.
    transformIndexHtml: html => html.replace(/<meta[^>]+http-equiv="Content-Security-Policy"[^>]*>/i, ''),
  }],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@mediabunny/aac-encoder'] },
  build: { target: 'es2022', sourcemap: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 1500 },
});
