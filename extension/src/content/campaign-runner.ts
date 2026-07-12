/**
 * Campaign runner — the "find posts by keyword, scroll & open comment box"
 * flow. Runs entirely inside the content script (same origin as LinkedIn).
 *
 * Safety:
 *   • Hard cap on scrolls and matches so we can't runaway.
 *   • Never clicks "Post". Only opens the comment editor and lets the side
 *     panel insert a drafted comment.
 *   • Respects a per-post delay so we don't hammer LinkedIn's UI.
 */

import type { CampaignItem, Message } from "../shared/messages";
import {
  findCommentButton,
  findCommentEditor,
  findPostElements,
  getPostRef,
} from "./linkedin-adapter";
import { extractFromElement } from "./post-extractor";
import { log } from "../shared/logger";

const SCROLL_STEP_RATIO = 0.85;   // scroll ~85% of viewport per step
const SCROLL_WAIT_MS = 900;       // let LinkedIn hydrate new feed items
const BETWEEN_POSTS_MS = 600;     // pace between opening comment editors
const OPEN_EDITOR_TIMEOUT_MS = 3500;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function makeSnippet(text: string, max = 140): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : clean.slice(0, max - 1) + "…";
}

/** Does the post text contain ANY of the provided keywords (case-insensitive)? */
function matches(postText: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const lower = postText.toLowerCase();
  return keywords.some((k) => k.length > 0 && lower.includes(k.toLowerCase()));
}

/** Open the inline comment editor for a post; return it (or null on timeout). */
async function openEditor(postEl: HTMLElement): Promise<HTMLElement | null> {
  const existing = findCommentEditor(postEl);
  if (existing) return existing;
  const btn = findCommentButton(postEl);
  if (!btn) return null;
  btn.click();
  const start = Date.now();
  while (Date.now() - start < OPEN_EDITOR_TIMEOUT_MS) {
    const ed = findCommentEditor(postEl);
    if (ed) return ed;
    await delay(120);
  }
  return null;
}

function emit(msg: Message): void {
  chrome.runtime.sendMessage(msg).catch(() => {
    /* side panel may have closed — ignore */
  });
}

export interface CampaignParams {
  keywords: string[];
  maxPosts: number;
  maxScrolls: number;
}

/**
 * Find posts matching the given keywords. For each match:
 *   1. scroll it into view
 *   2. open LinkedIn's comment editor (does NOT type anything)
 *   3. emit a CAMPAIGN_MATCH so the side panel can generate + inject text
 *
 * Returns the array of items emitted.
 */
export async function runCampaign(params: CampaignParams): Promise<CampaignItem[]> {
  const maxPosts = Math.max(1, Math.min(10, params.maxPosts));
  const maxScrolls = Math.max(2, Math.min(20, params.maxScrolls));
  const items: CampaignItem[] = [];
  const seen = new Set<string>();

  const collectMatches = () => {
    const posts = findPostElements();
    for (const el of posts) {
      if (items.length >= maxPosts) break;
      const ref = getPostRef(el);
      if (seen.has(ref)) continue;
      const extracted = extractFromElement(el);
      if (!extracted) continue;
      if (!matches(extracted.postText, params.keywords)) {
        seen.add(ref); // skip permanently; text isn't going to change
        continue;
      }
      const item: CampaignItem = {
        ref,
        authorName: extracted.authorName,
        snippet: makeSnippet(extracted.postText),
        status: "pending",
      };
      items.push(item);
      seen.add(ref);
      emit({ type: "CAMPAIGN_MATCH", item });
    }
  };

  // Initial pass (in case posts are already loaded above the fold)
  collectMatches();

  for (let i = 0; i < maxScrolls && items.length < maxPosts; i++) {
    window.scrollBy({ top: window.innerHeight * SCROLL_STEP_RATIO, behavior: "smooth" });
    await delay(SCROLL_WAIT_MS);
    collectMatches();
  }

  log.info(`Campaign found ${items.length} matches (max=${maxPosts})`);
  return items;
}

/**
 * For a single matched post: scroll to it, open the comment editor.
 * Called by the side panel one-at-a-time (via the background worker) so it
 * can pace generation ↔ insertion cleanly.
 */
export async function prepareEditor(ref: string): Promise<{ ok: boolean; error?: string }> {
  const postEl = document.querySelector<HTMLElement>(
    `[data-urn="${CSS.escape(ref)}"], [data-id="${CSS.escape(ref)}"], [data-lca-ref="${CSS.escape(ref)}"]`,
  );
  if (!postEl) return { ok: false, error: "Post is no longer in the DOM." };
  postEl.scrollIntoView({ behavior: "smooth", block: "center" });
  await delay(BETWEEN_POSTS_MS);
  const editor = await openEditor(postEl);
  if (!editor) return { ok: false, error: "Could not open LinkedIn's comment editor." };
  return { ok: true };
}
