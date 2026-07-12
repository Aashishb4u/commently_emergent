"""
LinkedIn Comment Assistant — Backend Proxy
==========================================
Secure FastAPI backend that proxies Claude Sonnet 4.5 calls for the Chrome
extension. Keeps the Anthropic API key off the client bundle.

Endpoints (all prefixed with /api):
    GET  /api/health
    POST /api/generate-comment
    GET  /api/settings/defaults
"""

import logging
import os
from datetime import datetime, timezone
from typing import Literal, Optional

from anthropic import Anthropic, APIError
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, field_validator

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("linkedin-comment-assistant")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-5-20250929")
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*")

# Mongo (used only for anonymous usage counter / logs — no PII stored)
mongo_client = AsyncIOMotorClient(MONGO_URL)
db = mongo_client[DB_NAME]

# Anthropic client (lazy — allows server to boot without key so the health
# endpoint still responds; requests fail loudly if the key is missing).
_anthropic_client: Optional[Anthropic] = None


def get_anthropic() -> Anthropic:
    global _anthropic_client
    if not ANTHROPIC_API_KEY or ANTHROPIC_API_KEY.startswith("REPLACE_"):
        raise HTTPException(
            status_code=503,
            detail=(
                "Anthropic API key is not configured on the backend. "
                "Add ANTHROPIC_API_KEY to /app/backend/.env and restart."
            ),
        )
    if _anthropic_client is None:
        _anthropic_client = Anthropic(api_key=ANTHROPIC_API_KEY)
    return _anthropic_client


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="LinkedIn Comment Assistant API",
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

# CORS — Chrome extension origins look like chrome-extension://<id>. Wildcard
# is acceptable here because the API is unauthenticated and returns only
# generated text based on the caller's own payload.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGINS.split(",")] if ALLOWED_ORIGINS != "*" else ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
Tone = Literal["professional", "thoughtful", "concise", "friendly", "insightful"]
Length = Literal["short", "medium", "long"]


class GenerateCommentRequest(BaseModel):
    post_text: str = Field(..., min_length=1, max_length=5000)
    author_name: Optional[str] = Field(default=None, max_length=200)
    tone: Tone = "professional"
    length: Length = "medium"
    custom_instructions: Optional[str] = Field(default=None, max_length=500)

    @field_validator("post_text")
    @classmethod
    def strip_text(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("post_text cannot be empty")
        return v


class GenerateCommentResponse(BaseModel):
    comment: str
    model: str
    tone: Tone
    length: Length
    generated_at: str


class HealthResponse(BaseModel):
    status: str
    model: str
    anthropic_configured: bool
    timestamp: str


class DefaultsResponse(BaseModel):
    tones: list[str]
    lengths: list[str]
    default_tone: Tone
    default_length: Length
    model: str


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------
_TONE_GUIDES = {
    "professional": "polished, business-appropriate, warm but not casual",
    "thoughtful": "reflective, adds a considered perspective or question",
    "concise": "brief and punchy — no fluff, one clear point",
    "friendly": "warm, personable, uses first person naturally",
    "insightful": "adds a specific insight, framework, or observation that extends the post",
}

_LENGTH_GUIDES = {
    "short": "one short sentence (max 20 words)",
    "medium": "1–2 sentences (25–45 words)",
    "long": "2–3 sentences (50–80 words)",
}


def build_system_prompt(tone: Tone, length: Length, extra: Optional[str]) -> str:
    base = (
        "You are an assistant that writes authentic LinkedIn comments on behalf of a "
        "professional user. Your comments must sound human, specific to the post's "
        "actual content, and add real value — never generic, never sycophantic, "
        "never spammy. Do not use hashtags, emojis, or the phrases 'Great post', "
        "'Thanks for sharing', or 'Well said'. Write in the first person.\n\n"
        f"Tone: {_TONE_GUIDES[tone]}.\n"
        f"Length: {_LENGTH_GUIDES[length]}.\n"
        "Return ONLY the comment text — no quotes, no preamble, no explanations."
    )
    if extra:
        base += f"\n\nAdditional guidance from user: {extra.strip()}"
    return base


def build_user_prompt(post_text: str, author_name: Optional[str]) -> str:
    header = f"Post by {author_name}:\n\n" if author_name else "Post:\n\n"
    return f"{header}\"\"\"\n{post_text.strip()}\n\"\"\"\n\nWrite the comment now."


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        model=CLAUDE_MODEL,
        anthropic_configured=bool(ANTHROPIC_API_KEY and not ANTHROPIC_API_KEY.startswith("REPLACE_")),
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@app.get("/api/settings/defaults", response_model=DefaultsResponse)
async def defaults() -> DefaultsResponse:
    return DefaultsResponse(
        tones=["professional", "thoughtful", "concise", "friendly", "insightful"],
        lengths=["short", "medium", "long"],
        default_tone="professional",
        default_length="medium",
        model=CLAUDE_MODEL,
    )


@app.post("/api/generate-comment", response_model=GenerateCommentResponse)
async def generate_comment(payload: GenerateCommentRequest, request: Request) -> GenerateCommentResponse:
    client = get_anthropic()

    system_prompt = build_system_prompt(payload.tone, payload.length, payload.custom_instructions)
    user_prompt = build_user_prompt(payload.post_text, payload.author_name)

    max_tokens = {"short": 80, "medium": 180, "long": 320}[payload.length]

    try:
        message = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
            temperature=0.7,
        )
    except APIError as exc:
        logger.exception("Anthropic API error")
        raise HTTPException(status_code=502, detail=f"AI provider error: {exc}") from exc

    # Extract text (Anthropic returns a list of content blocks)
    text_parts = [b.text for b in message.content if getattr(b, "type", "") == "text"]
    comment = "".join(text_parts).strip().strip('"').strip()
    if not comment:
        raise HTTPException(status_code=502, detail="AI provider returned empty output")

    # Anonymous usage counter — no post content stored
    try:
        await db.usage.insert_one(
            {
                "tone": payload.tone,
                "length": payload.length,
                "model": CLAUDE_MODEL,
                "ts": datetime.now(timezone.utc).isoformat(),
                "ua": request.headers.get("user-agent", "")[:200],
            }
        )
    except Exception:  # noqa: BLE001 — usage logging must never break the API
        logger.warning("Usage log write failed (non-fatal)")

    return GenerateCommentResponse(
        comment=comment,
        model=CLAUDE_MODEL,
        tone=payload.tone,
        length=payload.length,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


@app.on_event("shutdown")
async def _shutdown() -> None:
    mongo_client.close()
