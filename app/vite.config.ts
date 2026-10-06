import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development, /api is proxied to the local API (npm run dev in ../api, port 7071).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:7071' }
  },
  build: { outDir: 'dist', sourcemap: false }
});
