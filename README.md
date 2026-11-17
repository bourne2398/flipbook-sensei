# Flipbook Sensei

A static FlipHTML5 learning workspace with a server-side AI teacher.

## Architecture

- `index.html` is the static homepage served at `/`.
- `api/teach.js` is a Vercel Node.js Function served at `POST /api/teach`.
- The browser uploads an optimized page screenshot to the API.
- The API sends the screenshot to OpenAI using the server-side `OPENAI_API_KEY`.

There is no Python runtime, Python entrypoint, build step, or external Node dependency.

## Vercel setup

1. Import this repository into Vercel.
2. Set Framework Preset to **Other**.
3. Leave Root Directory blank.
4. Leave Build Command and Output Directory unset.
5. Add `OPENAI_API_KEY` to the Production environment variables.
6. Optionally set `OPENAI_MODEL` (defaults to `gpt-4.1-mini`).
7. Deploy the `main` branch.

## Routes

- `GET /` serves the static learning studio.
- `POST /api/teach` generates a teacher-style explanation.
- Other methods on `/api/teach` return HTTP 405.

## Notes

FlipHTML5 embeds are cross-origin. The app cannot read the flipbook's internal page content directly, so the learner supplies a screenshot for accurate visual explanation. API credentials are never sent to the browser.
