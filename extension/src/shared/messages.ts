/**
 * Chrome runtime message types. All cross-context communication goes through
 * this discriminated union so contracts are enforced at compile time.
 */
import type { ExtractedPost, GenerateCommentResult, Tone, Length } from "./types";

/** A single result item reported to the side panel during a campaign run. */
export interface CampaignItem {
  ref: string;
  authorName: string | null;
  snippet: string;
  status: "pending" | "generating" | "inserting" | "done" | "skipped" | "failed";
  comment?: string;
  error?: string;
}

export type Message =
  // ── Content script → Side panel / Background ────────────────────────────
  | { type: "POST_SELECTED"; post: ExtractedPost }
  | { type: "AUTH_STATUS"; signedIn: boolean }
  | { type: "COMMENT_INSERTED"; ref: string; success: boolean; error?: string }
  | { type: "CAMPAIGN_MATCH"; item: CampaignItem }

  // ── Side panel → Content script (via background) ────────────────────────
  | { type: "INSERT_COMMENT"; ref: string; comment: string }
  | { type: "REQUEST_LAST_POST" }
  | { type: "CHECK_AUTH" }
  | {
      type: "FIND_POSTS";
      keywords: string[];
      maxPosts: number;
      maxScrolls: number;
    }

  // ── Side panel → Background (AI proxy) ──────────────────────────────────
  | {
      type: "GENERATE_COMMENT";
      postText: string;
      authorName: string | null;
      tone: Tone;
      length: Length;
      customInstructions?: string;
    }
  | { type: "GENERATE_COMMENT_RESULT"; ok: true; data: GenerateCommentResult }
  | { type: "GENERATE_COMMENT_RESULT"; ok: false; error: string };

export type MessageOf<T extends Message["type"]> = Extract<Message, { type: T }>;
