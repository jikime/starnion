"""Daily log repository for diary entries with vector embeddings."""

from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool


async def create(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    content: str,
    sentiment: str = "",
    embedding: list[float] | None = None,
) -> dict[str, Any]:
    """Insert a new daily log entry.

    Args:
        pool: The async connection pool.
        user_id: Telegram user ID.
        content: Log entry text.
        sentiment: Detected sentiment label.
        embedding: 768-dim embedding vector.

    Returns:
        The inserted row as a dictionary.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                INSERT INTO daily_logs (user_id, content, sentiment, embedding)
                VALUES (%s, %s, %s, %s)
                RETURNING id, user_id, content, sentiment, created_at
                """,
                (user_id, content, sentiment, embedding),
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
    """Find daily logs similar to the query embedding.

    Args:
        pool: The async connection pool.
        user_id: Filter by user.
        query_embedding: The query vector (768 dims).
        top_k: Maximum results to return.
        threshold: Minimum cosine similarity threshold.

    Returns:
        List of dicts with id, content, similarity, created_at.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT id, content, created_at,
                       1 - (embedding <=> %s::vector) AS similarity
                FROM daily_logs
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


async def get_recent(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Get the most recent daily logs for a user.

    Args:
        pool: The async connection pool.
        user_id: Telegram user ID.
        limit: Maximum number of entries.

    Returns:
        List of log entries ordered by created_at desc.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT id, content, sentiment, created_at
                FROM daily_logs
                WHERE user_id = %s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (user_id, limit),
            )
            rows = await cur.fetchall()
            return [dict(r) for r in rows]
