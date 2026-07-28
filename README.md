
# StitchSpeak

StitchSpeak translates knitting pattern PDFs using localized terminology and includes a Gemini-powered assistant.

## Setup

### Frontend
1. `npm install`
2. Copy `.env.example` to `.env` and set `VITE_GOOGLE_CLIENT_ID` for Google sign-in.
3. `npm run dev`

### Server
1. `cd server && npm install`
2. Set environment variables: `GEMINI_API_KEY`, `OPENAI_API_KEY`, and `GOOGLE_CLIENT_ID` (same value as `VITE_GOOGLE_CLIENT_ID`).
3. `npm run dev`

All assisted features run through the Express server. Translation, chat, glossary lookup, and grading use Gemini; tech editing uses OpenAI. No API keys are exposed to the browser.

## Launch checklist

Frontend hosting (Vercel or GitHub Pages) needs:

- `VITE_GOOGLE_CLIENT_ID`
- `VITE_API_URL` pointing at the public Express server, for example `https://your-api.up.railway.app`

Server hosting needs:

- `NODE_ENV=production`
- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `GOOGLE_CLIENT_ID` matching the frontend client ID
- `AUTH_SESSION_SECRET` with a long random value for email-account sessions
- `APP_URL` with the canonical frontend origin used in verification/reset links
- `RESEND_API_KEY` and `AUTH_EMAIL_FROM` for verification and password-reset delivery
- `FRONTEND_URL` with every public frontend origin, comma-separated
- `DATA_DIR` on a persistent volume
- `ADMIN_EMAILS` with the comma-separated Google accounts allowed to open `/admin`
- `LEMON_SQUEEZY_API_KEY`, `LEMON_SQUEEZY_STORE_ID`, `LEMON_SQUEEZY_VARIANT_ID`, and `LEMON_SQUEEZY_WEBHOOK_SECRET` when payments are live

Before switching real users on:

1. Rotate any local API keys that may have been shared outside your machine.
2. Confirm Google OAuth allows the production frontend origin.
3. Confirm Lemon Squeezy webhook sends `order_created` to `/api/lemon-squeezy/webhook`.
4. Run `npm run check` in the repo root and `npm run build` in `server/`.
5. Open the deployed frontend and test sign-in, credit balance, checkout cancel/success, one small translation, glossary lookup, chat, history reload, and export.
6. Confirm the Lemon Squeezy API key, store, variant, and webhook are in **live
   mode**. Test-mode credentials can create valid-looking checkout URLs but cannot
   accept production payments.

### Production operations

- Railway must mount its persistent volume at `/data` and set `DATA_DIR=/data`.
- Configure the Railway health check to use `/health/deep`; it verifies Gemini, OpenAI, OAuth,
  payments, webhook configuration, and both persistent stores.
- Enable automated Railway volume backups before accepting payments. Periodically
  test restoring `credits.db` and the pattern store into a non-production environment.
- The `Production health` GitHub Actions workflow checks `/health/deep` every 15
  minutes. Keep GitHub Actions failure notifications enabled for the repository.
- The same workflow checks `/health/payments`; verified webhook reconciliation
  failures trigger alerts for one hour without taking the API offline.
- The `CI` GitHub Actions workflow must pass before merging to `main`.

### Lemon Squeezy setup

1. Create one single-payment product named `StitchSpeak Credits`.
2. Copy the store ID and the product variant ID into `LEMON_SQUEEZY_STORE_ID` and `LEMON_SQUEEZY_VARIANT_ID`.
3. Create an API key in Lemon Squeezy and set `LEMON_SQUEEZY_API_KEY`.
4. Create a webhook endpoint for `https://your-api.example.com/api/lemon-squeezy/webhook`.
5. Subscribe the webhook to `order_created` and `order_refunded`.
6. Choose a signing secret and set the same value as `LEMON_SQUEEZY_WEBHOOK_SECRET`.

The server creates checkout links on demand using Lemon Squeezy's Checkouts API. It overrides the product price per credit pack and sends the signed-in user ID as checkout custom data. Credits are granted only when the verified `order_created` webhook arrives.

## Stack

React 19, TypeScript, Vite, Tailwind CSS v4, Express, Google Gemini, OpenAI, Google Sign-In.
