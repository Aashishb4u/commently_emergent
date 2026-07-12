import React, { useEffect, useState } from "react";
import "./App.css";
import {
  Sparkles,
  ShieldCheck,
  Zap,
  Puzzle,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Tag,
  Sliders,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const FEATURES = [
  {
    icon: Tag,
    title: "Keyword-driven feed scan",
    body: "Type the topics you want to engage with — AI, product, GTM, whatever — and Commently scrolls LinkedIn to find matching posts for you.",
  },
  {
    icon: Sparkles,
    title: "Model-agnostic AI",
    body: "Powered by OpenAI (GPT-4o mini by default). Swap the model via a single env variable — no code changes.",
  },
  {
    icon: ShieldCheck,
    title: "Uses your existing LinkedIn session",
    body: "Never asks for your password. No cookies, tokens, or credentials are stored or transmitted.",
  },
  {
    icon: Sliders,
    title: "Human-in-the-loop by design",
    body: "Comments are drafted into LinkedIn's own comment box. You still press Post yourself — nothing auto-submits.",
  },
  {
    icon: Zap,
    title: "Side panel workflow",
    body: "Set tone, length and a cap on comments per run. Watch each match land in real time.",
  },
  {
    icon: Puzzle,
    title: "Modular DOM adapter",
    body: "LinkedIn selectors are isolated in one file — Commently survives UI changes without rewrites.",
  },
];

const TONES = [
  "professional",
  "thoughtful",
  "concise",
  "friendly",
  "insightful",
];

function App() {
  const [health, setHealth] = useState({ state: "loading" });

  useEffect(() => {
    fetch(`${API}/health`)
      .then((r) => r.json())
      .then((d) => setHealth({ state: "ok", data: d }))
      .catch(() => setHealth({ state: "error" }));
  }, []);

  return (
    <div className="min-h-screen bg-white text-li-text" data-testid="landing-root">
      {/* Header */}
      <header
        className="sticky top-0 z-50 bg-white/85 backdrop-blur-md border-b border-black/5"
        data-testid="landing-header"
      >
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/commently-logo.png" alt="Commently" className="w-7 h-7 rounded-md" />
            <span className="font-semibold tracking-tight">Commently</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <BackendBadge health={health} />
            <a
              href="/linkedin-comment-assistant.zip"
              download="commently-extension.zip"
              className="px-3 py-1.5 rounded-full bg-li-primary text-white font-semibold hover:bg-li-primaryHover transition-colors"
              data-testid="header-install-cta"
            >
              Download
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-black/5">
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div className="relative max-w-6xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <span
              className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-li-ai bg-li-ai/10 border border-li-ai/20 px-2.5 py-1 rounded"
              data-testid="hero-badge"
            >
              <Sparkles className="w-3 h-3" strokeWidth={2} />
              Type keywords · Commently drafts
            </span>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-[1.05]">
              Comment on the LinkedIn posts{" "}
              <span className="text-li-primary">that actually matter to you.</span>
            </h1>
            <p className="text-lg text-li-muted leading-relaxed max-w-xl">
              Give Commently a few keywords. It scrolls your LinkedIn feed, finds the posts that
              match, and drafts a thoughtful comment in your voice — right inside LinkedIn's own
              comment box. You review and press Post.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href="/linkedin-comment-assistant.zip"
                download="commently-extension.zip"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-li-primary text-white rounded-full font-semibold hover:bg-li-primaryHover transition-colors shadow-card"
                data-testid="hero-install-cta"
              >
                Download Commently
                <ArrowRight className="w-4 h-4" strokeWidth={2} />
              </a>
              <a
                href="#how"
                className="text-sm font-semibold text-li-primary hover:underline"
                data-testid="hero-how-link"
              >
                How it works →
              </a>
            </div>
            <div className="flex flex-wrap gap-2 pt-3" data-testid="hero-tone-chips">
              {TONES.map((t) => (
                <span
                  key={t}
                  className="text-[11px] uppercase tracking-wider font-semibold text-li-muted bg-li-bg border border-li-border px-2 py-1 rounded-full"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          <MockPanel />
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="max-w-2xl mb-12">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-li-muted mb-2">
            What's inside
          </div>
          <h2 className="text-3xl font-bold tracking-tight">
            Built the way a senior extension engineer would build it.
          </h2>
        </div>
        <div className="grid md:grid-cols-2 gap-6" data-testid="features-grid">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="p-6 bg-white border border-li-border rounded-lg shadow-card hover:-translate-y-[1px] transition-transform"
              data-testid={`feature-${f.title.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <f.icon className="w-5 h-5 text-li-primary mb-3" strokeWidth={1.5} />
              <h3 className="font-semibold text-lg tracking-tight mb-1">{f.title}</h3>
              <p className="text-sm text-li-muted leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-black/5 bg-li-bg/50">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="max-w-2xl mb-12">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-li-muted mb-2">
              End-to-end workflow
            </div>
            <h2 className="text-3xl font-bold tracking-tight">
              Keywords → Match → Draft → Approve.
            </h2>
          </div>
          <ol className="grid md:grid-cols-4 gap-6" data-testid="workflow-steps">
            {[
              ["Set keywords", "Type the topics that matter — comma-separated — plus tone and length."],
              ["Scan the feed", "Commently scrolls your LinkedIn feed and finds posts matching your keywords."],
              ["Draft comments", "The OpenAI proxy generates a comment per match, opens each comment box, and inserts the draft."],
              ["Approve & post", "You review each draft in LinkedIn's own comment box and press Post yourself."],
            ].map(([title, body], i) => (
              <li
                key={title}
                className="p-5 bg-white border border-li-border rounded-lg"
                data-testid={`workflow-step-${i + 1}`}
              >
                <div className="text-xs font-mono text-li-primary mb-2">0{i + 1}</div>
                <div className="font-semibold mb-1">{title}</div>
                <div className="text-sm text-li-muted leading-relaxed">{body}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Install */}
      <section id="install" className="max-w-4xl mx-auto px-6 py-20">
        <div className="max-w-2xl mb-8">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-li-muted mb-2">
            Install locally
          </div>
          <h2 className="text-3xl font-bold tracking-tight">
            Load the unpacked extension in Chrome.
          </h2>
        </div>
        <div
          className="bg-white border border-li-border rounded-lg p-6 space-y-4 shadow-card"
          data-testid="install-steps"
        >
          {[
            ["Download & unzip", "Click Download above to get commently-extension.zip and unzip it anywhere on your computer."],
            ["Open Chrome extensions", "Go to chrome://extensions and toggle Developer mode on (top-right)."],
            ["Load unpacked", 'Click "Load unpacked" and select the unzipped folder (the one containing manifest.json).'],
            ["Configure the API key", "Edit /app/backend/.env to set OPENAI_API_KEY=sk-... then run sudo supervisorctl restart backend."],
            ["Use it on LinkedIn", "Open your LinkedIn feed → open the Commently side panel from the toolbar → type keywords → click Generate comments."],
          ].map(([step, body], i) => (
            <div key={step} className="flex gap-4" data-testid={`install-step-${i + 1}`}>
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-li-primary text-white font-bold text-sm flex items-center justify-center">
                {i + 1}
              </div>
              <div>
                <div className="font-semibold">{step}</div>
                <p className="text-sm text-li-muted leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-black/5">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-3 text-xs text-li-muted">
          <span>
            Commently · FastAPI + OpenAI. Model, temperature and token limits are configurable
            via env variables — no code changes needed.
          </span>
          <span className="font-mono">v1.2.0</span>
        </div>
      </footer>
    </div>
  );
}

function BackendBadge({ health }) {
  if (health.state === "loading") {
    return (
      <span className="inline-flex items-center gap-1.5 text-li-muted" data-testid="backend-status-loading">
        <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
        Checking backend…
      </span>
    );
  }
  if (health.state === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-li-error font-semibold" data-testid="backend-status-error">
        <XCircle className="w-3 h-3" strokeWidth={2} />
        Backend offline
      </span>
    );
  }
  const configured = health.data?.ai_configured;
  const modelLabel = health.data?.model_label ?? "AI";
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold ${configured ? "text-li-success" : "text-li-error"}`}
      data-testid="backend-status-ok"
    >
      <CheckCircle2 className="w-3 h-3" strokeWidth={2} />
      Backend online · {configured ? modelLabel : "API key missing"}
    </span>
  );
}

function MockPanel() {
  return (
    <div
      className="relative mx-auto w-full max-w-[380px] bg-white border border-li-border rounded-xl shadow-[0_20px_60px_rgba(10,102,194,0.15)] overflow-hidden"
      data-testid="hero-mock-panel"
    >
      <div className="px-4 py-3 bg-white border-b border-black/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/commently-logo.png" alt="Commently" className="w-6 h-6 rounded-md" />
          <span className="font-semibold text-sm">Commently</span>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-li-success">
          <CheckCircle2 className="w-3 h-3" strokeWidth={2} /> Signed in
        </span>
      </div>
      <div className="p-4 space-y-3 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-li-muted mb-1 font-semibold">
            Keywords
          </div>
          <div className="p-2 text-xs bg-white border border-li-border rounded-md flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-li-muted" strokeWidth={2} />
            <span>Postgres, migration, replication</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["professional", "thoughtful", "concise"].map((t, i) => (
            <span
              key={t}
              className={
                i === 1
                  ? "px-2.5 py-1 rounded-full text-[11px] font-medium border border-li-primary bg-li-primary/10 text-li-primary"
                  : "px-2.5 py-1 rounded-full text-[11px] font-medium border border-li-border bg-white text-li-muted"
              }
            >
              {t}
            </span>
          ))}
        </div>
        <button
          type="button"
          disabled
          className="w-full py-2 bg-li-primary text-white rounded-full text-xs font-semibold flex items-center justify-center gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
          Generate comments
        </button>
        <div className="p-2 rounded-md bg-li-bg border border-black/5 text-xs">
          <div className="font-semibold text-li-text truncate">Jane Doe</div>
          <div className="italic text-li-muted line-clamp-2">
            Just wrapped our zero-downtime migration to Postgres 16. Three things I'd do
            differently next time…
          </div>
          <div className="mt-1.5 p-2 bg-white border border-li-border rounded text-li-text">
            <div className="text-[9px] uppercase tracking-wider text-li-ai font-bold mb-0.5">
              Drafted comment
            </div>
            The logical replication trade-off is the one that always bites teams later — curious
            whether you kept the publication scoped to a subset of tables.
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
