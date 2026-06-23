
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
    // `vite preview` serves the production build, so it's the right place to
    // exercise the report-only CSP locally (dev uses inline/eval HMR scripts
    // that would generate misleading violations). Mirrors vercel.json.
    preview: {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy-Report-Only':
          "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://*.googleusercontent.com https://*.gstatic.com; connect-src 'self' https://accounts.google.com https://stitchspeak-production.up.railway.app; frame-src https://accounts.google.com; worker-src 'self' blob:",
      },
    },
    server: {
      // Baseline hardening headers for the dev server. (Production headers are
      // configured in vercel.json.) A full CSP is intentionally omitted here
      // because it would break Vite's inline HMR scripts.
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
      },
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
