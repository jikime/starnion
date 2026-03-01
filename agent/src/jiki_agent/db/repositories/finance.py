"""Finance repository for expense/income record persistence."""

from datetime import datetime
from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool


async def create(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    amount: int,
    category: str,
    description: str = "",
) -> dict[str, Any]:
    """Insert a new finance record and return the inserted row.

    Args:
        pool: The async connection pool.
        user_id: Telegram user ID.
        amount: Amount in KRW (integer).
        category: Expense or income category.
        description: Optional description.

    Returns:
        The inserted row as a dictionary.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                INSERT INTO finances (user_id, amount, category, description)
                VALUES (%s, %s, %s, %s)
                RETURNING id, user_id, amount, category, description, created_at
                """,
                (user_id, amount, category, description),
            )
            row = await cur.fetchone()
            await conn.commit()
            return row  # type: ignore[return-value]


async def get_monthly_total(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    category: str,
    month: str,
) -> int:
    """Get total amount for a user + category in a given month.

    Args:
        pool: The async connection pool.
        user_id: Telegram user ID.
        category: Expense category to filter by.
        month: Month string in "YYYY-MM" format.

    Returns:
        Sum of amounts, or 0 if no records exist.
    """
    start, end = _month_range(month)
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT COALESCE(SUM(amount), 0) AS total
                FROM finances
                WHERE user_id = %s
                  AND category = %s
                  AND created_at >= %s
                  AND created_at < %s
                """,
                (user_id, category, start, end),
            )
            row = await cur.fetchone()
            return row["total"] if row else 0


async def get_monthly_summary(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    month: str,
) -> list[dict[str, Any]]:
    """Get spending grouped by category for the month.

    Args:
        pool: The async connection pool.
        user_id: Telegram user ID.
        month: Month string in "YYYY-MM" format.

    Returns:
        List of dicts with 'category' and 'total' keys.
    """
    start, end = _month_range(month)
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT category, COALESCE(SUM(amount), 0) AS total
                FROM finances
                WHERE user_id = %s
                  AND created_at >= %s
                  AND created_at < %s
                GROUP BY category
                ORDER BY total DESC
                """,
                (user_id, start, end),
            )
            rows = await cur.fetchall()
            return [dict(r) for r in rows]


def _month_range(month: str) -> tuple[datetime, datetime]:
    """Compute the start (inclusive) and end (exclusive) of a month.

    Args:
        month: Month string in "YYYY-MM" format.

    Returns:
        Tuple of (start_datetime, end_datetime).
    """
    year, mon = month.split("-")
    year_int = int(year)
    mon_int = int(mon)
    start = datetime(year_int, mon_int, 1)
    if mon_int == 12:
        end = datetime(year_int + 1, 1, 1)
    else:
        end = datetime(year_int, mon_int + 1, 1)
    return start, end
