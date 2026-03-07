"""Shared pytest fixtures for starnion-agent tests.

Provides reusable mock objects for the async psycopg3 connection pool,
connection, and cursor chain used across all repository and tool tests.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Mock cursor fixture
# ---------------------------------------------------------------------------
@pytest.fixture
def mock_cursor() -> AsyncMock:
    """Create a mock async cursor with dict_row-style behaviour.

    The cursor supports:
    - ``execute(query, params)`` as an AsyncMock
    - ``fetchone()`` returning a configurable value (default ``None``)
    - ``fetchall()`` returning a configurable list (default ``[]``)

    Tests can override return values:
        ``mock_cursor.fetchone.return_value = {"id": 1, ...}``
    """
    cursor = AsyncMock()
    cursor.execute = AsyncMock()
    cursor.fetchone = AsyncMock(return_value=None)
    cursor.fetchall = AsyncMock(return_value=[])
    return cursor


# ---------------------------------------------------------------------------
# Mock connection fixture
# ---------------------------------------------------------------------------
@pytest.fixture
def mock_conn(mock_cursor: AsyncMock) -> AsyncMock:
    """Create a mock async connection whose ``.cursor()`` returns *mock_cursor*.

    The connection supports:
    - ``cursor(row_factory=...)`` as an async context manager yielding *mock_cursor*
    - ``commit()`` as an AsyncMock
    """
    conn = AsyncMock()
    conn.commit = AsyncMock()

    @asynccontextmanager
    async def _cursor_ctx(**kwargs: Any):  # noqa: ANN401
        yield mock_cursor

    conn.cursor = MagicMock(side_effect=_cursor_ctx)
    return conn


# ---------------------------------------------------------------------------
# Mock pool fixture
# ---------------------------------------------------------------------------
@pytest.fixture
def mock_pool(mock_conn: AsyncMock) -> MagicMock:
    """Create a mock ``AsyncConnectionPool`` whose ``.connection()`` yields *mock_conn*.

    Usage in tests::

        result = await finance_repo.create(mock_pool, ...)
    """
    pool = MagicMock()

    @asynccontextmanager
    async def _conn_ctx():
        yield mock_conn

    pool.connection = MagicMock(side_effect=_conn_ctx)
    return pool


# ---------------------------------------------------------------------------
# Current-user reset fixture
# ---------------------------------------------------------------------------
@pytest.fixture(autouse=False)
def reset_current_user():
    """Reset the module-level ``_current_user_id`` in ``tools.finance`` before and after each test.

    Use this fixture (or request it explicitly) whenever tests touch
    ``set_current_user`` / ``get_current_user``.
    """
    from starnion_agent.context import set_current_user
    set_current_user("")
    yield
    set_current_user("")


# ---------------------------------------------------------------------------
# Auto-patch skill_guard to always allow (for tool unit tests)
# ---------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def _bypass_skill_guard():
    """Bypass skill_guard for all tool tests.

    The guard decorator calls get_pool() and skill_repo.is_enabled().
    In unit tests we don't have a real DB, so we auto-patch these.
    """
    mock_pool = MagicMock()
    with (
        patch("starnion_agent.skills.guard.get_pool", return_value=mock_pool),
        patch("starnion_agent.skills.guard.skill_repo") as mock_repo,
    ):
        mock_repo.is_enabled = AsyncMock(return_value=True)
        # Also patch profile_repo used by finance tools for budget checking.
        with patch(
            "starnion_agent.skills.finance.tools.profile_repo"
        ) as mock_profile:
            mock_profile.get_by_telegram_id = AsyncMock(return_value=None)
            yield


# ---------------------------------------------------------------------------
# Convenience data fixtures
# ---------------------------------------------------------------------------
@pytest.fixture
def sample_user_id() -> str:
    """A deterministic Telegram user ID for tests."""
    return "tg_user_42"


@pytest.fixture
def sample_finance_row() -> dict[str, Any]:
    """A realistic row returned by ``finances`` INSERT ... RETURNING."""
    return {
        "id": 1,
        "user_id": "tg_user_42",
        "amount": 15000,
        "category": "food",
        "description": "Lunch at cafe",
        "created_at": "2025-03-01T12:00:00",
    }


@pytest.fixture
def sample_profile_row() -> dict[str, Any]:
    """A realistic row returned by ``profiles`` SELECT / UPSERT."""
    return {
        "id": 1,
        "telegram_id": "tg_user_42",
        "user_name": "TestUser",
        "goals": None,
        "preferences": None,
        "created_at": "2025-03-01T10:00:00",
        "updated_at": "2025-03-01T10:00:00",
    }
