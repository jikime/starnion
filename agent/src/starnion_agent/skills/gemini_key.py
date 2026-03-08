"""Per-user Gemini API key lookup.

Lookup order (first non-empty value wins):
  1. integration_keys WHERE provider = 'gemini'   — dedicated media key
  2. providers table   WHERE provider = 'gemini'   — reuse existing chat key

Returns None when no key is configured so callers can return a friendly
setup message instead of crashing.
"""

from __future__ import annotations

import logging

from starnion_agent.context import get_current_user
from starnion_agent.db.pool import get_pool

logger = logging.getLogger(__name__)

_SETUP_MSG = (
    "Gemini API 키가 필요합니다.\n"
    "웹 UI → 설정 → 연동 → Gemini에서 API 키를 등록해주세요.\n"
    "(Google AI Studio: https://aistudio.google.com/apikey)"
)


async def get_gemini_api_key(user_id: str | None = None) -> str | None:
    """Return the Gemini API key for the given user (or current user), or None if not configured."""
    if not user_id:
        user_id = get_current_user()
    if not user_id:
        return None

    pool = get_pool()
    try:
        async with pool.connection() as conn:
            async with conn.cursor() as cur:
                # 1순위: integration_keys (전용 미디어 키)
                await cur.execute(
                    "SELECT api_key FROM integration_keys"
                    " WHERE user_id = %s AND provider = 'gemini'",
                    (user_id,),
                )
                row = await cur.fetchone()
                if row and row[0]:
                    return row[0]

                # 2순위: providers 테이블 (Gemini를 채팅 LLM으로 설정한 경우 재활용)
                await cur.execute(
                    "SELECT p.api_key FROM providers p"
                    " JOIN personas pr ON pr.provider_id = p.id"
                    " WHERE pr.user_id = %s AND p.provider = 'gemini'"
                    " AND p.api_key IS NOT NULL AND p.api_key != ''"
                    " LIMIT 1",
                    (user_id,),
                )
                row = await cur.fetchone()
                if row and row[0]:
                    return row[0]

    except Exception:
        logger.debug("Failed to fetch Gemini API key for user %s", user_id, exc_info=True)

    return None


def no_key_message() -> str:
    """Return the standard 'Gemini key not configured' message."""
    return _SETUP_MSG
