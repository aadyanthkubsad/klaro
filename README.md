<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/ac700134-4738-401d-8e7a-4549a523addd

## Run Locally

**Prerequisites:** Node.js 22+

1. Install dependencies:
   ```
   npm install
   ```
2. Create a `.env` file at the project root (alongside `package.json`) with your Gemini API key:
   ```
   GEMINI_API_KEY=AIza...your_real_key_here...
   ```
   Get a key at https://aistudio.google.com/apikey. The key is **only** read server-side from `process.env.GEMINI_API_KEY` and is never bundled into the frontend.
3. Run the app:
   ```
   npm run dev
   ```
4. Verify the key was picked up — the server logs a one-line summary at startup:
   ```
   [VARKify] Gemini API key check
     API key exists: true
     API key length: 39
     Source:         process.env.GEMINI_API_KEY (.env via dotenv)
   ```
   You can also hit `http://localhost:3000/api/debug-key` to see the same status as JSON (no key contents).
