"""Memory store backed by pgvector for persistent RAG memory."""

from typing import Any

from jiki_agent.db.pool import get_pool
from jiki_agent.db.repositories import knowledge as knowledge_repo
from jiki_agent.embedding.service import embed_text


async def save_knowledge(
    user_id: str,
    key: str,
    value: str,
    source: str = "conversation",
) -> dict[str, Any]:
    """Save a knowledge entry with embedding for later retrieval.

    Args:
        user_id: The user this knowledge belongs to.
        key: Knowledge key (e.g. "favorite_food", "birthday").
        value: The knowledge value.
        source: Where this knowledge came from.

    Returns:
        The stored knowledge entry.
    """
    embedding = await embed_text(f"{key}: {value}")
    pool = get_pool()
    return await knowledge_repo.upsert(
        pool, user_id=user_id, key=key, value=value,
        source=source, embedding=embedding,
    )
