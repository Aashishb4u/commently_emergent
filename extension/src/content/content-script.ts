/**
 * Content script — runs inside every LinkedIn page tab.
 *
 * Responsibilities:
 *   1. Detect the user's authentication status (via visible DOM markers only).
 *   2. Watch for post elements in the feed and inject a "✨ Suggest comment"
 *      button into each one.
 *   3. When the injected button is clicked, extract the post and hand it to
 *      the side panel via chrome.runtime messaging.
 *   4. Handle INSERT_COMMENT messages by placing the drafted comment into
 *      LinkedIn's own comment editor (user still presses Post).
 *
 * This file NEVER:
 *   - reads or exports cookies / session tokens
 *   - auto-submits comments
 *   - scrapes data beyond the currently rendered post
 */

import { getSettings, onSettingsChange } from "../shared/storage";
import { log } from "../shared/logger";
import type { Message } from "../shared/messages";
import {
  findPostByRef,
  findPostElements,
  getPostRef,
  isSignedIn,
} from "./linkedin-adapter";
import { extractFromElement } from "./post-extractor";
import { injectComment } from "./comment-injector";

const BUTTON_MARKER = "data-lca-button";
const CONTAINER_MARKER = "data-lca-injected";
const STYLE_ID = "lca-injected-styles";

let enabled = true;

// ---------------------------------------------------------------------------
// Style injection (scoped, prefixed) — kept in one string so LinkedIn's
// global styles never clash with ours.
// ---------------------------------------------------------------------------
const INJECTED_CSS = `
.lca-inject-wrapper{display:inline-flex;align-items:center;margin-left:4px}
.lca-inject-btn{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;font-family:"IBM Plex Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;font-weight:600;color:#4338ca;background:transparent;border:1px solid transparent;transition:background-color 150ms ease,border-color 150ms ease,color 150ms ease}
.lca-inject-btn:hover{background:rgba(67,56,202,0.08);border-color:rgba(67,56,202,0.2);color:#3730a3}
.lca-inject-btn:focus-visible{outline:2px solid #0a66c2;outline-offset:2px}
.lca-inject-btn__spark{font-size:14px;line-height:1;color:#4338ca}
.lca-inject-btn__label{line-height:1}
`;

function ensureStylesInjected(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = INJECTED_CSS;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Button injection
// ---------------------------------------------------------------------------
function buildButton(post: HTMLElement): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute(BUTTON_MARKER, "true");
  btn.setAttribute("data-testid", "injected-generate-comment-btn");
  btn.setAttribute("aria-label", "Draft an AI comment for this post");
  btn.className = "lca-inject-btn";
  btn.innerHTML =
    '<span class="lca-inject-btn__spark" aria-hidden="true">✦</span>' +
    '<span class="lca-inject-btn__label">Suggest comment</span>';
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onSuggestClick(post);
  });
  return btn;
}

function findActionBar(post: HTMLElement): HTMLElement | null {
  return (
    post.querySelector<HTMLElement>(".feed-shared-social-action-bar") ??
    post.querySelector<HTMLElement>(".social-actions-buttons") ??
    post.querySelector<HTMLElement>(".social-details-social-activity")
  );
}

function injectButtonInto(post: HTMLElement): void {
  if (post.getAttribute(CONTAINER_MARKER) === "1") return;
  const bar = findActionBar(post);
  if (!bar) return;

  const wrapper = document.createElement("div");
  wrapper.className = "lca-inject-wrapper";
  wrapper.appendChild(buildButton(post));
  bar.appendChild(wrapper);
  post.setAttribute(CONTAINER_MARKER, "1");
}

function removeAllInjectedButtons(): void {
  document.querySelectorAll(`[${CONTAINER_MARKER}="1"]`).forEach((post) => {
    post.querySelectorAll(".lca-inject-wrapper").forEach((n) => n.remove());
    post.removeAttribute(CONTAINER_MARKER);
  });
}

// ---------------------------------------------------------------------------
// Feed observer
// ---------------------------------------------------------------------------
function scanAndInject(): void {
  if (!enabled) return;
  const posts = findPostElements();
  for (const p of posts) injectButtonInto(p);
}

let observer: MutationObserver | null = null;

function startObserver(): void {
  if (observer) return;
  observer = new MutationObserver(() => {
    // Throttle via microtask so bursts of feed updates collapse into one scan.
    queueMicrotask(scanAndInject);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  scanAndInject();
}

function stopObserver(): void {
  observer?.disconnect();
  observer = null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
async function onSuggestClick(postEl: HTMLElement): Promise<void> {
  const ref = getPostRef(postEl);
  const post = extractFromElement(postEl);
  if (!post) {
    log.warn("Could not extract post text", ref);
    return;
  }
  log.info("Post selected", { ref, author: post.authorName });

  // Open the side panel and hand it the post payload.
  try {
    await chrome.runtime.sendMessage<Message>({ type: "POST_SELECTED", post });
  } catch (err) {
    log.error("sendMessage POST_SELECTED failed", err);
  }
}

async function handleInsertRequest(ref: string, comment: string): Promise<void> {
  const result = await injectComment(ref, comment);
  const msg: Message = {
    type: "COMMENT_INSERTED",
    ref,
    success: result.ok,
    error: result.ok ? undefined : result.error,
  };
  try {
    await chrome.runtime.sendMessage(msg);
  } catch {
    /* side panel may have closed — ignore */
  }
}

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const msg = raw as Message;
  switch (msg.type) {
    case "INSERT_COMMENT":
      void handleInsertRequest(msg.ref, msg.comment);
      sendResponse({ ok: true });
      return true;
    case "CHECK_AUTH":
      sendResponse({ signedIn: isSignedIn() });
      return true;
    case "REQUEST_LAST_POST": {
      const first = findPostElements()[0];
      const post = first ? extractFromElement(first) : null;
      sendResponse({ post });
      return true;
    }
    default:
      return false;
  }
});

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
(async function init() {
  ensureStylesInjected();
  const settings = await getSettings();
  enabled = settings.enabled;
  if (enabled) startObserver();

  onSettingsChange((s) => {
    enabled = s.enabled;
    if (enabled) {
      startObserver();
      scanAndInject();
    } else {
      stopObserver();
      removeAllInjectedButtons();
    }
  });

  // Reannounce auth status when the URL changes (LinkedIn is a SPA).
  const onNav = () => {
    void chrome.runtime
      .sendMessage<Message>({ type: "AUTH_STATUS", signedIn: isSignedIn() })
      .catch(() => undefined);
  };
  window.addEventListener("popstate", onNav);
  onNav();
})();

// Keep TS happy about unused warnings for guard purposes.
void findPostByRef;
