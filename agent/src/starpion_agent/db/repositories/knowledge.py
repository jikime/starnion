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


async def search_fulltext(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    query_text: str,
    top_k: int = 5,
) -> list[dict[str, Any]]:
    """Find knowledge entries matching the query via full-text search.

    Searches across both key and value fields.

    Args:
        pool: The async connection pool.
        user_id: Filter by user.
        query_text: Raw search text (converted to tsquery internally).
        top_k: Maximum results to return.

    Returns:
        List of dicts with id, key, value, rank, created_at.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT id, key, value, source, created_at,
                       ts_rank(content_tsv, plainto_tsquery('simple', %s)) AS rank
                FROM knowledge_base
                WHERE user_id = %s
                  AND content_tsv @@ plainto_tsquery('simple', %s)
                ORDER BY rank DESC
                LIMIT %s
                """,
                (query_text, user_id, query_text, top_k),
            )
            rows = await cur.fetchall()
            return [dict(r) for r in rows]


async def delete_by_key(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    key: str,
) -> None:
    """Delete all knowledge base entries matching user_id and key.

    Used before upsert to replace stale pattern data without duplicates.

    Args:
        pool: The async connection pool.
        user_id: Telegram user ID.
        key: Knowledge key to delete.
    """
    async with pool.connection() as conn:
        await conn.execute(
            "DELETE FROM knowledge_base WHERE user_id = %s AND key = %s",
            (user_id, key),
        )
        await conn.commit()


async def get_by_key_prefix(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    prefix: str,
) -> list[dict[str, Any]]:
    """Get all knowledge entries whose key starts with the given prefix.

    Args:
        pool: The async connection pool.
        user_id: Telegram user ID.
        prefix: Key prefix to match (e.g., "goal:").

    Returns:
        List of knowledge entries matching the prefix, ordered by created_at desc.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT id, key, value, source, created_at
                FROM knowledge_base
                WHERE user_id = %s AND key LIKE %s
                ORDER BY created_at DESC
                """,
                (user_id, prefix + "%"),
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
