"""Content tags repository — auto-tagging overlay for diary entries and memos."""

from typing import Any, Literal

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

Source = Literal["diary", "memo"]


async def upsert_tags(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    source: Source,
    source_id: int,
    tags: list[str],
    auto_tagged: bool = True,
) -> None:
    """Insert tags for a content item, ignoring duplicates.

    Args:
        pool: The async connection pool.
        user_id: User ID.
        source: Content source type ('diary' or 'memo').
        source_id: ID of the source record.
        tags: List of tag strings to associate.
        auto_tagged: Whether tags were generated automatically.
    """
    if not tags:
        return
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            for tag in tags:
                await cur.execute(
                    """
                    INSERT INTO content_tags (user_id, source, source_id, tag, auto_tagged)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (source, source_id, tag) DO NOTHING
                    """,
                    (user_id, source, source_id, tag.strip(), auto_tagged),
                )
        await conn.commit()


async def get_tags_for(
    pool: AsyncConnectionPool[Any],
    source: Source,
    source_id: int,
) -> list[str]:
    """Return all tags for a specific content item.

    Returns:
        List of tag strings ordered alphabetically.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT tag FROM content_tags
                WHERE source = %s AND source_id = %s
                ORDER BY tag
                """,
                (source, source_id),
            )
            rows = await cur.fetchall()
            return [r["tag"] for r in rows]


async def search_by_tags(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    tags: list[str],
    source: Source | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Find content items that have ANY of the given tags.

    Args:
        pool: The async connection pool.
        user_id: User ID.
        tags: Tags to search for (OR logic — any match counts).
        source: Optionally restrict to 'diary' or 'memo'.
        limit: Max results.

    Returns:
        List of dicts with source, source_id, tag, created_at.
        Ordered by created_at DESC, deduplicated by (source, source_id).
    """
    if not tags:
        return []

    lower_tags = [t.lower().strip() for t in tags if t.strip()]
    source_filter = "AND source = %s" if source else ""
    params: list[Any] = [user_id, lower_tags]
    if source:
        params.append(source)
    params.append(limit)

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                f"""
                SELECT DISTINCT ON (source, source_id)
                       source, source_id, tag, created_at
                FROM content_tags
                WHERE user_id = %s
                  AND LOWER(tag) = ANY(%s)
                  {source_filter}
                ORDER BY source, source_id, created_at DESC
                LIMIT %s
                """,
                params,
            )
            rows = await cur.fetchall()
            return [dict(r) for r in rows]


async def delete_tags_for(
    pool: AsyncConnectionPool[Any],
    source: Source,
    source_id: int,
) -> None:
    """Delete all tags for a content item (e.g. when item is deleted)."""
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "DELETE FROM content_tags WHERE source = %s AND source_id = %s",
                (source, source_id),
            )
        await conn.commit()
