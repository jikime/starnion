"""Server-wide embedding service.

Supports OpenAI (text-embedding-3-small, recommended) and Google Gemini (gemini-embedding-001).
All users share the same provider/model so vectors are comparable across the system.

Configure via:  starnion config embedding
All vectors are stored at 768 dimensions to match pgvector HNSW index.

When the API key is absent, EmbeddingUnavailableError is raised so callers
can skip vector storage gracefully without crashing.
"""

import logging

from starnion_agent.config import settings

logger = logging.getLogger(__name__)


class EmbeddingUnavailableError(RuntimeError):
    """Raised when the embedding API key is not configured."""


def _check_configured() -> None:
    if not settings.embedding.api_key:
        raise EmbeddingUnavailableError(
            f"Embedding API key not configured (provider: {settings.embedding.provider}). "
            "Run: starnion config embedding"
        )


# ── OpenAI ────────────────────────────────────────────────────────────────────

async def _embed_openai(texts: list[str]) -> list[list[float]]:
    from openai import AsyncOpenAI  # noqa: PLC0415
    client = AsyncOpenAI(api_key=settings.embedding.api_key)
    resp = await client.embeddings.create(
        model=settings.embedding.model,
        input=texts,
        dimensions=settings.embedding.dimensions,
    )
    return [item.embedding for item in resp.data]


# ── Gemini ────────────────────────────────────────────────────────────────────

async def _embed_gemini(texts: list[str]) -> list[list[float]]:
    from google import genai  # noqa: PLC0415
    from google.genai.types import EmbedContentConfig  # noqa: PLC0415
    client = genai.Client(api_key=settings.embedding.api_key)
    config = EmbedContentConfig(output_dimensionality=settings.embedding.dimensions)
    result = client.models.embed_content(
        model=settings.embedding.model,
        contents=texts,
        config=config,
    )
    return [list(e.values) for e in result.embeddings]


# ── Public API ────────────────────────────────────────────────────────────────

async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Generate embedding vectors for multiple texts.

    Uses the server-wide provider configured in starnion.yaml (embedding.provider).

    Raises:
        EmbeddingUnavailableError: When API key is not configured.
    """
    _check_configured()
    provider = settings.embedding.provider
    if provider == "openai":
        return await _embed_openai(texts)
    if provider == "gemini":
        return await _embed_gemini(texts)
    raise EmbeddingUnavailableError(f"Unknown embedding provider: {provider!r}")


async def embed_text(text: str) -> list[float]:
    """Generate an embedding vector for a single text.

    Raises:
        EmbeddingUnavailableError: When API key is not configured.
    """
    results = await embed_texts([text])
    return results[0]
