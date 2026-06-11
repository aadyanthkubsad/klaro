import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// GEMINI_API_KEY is intentionally NOT exposed to the frontend bundle.
// All AI calls are proxied through Express endpoints in server.ts which
// read process.env.GEMINI_API_KEY server-side only.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    minify: 'esbuild',
    target: 'es2020',
  },
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: {
      ignored: ['**/server_log.txt', '**/node_modules/**', '**/dist/**', '**/*.log', '**/data/**', '**/public/generated-audio/**'],
    },
  },
});
