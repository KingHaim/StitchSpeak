
import { loadEnv, type ProxyOptions } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const LOCAL_SESSION_COOKIE = 'ss_session';
const HOST_SESSION_COOKIE = '__Host-ss_session';

function isRemoteApiTarget(target: string): boolean {
  try {
    const { hostname } = new URL(target);
    return hostname !== 'localhost' && hostname !== '127.0.0.1';
  } catch {
    return false;
  }
}

/**
 * Production sets an `__Host-` Secure cookie that browsers will not store on
 * http://localhost. When the Vite proxy targets a remote API, rewrite the
 * cookie to a first-party localhost cookie and map it back on the way out.
 */
function remoteSessionCookieProxy(): Pick<ProxyOptions, 'configure'> {
  return {
    configure(proxy) {
      proxy.on('proxyReq', (proxyReq, req) => {
        const cookie = req.headers.cookie;
        if (!cookie?.includes(`${LOCAL_SESSION_COOKIE}=`)) return;
        proxyReq.setHeader(
          'cookie',
          cookie.replaceAll(`${LOCAL_SESSION_COOKIE}=`, `${HOST_SESSION_COOKIE}=`),
        );
      });
      proxy.on('proxyRes', (proxyRes) => {
        const setCookie = proxyRes.headers['set-cookie'];
        if (!setCookie) return;
        const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
        proxyRes.headers['set-cookie'] = cookies.map((value) =>
          value
            .replaceAll(`${HOST_SESSION_COOKIE}=`, `${LOCAL_SESSION_COOKIE}=`)
            .replace(/;\s*Secure/gi, '')
            .replace(/;\s*SameSite=None/gi, '; SameSite=Lax'),
        );
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_URL || 'http://localhost:3001';

  return {
    plugins: [react(), tailwindcss()],
    test: {
      exclude: ['e2e/**', '**/node_modules/**', '**/dist/**'],
    },
    build: {
      outDir: 'dist',
    },
    // `vite preview` serves the production build, so it's the right place to
    // exercise the enforced CSP locally (dev uses inline/eval HMR scripts that
    // would generate misleading violations). Mirrors vercel.json.
    preview: {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy':
          "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://*.gstatic.com https://*.googleusercontent.com; connect-src 'self' https://accounts.google.com https://*.up.railway.app https://stitchspeak.com https://www.stitchspeak.com; frame-src https://accounts.google.com; worker-src 'self' blob:",
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
          target: apiTarget,
          changeOrigin: true,
          // Gemini 3 Pro can spend several minutes on a long pattern; the
          // proxy must stay open at least that long or local dev sees an
          // ECONNRESET while the API is still legitimately working.
          timeout: 10 * 60 * 1000,
          proxyTimeout: 10 * 60 * 1000,
          ...(isRemoteApiTarget(apiTarget) ? remoteSessionCookieProxy() : {}),
        },
      },
    },
  };
});
