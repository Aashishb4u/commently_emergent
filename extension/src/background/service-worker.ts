/**
 * Background service worker (Manifest V3)
 * =======================================
 * - Bridges side-panel ↔ content-script messaging.
 * - Proxies GENERATE_COMMENT requests to the backend so the side panel doesn't
 *   have to duplicate fetch logic.
 * - Opens the side panel when the toolbar action icon is clicked.
 */

import { AIClient } from "../shared/ai-client";
import { getSettings } from "../shared/storage";
import { log } from "../shared/logger";
import type { Message } from "../shared/messages";

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    log.info("Commently side panel behaviour configured");
  } catch (err) {
    log.warn("setPanelBehavior failed", err);
  }
});

/** Forward a message to the currently-active LinkedIn tab. */
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

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const msg = raw as Message;

  switch (msg.type) {
    // AI generation — server-side proxy.
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
      return true;
    }

    // Side panel → active LinkedIn tab content script relays.
    case "INSERT_COMMENT":
    case "REQUEST_LAST_POST":
    case "CHECK_AUTH":
    case "FIND_POSTS": {
      (async () => {
        const result = await forwardToActiveLinkedInTab(msg);
        sendResponse(result ?? { ok: false, error: "No active LinkedIn tab. Open your LinkedIn feed in this window." });
      })();
      return true;
    }

    default:
      return false;
  }
});
