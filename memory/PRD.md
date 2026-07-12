# LinkedIn Comment Assistant — Chrome Extension (PRD)

## Original problem statement
Build a production-quality Google Chrome extension (Manifest V3, React,
TypeScript) that detects LinkedIn feed posts via a dedicated DOM adapter,
generates context-aware AI comment suggestions (Claude Sonnet 4.5) through
a secure backend proxy, and lets the user review/edit/approve before posting.
The extension must NOT ask for LinkedIn credentials, never export cookies or
session tokens, and never auto-post.

## User choices (as stated by user)
- AI provider: **Claude Sonnet 4.5**
- API key source: User will supply their own Anthropic key (declined Emergent LLM key)
- Backend language: Node.js was suggested by user; environment supervisor is
  hard-coded to run Python FastAPI at `/app/backend/server.py`, so backend was
  built with **FastAPI + Anthropic Python SDK** (same secure-proxy architecture).
- UI surface: **Chrome Side Panel** (Chrome 114+) + inline injected button
- Design vibe: **LinkedIn-native** (blue `#0A66C2`, IBM Plex Sans, flat surfaces)

## Architecture
- `/app/backend` — FastAPI proxy on port 8001 (`/api/health`,
  `/api/settings/defaults`, `/api/generate-comment`). Anthropic Python SDK.
- `/app/frontend` — CRA + Tailwind landing / install page on port 3000.
- `/app/extension` — Chrome extension built with Vite + React + TypeScript.
  Ships to `/app/extension/dist` and is loadable via Chrome "Load unpacked".

## What's implemented (2026-07-12)
- **Backend**: FastAPI + Anthropic SDK 0.39, Pydantic validated request/response,
  MongoDB anonymous usage counter (no PII), CORS, structured logging, defensive
  error handling (503 when key missing, 422 on invalid payload, 502 on Anthropic
  failure).
- **Landing page**: Hero, feature grid, workflow, install steps, live backend
  health badge, LinkedIn-native design tokens.
- **Extension — Manifest V3**: side panel + content script + background service
  worker. Minimal permissions (`storage`, `sidePanel`, `activeTab`, `scripting`).
  Host permissions scoped to `linkedin.com` and backend URL.
- **Content script**: MutationObserver-based feed watcher, injects a scoped
  `✦ Suggest comment` button next to every post's action bar. All LinkedIn DOM
  logic isolated in `linkedin-adapter.ts`.
- **Post extractor**: pulls author name, headline, and cleaned post text
  (strips "see more" chrome). Never touches profile pages, DMs, or unrelated
  data.
- **Comment injector**: opens LinkedIn's inline comment editor and inserts the
  drafted text via `execCommand('insertText')` with input-event fallback.
  **NEVER** clicks Post — user always approves manually.
- **Side panel React UI**: enable/disable toggle, LinkedIn auth status
  indicator, post preview card, tone chips (5 tones), length segmented
  control (3 lengths), generate/regenerate/copy/insert actions, AI-draft
  badge that disappears when the user edits, settings panel (backend URL,
  custom instructions), toasts for success/error, empty state, aria-live
  region.
- **Shared layer**: typed messages (discriminated union), storage wrapper,
  AI HTTP client, logger, types.
- **Icons**: 16 / 48 / 128 PNGs generated (LinkedIn-blue rounded "in").
- **Build**: `yarn build` produces a clean `dist/` in ~3 s. `yarn type-check`
  passes with strict mode.

## Testing status
- Backend: contract tests pass (200 on `/api/health`, `/api/settings/defaults`;
  503 when no key; 422 on invalid payloads).
- Extension: `tsc --noEmit` passes; Vite build succeeds; all files present in
  `dist/`.
- Landing page: renders correctly, backend badge reports live status.
- Live AI call: **NOT** exercised — user chose to skip until they add their
  Anthropic key.

## Backlog / next actions
- P0: User adds `ANTHROPIC_API_KEY` to `/app/backend/.env` and runs
  `sudo supervisorctl restart backend` to enable generation.
- P0: Load `/app/extension/dist` via `chrome://extensions` → Load unpacked,
  and run a live smoke test on the LinkedIn feed.
- P1: Comment history stored locally per user preference.
- P1: Additional AI providers (Gemini, GPT) selectable in Settings.
- P2: Multilingual DOM adapter validation (non-English LinkedIn UIs).
- P2: Comment analytics (draft acceptance rate, edit distance) — anonymous
  and opt-in only.

## Personas
- **Primary**: LinkedIn power users (founders, PMs, technical leads) who
  comment daily and want to save 60–90 s per thoughtful comment.
- **Secondary**: Sales/BD professionals building rapport via meaningful
  engagement (not spam).
