import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// The model probe can run for several minutes. Disable HMR so unrelated source
// edits in the shared workspace cannot navigate away from an in-flight model.
export default defineConfig({
  base: process.env.BASE_PATH || '/creator-autoedit/',
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { hmr: false },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@huggingface/transformers', '@shiguredo/rnnoise-wasm'] },
});

