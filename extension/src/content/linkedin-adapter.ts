/**
 * LinkedIn DOM Adapter
 * =====================
 * The ONLY file in the extension that knows about LinkedIn's DOM structure.
 * When LinkedIn changes its UI, only the selectors and small helpers in this
 * file need to be updated.
 *
 * Selectors are ordered from most-specific to fallback so a single class-name
 * churn doesn't break the extension.
 */

/**
 * Return the currently authenticated user indicator element. LinkedIn always
 * renders the global nav "Me" menu when a user is signed in.
 */
export function isSignedIn(): boolean {
  return (
    document.querySelector('[data-test-global-nav-me]') !== null ||
    document.querySelector('.global-nav__me') !== null ||
    document.querySelector('img.global-nav__me-photo') !== null
  );
}

/** True when the current URL is the main feed page. */
export function isOnFeedPage(): boolean {
  return /^https:\/\/www\.linkedin\.com\/feed\/?/.test(window.location.href);
}

/**
 * Find all feed post containers currently in the DOM.
 * LinkedIn wraps every feed post in a `<div data-id="urn:li:activity:...">`
 * inside `.scaffold-finite-scroll` on the feed.
 */
export function findPostElements(root: ParentNode = document): HTMLElement[] {
  const selectors = [
    'div.feed-shared-update-v2[data-urn^="urn:li:activity"]',
    'div[data-id^="urn:li:activity"]',
    'div.feed-shared-update-v2',
  ];
  for (const sel of selectors) {
    const nodes = Array.from(root.querySelectorAll<HTMLElement>(sel));
    if (nodes.length > 0) return nodes;
  }
  return [];
}

/**
 * Extract a stable-ish reference for a post. Preference order:
 *   1. data-urn attribute (e.g. urn:li:activity:12345)
 *   2. data-id attribute
 *   3. a generated key stashed on the element
 */
export function getPostRef(el: HTMLElement): string {
  return (
    el.getAttribute("data-urn") ??
    el.getAttribute("data-id") ??
    (el.dataset.lcaRef ??=
      "lca-" + Math.random().toString(36).slice(2, 10))
  );
}

/** Look up a post element by the reference we previously generated. */
export function findPostByRef(ref: string): HTMLElement | null {
  const escaped = ref.replace(/"/g, '\\"');
  return (
    document.querySelector<HTMLElement>(`[data-urn="${escaped}"]`) ??
    document.querySelector<HTMLElement>(`[data-id="${escaped}"]`) ??
    (document.querySelector<HTMLElement>(`[data-lca-ref="${escaped}"]`))
  );
}

/** Extract the post text content, stripping "see more" chrome. */
export function extractPostText(postEl: HTMLElement): string {
  const textNode =
    postEl.querySelector<HTMLElement>(
      ".feed-shared-update-v2__description .update-components-text",
    ) ??
    postEl.querySelector<HTMLElement>(".update-components-text") ??
    postEl.querySelector<HTMLElement>(".feed-shared-inline-show-more-text") ??
    postEl.querySelector<HTMLElement>('[dir="ltr"]');

  if (!textNode) return "";

  // Clone so we can safely remove UI chrome without touching the live DOM.
  const clone = textNode.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      "button, .feed-shared-inline-show-more-text__see-more-less-toggle, .visually-hidden",
    )
    .forEach((n) => n.remove());
  return clone.textContent?.trim().replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ") ?? "";
}

/** Extract the visible author name. */
export function extractAuthorName(postEl: HTMLElement): string | null {
  const candidates = [
    ".update-components-actor__title span[dir='ltr'] span[aria-hidden='true']",
    ".update-components-actor__title span[aria-hidden='true']",
    ".update-components-actor__name",
    ".feed-shared-actor__name",
  ];
  for (const sel of candidates) {
    const n = postEl.querySelector<HTMLElement>(sel);
    const t = n?.textContent?.trim();
    if (t) return t;
  }
  return null;
}

/** Extract the author's headline (their role/company one-liner). */
export function extractAuthorHeadline(postEl: HTMLElement): string | null {
  const n =
    postEl.querySelector<HTMLElement>(".update-components-actor__description") ??
    postEl.querySelector<HTMLElement>(".feed-shared-actor__description");
  return n?.textContent?.trim() ?? null;
}

/**
 * Find the "Comment" action button inside a post. Clicking this expands the
 * inline comment editor.
 */
export function findCommentButton(postEl: HTMLElement): HTMLButtonElement | null {
  const buttons = Array.from(postEl.querySelectorAll<HTMLButtonElement>("button"));
  return (
    buttons.find(
      (b) =>
        b.getAttribute("aria-label")?.toLowerCase().includes("comment") ||
        b.querySelector(".social-actions-button")?.textContent?.trim().toLowerCase() === "comment",
    ) ?? null
  );
}

/**
 * Locate the currently-open comment editor for a post. LinkedIn uses a
 * contenteditable div with role="textbox".
 */
export function findCommentEditor(postEl: HTMLElement): HTMLElement | null {
  return (
    postEl.querySelector<HTMLElement>(
      '.comments-comment-box__form div[role="textbox"][contenteditable="true"]',
    ) ??
    postEl.querySelector<HTMLElement>('div[role="textbox"][contenteditable="true"]')
  );
}

/**
 * Selectors bundled together so consumers can pass this object around
 * without importing individual functions.
 */
export const LinkedInSelectors = {
  isSignedIn,
  isOnFeedPage,
  findPostElements,
  getPostRef,
  findPostByRef,
  extractPostText,
  extractAuthorName,
  extractAuthorHeadline,
  findCommentButton,
  findCommentEditor,
};

export type LinkedInAdapter = typeof LinkedInSelectors;
