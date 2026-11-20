import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development, `/api` is proxied to survey-skipper-server on port 3000 (override with API_TARGET).
const proxy = {
  '/api': {
    target: process.env.API_TARGET ?? 'http://localhost:3000',
    rewrite: (path: string) => path.replace(/^\/api/, ''),
  },
};

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
});
