"""Profile repository for user profile persistence."""

from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool


async def upsert(
    pool: AsyncConnectionPool[Any],
    uuid_id: str,
    user_name: str,
) -> dict[str, Any]:
    """Insert or update a user profile and return the row.

    On conflict (uuid_id already exists), updates user_name and updated_at.

    Args:
        pool: The async connection pool.
        uuid_id: Canonical user UUID (users.id).
        user_name: Display name.

    Returns:
        The upserted row as a dictionary.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                INSERT INTO profiles (uuid_id, user_name)
                VALUES (%s, %s)
                ON CONFLICT (uuid_id)
                DO UPDATE SET user_name = CASE
                    WHEN EXCLUDED.user_name = '' THEN profiles.user_name
                    ELSE EXCLUDED.user_name
                END,
                updated_at = NOW()
                RETURNING id, uuid_id, telegram_id, user_name, goals, preferences,
                          created_at, updated_at
                """,
                (uuid_id, user_name),
            )
            row = await cur.fetchone()
            await conn.commit()
            return row  # type: ignore[return-value]


async def update_preferences(
    pool: AsyncConnectionPool[Any],
    uuid_id: str,
    preferences: dict,
) -> dict[str, Any] | None:
    """Update the preferences JSONB column for a user profile.

    Args:
        pool: The async connection pool.
        uuid_id: Canonical user UUID.
        preferences: New preferences dict (replaces existing).

    Returns:
        The updated row, or None if user not found.
    """
    import json

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                UPDATE profiles
                SET preferences = %s::jsonb, updated_at = NOW()
                WHERE uuid_id = %s
                RETURNING id, uuid_id, telegram_id, user_name, goals, preferences,
                          created_at, updated_at
                """,
                (json.dumps(preferences), uuid_id),
            )
            row = await cur.fetchone()
            await conn.commit()
            return dict(row) if row else None


async def get_by_uuid_id(
    pool: AsyncConnectionPool[Any],
    uuid_id: str,
) -> dict[str, Any] | None:
    """Fetch a user profile by canonical UUID.

    Args:
        pool: The async connection pool.
        uuid_id: Canonical user UUID (users.id).

    Returns:
        The profile row as a dictionary, or None if not found.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT id, uuid_id, telegram_id, user_name, goals, preferences,
                       created_at, updated_at
                FROM profiles
                WHERE uuid_id = %s
                """,
                (uuid_id,),
            )
            row = await cur.fetchone()
            return dict(row) if row else None
