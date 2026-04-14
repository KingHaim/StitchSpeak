# StitchSpeak

## Cursor Cloud specific instructions

StitchSpeak is a single-page React 19 + TypeScript + Tailwind CSS v4 app built with Vite. There is no backend — the Gemini API is called directly from the browser.

### Commands

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Dev server | `npm run dev` |
| Lint | `npm run lint` |
| Build | `npm run build` |
| Preview build | `npm run preview` |

### Key notes

- The app requires a `VITE_API_KEY` env var (Google Gemini API key) in `.env` for AI features. Without it, the app runs in **demo/fallback mode** with stub responses.
- Tailwind CSS v4 uses the `@tailwindcss/vite` plugin — there is no `tailwind.config.js`. Styles are imported via `@import "tailwindcss"` in `src/index.css`.
- The app deploys to both **Vercel** (`vercel.json`) and **GitHub Pages** (`.github/workflows/deploy.yml`).
- TypeScript strict mode is enabled. Run `npx tsc -b` to type-check without building.
