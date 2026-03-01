"""Knowledge base repository for entity-level memory."""

from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool


async def upsert(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    key: str,
    value: str,
    source: str = "",
    embedding: list[float] | None = None,
) -> dict[str, Any]:
    """Insert or update a knowledge base entry.

    Args:
        pool: The async connection pool.
        user_id: Telegram user ID.
        key: Knowledge key (e.g. "allergy", "birthday").
        value: Knowledge value.
        source: Where this knowledge was derived from.
        embedding: 768-dim embedding vector.

    Returns:
        The upserted row as a dictionary.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                INSERT INTO knowledge_base (user_id, key, value, source, embedding)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, user_id, key, value, source, created_at
                """,
                (user_id, key, value, source, embedding),
            )
            row = await cur.fetchone()
            await conn.commit()
            return row  # type: ignore[return-value]


async def search_similar(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    query_embedding: list[float],
    top_k: int = 5,
    threshold: float = 0.3,
) -> list[dict[str, Any]]:
    """Find knowledge base entries similar to the query embedding.

    Args:
        pool: The async connection pool.
        user_id: Filter by user.
        query_embedding: The query vector (768 dims).
        top_k: Maximum results to return.
        threshold: Minimum cosine similarity threshold.

    Returns:
        List of dicts with id, key, value, similarity.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT id, key, value, source, created_at,
                       1 - (embedding <=> %s::vector) AS similarity
                FROM knowledge_base
                WHERE user_id = %s
                  AND embedding IS NOT NULL
                  AND 1 - (embedding <=> %s::vector) > %s
                ORDER BY similarity DESC
                LIMIT %s
                """,
                (query_embedding, user_id, query_embedding, threshold, top_k),
            )
            rows = await cur.fetchall()
            return [dict(r) for r in rows]


async def get_by_key(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    key: str,
) -> dict[str, Any] | None:
    """Get a specific knowledge entry by key.

    Args:
        pool: The async connection pool.
        user_id: Telegram user ID.
        key: Knowledge key to look up.

    Returns:
        The knowledge entry or None.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT id, key, value, source, created_at
                FROM knowledge_base
                WHERE user_id = %s AND key = %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (user_id, key),
            )
            row = await cur.fetchone()
            return dict(row) if row else None
