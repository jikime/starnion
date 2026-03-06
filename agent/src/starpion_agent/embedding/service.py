"""Embedding service using Google gemini-embedding-001."""

import logging

from google import genai
from google.genai.types import EmbedContentConfig

from starpion_agent.config import settings

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768  # Reduced from native 3072 for pgvector HNSW compatibility.

_EMBED_CONFIG = EmbedContentConfig(output_dimensionality=EMBEDDING_DIMENSIONS)

# Module-level singleton initialised lazily.
_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


async def embed_text(text: str) -> list[float]:
    """Generate an embedding vector for the given text.

    Uses Google gemini-embedding-001 with output reduced to 768 dimensions.

    Args:
        text: The text to embed.

    Returns:
        A list of 768 floats representing the embedding.
    """
    client = _get_client()
    result = client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=text,
        config=_EMBED_CONFIG,
    )
    return list(result.embeddings[0].values)


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for multiple texts in a single call.

    Args:
        texts: List of texts to embed.

    Returns:
        List of embedding vectors.
    """
    client = _get_client()
    result = client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=texts,
        config=_EMBED_CONFIG,
    )
    return [list(e.values) for e in result.embeddings]
