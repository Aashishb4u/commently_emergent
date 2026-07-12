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
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const FEATURES = [
  {
    icon: Sparkles,
    title: "Claude Sonnet 4.5",
    body: "Context-aware suggestions that actually read the post — no generic 'Great share!' filler.",
  },
  {
    icon: ShieldCheck,
    title: "Uses your existing LinkedIn session",
    body: "Never asks for your password. No cookies, tokens, or credentials are stored or transmitted.",
  },
  {
    icon: Zap,
    title: "Side panel + inline button",
    body: "Click ✨ next to any post, or open the side panel to review, edit, and approve before sending.",
  },
  {
    icon: Puzzle,
    title: "Modular DOM adapter",
    body: "LinkedIn selectors are isolated in one file — the extension survives UI changes without rewrites.",
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
            <div className="w-7 h-7 rounded-md bg-li-primary text-white flex items-center justify-center font-bold text-sm">
              in
            </div>
            <span className="font-semibold tracking-tight">Comment Assistant</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <BackendBadge health={health} />
            <a
              href="/linkedin-comment-assistant.zip"
              download="linkedin-comment-assistant.zip"
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
              AI-assisted, human-approved
            </span>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-[1.05]">
              Write LinkedIn comments{" "}
              <span className="text-li-primary">that actually add value.</span>
            </h1>
            <p className="text-lg text-li-muted leading-relaxed max-w-xl">
              A Chrome extension that reads the post you're looking at, drafts a
              thoughtful comment in your chosen tone, and lets you review before
              you post. No passwords. No autopilot.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href="/linkedin-comment-assistant.zip"
                download="linkedin-comment-assistant.zip"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-li-primary text-white rounded-full font-semibold hover:bg-li-primaryHover transition-colors shadow-card"
                data-testid="hero-install-cta"
              >
                Download extension (.zip)
                <ArrowRight className="w-4 h-4" strokeWidth={2} />
              </a>
              <a
                href="#install"
                className="text-sm font-semibold text-li-primary hover:underline"
                data-testid="hero-how-link"
              >
                How to install →
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
              <h3 className="font-semibold text-lg tracking-tight mb-1">
                {f.title}
              </h3>
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
              Detect → Draft → Review → Approve.
            </h2>
          </div>
          <ol className="grid md:grid-cols-4 gap-6" data-testid="workflow-steps">
            {[
              ["Detect posts", "Content script watches the feed via a dedicated LinkedIn DOM adapter."],
              ["Draft comment", "Backend proxies Claude Sonnet 4.5 — your API key never touches the browser."],
              ["Review & edit", "Suggestions appear in the side panel with an AI-generated badge. Edit freely."],
              ["Approve & post", "One-click insert into LinkedIn's own reply box. You always press Post."],
            ].map(([title, body], i) => (
              <li
                key={title}
                className="p-5 bg-white border border-li-border rounded-lg"
                data-testid={`workflow-step-${i + 1}`}
              >
                <div className="text-xs font-mono text-li-primary mb-2">
                  0{i + 1}
                </div>
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
            ["Download & unzip", "Click the Download button at the top of this page to get linkedin-comment-assistant.zip, then unzip it anywhere on your computer."],
            ["Open Chrome extensions", "Go to chrome://extensions and toggle Developer mode on (top-right)."],
            ["Load unpacked", 'Click "Load unpacked" and select the unzipped folder (the one containing manifest.json).'],
            ["Configure the API key", "On the sandbox, edit /app/backend/.env to set ANTHROPIC_API_KEY=sk-ant-... then run sudo supervisorctl restart backend."],
            ["Use it on LinkedIn", "Sign in to LinkedIn normally, open your feed, and click ✦ Suggest comment next to any post — or open the side panel from the Chrome toolbar."],
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

      {/* Footer */}
      <footer className="border-t border-black/5">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-3 text-xs text-li-muted">
          <span>
            Built with FastAPI + Claude Sonnet 4.5. Uses your existing LinkedIn
            session — never stores credentials.
          </span>
          <span className="font-mono">v1.0.0</span>
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
  const configured = health.data?.anthropic_configured;
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold ${configured ? "text-li-success" : "text-li-error"}`}
      data-testid="backend-status-ok"
    >
      <CheckCircle2 className="w-3 h-3" strokeWidth={2} />
      Backend online {configured ? "· AI configured" : "· API key missing"}
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
          <div className="w-6 h-6 rounded-md bg-li-primary text-white flex items-center justify-center font-bold text-xs">
            in
          </div>
          <span className="font-semibold text-sm">Comment Assistant</span>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-li-success">
          <CheckCircle2 className="w-3 h-3" strokeWidth={2} /> Signed in
        </span>
      </div>
      <div className="p-4 space-y-4 text-sm">
        <div className="bg-li-bg p-3 rounded-md border border-black/5">
          <div className="font-semibold text-li-text mb-1">Jane Doe · CTO at Northwind</div>
          <div className="italic text-li-muted border-l-2 border-li-primary pl-2 line-clamp-3">
            Just wrapped our zero-downtime migration to Postgres 16. Three
            things I'd do differently next time — starting with logical
            replication…
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
        <div className="relative">
          <div className="absolute top-2 left-2 bg-li-ai/10 text-li-ai px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border border-li-ai/20">
            AI draft
          </div>
          <div className="w-full min-h-[100px] p-3 pt-7 rounded-md border border-li-border bg-white text-xs text-li-text leading-relaxed">
            The logical replication trade-off is the one that always bites
            teams later — curious whether you kept the publication scoped to a
            subset of tables, or ran it on the full cluster.
          </div>
        </div>
        <button
          type="button"
          className="w-full py-2 bg-li-primary text-white rounded-full text-xs font-semibold hover:bg-li-primaryHover transition-colors"
          disabled
        >
          Insert into LinkedIn
        </button>
      </div>
    </div>
  );
}

export default App;
