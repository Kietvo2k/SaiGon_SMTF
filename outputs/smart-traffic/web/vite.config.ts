import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const landing = resolve(__dirname, 'index.html');

export default defineConfig({
  plugins: [react()],
  server: { port: Number(process.env.VITE_PORT || 5173) },
  build: {
    rollupOptions: {
      input: {
        ...(process.env.SMTF_VERCEL_SUBMIT === '1' && existsSync(landing) ? { landing } : {}),
        officer: resolve(__dirname, 'index-officer.html'),
        citizen: resolve(__dirname, 'index-citizen.html')
      }
    }
  }
});
