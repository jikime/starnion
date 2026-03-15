"""User repository — reads/writes the users table (merged from profiles)."""

from __future__ import annotations

import json
import logging
from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

logger = logging.getLogger(__name__)

SUPPORTED_LANGUAGES = ("ko", "en", "ja", "zh")


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


async def get_user_timezone(
    pool: AsyncConnectionPool[Any],
    user_id: str,
) -> str:
    """사용자의 IANA 타임존을 DB에서 조회합니다. 기본값은 'Asia/Seoul'입니다.

    users.preferences JSONB 컬럼에서 ``{"timezone": "Asia/Seoul"}`` 형태로
    저장된 값을 읽습니다.  값이 없거나 DB 오류 발생 시 'Asia/Seoul'을 반환합니다.

    Args:
        pool: 애플리케이션 AsyncConnectionPool 인스턴스.
        user_id: 사용자 UUID 문자열.

    Returns:
        IANA 타임존 문자열.  기본값: 'Asia/Seoul'.
    """
    try:
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "SELECT preferences->>'timezone' AS timezone FROM users WHERE id = %s",
                    (user_id,),
                )
                row = await cur.fetchone()
                if row and row["timezone"]:
                    return row["timezone"]
        return "Asia/Seoul"
    except Exception:
        logger.warning(
            "get_user_timezone: DB 조회 실패, 기본값 'Asia/Seoul' 반환 (user_id=%s)",
            user_id,
            exc_info=True,
        )
        return "Asia/Seoul"


async def get_user_language(
    pool: AsyncConnectionPool[Any],
    user_id: str,
) -> str:
    """사용자의 선호 언어를 DB에서 조회합니다. 기본값은 'ko'입니다.

    users.preferences JSONB 컬럼에서 ``{"language": "ko"}`` 형태로 저장된
    언어 코드를 읽습니다.  지원 언어(ko, en, ja, zh) 이외의 값이거나
    레코드가 없거나 DB 오류 발생 시 'ko'를 반환합니다.

    Args:
        pool: 애플리케이션 AsyncConnectionPool 인스턴스.
        user_id: 사용자 UUID 문자열.

    Returns:
        지원 언어 코드 중 하나 ('ko', 'en', 'ja', 'zh').  기본값: 'ko'.
    """
    try:
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "SELECT preferences->>'language' AS language FROM users WHERE id = %s",
                    (user_id,),
                )
                row = await cur.fetchone()
                if row and row["language"] in SUPPORTED_LANGUAGES:
                    return row["language"]
        return "ko"
    except Exception:
        logger.warning(
            "get_user_language: DB 조회 실패, 기본값 'ko' 반환 (user_id=%s)",
            user_id,
            exc_info=True,
        )
        return "ko"
