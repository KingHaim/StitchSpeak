# StitchSpeak

## Cursor Cloud specific instructions

StitchSpeak is a React 19 + TypeScript + Tailwind CSS v4 frontend (Vite) with an Express backend (`server/`). Translation, chat, and glossary AI lookup all go through the server, which calls the Gemini API server-side.

### Commands

| Task | Command | Dir |
|------|---------|-----|
| Install frontend deps | `npm install` | repo root |
| Install server deps | `npm install` | `server/` |
| Dev frontend | `npm run dev` | repo root |
| Dev server | `npm run dev` | `server/` |
| Lint | `npm run lint` | repo root |
| Build frontend | `npm run build` | repo root |
| Build server | `npm run build` | `server/` |
| Preview frontend build | `npm run preview` | repo root |
| Type-check frontend | `npx tsc -b` | repo root |

### Environment variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `GEMINI_API_KEY` | `server/.env` | Server-side Gemini key for translation, chat & glossary |
| `GOOGLE_CLIENT_ID` | `server/.env` | Same Google OAuth client ID as `VITE_GOOGLE_CLIENT_ID` — used server-side to verify ID tokens |
| `PORT` | `server/.env` | Port the Express server listens on (default `3001`) |
| `FRONTEND_URL` | `server/.env` | Comma-separated extra CORS origins (localhost dev ports are always allowed) |
| `DATA_DIR` | `server/.env` | Directory for persistent data like the credits DB (default `./data`) |
| `STRIPE_SECRET_KEY` | `server/.env` | Stripe secret key for creating card checkout sessions |
| `STRIPE_WEBHOOK_SECRET` | `server/.env` | Stripe webhook signing secret for completed checkout events |
| `APP_URL` | `server/.env` | Frontend app URL used for Stripe checkout success/cancel redirects |
| `VITE_GOOGLE_CLIENT_ID` | `.env` | Google OAuth Web client ID for sign-in |
| `VITE_API_URL` | `.env` | Backend origin the frontend calls (e.g. `http://localhost:3001`) |

Without `VITE_API_URL`, the frontend will call `/api/*` relative to its own origin (works if both are behind the same reverse proxy).

### Key notes

- Tailwind CSS v4 uses the `@tailwindcss/vite` plugin — there is no `tailwind.config.js`. Custom theme tokens (brand colors, animations) are defined via `@theme` and `@utility` in `src/index.css`.
- The app deploys to both **Vercel** (`vercel.json`) and **GitHub Pages** (`.github/workflows/deploy.yml`).
- TypeScript strict mode is enabled.
