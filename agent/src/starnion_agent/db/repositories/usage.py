"""Usage log repository — saves per-LLM-call token & cost records."""

from __future__ import annotations

import logging
from typing import Any

from psycopg_pool import AsyncConnectionPool

logger = logging.getLogger(__name__)


async def save_usage_log(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    model: str,
    provider: str,
    input_tokens: int,
    output_tokens: int,
    cached_tokens: int,
    cost_usd: float,
    status: str = "success",
    call_type: str = "chat",
) -> None:
    """Insert one usage log row. Errors are logged but not re-raised."""
    try:
        async with pool.connection() as conn:
            await conn.execute(
                """
                INSERT INTO usage_logs
                    (user_id, model, provider,
                     input_tokens, output_tokens, cached_tokens,
                     cost_usd, status, call_type)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    user_id,
                    model,
                    provider,
                    input_tokens,
                    output_tokens,
                    cached_tokens,
                    cost_usd,
                    status,
                    call_type,
                ),
            )
    except Exception:
        logger.warning("Failed to save usage log", exc_info=True)
