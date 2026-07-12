/**
 * Comment injector — inserts an AI-drafted comment into LinkedIn's own
 * comment editor. The user still presses "Post" themselves. We never
 * auto-submit.
 */
import { findCommentButton, findCommentEditor, findPostByRef } from "./linkedin-adapter";

export type InjectResult =
  | { ok: true }
  | { ok: false; error: string };

/** Try to open the comment editor. Returns the editor element or null. */
async function openEditor(postEl: HTMLElement, timeoutMs = 3000): Promise<HTMLElement | null> {
  const existing = findCommentEditor(postEl);
  if (existing) return existing;

  const btn = findCommentButton(postEl);
  if (!btn) return null;
  btn.click();

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ed = findCommentEditor(postEl);
    if (ed) return ed;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

/**
 * Insert `text` into the LinkedIn comment editor for the post identified by
 * `ref`. Does NOT click the Post button — user approval is required.
 */
export async function injectComment(ref: string, text: string): Promise<InjectResult> {
  const postEl = findPostByRef(ref);
  if (!postEl) {
    return { ok: false, error: "Post is no longer visible on the page. Scroll to it and try again." };
  }

  // Scroll into view first so the editor renders reliably.
  postEl.scrollIntoView({ behavior: "smooth", block: "center" });
  await new Promise((r) => setTimeout(r, 300));

  const editor = await openEditor(postEl);
  if (!editor) {
    return { ok: false, error: "Could not open LinkedIn's comment editor for this post." };
  }

  // LinkedIn's editor is a contenteditable div using ProseMirror/Quill-ish.
  // Simulate real user input so their internal state stays consistent.
  editor.focus();
  document.execCommand?.("selectAll", false);
  document.execCommand?.("delete", false);
  const inserted = document.execCommand?.("insertText", false, text);
  if (!inserted) {
    // Fallback for browsers where execCommand is neutered — set textContent
    // and dispatch input event so LinkedIn's listeners react.
    editor.textContent = text;
  }
  editor.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true }));

  return { ok: true };
}
