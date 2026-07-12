/**
 * Chrome runtime message types. All cross-context communication goes through
 * this discriminated union so contracts are enforced at compile time.
 */
import type { ExtractedPost, GenerateCommentResult, Tone, Length } from "./types";

export type Message =
  // Content script → Side panel / Background
  | { type: "POST_SELECTED"; post: ExtractedPost }
  | { type: "AUTH_STATUS"; signedIn: boolean }
  | { type: "COMMENT_INSERTED"; ref: string; success: boolean; error?: string }
  // Side panel → Content script (via background)
  | { type: "INSERT_COMMENT"; ref: string; comment: string }
  | { type: "REQUEST_LAST_POST" }
  | { type: "CHECK_AUTH" }
  // Side panel → Background
  | {
      type: "GENERATE_COMMENT";
      postText: string;
      authorName: string | null;
      tone: Tone;
      length: Length;
      customInstructions?: string;
    }
  // Background → Side panel
  | { type: "GENERATE_COMMENT_RESULT"; ok: true; data: GenerateCommentResult }
  | { type: "GENERATE_COMMENT_RESULT"; ok: false; error: string };

export type MessageOf<T extends Message["type"]> = Extract<Message, { type: T }>;
