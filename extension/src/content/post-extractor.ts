/**
 * Post extractor — thin functional layer on top of the DOM adapter.
 * Produces the ExtractedPost payload consumed by the side panel + AI backend.
 * NEVER extracts private data, contact info, or content beyond the visible post.
 */
import type { ExtractedPost } from "../shared/types";
import {
  extractAuthorHeadline,
  extractAuthorName,
  extractPostText,
  getPostRef,
} from "./linkedin-adapter";

export function extractFromElement(el: HTMLElement): ExtractedPost | null {
  const postText = extractPostText(el);
  if (!postText || postText.length < 3) return null;
  return {
    ref: getPostRef(el),
    authorName: extractAuthorName(el),
    authorHeadline: extractAuthorHeadline(el),
    postText,
    detectedAt: new Date().toISOString(),
  };
}
