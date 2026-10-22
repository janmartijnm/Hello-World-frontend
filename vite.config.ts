import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri runs the dev server on a fixed port (see src-tauri/tauri.conf.json). In a plain browser, /api is forwarded
// to NETBOX_UPSTREAM so the screens can be tried without the app.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.NETBOX_UPSTREAM || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'safari15',
  },
});
