"""User search repository for hybrid RAG search.

Mirrors the memo_db pattern: each row has an embedding vector (768 dims)
for cosine similarity search and a content_tsv column for full-text search.
"""

from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool


async def update_embedding(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    search_id: int,
    embedding: list[float],
) -> bool:
    """Set the embedding for a saved search row.

    Returns:
        True if the row was updated, False if not found.
    """
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "UPDATE searches SET embedding = %s WHERE id = %s AND user_id = %s",
                (embedding, search_id, user_id),
            )
            updated = cur.rowcount > 0
            await conn.commit()
            return updated


async def search_similar(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    query_embedding: list[float],
    top_k: int = 5,
    threshold: float = 0.3,
) -> list[dict[str, Any]]:
    """Find saved searches similar to the query embedding.

    Returns:
        List of dicts with id, query, result, created_at, similarity.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT id, query, result, created_at,
                       1 - (embedding <=> %s::vector) AS similarity
                FROM searches
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
    """Find saved searches matching the query via full-text search.

    Returns:
        List of dicts with id, query, result, created_at, rank.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT id, query, result, created_at,
                       ts_rank(content_tsv, plainto_tsquery('simple', %s)) AS rank
                FROM searches
                WHERE user_id = %s
                  AND content_tsv @@ plainto_tsquery('simple', %s)
                ORDER BY rank DESC
                LIMIT %s
                """,
                (query_text, user_id, query_text, top_k),
            )
            rows = await cur.fetchall()
            return [dict(r) for r in rows]
