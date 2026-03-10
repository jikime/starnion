"""Async connection pool manager using psycopg3."""

from typing import Any

from psycopg_pool import AsyncConnectionPool

pool: AsyncConnectionPool[Any] | None = None


async def init_pool(conninfo: str) -> AsyncConnectionPool[Any]:
    """Create and open the async connection pool.

    Args:
        conninfo: PostgreSQL connection string.

    Returns:
        The opened AsyncConnectionPool instance.
    """
    global pool
    # min_size=5  : covers background tasks (cron, pattern analysis) without contention.
    # max_size=20 : retriever issues 13 parallel queries per call; supports ~3 concurrent
    #               users before queuing begins.
    # timeout=10  : surface pool exhaustion quickly rather than blocking indefinitely.
    p = AsyncConnectionPool(
        conninfo=conninfo,
        min_size=5,
        max_size=20,
        timeout=10.0,
        open=False,
    )
    await p.open()
    pool = p
    return p


async def close_pool() -> None:
    """Close the connection pool if it is open."""
    global pool
    if pool is not None:
        await pool.close()
        pool = None


def get_pool() -> AsyncConnectionPool[Any]:
    """Return the current connection pool.

    Raises:
        RuntimeError: If the pool has not been initialized.
    """
    if pool is None:
        raise RuntimeError(
            "Connection pool is not initialized. Call init_pool() first."
        )
    return pool
