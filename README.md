
# 🧶 StitchSpeak

StitchSpeak is an intelligent knitting pattern translator that accurately converts patterns into different languages using localized knitting terminology and abbreviations.

## Features

- **PDF Translation**: Upload a knitting pattern PDF and translate it instantly.
- **Localized Terminology**: Uses correct abbreviations (like `k2tog`, `m1l`, `yo`) specific to the target language.
- **Alternating Formatting**: Automatically formats multi-size instructions (e.g., `2 (3) 4 (5)`) for better readability.
- **AI Knitting Assistant**: Ask questions about your translated pattern to get expert advice.
- **Secure Payments**: Integrated with a Stripe simulation for premium translation services.

## Setup

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file and add your Gemini API key:
   ```env
   VITE_API_KEY=your_api_key_here
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```

## Deployment to GitHub Pages

1. Push your code to a GitHub repository.
2. Go to **Settings > Secrets and variables > Actions**.
3. Add a new secret named `API_KEY` with your Gemini API key.
4. The GitHub Action in `.github/workflows/deploy.yml` will automatically build and deploy the site.

## Technologies

- React 19
- TypeScript
- Tailwind CSS
- Google Gemini API (@google/genai)
- Vite
- GitHub Actions
