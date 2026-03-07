"""User repository — reads/writes the users table (merged from profiles)."""

from __future__ import annotations

import json
from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool


async def get_by_uuid_id(
    pool: AsyncConnectionPool[Any],
    uuid_id: str,
) -> dict[str, Any] | None:
    """Fetch a user row by id.

    Returns a dict with at least ``id``, ``display_name``, ``preferences``.
    Returns None if the user does not exist.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT id, display_name, preferences, created_at, updated_at
                FROM users
                WHERE id = %s
                """,
                (uuid_id,),
            )
            row = await cur.fetchone()
            return dict(row) if row else None


async def upsert(
    pool: AsyncConnectionPool[Any],
    uuid_id: str,
    user_name: str,
) -> dict[str, Any] | None:
    """Update display_name for an existing user (only when currently empty).

    The user row is always created by the identity service before this is
    called, so INSERT is not needed here.  Returns the current user row.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            if user_name:
                await cur.execute(
                    """
                    UPDATE users
                    SET display_name = %s, updated_at = NOW()
                    WHERE id = %s
                      AND (display_name IS NULL OR display_name = '')
                    """,
                    (user_name, uuid_id),
                )
                await conn.commit()
            await cur.execute(
                """
                SELECT id, display_name, preferences, created_at, updated_at
                FROM users WHERE id = %s
                """,
                (uuid_id,),
            )
            row = await cur.fetchone()
            return dict(row) if row else None


async def update_preferences(
    pool: AsyncConnectionPool[Any],
    uuid_id: str,
    preferences: dict,
) -> dict[str, Any] | None:
    """Merge preferences into users.preferences (JSONB patch).

    Returns the updated row, or None if the user does not exist.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                UPDATE users
                SET preferences = preferences || %s::jsonb,
                    updated_at  = NOW()
                WHERE id = %s
                RETURNING id, display_name, preferences, created_at, updated_at
                """,
                (json.dumps(preferences), uuid_id),
            )
            row = await cur.fetchone()
            await conn.commit()
            return dict(row) if row else None
