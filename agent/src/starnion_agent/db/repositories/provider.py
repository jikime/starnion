"""Provider and persona repository for per-user LLM configuration."""

from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool


async def get_default_persona_with_provider(
    pool: AsyncConnectionPool[Any],
    user_id: str,
) -> dict[str, Any] | None:
    """Fetch the user's default persona and its provider API key in one query.

    Returns a dict with keys:
        persona_name, description, provider, model, system_prompt,
        api_key, base_url
    or None if no default persona is configured.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT
                    p.name          AS persona_name,
                    p.description,
                    p.provider,
                    p.model,
                    p.system_prompt,
                    COALESCE(pr.api_key,  '')  AS api_key,
                    COALESCE(pr.base_url, '')  AS base_url
                FROM personas p
                LEFT JOIN providers pr
                    ON pr.user_id = p.user_id
                    AND pr.provider = p.provider
                WHERE p.user_id = %s
                  AND p.is_default = TRUE
                LIMIT 1
                """,
                (user_id,),
            )
            row = await cur.fetchone()
            return dict(row) if row else None
