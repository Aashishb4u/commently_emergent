/**
 * Background service worker (Manifest V3)
 * =======================================
 * - Bridges side-panel ↔ content-script messaging.
 * - Proxies GENERATE_COMMENT requests to the backend so the side panel doesn't
 *   have to duplicate fetch logic.
 * - Opens the side panel when the toolbar action icon is clicked, or when a
 *   post is selected from a LinkedIn tab.
 */

import { AIClient } from "../shared/ai-client";
import { getSettings } from "../shared/storage";
import { log } from "../shared/logger";
import type { Message } from "../shared/messages";

// Register toolbar-icon click → open side panel for that tab.
chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    log.info("Side panel behaviour configured");
  } catch (err) {
    log.warn("setPanelBehavior failed", err);
  }
});

/**
 * Forward a message to the active LinkedIn tab (used by the side panel to
 * request info from — or drive — the content script).
 */
async function forwardToActiveLinkedInTab<T>(msg: Message): Promise<T | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith("https://www.linkedin.com/")) return null;
  try {
    return (await chrome.tabs.sendMessage(tab.id, msg)) as T;
  } catch (err) {
    log.warn("forwardToActiveLinkedInTab failed", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  const msg = raw as Message;

  switch (msg.type) {
    // -------------------------------------------------------------------
    // From content script → open the side panel and let the panel receive
    // the POST_SELECTED broadcast (chrome delivers to all listeners).
    // -------------------------------------------------------------------
    case "POST_SELECTED": {
      if (sender.tab?.windowId !== undefined) {
        chrome.sidePanel
          .open({ windowId: sender.tab.windowId })
          .catch((err) => log.warn("sidePanel.open failed", err));
      }
      // Cache the last-selected post for panels opening late.
      void chrome.storage.session.set({ "lca.lastPost": msg.post });
      return false;
    }

    // -------------------------------------------------------------------
    // From side panel → generate a comment via the backend proxy.
    // -------------------------------------------------------------------
    case "GENERATE_COMMENT": {
      (async () => {
        try {
          const settings = await getSettings();
          const client = new AIClient(settings.backendUrl);
          const data = await client.generateComment({
            post_text: msg.postText,
            author_name: msg.authorName,
            tone: msg.tone,
            length: msg.length,
            custom_instructions: msg.customInstructions,
          });
          sendResponse({ type: "GENERATE_COMMENT_RESULT", ok: true, data });
        } catch (err) {
          const error = err instanceof Error ? err.message : "Unknown error";
          log.error("generate-comment failed", error);
          sendResponse({ type: "GENERATE_COMMENT_RESULT", ok: false, error });
        }
      })();
      return true; // async response
    }

    // -------------------------------------------------------------------
    // Side panel → active LinkedIn tab content script relays.
    // -------------------------------------------------------------------
    case "INSERT_COMMENT":
    case "REQUEST_LAST_POST":
    case "CHECK_AUTH": {
      (async () => {
        const result = await forwardToActiveLinkedInTab(msg);
        sendResponse(result ?? { ok: false, error: "No active LinkedIn tab." });
      })();
      return true;
    }

    default:
      return false;
  }
});
