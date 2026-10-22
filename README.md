# Veritas

Veritas is now a standalone React website with a server-side Gemini API. The original text/media analysis, video frame sampling, streaming assistant, PDF previews, themes, settings, exports, sharing, and device-local history are retained.

## Hosting architecture

- Vinext builds the React client and Cloudflare Worker. The Sites deployment serves versioned static assets and provisions D1.
- `/api/analyze` and `/api/chat` keep the Gemini key and prompts on the server. They require the platform's signed-in visitor identity and same-origin JSON POSTs.
- D1 stores atomic request counters, shared across Worker instances: **30 requests per signed-in user per minute**, and **500 requests for the entire site per UTC day**. These are request caps, not a dollar-denominated budget; set provider billing budgets separately. Limits fail closed if D1 is unavailable.
- Requests have a 90-second upstream timeout. Analysis output is capped at 4,096 tokens and chat output at 2,048 tokens. Input is bounded before parsing; plain text is limited to 100,000 characters, media to 8 MiB per API call. Videos up to 100 MiB use the existing browser frame sampling when over 8 MiB.
- The initial deployment is private. Preserve the platform access boundary. Making it public requires reviewing access and provider costs first; anonymous AI calls are rejected by the API.
- No uploaded media, chat content, or analysis text is stored by this server. Existing history and settings remain browser-local. D1 stores only quota scope/window/count/expiry, with expired rows removed on successful quota checks.

## Required runtime configuration

Set `GEMINI_API_KEY` as a **server runtime secret** in hosting. Do not put it in browser-visible `VITE_*`/`NEXT_PUBLIC_*` variables or source control. Until configured, the UI can load and local tools work; AI requests return a clear setup error.

`GEMINI_MODEL` is optional and defaults to `gemini-3.1-pro-preview`. The original `gemini-3-pro-preview` was retired. See [Google's model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview). The configured model must support inline media, structured JSON output, and streaming chat.

`GET /api/health` returns service availability and booleans for AI/quota configuration, never secret values. An `aiConfigured` value of `true` only means a key is present; it does not prove the key, model access, or quota is valid.

## Development and verification

Use Node.js 24 and npm:

```sh
npm ci
npm test
npm run typecheck
npm run db:generate  # only after changing db/schema.ts
npm run build
npm run dev
```

Local runtime secrets belong in an ignored `.dev.vars` file, using the key names from `.env.example`. The Sites starter supports local authentication emulation on portable development hosts; production identity must come from the hosting boundary. Use the supported Sites preview workflow in the managed environment.

Commit the lockfile, generated `drizzle/` migrations, and `.openai/hosting.json`. Sites applies schema migrations before publishing the Worker. CI validates request security boundaries, types, and the production build without an API key. Actual analysis/chat requires a configured key and an authenticated browser.

## Migrating existing browser data

Browser storage belongs to the website origin. History saved in AI Studio does not automatically appear on the new domain. Use the original app's JSON export while you still have access to its history; retain that export before retiring the old origin. Existing shared links remain tied to their old origin unless you move the query/hash to the new site URL. This migration does not delete the original AI Studio app or its local data.

## AI analysis limits

The output is a model's assessment, not proof of authorship or a calibrated probability. Review source/context and independent evidence before relying on a detection result.

Original AI Studio project: https://ai.studio/apps/drive/12bxJ7iVq9KEJiBnHkqQDotxCEjH2kNvY
