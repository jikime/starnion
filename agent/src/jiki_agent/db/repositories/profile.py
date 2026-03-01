"""Profile repository for user profile persistence."""

from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool


async def upsert(
    pool: AsyncConnectionPool[Any],
    telegram_id: str,
    user_name: str,
) -> dict[str, Any]:
    """Insert or update a user profile and return the row.

    On conflict (telegram_id already exists), updates user_name and updated_at.

    Args:
        pool: The async connection pool.
        telegram_id: Telegram user ID (unique).
        user_name: Display name.

    Returns:
        The upserted row as a dictionary.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                INSERT INTO profiles (telegram_id, user_name)
                VALUES (%s, %s)
                ON CONFLICT (telegram_id)
                DO UPDATE SET user_name = EXCLUDED.user_name,
                              updated_at = NOW()
                RETURNING id, telegram_id, user_name, goals, preferences,
                          created_at, updated_at
                """,
                (telegram_id, user_name),
            )
            row = await cur.fetchone()
            await conn.commit()
            return row  # type: ignore[return-value]


async def get_by_telegram_id(
    pool: AsyncConnectionPool[Any],
    telegram_id: str,
) -> dict[str, Any] | None:
    """Fetch a user profile by telegram_id.

    Args:
        pool: The async connection pool.
        telegram_id: Telegram user ID.

    Returns:
        The profile row as a dictionary, or None if not found.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT id, telegram_id, user_name, goals, preferences,
                       created_at, updated_at
                FROM profiles
                WHERE telegram_id = %s
                """,
                (telegram_id,),
            )
            row = await cur.fetchone()
            return dict(row) if row else None
