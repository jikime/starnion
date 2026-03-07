"""Unit tests for starnion_agent.tools.finance module.

Tests cover:
- ``set_current_user`` / ``get_current_user``: Module-level user tracking
- ``SaveFinanceInput`` / ``GetMonthlyTotalInput``: Pydantic input schemas
- ``save_finance`` tool: Records expense and returns Korean confirmation
- ``get_monthly_total`` tool: Returns monthly spending summary in Korean
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

from starnion_agent.context import get_current_user, set_current_user
from starnion_agent.skills.finance.tools import (
    GetMonthlyTotalInput,
    SaveFinanceInput,
    get_monthly_total,
    save_finance,
)


# =========================================================================
# set_current_user / get_current_user
# =========================================================================
class TestCurrentUser:
    """Tests for the module-level user tracking helpers."""

    def test_set_and_get_user(self):
        """Setting a user ID makes it retrievable via get_current_user."""
        set_current_user("tg_user_42")

        assert get_current_user() == "tg_user_42"

        # Cleanup
        set_current_user("")

    def test_get_default_is_empty_string(self):
        """Before any set call, the default user ID is an empty string."""
        set_current_user("")

        assert get_current_user() == ""

    def test_overwrite_user(self):
        """A second set call overwrites the previous user ID."""
        set_current_user("user_a")
        set_current_user("user_b")

        assert get_current_user() == "user_b"

        # Cleanup
        set_current_user("")

    def test_reset_to_empty(self):
        """Setting the user to empty string effectively clears it."""
        set_current_user("tg_user_42")
        set_current_user("")

        assert get_current_user() == ""


# =========================================================================
# Pydantic input schemas
# =========================================================================
class TestSaveFinanceInput:
    """Tests for the ``SaveFinanceInput`` Pydantic model."""

    def test_valid_input_with_all_fields(self):
        """All three fields provided creates a valid model."""
        model = SaveFinanceInput(
            category="food",
            amount=15000,
            description="Lunch at cafe",
        )

        assert model.category == "food"
        assert model.amount == 15000
        assert model.description == "Lunch at cafe"

    def test_description_defaults_to_empty_string(self):
        """When description is omitted, it defaults to an empty string."""
        model = SaveFinanceInput(category="transport", amount=3000)

        assert model.description == ""

    def test_missing_category_raises_validation_error(self):
        """Category is required -- omitting it raises ValidationError."""
        with pytest.raises(ValidationError):
            SaveFinanceInput(amount=10000)  # type: ignore[call-arg]

    def test_missing_amount_raises_validation_error(self):
        """Amount is required -- omitting it raises ValidationError."""
        with pytest.raises(ValidationError):
            SaveFinanceInput(category="food")  # type: ignore[call-arg]

    def test_amount_must_be_integer(self):
        """Amount field must accept integer values."""
        model = SaveFinanceInput(category="food", amount=5000)
        assert isinstance(model.amount, int)


class TestGetMonthlyTotalInput:
    """Tests for the ``GetMonthlyTotalInput`` Pydantic model."""

    def test_category_defaults_to_empty_string(self):
        """When category is omitted, it defaults to an empty string."""
        model = GetMonthlyTotalInput()

        assert model.category == ""

    def test_category_can_be_set(self):
        """Explicit category value is stored."""
        model = GetMonthlyTotalInput(category="food")

        assert model.category == "food"


# =========================================================================
# save_finance tool
# =========================================================================
class TestSaveFinanceTool:
    """Tests for the ``save_finance`` @tool function."""

    @pytest.mark.asyncio
    async def test_returns_error_when_no_user(self):
        """When no user is set, returns Korean error message."""
        set_current_user("")

        result = await save_finance.ainvoke(
            {"category": "food", "amount": 15000}
        )

        assert "사용자 정보를 확인할 수 없어요" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.finance.tools.finance_repo")
    @patch("starnion_agent.skills.finance.tools.get_pool")
    async def test_records_expense_and_returns_confirmation(
        self,
        mock_get_pool: MagicMock,
        mock_finance_repo: MagicMock,
    ):
        """Successful save returns a Korean message with category, amount, and monthly total."""
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_finance_repo.create = AsyncMock()
        mock_finance_repo.get_monthly_total = AsyncMock(return_value=45000)

        set_current_user("tg_user_42")

        result = await save_finance.ainvoke(
            {"category": "food", "amount": 15000, "description": "Lunch"}
        )

        assert "food" in result
        assert "15,000" in result
        assert "45,000" in result
        assert "기록했어요" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.finance.tools.finance_repo")
    @patch("starnion_agent.skills.finance.tools.get_pool")
    async def test_calls_create_with_correct_args(
        self,
        mock_get_pool: MagicMock,
        mock_finance_repo: MagicMock,
    ):
        """Verify finance_repo.create is called with correct args."""
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_finance_repo.create = AsyncMock()
        mock_finance_repo.get_monthly_total = AsyncMock(return_value=15000)

        set_current_user("tg_user_42")

        await save_finance.ainvoke(
            {"category": "transport", "amount": 3000, "description": "Bus fare"}
        )

        mock_finance_repo.create.assert_awaited_once_with(
            mock_pool,
            user_id="tg_user_42",
            amount=3000,
            category="transport",
            description="Bus fare",
        )

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.finance.tools.finance_repo")
    @patch("starnion_agent.skills.finance.tools.get_pool")
    async def test_calls_get_monthly_total_with_current_month(
        self,
        mock_get_pool: MagicMock,
        mock_finance_repo: MagicMock,
    ):
        """After saving, queries the monthly total for the same category and current month."""
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_finance_repo.create = AsyncMock()
        mock_finance_repo.get_monthly_total = AsyncMock(return_value=30000)

        set_current_user("tg_user_42")

        await save_finance.ainvoke({"category": "food", "amount": 10000})

        mock_finance_repo.get_monthly_total.assert_awaited_once()
        call_kwargs = mock_finance_repo.get_monthly_total.call_args
        assert call_kwargs.kwargs["user_id"] == "tg_user_42"
        assert call_kwargs.kwargs["category"] == "food"
        # month format: "YYYY-MM"
        month_arg = call_kwargs.kwargs["month"]
        assert len(month_arg) == 7
        assert "-" in month_arg

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.finance.tools.finance_repo")
    @patch("starnion_agent.skills.finance.tools.get_pool")
    async def test_default_empty_description(
        self,
        mock_get_pool: MagicMock,
        mock_finance_repo: MagicMock,
    ):
        """When description is omitted, it defaults to empty string in the create call."""
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_finance_repo.create = AsyncMock()
        mock_finance_repo.get_monthly_total = AsyncMock(return_value=5000)

        set_current_user("tg_user_42")

        await save_finance.ainvoke({"category": "food", "amount": 5000})

        call_kwargs = mock_finance_repo.create.call_args
        assert call_kwargs.kwargs["description"] == ""

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.finance.tools.finance_repo")
    @patch("starnion_agent.skills.finance.tools.get_pool")
    async def test_number_formatting_in_response(
        self,
        mock_get_pool: MagicMock,
        mock_finance_repo: MagicMock,
    ):
        """Large amounts are formatted with comma separators (Korean won)."""
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_finance_repo.create = AsyncMock()
        mock_finance_repo.get_monthly_total = AsyncMock(return_value=1234567)

        set_current_user("tg_user_42")

        result = await save_finance.ainvoke(
            {"category": "shopping", "amount": 1234567}
        )

        assert "1,234,567" in result


# =========================================================================
# get_monthly_total tool
# =========================================================================
class TestGetMonthlyTotalTool:
    """Tests for the ``get_monthly_total`` @tool function."""

    @pytest.mark.asyncio
    async def test_returns_error_when_no_user(self):
        """When no user is set, returns Korean error message."""
        set_current_user("")

        result = await get_monthly_total.ainvoke({"category": ""})

        assert "사용자 정보를 확인할 수 없어요" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.finance.tools.finance_repo")
    @patch("starnion_agent.skills.finance.tools.get_pool")
    async def test_specific_category_returns_total(
        self,
        mock_get_pool: MagicMock,
        mock_finance_repo: MagicMock,
    ):
        """When a category is provided, return that category's total."""
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_finance_repo.get_monthly_total = AsyncMock(return_value=45000)

        set_current_user("tg_user_42")

        result = await get_monthly_total.ainvoke({"category": "food"})

        assert "food" in result
        assert "45,000" in result
        assert "총 지출" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.finance.tools.finance_repo")
    @patch("starnion_agent.skills.finance.tools.get_pool")
    async def test_empty_category_returns_full_summary(
        self,
        mock_get_pool: MagicMock,
        mock_finance_repo: MagicMock,
    ):
        """When category is empty, returns a summary with all categories."""
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_finance_repo.get_monthly_summary = AsyncMock(
            return_value=[
                {"category": "food", "total": 45000},
                {"category": "transport", "total": 20000},
            ]
        )

        set_current_user("tg_user_42")

        result = await get_monthly_total.ainvoke({"category": ""})

        assert "65,000" in result  # grand total = 45000 + 20000
        assert "food" in result
        assert "45,000" in result
        assert "transport" in result
        assert "20,000" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.finance.tools.finance_repo")
    @patch("starnion_agent.skills.finance.tools.get_pool")
    async def test_empty_category_no_records_message(
        self,
        mock_get_pool: MagicMock,
        mock_finance_repo: MagicMock,
    ):
        """When category is empty and no records exist, returns a no-records message."""
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_finance_repo.get_monthly_summary = AsyncMock(return_value=[])

        set_current_user("tg_user_42")

        result = await get_monthly_total.ainvoke({"category": ""})

        assert "기록된 지출이 없어요" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.finance.tools.finance_repo")
    @patch("starnion_agent.skills.finance.tools.get_pool")
    async def test_specific_category_calls_get_monthly_total(
        self,
        mock_get_pool: MagicMock,
        mock_finance_repo: MagicMock,
    ):
        """A specific category calls get_monthly_total, NOT get_monthly_summary."""
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_finance_repo.get_monthly_total = AsyncMock(return_value=10000)
        mock_finance_repo.get_monthly_summary = AsyncMock()

        set_current_user("tg_user_42")

        await get_monthly_total.ainvoke({"category": "food"})

        mock_finance_repo.get_monthly_total.assert_awaited_once()
        mock_finance_repo.get_monthly_summary.assert_not_awaited()

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.finance.tools.finance_repo")
    @patch("starnion_agent.skills.finance.tools.get_pool")
    async def test_empty_category_calls_get_monthly_summary(
        self,
        mock_get_pool: MagicMock,
        mock_finance_repo: MagicMock,
    ):
        """Empty category calls get_monthly_summary, NOT get_monthly_total."""
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_finance_repo.get_monthly_summary = AsyncMock(return_value=[])
        mock_finance_repo.get_monthly_total = AsyncMock()

        set_current_user("tg_user_42")

        await get_monthly_total.ainvoke({"category": ""})

        mock_finance_repo.get_monthly_summary.assert_awaited_once()
        mock_finance_repo.get_monthly_total.assert_not_awaited()

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.finance.tools.finance_repo")
    @patch("starnion_agent.skills.finance.tools.get_pool")
    async def test_summary_line_format(
        self,
        mock_get_pool: MagicMock,
        mock_finance_repo: MagicMock,
    ):
        """Summary output has a header line followed by indented category lines."""
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_finance_repo.get_monthly_summary = AsyncMock(
            return_value=[
                {"category": "food", "total": 50000},
                {"category": "transport", "total": 10000},
            ]
        )

        set_current_user("tg_user_42")

        result = await get_monthly_total.ainvoke({"category": ""})

        lines = result.split("\n")
        assert len(lines) == 3  # header + 2 categories
        assert lines[0].startswith("이번 달 총 지출:")
        assert lines[1].strip().startswith("- food:")
        assert lines[2].strip().startswith("- transport:")

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.finance.tools.finance_repo")
    @patch("starnion_agent.skills.finance.tools.get_pool")
    async def test_zero_total_for_specific_category(
        self,
        mock_get_pool: MagicMock,
        mock_finance_repo: MagicMock,
    ):
        """A category with zero spending still returns a valid message."""
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_finance_repo.get_monthly_total = AsyncMock(return_value=0)

        set_current_user("tg_user_42")

        result = await get_monthly_total.ainvoke({"category": "medical"})

        assert "medical" in result
        assert "0" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.finance.tools.finance_repo")
    @patch("starnion_agent.skills.finance.tools.get_pool")
    async def test_single_category_summary(
        self,
        mock_get_pool: MagicMock,
        mock_finance_repo: MagicMock,
    ):
        """Summary with a single category still renders header + one detail line."""
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_finance_repo.get_monthly_summary = AsyncMock(
            return_value=[
                {"category": "subscription", "total": 29000},
            ]
        )

        set_current_user("tg_user_42")

        result = await get_monthly_total.ainvoke({"category": ""})

        lines = result.split("\n")
        assert len(lines) == 2
        assert "29,000" in lines[0]
        assert "subscription" in lines[1]
