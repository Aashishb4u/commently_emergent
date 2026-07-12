# LinkedIn Comment Assistant — Chrome Extension

A production-quality Chrome extension (Manifest V3, React + TypeScript, Vite) that
generates thoughtful, context-aware AI comment suggestions for LinkedIn posts
using **Claude Sonnet 4.5**. The user's LinkedIn credentials are **never**
requested or stored — the extension operates in the browser's existing
authenticated session and always asks for explicit approval before posting.

---

## 1. Architecture overview

```
                       ┌──────────────────────────────┐
                       │       LinkedIn.com tab       │
                       │  ┌────────────────────────┐  │
                       │  │  content.js            │  │
                       │  │  • DOM adapter         │──┼──► POST_SELECTED
                       │  │  • Post extractor      │  │
                       │  │  • Comment injector    │◄─┼──  INSERT_COMMENT
                       │  └────────────────────────┘  │
                       └──────────────┬───────────────┘
                                      │ chrome.runtime.sendMessage
                                      ▼
                       ┌──────────────────────────────┐
                       │   background/service-worker  │
                       │   • Message router           │
                       │   • Opens side panel         │
                       │   • Proxies AI calls         │
                       └──────────────┬───────────────┘
                                      │ chrome.tabs.sendMessage / fetch
                        ┌─────────────┴──────────────┐
                        ▼                            ▼
       ┌─────────────────────────┐        ┌──────────────────────┐
       │  Side panel (React)     │        │  Backend (FastAPI)   │
       │  • Tone / length UI     │        │  POST /api/generate- │
       │  • Editable draft       │        │       comment        │
       │  • Insert action        │        │  Anthropic SDK       │
       └─────────────────────────┘        └──────────────────────┘
```

Every layer is decoupled:

- **`content/linkedin-adapter.ts`** — the *only* file that knows LinkedIn's
  DOM. When LinkedIn ships UI changes, update this file alone.
- **`shared/`** — messages, storage, HTTP client, types. Framework-agnostic.
- **`sidepanel/`** — React UI, does not touch the DOM adapter directly.
- **`background/service-worker.ts`** — orchestrates messages and proxies
  network calls so the side panel and content script stay simple.

## 2. User workflow

1. Sign in to LinkedIn normally in Chrome.
2. Open your feed. Every post grows a small `✦ Suggest comment` button next
   to Like / Comment / Repost / Send.
3. Click it → the Chrome **side panel** opens with the post already selected.
4. Choose a tone (`professional`, `thoughtful`, `concise`, `friendly`,
   `insightful`) and length (`short` / `medium` / `long`).
5. Press **Generate comment**. The draft appears with an "AI draft" badge.
6. Edit freely. Regenerate if you want a different angle.
7. Press **Insert** — the extension places the text into LinkedIn's own
   comment editor. **You** still click LinkedIn's Post button.

## 3. Project structure

```
/app
├─ backend/                       # FastAPI AI proxy (port 8001)
│  ├─ server.py                   # /api/health, /api/generate-comment
│  ├─ requirements.txt
│  └─ .env                        # ANTHROPIC_API_KEY, MONGO_URL, DB_NAME
│
├─ frontend/                      # Marketing / install landing page (port 3000)
│  └─ …                           # CRA + Tailwind
│
└─ extension/                     # Chrome extension source
   ├─ public/
   │  ├─ manifest.json            # Manifest V3
   │  └─ icons/                   # 16 / 48 / 128 px PNGs
   ├─ src/
   │  ├─ background/
   │  │  └─ service-worker.ts
   │  ├─ content/
   │  │  ├─ content-script.ts
   │  │  ├─ linkedin-adapter.ts   # ← the only LinkedIn-DOM aware file
   │  │  ├─ post-extractor.ts
   │  │  └─ comment-injector.ts
   │  ├─ shared/
   │  │  ├─ ai-client.ts
   │  │  ├─ messages.ts
   │  │  ├─ storage.ts
   │  │  ├─ logger.ts
   │  │  └─ types.ts
   │  └─ sidepanel/
   │     ├─ index.html
   │     ├─ main.tsx
   │     ├─ SidePanel.tsx         # ← whole React UI
   │     └─ styles.css
   ├─ vite.config.ts
   ├─ tsconfig.json
   ├─ tailwind.config.cjs
   ├─ postcss.config.cjs
   └─ package.json
```

## 4. Manifest V3 permission strategy

| Permission                                             | Why                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `storage`                                              | Save the user's non-sensitive prefs (tone, length, backend URL, enabled toggle).                 |
| `sidePanel`                                            | Show the extension's main UI in the Chrome side panel.                                           |
| `activeTab`                                            | Reach into the currently-focused LinkedIn tab from the service worker on user gesture.           |
| `scripting`                                            | Reserved for future dynamic content-script injection (not currently used at runtime).            |
| Host `https://www.linkedin.com/*`                      | Content script needs to read the visible feed DOM and inject the comment.                        |
| Host `https://<your-backend-domain>/*`                 | Side panel + service worker call the AI proxy. Update this to your deployed backend.             |

Deliberately **NOT** requested: `cookies`, `webRequest`, `<all_urls>`,
`tabs` (full), `history`, `identity`.

## 5. Communication flow

```
LinkedIn tab               Background worker              Side panel
─────────────              ─────────────────              ──────────
POST_SELECTED  ──────────►  cache + sidePanel.open  ────►  render post
                                                            │
                                                            ▼
                            ◄──────────────  GENERATE_COMMENT
                            (proxy to backend)
                            │
                            └───────►  Anthropic API (server-side)
                            ◄─────────  { comment }
                                                            │
                                                            ▼
INSERT_COMMENT ◄─── (relayed) ──────  side panel "Insert"
   │
   ▼
Editor filled;
user presses Post themselves.
```

## 6. Security & privacy

- The extension **never** requests a LinkedIn username or password.
- No LinkedIn cookies, session tokens, or authentication data are read,
  exported, transmitted or persisted.
- The **Anthropic API key lives only on the backend** (`/app/backend/.env`).
  It is never bundled into the extension.
- Only the *visible* text of a post the user explicitly selects is sent to
  the backend, along with tone/length preferences.
- Nothing is auto-posted. LinkedIn's own Post button remains the final gate.
- Backend anonymously logs `tone`, `length`, and `user-agent` for usage
  metrics only — no post content, no author, no user identity.

## 7. Local development

### Backend

```bash
# 1. Set your Anthropic API key
edit /app/backend/.env    # set ANTHROPIC_API_KEY=sk-ant-...

# 2. Restart
sudo supervisorctl restart backend

# 3. Smoke test
curl "$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2)/api/health"
```

### Landing page

Runs automatically on port 3000 via supervisor.

### Extension

```bash
cd /app/extension
yarn install          # already installed once
yarn build            # writes /app/extension/dist
```

Load into Chrome:

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top-right)
3. Click **Load unpacked** → select `/app/extension/dist`
4. Sign in to LinkedIn as usual
5. Click the extension's toolbar icon or click a `✦ Suggest comment` on any post

Hot-reload dev build: `yarn dev` (writes to `dist/` on every change; reload
the extension in `chrome://extensions` to pick up new content-script code).

## 8. Testing strategy

- **Backend** — `curl` against `/api/health` (no key needed) and
  `/api/generate-comment` (requires `ANTHROPIC_API_KEY`). Payload validation
  is enforced by Pydantic. Anthropic errors surface as 502 with a helpful
  detail message.
- **Content script / DOM adapter** — designed so each selector function is
  small and pure; can be unit-tested against a saved LinkedIn HTML fixture.
- **Side panel React** — components are keyed by `data-testid` for E2E
  automation (see all `data-testid="*"` attributes in `SidePanel.tsx`).
- **Manual** — the smoke test is: install → sign in to LinkedIn → click the
  injected button on any feed post → verify draft appears → edit → insert →
  verify LinkedIn's editor shows the text → press Post.

## 9. Security & privacy checklist

- [x] No credential prompts inside the extension
- [x] No cookie / session-token access
- [x] No auto-submit of comments
- [x] AI key stays on backend only (server-side Anthropic call)
- [x] Only user-selected, visible post text is transmitted
- [x] Minimal Manifest V3 permissions
- [x] CSP set to `script-src 'self'; object-src 'self'`
- [x] Injected CSS namespaced under `lca-*`
- [x] Storage uses `chrome.storage.local` — never `sync` (avoids cloud copies)
- [x] Anonymous usage metrics only (no PII, no post content)

## 10. Known limitations & maintenance

- LinkedIn regularly changes DOM class names. When that happens the
  extension gracefully does nothing rather than misbehaving. Fix by editing
  **only** `src/content/linkedin-adapter.ts`.
- Anthropic occasionally returns 529 (overload). The backend surfaces this
  as a 502 with the original message; the UI shows the error and offers a
  regenerate button.
- The Chrome Side Panel API requires Chrome 114+.
- The current implementation targets English feed posts. The AI prompt
  itself is language-agnostic (Claude handles most languages well), but the
  DOM adapter has been validated primarily against English LinkedIn UI.

---

**License**: MIT.
Built as a demonstration of Manifest V3 architecture, safe DOM
interaction, and AI-assisted UX with explicit user control.
