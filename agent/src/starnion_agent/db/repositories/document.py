"""Document repository for user documents and chunked sections."""

from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool


async def create_document(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    title: str,
    file_type: str,
    file_url: str,
) -> dict[str, Any]:
    """Insert a new user document record.

    Args:
        pool: The async connection pool.
        user_id: Telegram user ID.
        title: Document title.
        file_type: MIME type or extension.
        file_url: Storage URL.

    Returns:
        The inserted row as a dictionary.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                INSERT INTO documents (user_id, title, file_type, file_url)
                VALUES (%s, %s, %s, %s)
                RETURNING id, user_id, title, file_type, file_url, uploaded_at
                """,
                (user_id, title, file_type, file_url),
            )
            row = await cur.fetchone()
            await conn.commit()
            return row  # type: ignore[return-value]


async def create_section(
    pool: AsyncConnectionPool[Any],
    document_id: int,
    content: str,
    embedding: list[float] | None = None,
    metadata: dict | None = None,
) -> dict[str, Any]:
    """Insert a document chunk/section with embedding.

    Args:
        pool: The async connection pool.
        document_id: Parent document ID.
        content: Chunk text.
        embedding: 768-dim embedding vector.
        metadata: Additional metadata (JSON).

    Returns:
        The inserted row as a dictionary.
    """
    import json

    meta_json = json.dumps(metadata or {})
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                INSERT INTO document_sections (document_id, content, embedding, metadata)
                VALUES (%s, %s, %s, %s::jsonb)
                RETURNING id, document_id, content, metadata
                """,
                (document_id, content, embedding, meta_json),
            )
            row = await cur.fetchone()
            await conn.commit()
            return row  # type: ignore[return-value]


async def search_fulltext_by_user(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    query_text: str,
    top_k: int = 5,
) -> list[dict[str, Any]]:
    """Find document sections matching the query via full-text search.

    Searches across all documents belonging to the user.

    Args:
        pool: The async connection pool.
        user_id: Telegram user ID.
        query_text: Raw search text (converted to tsquery internally).
        top_k: Maximum results to return.

    Returns:
        List of section dicts with rank score and document title.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT ds.id, ds.content, ds.metadata,
                       ud.title AS doc_title,
                       ts_rank(ds.content_tsv, plainto_tsquery('simple', %s)) AS rank
                FROM document_sections ds
                JOIN documents ud ON ud.id = ds.document_id
                WHERE ud.user_id = %s
                  AND ds.content_tsv @@ plainto_tsquery('simple', %s)
                ORDER BY rank DESC
                LIMIT %s
                """,
                (query_text, user_id, query_text, top_k),
            )
            rows = await cur.fetchall()
            return [dict(r) for r in rows]


async def search_sections(
    pool: AsyncConnectionPool[Any],
    document_id: int,
    query_embedding: list[float],
    top_k: int = 5,
    threshold: float = 0.3,
) -> list[dict[str, Any]]:
    """Find document sections similar to the query embedding.

    Args:
        pool: The async connection pool.
        document_id: Filter by document.
        query_embedding: The query vector (768 dims).
        top_k: Maximum results.
        threshold: Minimum cosine similarity.

    Returns:
        List of section dicts with similarity score.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT id, content, metadata,
                       1 - (embedding <=> %s::vector) AS similarity
                FROM document_sections
                WHERE document_id = %s
                  AND embedding IS NOT NULL
                  AND 1 - (embedding <=> %s::vector) > %s
                ORDER BY similarity DESC
                LIMIT %s
                """,
                (query_embedding, document_id, query_embedding, threshold, top_k),
            )
            rows = await cur.fetchall()
            return [dict(r) for r in rows]


async def search_by_user(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    query_embedding: list[float],
    top_k: int = 5,
    threshold: float = 0.3,
) -> list[dict[str, Any]]:
    """Find document sections similar to query across all user documents.

    Args:
        pool: The async connection pool.
        user_id: Telegram user ID.
        query_embedding: The query vector (768 dims).
        top_k: Maximum results.
        threshold: Minimum cosine similarity.

    Returns:
        List of section dicts with similarity score and document title.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT ds.id, ds.content, ds.metadata,
                       ud.title AS doc_title,
                       1 - (ds.embedding <=> %s::vector) AS similarity
                FROM document_sections ds
                JOIN documents ud ON ud.id = ds.document_id
                WHERE ud.user_id = %s
                  AND ds.embedding IS NOT NULL
                  AND 1 - (ds.embedding <=> %s::vector) > %s
                ORDER BY similarity DESC
                LIMIT %s
                """,
                (query_embedding, user_id, query_embedding, threshold, top_k),
            )
            rows = await cur.fetchall()
            return [dict(r) for r in rows]
