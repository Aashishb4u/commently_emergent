import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Copy,
  RotateCw,
  Send,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Settings as SettingsIcon,
  Power,
  Info,
} from "lucide-react";
import type { ExtractedPost, Tone, Length, UserSettings } from "../shared/types";
import type { Message } from "../shared/messages";
import { getSettings, saveSettings, DEFAULTS } from "../shared/storage";
import { log } from "../shared/logger";

const TONES: { id: Tone; label: string; hint: string }[] = [
  { id: "professional", label: "Professional", hint: "Polished & business-appropriate" },
  { id: "thoughtful", label: "Thoughtful", hint: "Reflective, adds a perspective" },
  { id: "concise", label: "Concise", hint: "One clear point — no fluff" },
  { id: "friendly", label: "Friendly", hint: "Warm and personable" },
  { id: "insightful", label: "Insightful", hint: "Adds a specific insight" },
];

const LENGTHS: { id: Length; label: string; desc: string }[] = [
  { id: "short", label: "Short", desc: "~20 words" },
  { id: "medium", label: "Medium", desc: "~35 words" },
  { id: "long", label: "Long", desc: "~65 words" },
];

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export function SidePanel(): React.JSX.Element {
  const [settings, setSettings] = useState<UserSettings>(DEFAULTS);
  const [post, setPost] = useState<ExtractedPost | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [isAiDraft, setIsAiDraft] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [showSettings, setShowSettings] = useState(false);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  // Load settings + last selected post on mount
  useEffect(() => {
    void getSettings().then(setSettings);
    void chrome.storage.session
      .get("lca.lastPost")
      .then((r) => r["lca.lastPost"] && setPost(r["lca.lastPost"] as ExtractedPost));
    void refreshAuthAndPost();
  }, []);

  // Listen for POST_SELECTED / AUTH_STATUS / COMMENT_INSERTED broadcasts
  useEffect(() => {
    const listener = (raw: unknown) => {
      const msg = raw as Message;
      if (msg.type === "POST_SELECTED") {
        setPost(msg.post);
        setComment("");
        setIsAiDraft(false);
        setStatus({ kind: "idle" });
      } else if (msg.type === "AUTH_STATUS") {
        setSignedIn(msg.signedIn);
      } else if (msg.type === "COMMENT_INSERTED") {
        if (msg.success) {
          setStatus({ kind: "success", message: "Comment inserted into LinkedIn. Review, then press Post." });
        } else {
          setStatus({ kind: "error", message: msg.error ?? "Insert failed." });
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const refreshAuthAndPost = useCallback(async () => {
    try {
      const auth = (await chrome.runtime.sendMessage<Message>({ type: "CHECK_AUTH" })) as
        | { signedIn: boolean }
        | { ok: false };
      if ("signedIn" in auth) setSignedIn(auth.signedIn);
      else setSignedIn(null);
    } catch {
      setSignedIn(null);
    }
    try {
      const last = (await chrome.runtime.sendMessage<Message>({ type: "REQUEST_LAST_POST" })) as
        | { post: ExtractedPost | null }
        | { ok: false };
      if ("post" in last && last.post) {
        setPost((current) => current ?? last.post);
      }
    } catch {
      /* no active linkedin tab */
    }
  }, []);

  const updateSettings = useCallback(async (patch: Partial<UserSettings>) => {
    const next = await saveSettings(patch);
    setSettings(next);
  }, []);

  const canGenerate = useMemo(
    () => post !== null && post.postText.length > 0 && status.kind !== "loading",
    [post, status.kind],
  );

  const generate = useCallback(async () => {
    if (!post) return;
    setStatus({ kind: "loading" });
    try {
      const response = (await chrome.runtime.sendMessage<Message>({
        type: "GENERATE_COMMENT",
        postText: post.postText,
        authorName: post.authorName,
        tone: settings.tone,
        length: settings.length,
        customInstructions: settings.customInstructions || undefined,
      })) as Extract<Message, { type: "GENERATE_COMMENT_RESULT" }>;

      if (response.ok) {
        setComment(response.data.comment);
        setIsAiDraft(true);
        setStatus({ kind: "success", message: `Draft generated · ${response.data.model.split("-")[0]}` });
      } else {
        setStatus({ kind: "error", message: response.error });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      log.error("generate failed", message);
      setStatus({ kind: "error", message });
    }
  }, [post, settings]);

  const insertIntoLinkedIn = useCallback(async () => {
    if (!post || !comment.trim()) return;
    setStatus({ kind: "loading" });
    try {
      await chrome.runtime.sendMessage<Message>({
        type: "INSERT_COMMENT",
        ref: post.ref,
        comment: comment.trim(),
      });
      // Wait briefly for content script to reply via COMMENT_INSERTED
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Insert failed" });
    }
  }, [post, comment]);

  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(comment);
    setStatus({ kind: "success", message: "Comment copied to clipboard." });
  }, [comment]);

  return (
    <div className="flex flex-col h-full bg-white text-li-text" data-testid="sidepanel-root">
      <Header
        enabled={settings.enabled}
        onToggleEnabled={() => updateSettings({ enabled: !settings.enabled })}
        onToggleSettings={() => setShowSettings((s) => !s)}
        signedIn={signedIn}
      />

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-6">
        {showSettings ? (
          <SettingsPanel settings={settings} onChange={updateSettings} onClose={() => setShowSettings(false)} />
        ) : (
          <>
            <AuthNotice signedIn={signedIn} />

            {post ? (
              <PostCard post={post} />
            ) : (
              <EmptyState onRefresh={refreshAuthAndPost} />
            )}

            <SectionLabel>Tone</SectionLabel>
            <div className="flex flex-wrap gap-2 mt-2" data-testid="tone-selector">
              {TONES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  title={t.hint}
                  onClick={() => updateSettings({ tone: t.id })}
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
                  onClick={() => updateSettings({ length: l.id })}
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

            <button
              type="button"
              onClick={generate}
              disabled={!canGenerate}
              data-testid="generate-btn"
              className={
                "w-full py-2.5 mt-5 rounded-full font-semibold text-sm flex justify-center items-center gap-2 transition-colors shadow-sm " +
                (canGenerate
                  ? "bg-li-primary text-white hover:bg-li-primaryHover"
                  : "bg-li-bg text-li-muted cursor-not-allowed")
              }
            >
              {status.kind === "loading" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                  Drafting…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" strokeWidth={2} />
                  {comment ? "Regenerate" : "Generate comment"}
                </>
              )}
            </button>

            {(comment || status.kind === "loading") && (
              <CommentOutput
                value={comment}
                onChange={(v) => {
                  setComment(v);
                  if (isAiDraft && v !== comment) setIsAiDraft(false);
                }}
                isAiDraft={isAiDraft}
                onCopy={copy}
                onRegenerate={generate}
                onInsert={insertIntoLinkedIn}
                canInsert={comment.trim().length > 0 && post !== null && status.kind !== "loading"}
                loading={status.kind === "loading"}
                textareaRef={commentRef}
              />
            )}

            <StatusFooter status={status} />
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
  enabled: boolean;
  onToggleEnabled: () => void;
  onToggleSettings: () => void;
  signedIn: boolean | null;
}) {
  return (
    <header
      className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-black/5 px-4 py-3 flex items-center justify-between"
      data-testid="sidepanel-header"
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-7 h-7 rounded-md bg-li-primary text-white flex items-center justify-center font-bold text-sm shrink-0">
          in
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-sm tracking-tight truncate">Comment Assistant</div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-li-muted">
            OpenAI · GPT-5.4
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={props.onToggleEnabled}
          title={props.enabled ? "Extension enabled" : "Extension disabled"}
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
        className="lca-fade lca-fade-1 mt-4 flex items-center gap-2 text-xs text-li-success bg-li-success/5 border border-li-success/20 px-3 py-2 rounded-md"
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
        className="lca-fade lca-fade-1 mt-4 flex items-start gap-2 text-xs text-li-error bg-li-error/5 border border-li-error/20 px-3 py-2 rounded-md"
        data-testid="auth-signed-out"
      >
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={2} />
        <span>
          You're not signed in to LinkedIn. Please sign in normally in this browser — this extension
          never asks for your password.
        </span>
      </div>
    );
  }
  return (
    <div
      className="lca-fade lca-fade-1 mt-4 flex items-center gap-2 text-xs text-li-muted bg-li-bg border border-li-border px-3 py-2 rounded-md"
      data-testid="auth-unknown"
    >
      <Info className="w-4 h-4 shrink-0" strokeWidth={2} />
      <span>Open a LinkedIn tab to detect your session.</span>
    </div>
  );
}

function PostCard({ post }: { post: ExtractedPost }) {
  return (
    <div
      className="lca-fade lca-fade-2 mt-4 bg-li-bg p-4 rounded-md border border-black/5 shadow-sm space-y-2"
      data-testid="post-preview-card"
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold text-li-text truncate" data-testid="post-author">
          {post.authorName ?? "Unknown author"}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-li-muted font-mono shrink-0">
          Selected
        </div>
      </div>
      {post.authorHeadline && (
        <div className="text-[11px] text-li-muted truncate">{post.authorHeadline}</div>
      )}
      <div
        className="text-sm text-li-muted italic border-l-2 border-li-primary pl-2 line-clamp-4"
        data-testid="post-snippet"
      >
        {post.postText}
      </div>
    </div>
  );
}

function EmptyState({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div
      className="lca-fade lca-fade-2 mt-4 flex flex-col items-center justify-center p-6 text-center border border-dashed border-li-border rounded-lg bg-li-bg/50"
      data-testid="empty-state"
    >
      <Sparkles className="w-6 h-6 text-li-primary mb-2" strokeWidth={1.5} />
      <div className="text-sm font-semibold">No post selected</div>
      <p className="text-xs text-li-muted mt-1 leading-relaxed">
        Open LinkedIn, then click the ✦&nbsp;Suggest comment button next to any post to bring it here.
      </p>
      <button
        type="button"
        onClick={onRefresh}
        className="mt-3 text-xs font-semibold text-li-primary hover:underline"
        data-testid="refresh-post-btn"
      >
        Try to detect a post now
      </button>
    </div>
  );
}

function CommentOutput(props: {
  value: string;
  onChange: (v: string) => void;
  isAiDraft: boolean;
  onCopy: () => void;
  onRegenerate: () => void;
  onInsert: () => void;
  canInsert: boolean;
  loading: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
}) {
  return (
    <div className="lca-fade lca-fade-3 relative mt-5" data-testid="comment-output">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-li-muted">
          Comment draft
        </div>
        {props.isAiDraft && (
          <span
            className="bg-li-ai/10 text-li-ai px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border border-li-ai/20"
            data-testid="ai-draft-badge"
          >
            AI draft
          </span>
        )}
      </div>
      <textarea
        ref={props.textareaRef}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.loading ? "Drafting…" : "Your comment will appear here."}
        disabled={props.loading}
        rows={5}
        aria-live="polite"
        data-testid="comment-textarea"
        className="w-full p-3 rounded-md border border-li-border bg-white text-sm text-li-text focus:outline-none focus:ring-2 focus:ring-li-primary/20 focus:border-li-primary resize-y shadow-sm disabled:opacity-70"
      />
      <div className="grid grid-cols-3 gap-2 mt-2">
        <IconButton
          onClick={props.onRegenerate}
          disabled={props.loading}
          icon={<RotateCw className="w-3.5 h-3.5" strokeWidth={2} />}
          label="Regenerate"
          testId="regenerate-btn"
        />
        <IconButton
          onClick={props.onCopy}
          disabled={!props.value}
          icon={<Copy className="w-3.5 h-3.5" strokeWidth={2} />}
          label="Copy"
          testId="copy-btn"
        />
        <IconButton
          onClick={props.onInsert}
          disabled={!props.canInsert}
          icon={<Send className="w-3.5 h-3.5" strokeWidth={2} />}
          label="Insert"
          testId="insert-btn"
          primary
        />
      </div>
      <p className="text-[10px] text-li-muted mt-2 leading-relaxed">
        Inserts the text into LinkedIn's comment box. You still press Post yourself.
      </p>
    </div>
  );
}

function IconButton(props: {
  onClick: () => void;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  testId: string;
  primary?: boolean;
}) {
  const base =
    "flex items-center justify-center gap-1.5 py-2 px-2 rounded-md text-xs font-semibold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const cls = props.primary
    ? `${base} bg-li-primary text-white border-li-primary hover:bg-li-primaryHover`
    : `${base} bg-white text-li-text border-li-border hover:bg-li-bg`;
  return (
    <button type="button" onClick={props.onClick} disabled={props.disabled} data-testid={props.testId} className={cls}>
      {props.icon}
      {props.label}
    </button>
  );
}

function StatusFooter({ status }: { status: Status }) {
  if (status.kind === "idle" || status.kind === "loading") return null;
  const ok = status.kind === "success";
  return (
    <div
      role="status"
      data-testid={ok ? "status-success" : "status-error"}
      className={
        "mt-3 text-xs flex items-start gap-1.5 px-3 py-2 rounded-md border " +
        (ok
          ? "text-li-success bg-li-success/5 border-li-success/20"
          : "text-li-error bg-li-error/5 border-li-error/20")
      }
    >
      {ok ? (
        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={2} />
      ) : (
        <XCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={2} />
      )}
      <span className="leading-relaxed">{status.message}</span>
    </div>
  );
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
          Where the AI proxy lives. Never enter your OpenAI key here — it stays on the backend.
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
        This extension only reads visible LinkedIn post content that you explicitly select. It never
        collects, stores, or transmits your LinkedIn cookies, tokens, or credentials.
      </div>

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
