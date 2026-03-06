"""D-day repository using the dedicated ddays table."""

from datetime import date
from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool


async def create(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    title: str,
    target_date: date,
    icon: str = "📅",
    description: str = "",
    recurring: bool = False,
) -> dict[str, Any]:
    """Insert a new D-day entry.

    Returns:
        The created row as a dictionary.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                INSERT INTO ddays
                    (user_id, title, target_date, icon, description, recurring)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id, user_id, title, target_date, icon,
                          description, recurring, created_at, updated_at
                """,
                (user_id, title, target_date, icon, description, recurring),
            )
            row = await cur.fetchone()
            await conn.commit()
            return dict(row)  # type: ignore[arg-type]


async def update(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    dday_id: int,
    title: str | None = None,
    target_date: date | None = None,
    icon: str | None = None,
    description: str | None = None,
    recurring: bool | None = None,
) -> dict[str, Any] | None:
    """Update a D-day entry.

    Only provided (non-None) fields are updated.

    Returns:
        Updated row or None if not found.
    """
    fields: list[str] = []
    values: list[Any] = []

    if title is not None:
        fields.append("title = %s")
        values.append(title)
    if target_date is not None:
        fields.append("target_date = %s")
        values.append(target_date)
    if icon is not None:
        fields.append("icon = %s")
        values.append(icon)
    if description is not None:
        fields.append("description = %s")
        values.append(description)
    if recurring is not None:
        fields.append("recurring = %s")
        values.append(recurring)

    if not fields:
        return None

    fields.append("updated_at = NOW()")
    values.extend([dday_id, user_id])

    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                f"""
                UPDATE ddays SET {", ".join(fields)}
                WHERE id = %s AND user_id = %s
                RETURNING id, user_id, title, target_date, icon,
                          description, recurring, updated_at
                """,
                values,
            )
            row = await cur.fetchone()
            await conn.commit()
            return dict(row) if row else None


async def delete(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    dday_id: int,
) -> bool:
    """Delete a D-day entry.

    Returns:
        True if deleted, False if not found.
    """
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "DELETE FROM ddays WHERE id = %s AND user_id = %s",
                (dday_id, user_id),
            )
            deleted = cur.rowcount > 0
            await conn.commit()
            return deleted


async def list_ddays(
    pool: AsyncConnectionPool[Any],
    user_id: str,
) -> list[dict[str, Any]]:
    """List all D-day entries for a user.

    Returns:
        D-days ordered by target_date ASC.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT id, user_id, title, target_date, icon,
                       description, recurring, created_at, updated_at
                FROM ddays
                WHERE user_id = %s
                ORDER BY target_date ASC
                """,
                (user_id,),
            )
            rows = await cur.fetchall()
            return [dict(r) for r in rows]
