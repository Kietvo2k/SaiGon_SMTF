import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  server: { port: Number(process.env.VITE_PORT || 5173) },
  build: {
    rollupOptions: {
      input: {
        officer: resolve(__dirname, 'index-officer.html'),
        citizen: resolve(__dirname, 'index-citizen.html')
      }
    }
  }
});
