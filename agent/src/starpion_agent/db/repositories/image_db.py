"""Repository for user_images table."""

from typing import Any

from psycopg_pool import AsyncConnectionPool


async def create(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    url: str,
    name: str = "image.png",
    mime: str = "image/png",
    size: int = 0,
    source: str = "telegram",
    img_type: str = "analyzed",
    prompt: str = "",
    analysis: str = "",
) -> int:
    """Insert a user_images row and return the new id."""
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO user_images
                    (user_id, url, name, mime, size, source, type, prompt, analysis)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (user_id, url, name, mime, size, source, img_type, prompt, analysis),
            )
            row = await cur.fetchone()
            await conn.commit()
            return row[0] if row else 0
