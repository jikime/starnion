"""Goals repository using the dedicated goals table."""

import json
from datetime import date
from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool


async def create(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    title: str,
    category: str = "general",
    target_value: float = 0,
    unit: str = "",
    start_date: date | None = None,
    end_date: date | None = None,
    description: str | None = None,
    icon: str = "🎯",
) -> dict[str, Any]:
    """Insert a new goal.

    Returns:
        The created goal row as a dictionary.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                INSERT INTO goals
                    (user_id, title, icon, category, target_value, unit,
                     start_date, end_date, description)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, user_id, title, icon, category,
                          target_value, current_value, unit,
                          start_date, end_date, status, description,
                          metadata, created_at, updated_at
                """,
                (
                    user_id, title, icon, category, target_value, unit,
                    start_date or date.today(), end_date, description,
                ),
            )
            row = await cur.fetchone()
            await conn.commit()
            return dict(row)  # type: ignore[arg-type]


async def update_status(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    goal_id: int,
    status: str,
) -> dict[str, Any] | None:
    """Update a goal's status.

    Args:
        status: 'completed' or 'abandoned'.

    Returns:
        Updated row or None if not found / already finished.
    """
    date_field = ""
    if status == "completed":
        date_field = ", completed_date = CURRENT_DATE"
    elif status == "abandoned":
        date_field = ", abandoned_date = CURRENT_DATE"

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                f"""
                UPDATE goals
                SET status = %s, updated_at = NOW(){date_field}
                WHERE id = %s AND user_id = %s AND status = 'in_progress'
                RETURNING id, title, status, updated_at
                """,
                (status, goal_id, user_id),
            )
            row = await cur.fetchone()
            await conn.commit()
            return dict(row) if row else None


async def update_progress(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    goal_id: int,
    progress_pct: float,
) -> dict[str, Any] | None:
    """Update the progress of a goal by percentage (0-100).

    Always stores progress_pct as current_value and ensures target_value=100,
    so the UI progress bar renders correctly for all goal types.

    Returns:
        Updated row with id, title, current_value, target_value, status,
        or None if not found.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                UPDATE goals
                SET current_value = %s,
                    target_value = 100,
                    updated_at = NOW()
                WHERE id = %s AND user_id = %s AND status = 'in_progress'
                RETURNING id, title, current_value, target_value, unit, status
                """,
                (progress_pct, goal_id, user_id),
            )
            row = await cur.fetchone()
            await conn.commit()
            return dict(row) if row else None


async def update_evaluation(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    goal_id: int,
    metadata: dict[str, Any],
) -> None:
    """Store evaluation data in the goal's metadata JSONB field."""
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                UPDATE goals
                SET metadata = %s::jsonb, updated_at = NOW()
                WHERE id = %s AND user_id = %s
                """,
                (json.dumps(metadata, ensure_ascii=False), goal_id, user_id),
            )
            await conn.commit()


async def list_goals(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    status: str | None = None,
) -> list[dict[str, Any]]:
    """List goals for a user, optionally filtered by status.

    Returns:
        Goals ordered by created_at DESC.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            if status:
                await cur.execute(
                    """
                    SELECT id, user_id, title, icon, category,
                           target_value, current_value, unit,
                           start_date, end_date, status, description,
                           metadata, completed_date, abandoned_date,
                           created_at, updated_at
                    FROM goals
                    WHERE user_id = %s AND status = %s
                    ORDER BY created_at DESC
                    """,
                    (user_id, status),
                )
            else:
                await cur.execute(
                    """
                    SELECT id, user_id, title, icon, category,
                           target_value, current_value, unit,
                           start_date, end_date, status, description,
                           metadata, completed_date, abandoned_date,
                           created_at, updated_at
                    FROM goals
                    WHERE user_id = %s
                    ORDER BY created_at DESC
                    """,
                    (user_id,),
                )
            rows = await cur.fetchall()
            return [dict(r) for r in rows]


async def get_by_id(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    goal_id: int,
) -> dict[str, Any] | None:
    """Get a single goal by ID.

    Returns:
        Goal dict or None if not found.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT id, user_id, title, icon, category,
                       target_value, current_value, unit,
                       start_date, end_date, status, description,
                       metadata, completed_date, abandoned_date,
                       created_at, updated_at
                FROM goals
                WHERE id = %s AND user_id = %s
                """,
                (goal_id, user_id),
            )
            row = await cur.fetchone()
            return dict(row) if row else None


async def delete(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    goal_id: int,
) -> bool:
    """Delete a goal.

    Returns:
        True if deleted, False if not found.
    """
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "DELETE FROM goals WHERE id = %s AND user_id = %s",
                (goal_id, user_id),
            )
            deleted = cur.rowcount > 0
            await conn.commit()
            return deleted


async def checkin(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    goal_id: int,
    check_date: date | None = None,
) -> bool:
    """Add a check-in for a goal.

    Returns:
        True if new check-in inserted, False if already checked in today.
    """
    d = check_date or date.today()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO goal_checkins (goal_id, user_id, check_date)
                VALUES (%s, %s, %s)
                ON CONFLICT (goal_id, check_date) DO NOTHING
                """,
                (goal_id, user_id, d),
            )
            inserted = cur.rowcount > 0
            await conn.commit()
            return inserted
