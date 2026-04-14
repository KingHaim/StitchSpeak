
# StitchSpeak

StitchSpeak translates knitting pattern PDFs using localized terminology and includes a Gemini-powered assistant.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and set **`VITE_GEMINI_API_KEY`** (or `GEMINI_API_KEY` / `API_KEY`) and optionally **`VITE_GOOGLE_CLIENT_ID`** for sign-in.
3. `npm run dev`

Translation runs **in the browser** via `@google/genai` (the key is bundled; use a restricted key and do not commit `.env`).

`services/api.ts` mirrors the BeatingHeart `replicate.js` client pattern (`apiCall`, auth helpers) for a **future** backend; it is not required for the current app.

## Stack

React 19, TypeScript, Vite, Tailwind (CDN), Google Gemini, Google Sign-In.
