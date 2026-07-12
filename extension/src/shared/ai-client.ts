/**
 * Backend HTTP client. Runs inside the extension (side panel or background)
 * and NEVER receives the raw API key — the backend proxies to Anthropic.
 */
import { log } from "./logger";
import type { GenerateCommentPayload, GenerateCommentResult, HealthResult } from "./types";

export class AIClient {
  constructor(private readonly baseUrl: string) {}

  private url(path: string): string {
    const clean = this.baseUrl.replace(/\/+$/, "");
    return `${clean}${path}`;
  }

  async health(): Promise<HealthResult> {
    const res = await fetch(this.url("/api/health"), { method: "GET" });
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
    return (await res.json()) as HealthResult;
  }

  async generateComment(payload: GenerateCommentPayload): Promise<GenerateCommentResult> {
    log.info("Generating comment", { tone: payload.tone, length: payload.length });
    const res = await fetch(this.url("/api/generate-comment"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { detail?: string };
        if (body?.detail) detail = body.detail;
      } catch {
        /* body not JSON */
      }
      throw new Error(detail);
    }
    return (await res.json()) as GenerateCommentResult;
  }
}
