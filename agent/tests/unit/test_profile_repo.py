"""Unit tests for starnion_agent.db.repositories.profile module.

Tests cover:
- ``upsert``: INSERT ON CONFLICT DO UPDATE with RETURNING
- ``get_by_telegram_id``: SELECT by telegram_id, returns dict or None
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from starnion_agent.db.repositories import profile as profile_repo


# =========================================================================
# upsert
# =========================================================================
class TestUpsert:
    """Tests for ``profile_repo.upsert``."""

    @pytest.mark.asyncio
    async def test_upsert_returns_profile_row(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
        sample_profile_row: dict[str, Any],
    ):
        """Successful upsert returns the full profile row."""
        mock_cursor.fetchone.return_value = sample_profile_row

        result = await profile_repo.upsert(
            mock_pool,
            telegram_id="tg_user_42",
            user_name="TestUser",
        )

        assert result == sample_profile_row
        assert result["telegram_id"] == "tg_user_42"
        assert result["user_name"] == "TestUser"

    @pytest.mark.asyncio
    async def test_upsert_calls_execute_with_correct_params(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
        sample_profile_row: dict[str, Any],
    ):
        """Verify the SQL parameters are passed in the correct order."""
        mock_cursor.fetchone.return_value = sample_profile_row

        await profile_repo.upsert(
            mock_pool,
            telegram_id="tg_user_42",
            user_name="TestUser",
        )

        mock_cursor.execute.assert_awaited_once()
        params = mock_cursor.execute.call_args[0][1]
        assert params == ("tg_user_42", "TestUser")

    @pytest.mark.asyncio
    async def test_upsert_commits_transaction(
        self,
        mock_pool: MagicMock,
        mock_conn: AsyncMock,
        mock_cursor: AsyncMock,
        sample_profile_row: dict[str, Any],
    ):
        """Upsert must commit the transaction after INSERT/UPDATE."""
        mock_cursor.fetchone.return_value = sample_profile_row

        await profile_repo.upsert(
            mock_pool,
            telegram_id="tg_user_42",
            user_name="TestUser",
        )

        mock_conn.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_upsert_sql_contains_on_conflict(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
        sample_profile_row: dict[str, Any],
    ):
        """The executed SQL must include ON CONFLICT for upsert semantics."""
        mock_cursor.fetchone.return_value = sample_profile_row

        await profile_repo.upsert(
            mock_pool,
            telegram_id="tg_user_42",
            user_name="TestUser",
        )

        sql = mock_cursor.execute.call_args[0][0]
        assert "INSERT INTO profiles" in sql
        assert "ON CONFLICT" in sql
        assert "RETURNING" in sql

    @pytest.mark.asyncio
    async def test_upsert_sql_updates_user_name_on_conflict(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
        sample_profile_row: dict[str, Any],
    ):
        """On conflict the SQL must update user_name and updated_at."""
        mock_cursor.fetchone.return_value = sample_profile_row

        await profile_repo.upsert(
            mock_pool,
            telegram_id="tg_user_42",
            user_name="TestUser",
        )

        sql = mock_cursor.execute.call_args[0][0]
        assert "DO UPDATE SET" in sql
        assert "user_name" in sql
        assert "updated_at" in sql

    @pytest.mark.asyncio
    async def test_upsert_returns_updated_row_on_conflict(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
    ):
        """When a conflict occurs, the RETURNING clause still returns the updated row."""
        updated_row = {
            "id": 1,
            "telegram_id": "tg_user_42",
            "user_name": "NewName",
            "goals": None,
            "preferences": None,
            "created_at": "2025-01-01T10:00:00",
            "updated_at": "2025-03-01T15:30:00",
        }
        mock_cursor.fetchone.return_value = updated_row

        result = await profile_repo.upsert(
            mock_pool,
            telegram_id="tg_user_42",
            user_name="NewName",
        )

        assert result["user_name"] == "NewName"
        assert result["updated_at"] == "2025-03-01T15:30:00"

    @pytest.mark.asyncio
    async def test_upsert_with_unicode_user_name(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
    ):
        """Korean and emoji characters in user_name are passed through correctly."""
        row = {
            "id": 3,
            "telegram_id": "tg_user_99",
            "user_name": "테스트유저",
            "goals": None,
            "preferences": None,
            "created_at": "2025-03-01T10:00:00",
            "updated_at": "2025-03-01T10:00:00",
        }
        mock_cursor.fetchone.return_value = row

        result = await profile_repo.upsert(
            mock_pool,
            telegram_id="tg_user_99",
            user_name="테스트유저",
        )

        assert result["user_name"] == "테스트유저"
        params = mock_cursor.execute.call_args[0][1]
        assert params == ("tg_user_99", "테스트유저")


# =========================================================================
# get_by_telegram_id
# =========================================================================
class TestGetByTelegramId:
    """Tests for ``profile_repo.get_by_telegram_id``."""

    @pytest.mark.asyncio
    async def test_returns_profile_dict_when_found(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
        sample_profile_row: dict[str, Any],
    ):
        """When the profile exists, return a plain dict with all columns."""
        mock_cursor.fetchone.return_value = sample_profile_row

        result = await profile_repo.get_by_telegram_id(
            mock_pool,
            telegram_id="tg_user_42",
        )

        assert result is not None
        assert result["telegram_id"] == "tg_user_42"
        assert result["user_name"] == "TestUser"
        assert "id" in result
        assert "goals" in result
        assert "preferences" in result

    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
    ):
        """When no profile matches, return None."""
        mock_cursor.fetchone.return_value = None

        result = await profile_repo.get_by_telegram_id(
            mock_pool,
            telegram_id="nonexistent_user",
        )

        assert result is None

    @pytest.mark.asyncio
    async def test_passes_telegram_id_as_param(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
    ):
        """The telegram_id is passed as a parameterised query value."""
        mock_cursor.fetchone.return_value = None

        await profile_repo.get_by_telegram_id(
            mock_pool,
            telegram_id="tg_user_42",
        )

        mock_cursor.execute.assert_awaited_once()
        params = mock_cursor.execute.call_args[0][1]
        assert params == ("tg_user_42",)

    @pytest.mark.asyncio
    async def test_sql_selects_from_profiles(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
    ):
        """The SQL must select from the profiles table with a WHERE clause."""
        mock_cursor.fetchone.return_value = None

        await profile_repo.get_by_telegram_id(
            mock_pool,
            telegram_id="tg_user_42",
        )

        sql = mock_cursor.execute.call_args[0][0]
        assert "SELECT" in sql
        assert "FROM profiles" in sql
        assert "WHERE telegram_id" in sql

    @pytest.mark.asyncio
    async def test_does_not_commit(
        self,
        mock_pool: MagicMock,
        mock_conn: AsyncMock,
        mock_cursor: AsyncMock,
    ):
        """Read-only query must not call commit."""
        mock_cursor.fetchone.return_value = None

        await profile_repo.get_by_telegram_id(
            mock_pool,
            telegram_id="tg_user_42",
        )

        mock_conn.commit.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_result_is_plain_dict_not_row_proxy(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
        sample_profile_row: dict[str, Any],
    ):
        """The function wraps fetchone in dict() so the result is a plain dict."""
        mock_cursor.fetchone.return_value = sample_profile_row

        result = await profile_repo.get_by_telegram_id(
            mock_pool,
            telegram_id="tg_user_42",
        )

        assert isinstance(result, dict)

    @pytest.mark.asyncio
    async def test_returns_all_expected_columns(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
        sample_profile_row: dict[str, Any],
    ):
        """Verify the returned dict contains all expected profile columns."""
        mock_cursor.fetchone.return_value = sample_profile_row

        result = await profile_repo.get_by_telegram_id(
            mock_pool,
            telegram_id="tg_user_42",
        )

        expected_keys = {
            "id",
            "telegram_id",
            "user_name",
            "goals",
            "preferences",
            "created_at",
            "updated_at",
        }
        assert result is not None
        assert set(result.keys()) == expected_keys
