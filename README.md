
# StitchSpeak

StitchSpeak translates knitting pattern PDFs using localized terminology and includes a Gemini-powered assistant.

## Setup

### Frontend
1. `npm install`
2. Copy `.env.example` to `.env` and set `VITE_GOOGLE_CLIENT_ID` for Google sign-in.
3. `npm run dev`

### Server
1. `cd server && npm install`
2. Set environment variables: `GEMINI_API_KEY` and `GOOGLE_CLIENT_ID` (same value as `VITE_GOOGLE_CLIENT_ID`).
3. `npm run dev`

All AI features (translation, chat, glossary lookup) run through the Express server. No API keys are exposed to the browser.

## Stack

React 19, TypeScript, Vite, Tailwind CSS v4, Express, Google Gemini, Google Sign-In.
