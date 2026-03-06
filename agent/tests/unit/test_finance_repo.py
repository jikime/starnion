"""Unit tests for starpion_agent.db.repositories.finance module.

Tests cover:
- ``create``: INSERT with RETURNING
- ``get_monthly_total``: SELECT SUM with month range filter
- ``get_monthly_summary``: GROUP BY category summary
- ``_month_range``: Pure helper for computing month boundaries
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from starpion_agent.db.repositories import finance as finance_repo


# =========================================================================
# _month_range (pure function -- no mocking needed)
# =========================================================================
class TestMonthRange:
    """Tests for the ``_month_range`` helper."""

    def test_normal_month(self):
        """A standard mid-year month returns first-of-month boundaries."""
        start, end = finance_repo._month_range("2025-06")

        assert start == datetime(2025, 6, 1)
        assert end == datetime(2025, 7, 1)

    def test_january(self):
        """January resolves correctly (mon_int == 1)."""
        start, end = finance_repo._month_range("2025-01")

        assert start == datetime(2025, 1, 1)
        assert end == datetime(2025, 2, 1)

    def test_december_rolls_to_next_year(self):
        """December boundary correctly rolls over to January of the next year."""
        start, end = finance_repo._month_range("2024-12")

        assert start == datetime(2024, 12, 1)
        assert end == datetime(2025, 1, 1)

    def test_leap_year_february(self):
        """February in a leap year still returns March 1 as the end boundary."""
        start, end = finance_repo._month_range("2024-02")

        assert start == datetime(2024, 2, 1)
        assert end == datetime(2024, 3, 1)

    def test_non_leap_year_february(self):
        """February in a non-leap year still returns March 1 as the end boundary."""
        start, end = finance_repo._month_range("2025-02")

        assert start == datetime(2025, 2, 1)
        assert end == datetime(2025, 3, 1)

    def test_start_is_always_before_end(self):
        """Invariant: start < end for every valid month."""
        for month_num in range(1, 13):
            month_str = f"2025-{month_num:02d}"
            start, end = finance_repo._month_range(month_str)
            assert start < end, f"Failed for {month_str}"

    def test_invalid_month_format_raises(self):
        """Malformed month strings should raise an exception."""
        with pytest.raises((ValueError, IndexError)):
            finance_repo._month_range("2025")

    def test_invalid_month_value_raises(self):
        """Month value 13 should raise ValueError from datetime constructor."""
        with pytest.raises(ValueError):
            finance_repo._month_range("2025-13")


# =========================================================================
# create
# =========================================================================
class TestCreate:
    """Tests for ``finance_repo.create``."""

    @pytest.mark.asyncio
    async def test_create_returns_inserted_row(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
        sample_finance_row: dict[str, Any],
    ):
        """Successful insert returns the full row dict from RETURNING clause."""
        mock_cursor.fetchone.return_value = sample_finance_row

        result = await finance_repo.create(
            mock_pool,
            user_id="tg_user_42",
            amount=15000,
            category="food",
            description="Lunch at cafe",
        )

        assert result == sample_finance_row
        assert result["user_id"] == "tg_user_42"
        assert result["amount"] == 15000
        assert result["category"] == "food"

    @pytest.mark.asyncio
    async def test_create_calls_execute_with_correct_params(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
        sample_finance_row: dict[str, Any],
    ):
        """Verify the SQL parameters are passed in the correct order."""
        mock_cursor.fetchone.return_value = sample_finance_row

        await finance_repo.create(
            mock_pool,
            user_id="tg_user_42",
            amount=15000,
            category="food",
            description="Lunch at cafe",
        )

        mock_cursor.execute.assert_awaited_once()
        call_args = mock_cursor.execute.call_args
        params = call_args[0][1]
        assert params == ("tg_user_42", 15000, "food", "Lunch at cafe")

    @pytest.mark.asyncio
    async def test_create_commits_transaction(
        self,
        mock_pool: MagicMock,
        mock_conn: AsyncMock,
        mock_cursor: AsyncMock,
        sample_finance_row: dict[str, Any],
    ):
        """Insert must commit the transaction."""
        mock_cursor.fetchone.return_value = sample_finance_row

        await finance_repo.create(
            mock_pool,
            user_id="tg_user_42",
            amount=15000,
            category="food",
        )

        mock_conn.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_create_with_empty_description(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
    ):
        """Default empty description is forwarded to the query."""
        mock_cursor.fetchone.return_value = {
            "id": 2,
            "user_id": "tg_user_42",
            "amount": 5000,
            "category": "transport",
            "description": "",
            "created_at": "2025-03-01T08:00:00",
        }

        result = await finance_repo.create(
            mock_pool,
            user_id="tg_user_42",
            amount=5000,
            category="transport",
        )

        assert result["description"] == ""
        call_args = mock_cursor.execute.call_args
        params = call_args[0][1]
        assert params == ("tg_user_42", 5000, "transport", "")

    @pytest.mark.asyncio
    async def test_create_sql_contains_insert_returning(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
        sample_finance_row: dict[str, Any],
    ):
        """The executed SQL must include INSERT and RETURNING keywords."""
        mock_cursor.fetchone.return_value = sample_finance_row

        await finance_repo.create(
            mock_pool,
            user_id="tg_user_42",
            amount=15000,
            category="food",
        )

        sql = mock_cursor.execute.call_args[0][0]
        assert "INSERT INTO finances" in sql
        assert "RETURNING" in sql


# =========================================================================
# get_monthly_total
# =========================================================================
class TestGetMonthlyTotal:
    """Tests for ``finance_repo.get_monthly_total``."""

    @pytest.mark.asyncio
    async def test_returns_total_when_records_exist(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
    ):
        """When records exist, return the summed total."""
        mock_cursor.fetchone.return_value = {"total": 45000}

        total = await finance_repo.get_monthly_total(
            mock_pool,
            user_id="tg_user_42",
            category="food",
            month="2025-03",
        )

        assert total == 45000

    @pytest.mark.asyncio
    async def test_returns_zero_when_no_records(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
    ):
        """COALESCE(SUM(amount), 0) returns 0 when no matching records."""
        mock_cursor.fetchone.return_value = {"total": 0}

        total = await finance_repo.get_monthly_total(
            mock_pool,
            user_id="tg_user_42",
            category="food",
            month="2025-03",
        )

        assert total == 0

    @pytest.mark.asyncio
    async def test_returns_zero_when_fetchone_is_none(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
    ):
        """Edge case: if fetchone returns None, the result should be 0."""
        mock_cursor.fetchone.return_value = None

        total = await finance_repo.get_monthly_total(
            mock_pool,
            user_id="tg_user_42",
            category="food",
            month="2025-03",
        )

        assert total == 0

    @pytest.mark.asyncio
    async def test_passes_month_range_to_query(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
    ):
        """Verify start/end datetime boundaries are computed from the month string."""
        mock_cursor.fetchone.return_value = {"total": 0}

        await finance_repo.get_monthly_total(
            mock_pool,
            user_id="tg_user_42",
            category="food",
            month="2025-03",
        )

        call_args = mock_cursor.execute.call_args
        params = call_args[0][1]
        user_id_param, category_param, start_param, end_param = params

        assert user_id_param == "tg_user_42"
        assert category_param == "food"
        assert start_param == datetime(2025, 3, 1)
        assert end_param == datetime(2025, 4, 1)

    @pytest.mark.asyncio
    async def test_december_month_range_in_query(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
    ):
        """December query must use Jan 1 of next year as end boundary."""
        mock_cursor.fetchone.return_value = {"total": 100000}

        await finance_repo.get_monthly_total(
            mock_pool,
            user_id="tg_user_42",
            category="shopping",
            month="2024-12",
        )

        params = mock_cursor.execute.call_args[0][1]
        assert params[2] == datetime(2024, 12, 1)
        assert params[3] == datetime(2025, 1, 1)

    @pytest.mark.asyncio
    async def test_does_not_commit(
        self,
        mock_pool: MagicMock,
        mock_conn: AsyncMock,
        mock_cursor: AsyncMock,
    ):
        """Read-only query must not call commit."""
        mock_cursor.fetchone.return_value = {"total": 0}

        await finance_repo.get_monthly_total(
            mock_pool,
            user_id="tg_user_42",
            category="food",
            month="2025-03",
        )

        mock_conn.commit.assert_not_awaited()


# =========================================================================
# get_monthly_summary
# =========================================================================
class TestGetMonthlySummary:
    """Tests for ``finance_repo.get_monthly_summary``."""

    @pytest.mark.asyncio
    async def test_returns_list_of_category_totals(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
    ):
        """When multiple categories exist, returns a list of dicts."""
        mock_cursor.fetchall.return_value = [
            {"category": "food", "total": 45000},
            {"category": "transport", "total": 20000},
            {"category": "shopping", "total": 15000},
        ]

        summary = await finance_repo.get_monthly_summary(
            mock_pool,
            user_id="tg_user_42",
            month="2025-03",
        )

        assert len(summary) == 3
        assert summary[0] == {"category": "food", "total": 45000}
        assert summary[1] == {"category": "transport", "total": 20000}
        assert summary[2] == {"category": "shopping", "total": 15000}

    @pytest.mark.asyncio
    async def test_returns_empty_list_when_no_records(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
    ):
        """No records in the month returns an empty list."""
        mock_cursor.fetchall.return_value = []

        summary = await finance_repo.get_monthly_summary(
            mock_pool,
            user_id="tg_user_42",
            month="2025-03",
        )

        assert summary == []

    @pytest.mark.asyncio
    async def test_returns_plain_dicts(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
    ):
        """Each row is converted to a plain dict (not a psycopg Row object)."""
        mock_cursor.fetchall.return_value = [
            {"category": "food", "total": 10000},
        ]

        summary = await finance_repo.get_monthly_summary(
            mock_pool,
            user_id="tg_user_42",
            month="2025-03",
        )

        assert isinstance(summary[0], dict)

    @pytest.mark.asyncio
    async def test_passes_correct_params_without_category_filter(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
    ):
        """Summary query has only user_id + start + end (no category filter)."""
        mock_cursor.fetchall.return_value = []

        await finance_repo.get_monthly_summary(
            mock_pool,
            user_id="tg_user_42",
            month="2025-06",
        )

        params = mock_cursor.execute.call_args[0][1]
        assert len(params) == 3
        assert params[0] == "tg_user_42"
        assert params[1] == datetime(2025, 6, 1)
        assert params[2] == datetime(2025, 7, 1)

    @pytest.mark.asyncio
    async def test_sql_contains_group_by(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
    ):
        """The executed SQL must include GROUP BY for category aggregation."""
        mock_cursor.fetchall.return_value = []

        await finance_repo.get_monthly_summary(
            mock_pool,
            user_id="tg_user_42",
            month="2025-03",
        )

        sql = mock_cursor.execute.call_args[0][0]
        assert "GROUP BY" in sql

    @pytest.mark.asyncio
    async def test_does_not_commit(
        self,
        mock_pool: MagicMock,
        mock_conn: AsyncMock,
        mock_cursor: AsyncMock,
    ):
        """Read-only query must not call commit."""
        mock_cursor.fetchall.return_value = []

        await finance_repo.get_monthly_summary(
            mock_pool,
            user_id="tg_user_42",
            month="2025-03",
        )

        mock_conn.commit.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_single_category_summary(
        self,
        mock_pool: MagicMock,
        mock_cursor: AsyncMock,
    ):
        """A month with only one category returns a single-element list."""
        mock_cursor.fetchall.return_value = [
            {"category": "subscription", "total": 29000},
        ]

        summary = await finance_repo.get_monthly_summary(
            mock_pool,
            user_id="tg_user_42",
            month="2025-03",
        )

        assert len(summary) == 1
        assert summary[0]["category"] == "subscription"
        assert summary[0]["total"] == 29000
