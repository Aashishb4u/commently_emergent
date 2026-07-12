import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Info,
  Settings as SettingsIcon,
  Power,
  Play,
  Square,
  Tag,
  ExternalLink,
} from "lucide-react";
import type { Tone, Length, UserSettings } from "../shared/types";
import type { CampaignItem, Message } from "../shared/messages";
import { getSettings, saveSettings, DEFAULTS } from "../shared/storage";
import { log } from "../shared/logger";
import { AIClient } from "../shared/ai-client";

const TONES: { id: Tone; label: string }[] = [
  { id: "professional", label: "Professional" },
  { id: "thoughtful", label: "Thoughtful" },
  { id: "concise", label: "Concise" },
  { id: "friendly", label: "Friendly" },
  { id: "insightful", label: "Insightful" },
];

const LENGTHS: { id: Length; label: string; desc: string }[] = [
  { id: "short", label: "Short", desc: "~20 words" },
  { id: "medium", label: "Medium", desc: "~35 words" },
  { id: "long", label: "Long", desc: "~65 words" },
];

const MAX_SCROLLS = 12;

type RunStatus =
  | { kind: "idle" }
  | { kind: "scanning" }
  | { kind: "processing" }
  | { kind: "done"; ok: number; failed: number }
  | { kind: "error"; message: string };

export function SidePanel(): React.JSX.Element {
  const [settings, setSettings] = useState<UserSettings>(DEFAULTS);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [items, setItems] = useState<CampaignItem[]>([]);
  const [status, setStatus] = useState<RunStatus>({ kind: "idle" });
  const [modelLabel, setModelLabel] = useState<string>("Commently");
  const [showSettings, setShowSettings] = useState(false);
  const [aborter, setAborter] = useState<{ aborted: boolean } | null>(null);

  // Bootstrap: load settings, fetch model label, check auth
  useEffect(() => {
    void (async () => {
      const s = await getSettings();
      setSettings(s);
      try {
        const client = new AIClient(s.backendUrl);
        const h = await client.health();
        if (h.model_label) setModelLabel(h.model_label);
      } catch {
        /* offline — keep default label */
      }
      try {
        const r = (await chrome.runtime.sendMessage<Message>({ type: "CHECK_AUTH" })) as
          | { signedIn: boolean }
          | { ok: false };
        setSignedIn("signedIn" in r ? r.signedIn : null);
      } catch {
        setSignedIn(null);
      }
    })();
  }, []);

  // Live inbound messages from the content script
  useEffect(() => {
    const listener = (raw: unknown) => {
      const msg = raw as Message;
      if (msg.type === "CAMPAIGN_MATCH") {
        setItems((prev) => (prev.some((i) => i.ref === msg.item.ref) ? prev : [...prev, msg.item]));
      } else if (msg.type === "AUTH_STATUS") {
        setSignedIn(msg.signedIn);
      } else if (msg.type === "COMMENT_INSERTED") {
        setItems((prev) =>
          prev.map((i) =>
            i.ref === msg.ref
              ? {
                  ...i,
                  status: msg.success ? "done" : "failed",
                  error: msg.success ? undefined : msg.error,
                }
              : i,
          ),
        );
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const update = useCallback(async (patch: Partial<UserSettings>) => {
    const next = await saveSettings(patch);
    setSettings(next);
  }, []);

  const parsedKeywords = useMemo(
    () =>
      settings.keywords
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k.length > 0),
    [settings.keywords],
  );

  const canRun = useMemo(
    () =>
      settings.enabled &&
      parsedKeywords.length > 0 &&
      status.kind !== "scanning" &&
      status.kind !== "processing",
    [settings.enabled, parsedKeywords.length, status.kind],
  );

  const startRun = useCallback(async () => {
    setItems([]);
    setStatus({ kind: "scanning" });
    const control = { aborted: false };
    setAborter(control);

    // 1) Scan the feed for matching posts
    const findResp = (await chrome.runtime.sendMessage<Message>({
      type: "FIND_POSTS",
      keywords: parsedKeywords,
      maxPosts: settings.maxPosts,
      maxScrolls: MAX_SCROLLS,
    })) as { ok: boolean; count?: number; error?: string };

    if (!findResp?.ok) {
      setStatus({
        kind: "error",
        message:
          findResp?.error ??
          "Couldn't reach the LinkedIn tab. Make sure your LinkedIn feed is the active tab in this window.",
      });
      setAborter(null);
      return;
    }

    if (control.aborted) return;

    // 2) The content script has already emitted CAMPAIGN_MATCH events;
    //    `items` is populated. Now generate + insert one at a time.
    setStatus({ kind: "processing" });

    // We read the freshest items from state via a functional setter.
    const currentItems = await new Promise<CampaignItem[]>((resolve) => {
      setItems((prev) => {
        resolve(prev);
        return prev;
      });
    });

    let ok = 0;
    let failed = 0;

    for (const item of currentItems) {
      if (control.aborted) break;

      // Mark generating
      setItems((prev) => prev.map((i) => (i.ref === item.ref ? { ...i, status: "generating" } : i)));

      const gen = (await chrome.runtime.sendMessage<Message>({
        type: "GENERATE_COMMENT",
        postText: item.snippet,
        authorName: item.authorName,
        tone: settings.tone,
        length: settings.length,
        customInstructions: settings.customInstructions || undefined,
      })) as Extract<Message, { type: "GENERATE_COMMENT_RESULT" }>;

      if (!gen.ok) {
        failed++;
        setItems((prev) =>
          prev.map((i) => (i.ref === item.ref ? { ...i, status: "failed", error: gen.error } : i)),
        );
        continue;
      }

      // Mark inserting + call content script
      setItems((prev) =>
        prev.map((i) =>
          i.ref === item.ref ? { ...i, status: "inserting", comment: gen.data.comment } : i,
        ),
      );

      const ins = (await chrome.runtime.sendMessage<Message>({
        type: "INSERT_COMMENT",
        ref: item.ref,
        comment: gen.data.comment,
      })) as { ok: boolean; error?: string };

      if (!ins?.ok) {
        failed++;
        setItems((prev) =>
          prev.map((i) => (i.ref === item.ref ? { ...i, status: "failed", error: ins?.error } : i)),
        );
      } else {
        ok++;
        setItems((prev) => prev.map((i) => (i.ref === item.ref ? { ...i, status: "done" } : i)));
      }

      // Small pacing gap so LinkedIn's UI stays sane
      await new Promise((r) => setTimeout(r, 800));
    }

    setStatus({ kind: "done", ok, failed });
    setAborter(null);
  }, [parsedKeywords, settings]);

  const stopRun = useCallback(() => {
    if (aborter) aborter.aborted = true;
    setStatus({ kind: "idle" });
    setAborter(null);
  }, [aborter]);

  return (
    <div className="flex flex-col h-full bg-white text-li-text" data-testid="sidepanel-root">
      <Header
        modelLabel={modelLabel}
        enabled={settings.enabled}
        onToggleEnabled={() => update({ enabled: !settings.enabled })}
        onToggleSettings={() => setShowSettings((s) => !s)}
      />

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-6">
        {showSettings ? (
          <SettingsPanel
            settings={settings}
            onChange={update}
            onClose={() => setShowSettings(false)}
          />
        ) : (
          <>
            <AuthNotice signedIn={signedIn} />

            <SectionLabel>Keywords</SectionLabel>
            <div className="mt-2 relative">
              <Tag className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-li-muted" strokeWidth={2} />
              <input
                type="text"
                value={settings.keywords}
                onChange={(e) => update({ keywords: e.target.value })}
                placeholder="e.g. AI, product management, startups"
                data-testid="keywords-input"
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-li-border rounded-md focus:outline-none focus:ring-2 focus:ring-li-primary/20 focus:border-li-primary"
              />
            </div>
            {parsedKeywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2" data-testid="parsed-keywords">
                {parsedKeywords.map((k) => (
                  <span
                    key={k}
                    className="text-[11px] font-medium bg-li-primary/8 text-li-primary border border-li-primary/20 px-2 py-0.5 rounded-full"
                  >
                    {k}
                  </span>
                ))}
              </div>
            )}
            <p className="text-[11px] text-li-muted mt-2 leading-relaxed">
              Comma-separated. Commently will scroll your LinkedIn feed and open the comment box on
              posts whose text contains any of these words.
            </p>

            <SectionLabel>Tone</SectionLabel>
            <div className="flex flex-wrap gap-2 mt-2" data-testid="tone-selector">
              {TONES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => update({ tone: t.id })}
                  data-testid={`tone-chip-${t.id}`}
                  className={
                    settings.tone === t.id
                      ? "px-3 py-1.5 rounded-full text-xs font-semibold border border-li-primary bg-li-primary/10 text-li-primary shadow-sm transition-colors"
                      : "px-3 py-1.5 rounded-full text-xs font-medium border border-li-border bg-white text-li-muted hover:bg-li-bg hover:text-li-text transition-colors"
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>

            <SectionLabel>Length</SectionLabel>
            <div
              className="mt-2 grid grid-cols-3 gap-1 p-1 bg-li-bg rounded-md border border-li-border"
              data-testid="length-selector"
            >
              {LENGTHS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => update({ length: l.id })}
                  data-testid={`length-chip-${l.id}`}
                  className={
                    settings.length === l.id
                      ? "py-1.5 rounded text-xs font-semibold bg-white text-li-primary shadow-sm border border-li-border transition-colors"
                      : "py-1.5 rounded text-xs font-medium text-li-muted hover:text-li-text transition-colors"
                  }
                >
                  <div>{l.label}</div>
                  <div className="text-[10px] opacity-70 font-normal">{l.desc}</div>
                </button>
              ))}
            </div>

            <SectionLabel>Comments per run</SectionLabel>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={settings.maxPosts}
                onChange={(e) => update({ maxPosts: Number(e.target.value) })}
                data-testid="max-posts-slider"
                className="flex-1 accent-li-primary"
              />
              <span
                className="text-sm font-mono font-semibold text-li-primary tabular-nums w-8 text-right"
                data-testid="max-posts-value"
              >
                {settings.maxPosts}
              </span>
            </div>
            <p className="text-[11px] text-li-muted mt-1">
              Hard cap. Commently will stop scrolling once this many matches are drafted.
            </p>

            {status.kind === "scanning" || status.kind === "processing" ? (
              <button
                type="button"
                onClick={stopRun}
                data-testid="stop-btn"
                className="w-full py-2.5 mt-5 rounded-full font-semibold text-sm flex justify-center items-center gap-2 transition-colors shadow-sm bg-li-error text-white hover:brightness-95"
              >
                <Square className="w-4 h-4" strokeWidth={2} /> Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={startRun}
                disabled={!canRun}
                data-testid="generate-btn"
                className={
                  "w-full py-2.5 mt-5 rounded-full font-semibold text-sm flex justify-center items-center gap-2 transition-colors shadow-sm " +
                  (canRun
                    ? "bg-li-primary text-white hover:bg-li-primaryHover"
                    : "bg-li-bg text-li-muted cursor-not-allowed")
                }
              >
                <Play className="w-4 h-4" strokeWidth={2} />
                Generate comments
              </button>
            )}

            {!canRun && parsedKeywords.length === 0 && status.kind === "idle" && (
              <p className="text-[11px] text-li-muted mt-2 flex items-center gap-1.5">
                <Info className="w-3 h-3 shrink-0" strokeWidth={2} />
                Add at least one keyword above to enable Generate.
              </p>
            )}

            <RunSummary status={status} />
            <ResultsList items={items} />

            <p className="text-[10px] text-li-muted mt-4 leading-relaxed border-t border-li-border pt-3">
              Commently drafts each comment inside LinkedIn's own comment box. You still press
              LinkedIn's <b className="text-li-text">Post</b> button yourself — nothing is submitted
              automatically.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function Header(props: {
  modelLabel: string;
  enabled: boolean;
  onToggleEnabled: () => void;
  onToggleSettings: () => void;
}) {
  return (
    <header
      className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-black/5 px-4 py-3 flex items-center justify-between"
      data-testid="sidepanel-header"
    >
      <div className="flex items-center gap-2 min-w-0">
        <img
          src={chrome.runtime.getURL("icons/icon-48.png")}
          alt="Commently"
          className="w-7 h-7 rounded-md shrink-0"
          data-testid="commently-logo"
        />
        <div className="min-w-0">
          <div className="font-semibold text-sm tracking-tight truncate">Commently</div>
          <div
            className="text-[10px] uppercase tracking-[0.14em] text-li-muted truncate"
            data-testid="model-label"
          >
            {props.modelLabel}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={props.onToggleEnabled}
          title={props.enabled ? "Commently is enabled" : "Commently is disabled"}
          data-testid="toggle-enabled-btn"
          className={
            "p-1.5 rounded-md border transition-colors " +
            (props.enabled
              ? "border-li-success/20 bg-li-success/10 text-li-success"
              : "border-li-border bg-white text-li-muted hover:bg-li-bg")
          }
        >
          <Power className="w-4 h-4" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={props.onToggleSettings}
          title="Settings"
          data-testid="toggle-settings-btn"
          className="p-1.5 rounded-md border border-li-border bg-white text-li-muted hover:bg-li-bg transition-colors"
        >
          <SettingsIcon className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-li-muted">
      {children}
    </div>
  );
}

function AuthNotice({ signedIn }: { signedIn: boolean | null }) {
  if (signedIn === true) {
    return (
      <div
        className="mt-4 flex items-center gap-2 text-xs text-li-success bg-li-success/5 border border-li-success/20 px-3 py-2 rounded-md"
        data-testid="auth-signed-in"
      >
        <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={2} />
        <span>Signed in to LinkedIn — using your existing session.</span>
      </div>
    );
  }
  if (signedIn === false) {
    return (
      <div
        className="mt-4 flex items-start gap-2 text-xs text-li-error bg-li-error/5 border border-li-error/20 px-3 py-2 rounded-md"
        data-testid="auth-signed-out"
      >
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={2} />
        <span>
          You're not signed in to LinkedIn. Please sign in normally in this browser — Commently
          never asks for your password.
        </span>
      </div>
    );
  }
  return (
    <div
      className="mt-4 flex items-center gap-2 text-xs text-li-muted bg-li-bg border border-li-border px-3 py-2 rounded-md"
      data-testid="auth-unknown"
    >
      <Info className="w-4 h-4 shrink-0" strokeWidth={2} />
      <span>Open your LinkedIn feed tab to detect your session.</span>
    </div>
  );
}

function RunSummary({ status }: { status: RunStatus }) {
  if (status.kind === "idle") return null;
  if (status.kind === "scanning") {
    return (
      <div
        className="mt-3 flex items-center gap-2 text-xs text-li-primary bg-li-primary/5 border border-li-primary/20 px-3 py-2 rounded-md"
        data-testid="status-scanning"
      >
        <Loader2 className="w-4 h-4 animate-spin shrink-0" strokeWidth={2} />
        <span>Scrolling LinkedIn and finding matching posts…</span>
      </div>
    );
  }
  if (status.kind === "processing") {
    return (
      <div
        className="mt-3 flex items-center gap-2 text-xs text-li-ai bg-li-ai/5 border border-li-ai/20 px-3 py-2 rounded-md"
        data-testid="status-processing"
      >
        <Sparkles className="w-4 h-4 shrink-0" strokeWidth={2} />
        <span>Drafting comments — you'll press Post yourself on LinkedIn.</span>
      </div>
    );
  }
  if (status.kind === "done") {
    return (
      <div
        className="mt-3 flex items-start gap-2 text-xs text-li-success bg-li-success/5 border border-li-success/20 px-3 py-2 rounded-md"
        data-testid="status-done"
      >
        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={2} />
        <span>
          Done — <b>{status.ok}</b> drafted, <b>{status.failed}</b> failed. Review each open comment
          box in LinkedIn and press Post.
        </span>
      </div>
    );
  }
  return (
    <div
      className="mt-3 flex items-start gap-2 text-xs text-li-error bg-li-error/5 border border-li-error/20 px-3 py-2 rounded-md"
      data-testid="status-error"
    >
      <XCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={2} />
      <span>{status.message}</span>
    </div>
  );
}

function ResultsList({ items }: { items: CampaignItem[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-3 space-y-2" data-testid="results-list">
      {items.map((item) => (
        <ResultRow key={item.ref} item={item} />
      ))}
    </ul>
  );
}

function ResultRow({ item }: { item: CampaignItem }) {
  const badge = statusBadge(item.status);
  return (
    <li
      className="bg-li-bg border border-li-border rounded-md p-3 text-xs"
      data-testid={`result-row-${item.ref}`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="font-semibold text-li-text truncate" data-testid="result-author">
          {item.authorName ?? "Unknown author"}
        </div>
        <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${badge.cls}`} data-testid={`result-status-${item.status}`}>
          {badge.text}
        </span>
      </div>
      <div className="italic text-li-muted line-clamp-2 border-l-2 border-li-primary pl-2">
        {item.snippet}
      </div>
      {item.comment && (
        <div className="mt-2 p-2 rounded bg-white border border-li-border text-li-text">
          <div className="text-[9px] uppercase tracking-wider text-li-ai font-bold mb-0.5">
            Drafted comment
          </div>
          {item.comment}
        </div>
      )}
      {item.error && (
        <div className="mt-2 text-li-error flex items-start gap-1">
          <XCircle className="w-3 h-3 shrink-0 mt-0.5" strokeWidth={2} />
          <span>{item.error}</span>
        </div>
      )}
    </li>
  );
}

function statusBadge(s: CampaignItem["status"]): { text: string; cls: string } {
  switch (s) {
    case "pending":
      return { text: "Queued", cls: "bg-li-border text-li-muted" };
    case "generating":
      return { text: "Drafting", cls: "bg-li-ai/10 text-li-ai" };
    case "inserting":
      return { text: "Inserting", cls: "bg-li-primary/10 text-li-primary" };
    case "done":
      return { text: "Drafted", cls: "bg-li-success/10 text-li-success" };
    case "failed":
      return { text: "Failed", cls: "bg-li-error/10 text-li-error" };
    case "skipped":
      return { text: "Skipped", cls: "bg-li-border text-li-muted" };
  }
}

function SettingsPanel(props: {
  settings: UserSettings;
  onChange: (s: Partial<UserSettings>) => void;
  onClose: () => void;
}) {
  const [backendUrl, setBackendUrl] = useState(props.settings.backendUrl);
  const [instructions, setInstructions] = useState(props.settings.customInstructions);

  return (
    <div className="pt-4 space-y-5" data-testid="settings-panel">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-li-muted mb-1.5">
          Backend URL
        </div>
        <input
          type="url"
          value={backendUrl}
          onChange={(e) => setBackendUrl(e.target.value)}
          onBlur={() => props.onChange({ backendUrl })}
          data-testid="backend-url-input"
          className="w-full p-2 text-sm bg-white border border-li-border rounded-md focus:outline-none focus:ring-2 focus:ring-li-primary/20 focus:border-li-primary"
        />
        <p className="text-[10px] text-li-muted mt-1">
          Where the Commently AI proxy lives. Your OpenAI key stays on that backend — never in this
          extension.
        </p>
      </div>

      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-li-muted mb-1.5">
          Custom instructions (optional)
        </div>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          onBlur={() => props.onChange({ customInstructions: instructions })}
          rows={3}
          maxLength={500}
          placeholder="e.g. 'I lead a data team, prefer engineering-heavy angles.'"
          data-testid="custom-instructions-input"
          className="w-full p-2 text-sm bg-white border border-li-border rounded-md focus:outline-none focus:ring-2 focus:ring-li-primary/20 focus:border-li-primary resize-y"
        />
      </div>

      <div className="p-3 rounded-md border border-li-border bg-li-bg text-xs text-li-muted leading-relaxed">
        <div className="font-semibold text-li-text mb-1">Privacy</div>
        Commently only reads visible LinkedIn post text that matches your keywords. It never
        collects, stores, or transmits your LinkedIn cookies, tokens, or credentials. Comments are
        drafted into LinkedIn's own comment box — you still press Post yourself.
      </div>

      <a
        href="https://www.linkedin.com/feed/"
        target="_blank"
        rel="noreferrer"
        className="w-full py-2 border border-li-border bg-white rounded-full font-semibold text-xs text-li-text hover:bg-li-bg transition-colors flex items-center justify-center gap-1.5"
        data-testid="open-feed-btn"
      >
        <ExternalLink className="w-3.5 h-3.5" strokeWidth={2} />
        Open LinkedIn feed
      </a>

      <button
        type="button"
        onClick={props.onClose}
        data-testid="settings-close-btn"
        className="w-full py-2 bg-li-primary text-white rounded-full font-semibold text-sm hover:bg-li-primaryHover transition-colors"
      >
        Done
      </button>
    </div>
  );
}

// The `log` import is used in dev builds via error paths; suppress unused-hint.
void log;
