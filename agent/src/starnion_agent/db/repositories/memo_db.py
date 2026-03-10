"""Memo repository using the dedicated memos table."""

from datetime import datetime
from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool


async def create(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    content: str,
    title: str = "",
    tag: str = "개인",
    embedding: list[float] | None = None,
) -> dict[str, Any]:
    """Insert a new memo.

    Args:
        pool: The async connection pool.
        user_id: User ID.
        content: Memo text.
        title: Memo title (defaults to first 30 chars of content).
        tag: Category tag (defaults to '개인').
        embedding: 768-dim embedding vector.

    Returns:
        The inserted row as a dictionary.
    """
    effective_title = title.strip() if title.strip() else content.strip()[:30]
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                INSERT INTO memos (user_id, title, content, tag, embedding)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, user_id, title, content, tag, created_at, updated_at
                """,
                (user_id, effective_title, content, tag or "개인", embedding),
            )
            row = await cur.fetchone()
            await conn.commit()
            return dict(row)  # type: ignore[arg-type]


async def update(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    memo_id: int,
    title: str | None = None,
    content: str | None = None,
    tag: str | None = None,
    embedding: list[float] | None = None,
) -> dict[str, Any] | None:
    """Update a memo.

    Only provided (non-None) fields are updated.

    Returns:
        Updated row or None if not found.
    """
    fields: list[str] = []
    values: list[Any] = []

    if title is not None:
        fields.append("title = %s")
        values.append(title)
    if content is not None:
        fields.append("content = %s")
        values.append(content)
    if tag is not None:
        fields.append("tag = %s")
        values.append(tag)
    if embedding is not None:
        fields.append("embedding = %s")
        values.append(embedding)

    if not fields:
        return None

    fields.append("updated_at = NOW()")
    values.extend([memo_id, user_id])

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                f"""
                UPDATE memos SET {", ".join(fields)}
                WHERE id = %s AND user_id = %s
                RETURNING id, user_id, title, content, tag, updated_at
                """,
                values,
            )
            row = await cur.fetchone()
            await conn.commit()
            return dict(row) if row else None


async def delete(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    memo_id: int,
) -> bool:
    """Delete a memo.

    Returns:
        True if deleted, False if not found.
    """
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "DELETE FROM memos WHERE id = %s AND user_id = %s",
                (memo_id, user_id),
            )
            deleted = cur.rowcount > 0
            await conn.commit()
            return deleted


async def list_memos(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    tag: str = "",
    limit: int = 50,
) -> list[dict[str, Any]]:
    """List memos for a user, optionally filtered by tag.

    Returns:
        Memos ordered by created_at DESC.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            if tag:
                await cur.execute(
                    """
                    SELECT id, user_id, title, content, tag, created_at, updated_at
                    FROM memos
                    WHERE user_id = %s AND tag = %s
                    ORDER BY created_at DESC
                    LIMIT %s
                    """,
                    (user_id, tag, limit),
                )
            else:
                await cur.execute(
                    """
                    SELECT id, user_id, title, content, tag, created_at, updated_at
                    FROM memos
                    WHERE user_id = %s
                    ORDER BY created_at DESC
                    LIMIT %s
                    """,
                    (user_id, limit),
                )
            rows = await cur.fetchall()
            return [dict(r) for r in rows]


async def search_similar(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    query_embedding: list[float],
    top_k: int = 5,
    threshold: float = 0.3,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> list[dict[str, Any]]:
    """Find memos similar to the query embedding.

    Args:
        date_from: Optional start datetime filter on created_at (inclusive).
        date_to: Optional end datetime filter on created_at (inclusive).

    Returns:
        List of dicts with id, title, content, tag, created_at, similarity.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT id, title, content, tag, created_at,
                       1 - (embedding <=> %s::vector) AS similarity
                FROM memos
                WHERE user_id = %s
                  AND embedding IS NOT NULL
                  AND 1 - (embedding <=> %s::vector) > %s
                  AND (%s::timestamptz IS NULL OR created_at >= %s::timestamptz)
                  AND (%s::timestamptz IS NULL OR created_at <= %s::timestamptz)
                ORDER BY similarity DESC
                LIMIT %s
                """,
                (
                    query_embedding, user_id, query_embedding, threshold,
                    date_from, date_from,
                    date_to, date_to,
                    top_k,
                ),
            )
            rows = await cur.fetchall()
            return [dict(r) for r in rows]


async def search_fulltext(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    query_text: str,
    top_k: int = 5,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> list[dict[str, Any]]:
    """Find memos matching the query via full-text search.

    Args:
        date_from: Optional start datetime filter on created_at (inclusive).
        date_to: Optional end datetime filter on created_at (inclusive).

    Returns:
        List of dicts with id, title, content, tag, created_at, rank.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT id, title, content, tag, created_at,
                       ts_rank(content_tsv, plainto_tsquery('simple', %s)) AS rank
                FROM memos
                WHERE user_id = %s
                  AND content_tsv @@ plainto_tsquery('simple', %s)
                  AND (%s::timestamptz IS NULL OR created_at >= %s::timestamptz)
                  AND (%s::timestamptz IS NULL OR created_at <= %s::timestamptz)
                ORDER BY rank DESC
                LIMIT %s
                """,
                (
                    query_text, user_id, query_text,
                    date_from, date_from,
                    date_to, date_to,
                    top_k,
                ),
            )
            rows = await cur.fetchall()
            return [dict(r) for r in rows]
