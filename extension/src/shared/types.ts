/**
 * Shared TypeScript types for the Commently extension.
 */

export type Tone =
  | "professional"
  | "thoughtful"
  | "concise"
  | "friendly"
  | "insightful";

export type Length = "short" | "medium" | "long";

/** A post extracted from the LinkedIn DOM. `ref` is a runtime-only key used
 *  to locate the same rendered post again (never persisted). */
export interface ExtractedPost {
  ref: string;
  authorName: string | null;
  authorHeadline: string | null;
  postText: string;
  detectedAt: string; // ISO timestamp
}

export interface UserSettings {
  enabled: boolean;
  tone: Tone;
  length: Length;
  customInstructions: string;
  backendUrl: string;
  keywords: string;   // comma-separated raw input
  maxPosts: number;   // safety cap per campaign run (1..10)
}

export interface GenerateCommentPayload {
  post_text: string;
  author_name?: string | null;
  tone: Tone;
  length: Length;
  custom_instructions?: string;
}

export interface GenerateCommentResult {
  comment: string;
  model: string;
  tone: Tone;
  length: Length;
  generated_at: string;
}

export interface HealthResult {
  status: string;
  model: string;
  model_label: string;
  provider: string;
  ai_configured: boolean;
  temperature: number;
  max_tokens: Record<string, number>;
  timestamp: string;
}
