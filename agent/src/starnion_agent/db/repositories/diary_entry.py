"""Diary entry repository with vector embeddings and full-text search."""

from datetime import date
from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool


async def create(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    content: str,
    title: str = "",
    mood: str = "보통",
    tags: list[str] | None = None,
    entry_date: date | None = None,
    embedding: list[float] | None = None,
) -> dict[str, Any]:
    """Insert a new diary entry.

    Args:
        pool: The async connection pool.
        user_id: User ID.
        content: Diary entry text.
        title: Optional title (defaults to empty string).
        mood: Mood label (defaults to '보통').
        tags: List of tag strings.
        entry_date: Date of the entry (defaults to today).
        embedding: 768-dim embedding vector.

    Returns:
        The inserted row as a dictionary.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                INSERT INTO diary_entries
                    (user_id, title, content, mood, tags, entry_date, embedding)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id, user_id, title, content, mood, tags,
                          entry_date, created_at, updated_at
                """,
                (
                    user_id,
                    title,
                    content,
                    mood,
                    tags or [],
                    entry_date or date.today(),
                    embedding,
                ),
            )
            row = await cur.fetchone()
            await conn.commit()
            return dict(row)  # type: ignore[arg-type]


async def update(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    entry_id: int,
    title: str | None = None,
    content: str | None = None,
    mood: str | None = None,
    tags: list[str] | None = None,
    entry_date: date | None = None,
    embedding: list[float] | None = None,
) -> dict[str, Any] | None:
    """Update a diary entry.

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
    if mood is not None:
        fields.append("mood = %s")
        values.append(mood)
    if tags is not None:
        fields.append("tags = %s")
        values.append(tags)
    if entry_date is not None:
        fields.append("entry_date = %s")
        values.append(entry_date)
    if embedding is not None:
        fields.append("embedding = %s")
        values.append(embedding)

    if not fields:
        return None

    fields.append("updated_at = NOW()")
    values.extend([entry_id, user_id])

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                f"""
                UPDATE diary_entries SET {", ".join(fields)}
                WHERE id = %s AND user_id = %s
                RETURNING id, user_id, title, content, mood, tags,
                          entry_date, updated_at
                """,
                values,
            )
            row = await cur.fetchone()
            await conn.commit()
            return dict(row) if row else None


async def delete(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    entry_id: int,
) -> bool:
    """Delete a diary entry.

    Returns:
        True if a row was deleted, False if not found.
    """
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "DELETE FROM diary_entries WHERE id = %s AND user_id = %s",
                (entry_id, user_id),
            )
            deleted = cur.rowcount > 0
            await conn.commit()
            return deleted


async def get_by_id(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    entry_id: int,
) -> dict[str, Any] | None:
    """Get a single diary entry by ID.

    Returns:
        Entry dict or None if not found.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT id, user_id, title, content, mood, tags,
                       entry_date, created_at, updated_at
                FROM diary_entries
                WHERE id = %s AND user_id = %s
                """,
                (entry_id, user_id),
            )
            row = await cur.fetchone()
            return dict(row) if row else None


async def list_entries(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """List recent diary entries for a user.

    Returns:
        Entries ordered by entry_date DESC, then created_at DESC.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT id, user_id, title, content, mood, tags,
                       entry_date, created_at, updated_at
                FROM diary_entries
                WHERE user_id = %s
                ORDER BY entry_date DESC, created_at DESC
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
) -> list[dict[str, Any]]:
    """Find diary entries similar to the query embedding.

    Returns:
        List of dicts with id, title, content, mood, entry_date,
        created_at, similarity.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT id, title, content, mood, entry_date, created_at,
                       1 - (embedding <=> %s::vector) AS similarity
                FROM diary_entries
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
    """Find diary entries matching the query via full-text search.

    Returns:
        List of dicts with id, title, content, mood, entry_date,
        created_at, rank.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT id, title, content, mood, entry_date, created_at,
                       ts_rank(content_tsv, plainto_tsquery('simple', %s)) AS rank
                FROM diary_entries
                WHERE user_id = %s
                  AND content_tsv @@ plainto_tsquery('simple', %s)
                ORDER BY rank DESC
                LIMIT %s
                """,
                (query_text, user_id, query_text, top_k),
            )
            rows = await cur.fetchall()
            return [dict(r) for r in rows]
