import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the website talks to the backend through this proxy, so the browser sees one
// address (http://localhost:5173) and no cross-origin settings are needed.
// Change BACKEND_URL if your API is not on port 4000.
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: BACKEND_URL, changeOrigin: true },
      '/media': { target: BACKEND_URL, changeOrigin: true },
    },
  },
  preview: { port: 5173 },
});
