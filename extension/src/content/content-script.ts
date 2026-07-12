/**
 * Content script — runs inside every LinkedIn page tab.
 *
 * Commently uses a keyword-based batch flow:
 *   1. Side panel sends FIND_POSTS with the user's keywords.
 *   2. Content script scrolls the feed, matches posts by keyword, and emits
 *      CAMPAIGN_MATCH events back to the side panel for each match.
 *   3. Side panel calls the AI backend to draft a comment per match and then
 *      sends INSERT_COMMENT with the drafted text.
 *   4. Content script scrolls the post into view, opens LinkedIn's own
 *      comment editor, and inserts the text. It NEVER clicks "Post".
 *
 * This file also handles CHECK_AUTH so the side panel can show whether the
 * user is signed in to LinkedIn via their existing browser session.
 */

import { getSettings, onSettingsChange } from "../shared/storage";
import { log } from "../shared/logger";
import type { Message } from "../shared/messages";
import { isSignedIn } from "./linkedin-adapter";
import { injectComment } from "./comment-injector";
import { prepareEditor, runCampaign } from "./campaign-runner";

const STYLE_ID = "commently-injected-styles";

let enabled = true;

// ---------------------------------------------------------------------------
// Optional cosmetic: a tiny "Commently is running" toast during a campaign.
// Uses namespaced classes so LinkedIn's CSS never clashes.
// ---------------------------------------------------------------------------
const INJECTED_CSS = `
.commently-toast{position:fixed;bottom:24px;right:24px;z-index:2147483000;background:#fff;color:#191919;border:1px solid #E0DFDC;border-radius:12px;padding:12px 14px;font-family:"IBM Plex Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;font-weight:500;box-shadow:0 12px 30px rgba(10,102,194,0.18);display:flex;align-items:center;gap:8px;max-width:320px}
.commently-toast__dot{width:8px;height:8px;border-radius:50%;background:#4338CA;box-shadow:0 0 0 4px rgba(67,56,202,0.15);animation:commently-pulse 1.4s infinite ease-in-out}
@keyframes commently-pulse{0%,100%{opacity:1}50%{opacity:.4}}
`;

function ensureStylesInjected(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = INJECTED_CSS;
  document.head.appendChild(style);
}

let toastEl: HTMLDivElement | null = null;
function showToast(text: string): void {
  ensureStylesInjected();
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "commently-toast";
    toastEl.setAttribute("data-testid", "commently-toast");
    document.body.appendChild(toastEl);
  }
  toastEl.innerHTML = '<span class="commently-toast__dot"></span><span></span>';
  (toastEl.lastElementChild as HTMLElement).textContent = text;
}
function hideToast(): void {
  toastEl?.remove();
  toastEl = null;
}

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const msg = raw as Message;

  switch (msg.type) {
    case "CHECK_AUTH":
      sendResponse({ signedIn: isSignedIn() });
      return true;

    case "FIND_POSTS": {
      if (!enabled) {
        sendResponse({ ok: false, error: "Commently is disabled." });
        return true;
      }
      showToast(`Commently is scanning for ${msg.keywords.length ? "matching " : ""}posts…`);
      runCampaign({
        keywords: msg.keywords,
        maxPosts: msg.maxPosts,
        maxScrolls: msg.maxScrolls,
      })
        .then((items) => {
          if (items.length === 0) hideToast();
          else showToast(`Commently found ${items.length} post${items.length === 1 ? "" : "s"}.`);
          sendResponse({ ok: true, count: items.length });
        })
        .catch((err) => {
          hideToast();
          log.error("campaign failed", err);
          sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
        });
      return true;
    }

    case "INSERT_COMMENT": {
      (async () => {
        // Make sure the editor is open first (works even if the side panel
        // calls INSERT_COMMENT without a prior prepareEditor).
        showToast("Commently is inserting a comment…");
        const prep = await prepareEditor(msg.ref);
        if (!prep.ok) {
          sendResponse({ ok: false, error: prep.error });
          chrome.runtime
            .sendMessage<Message>({
              type: "COMMENT_INSERTED",
              ref: msg.ref,
              success: false,
              error: prep.error,
            })
            .catch(() => undefined);
          return;
        }
        const result = await injectComment(msg.ref, msg.comment);
        const done: Message = {
          type: "COMMENT_INSERTED",
          ref: msg.ref,
          success: result.ok,
          error: result.ok ? undefined : result.error,
        };
        chrome.runtime.sendMessage(done).catch(() => undefined);
        sendResponse(result);
      })();
      return true;
    }

    case "REQUEST_LAST_POST":
      // Legacy — kept for API compatibility. Not used in the campaign flow.
      sendResponse({ post: null });
      return true;

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
  onSettingsChange((s) => {
    enabled = s.enabled;
    if (!enabled) hideToast();
  });

  // Broadcast auth status on load + on SPA navigation.
  const onNav = () => {
    chrome.runtime
      .sendMessage<Message>({ type: "AUTH_STATUS", signedIn: isSignedIn() })
      .catch(() => undefined);
  };
  window.addEventListener("popstate", onNav);
  onNav();
})();

// Auto-hide the toast when the tab is hidden for long.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) hideToast();
});
