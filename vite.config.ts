
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), tailwindcss()],
    build: {
      outDir: 'dist',
    },
    server: {
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:3001',
          changeOrigin: true,
          // Gemini 3 Pro can spend several minutes on a long pattern; the
          // proxy must stay open at least that long or local dev sees an
          // ECONNRESET while the API is still legitimately working.
          timeout: 10 * 60 * 1000,
          proxyTimeout: 10 * 60 * 1000,
        },
      },
    },
  };
});
