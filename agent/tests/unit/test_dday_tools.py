"""Unit tests for starpion_agent.skills.dday.tools module.

Tests cover:
- ``SetDdayInput`` / ``ListDdaysInput`` / ``DeleteDdayInput``: Pydantic schemas
- ``set_dday`` tool: D-day creation with validation
- ``list_ddays`` tool: D-day listing with past filtering
- ``delete_dday`` tool: D-day deletion
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

from starpion_agent.context import set_current_user
from starpion_agent.skills.dday.tools import (
    DeleteDdayInput,
    ListDdaysInput,
    SetDdayInput,
    delete_dday,
    list_ddays,
    set_dday,
)


# =========================================================================
# Pydantic input schemas
# =========================================================================
class TestSetDdayInput:
    def test_valid_input(self):
        model = SetDdayInput(title="생일", target_date="2026-12-25")
        assert model.title == "생일"
        assert model.target_date == "2026-12-25"
        assert model.recurring is False

    def test_with_recurring(self):
        model = SetDdayInput(title="생일", target_date="2026-12-25", recurring=True)
        assert model.recurring is True

    def test_missing_title_raises(self):
        with pytest.raises(ValidationError):
            SetDdayInput(target_date="2026-12-25")  # type: ignore[call-arg]

    def test_missing_date_raises(self):
        with pytest.raises(ValidationError):
            SetDdayInput(title="생일")  # type: ignore[call-arg]


class TestListDdaysInput:
    def test_default(self):
        model = ListDdaysInput()
        assert model.include_past is False

    def test_include_past(self):
        model = ListDdaysInput(include_past=True)
        assert model.include_past is True


class TestDeleteDdayInput:
    def test_valid(self):
        model = DeleteDdayInput(dday_id="abc12345")
        assert model.dday_id == "abc12345"

    def test_missing_id_raises(self):
        with pytest.raises(ValidationError):
            DeleteDdayInput()  # type: ignore[call-arg]


# =========================================================================
# Helpers
# =========================================================================
def _future_date(days: int = 30) -> str:
    """Return a date string in the future."""
    return (date.today() + timedelta(days=days)).isoformat()


def _past_date(days: int = 30) -> str:
    """Return a date string in the past."""
    return (date.today() - timedelta(days=days)).isoformat()


# =========================================================================
# set_dday tool
# =========================================================================
class TestSetDday:
    @pytest.mark.asyncio
    async def test_no_user(self):
        set_current_user("")
        result = await set_dday.ainvoke(
            {"title": "생일", "target_date": _future_date()}
        )
        assert "사용자 정보" in result

    @pytest.mark.asyncio
    async def test_empty_title(self):
        set_current_user("user1")
        result = await set_dday.ainvoke(
            {"title": "", "target_date": _future_date()}
        )
        assert "이름을 입력" in result

    @pytest.mark.asyncio
    async def test_invalid_date_format(self):
        set_current_user("user1")
        result = await set_dday.ainvoke(
            {"title": "생일", "target_date": "not-a-date"}
        )
        assert "형식이 올바르지" in result

    @pytest.mark.asyncio
    @patch("starpion_agent.skills.dday.tools.knowledge_repo")
    @patch("starpion_agent.skills.dday.tools.get_pool")
    async def test_max_ddays(self, mock_get_pool, mock_repo):
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_repo.get_by_key_prefix = AsyncMock(
            return_value=[{"key": f"dday:{i}", "value": "{}"} for i in range(30)]
        )
        set_current_user("user1")
        result = await set_dday.ainvoke(
            {"title": "생일", "target_date": _future_date()}
        )
        assert "최대" in result

    @pytest.mark.asyncio
    @patch("starpion_agent.skills.dday.tools.knowledge_repo")
    @patch("starpion_agent.skills.dday.tools.get_pool")
    async def test_successful_creation(self, mock_get_pool, mock_repo):
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_repo.get_by_key_prefix = AsyncMock(return_value=[])
        mock_repo.upsert = AsyncMock()

        set_current_user("user1")
        future = _future_date(100)
        result = await set_dday.ainvoke(
            {"title": "크리스마스", "target_date": future}
        )
        assert "설정했어요" in result
        assert "크리스마스" in result
        assert "D-" in result
        mock_repo.upsert.assert_awaited_once()

    @pytest.mark.asyncio
    @patch("starpion_agent.skills.dday.tools.knowledge_repo")
    @patch("starpion_agent.skills.dday.tools.get_pool")
    async def test_recurring_label(self, mock_get_pool, mock_repo):
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_repo.get_by_key_prefix = AsyncMock(return_value=[])
        mock_repo.upsert = AsyncMock()

        set_current_user("user1")
        result = await set_dday.ainvoke(
            {"title": "생일", "target_date": _future_date(), "recurring": True}
        )
        assert "매년 반복" in result


# =========================================================================
# list_ddays tool
# =========================================================================
class TestListDdays:
    @pytest.mark.asyncio
    async def test_no_user(self):
        set_current_user("")
        result = await list_ddays.ainvoke({"include_past": False})
        assert "사용자 정보" in result

    @pytest.mark.asyncio
    @patch("starpion_agent.skills.dday.tools.knowledge_repo")
    @patch("starpion_agent.skills.dday.tools.get_pool")
    async def test_no_ddays(self, mock_get_pool, mock_repo):
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_repo.get_by_key_prefix = AsyncMock(return_value=[])
        set_current_user("user1")
        result = await list_ddays.ainvoke({"include_past": False})
        assert "없어요" in result

    @pytest.mark.asyncio
    @patch("starpion_agent.skills.dday.tools.knowledge_repo")
    @patch("starpion_agent.skills.dday.tools.get_pool")
    async def test_list_future_only(self, mock_get_pool, mock_repo):
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_repo.get_by_key_prefix = AsyncMock(
            return_value=[
                {
                    "key": "dday:abc1",
                    "value": json.dumps({
                        "title": "미래행사",
                        "target_date": _future_date(30),
                    }),
                },
                {
                    "key": "dday:abc2",
                    "value": json.dumps({
                        "title": "지난행사",
                        "target_date": _past_date(30),
                    }),
                },
            ]
        )
        set_current_user("user1")
        result = await list_ddays.ainvoke({"include_past": False})
        assert "미래행사" in result
        assert "지난행사" not in result

    @pytest.mark.asyncio
    @patch("starpion_agent.skills.dday.tools.knowledge_repo")
    @patch("starpion_agent.skills.dday.tools.get_pool")
    async def test_list_include_past(self, mock_get_pool, mock_repo):
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_repo.get_by_key_prefix = AsyncMock(
            return_value=[
                {
                    "key": "dday:abc1",
                    "value": json.dumps({
                        "title": "미래",
                        "target_date": _future_date(30),
                    }),
                },
                {
                    "key": "dday:abc2",
                    "value": json.dumps({
                        "title": "과거",
                        "target_date": _past_date(30),
                    }),
                },
            ]
        )
        set_current_user("user1")
        result = await list_ddays.ainvoke({"include_past": True})
        assert "미래" in result
        assert "과거" in result

    @pytest.mark.asyncio
    @patch("starpion_agent.skills.dday.tools.knowledge_repo")
    @patch("starpion_agent.skills.dday.tools.get_pool")
    async def test_recurring_past_shown(self, mock_get_pool, mock_repo):
        """Recurring D-days should be shown even if target date is past."""
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_repo.get_by_key_prefix = AsyncMock(
            return_value=[
                {
                    "key": "dday:abc1",
                    "value": json.dumps({
                        "title": "생일반복",
                        "target_date": _past_date(10),
                        "recurring": True,
                    }),
                },
            ]
        )
        set_current_user("user1")
        result = await list_ddays.ainvoke({"include_past": False})
        assert "생일반복" in result


# =========================================================================
# delete_dday tool
# =========================================================================
class TestDeleteDday:
    @pytest.mark.asyncio
    async def test_no_user(self):
        set_current_user("")
        result = await delete_dday.ainvoke({"dday_id": "abc"})
        assert "사용자 정보" in result

    @pytest.mark.asyncio
    @patch("starpion_agent.skills.dday.tools.knowledge_repo")
    @patch("starpion_agent.skills.dday.tools.get_pool")
    async def test_not_found(self, mock_get_pool, mock_repo):
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_repo.get_by_key = AsyncMock(return_value=None)
        set_current_user("user1")
        result = await delete_dday.ainvoke({"dday_id": "notexist"})
        assert "찾을 수 없" in result

    @pytest.mark.asyncio
    @patch("starpion_agent.skills.dday.tools.knowledge_repo")
    @patch("starpion_agent.skills.dday.tools.get_pool")
    async def test_successful_deletion(self, mock_get_pool, mock_repo):
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_repo.get_by_key = AsyncMock(
            return_value={
                "key": "dday:abc",
                "value": json.dumps({
                    "title": "크리스마스",
                    "target_date": "2026-12-25",
                }),
            }
        )
        mock_repo.delete_by_key = AsyncMock()

        set_current_user("user1")
        result = await delete_dday.ainvoke({"dday_id": "abc"})
        assert "삭제했어요" in result
        assert "크리스마스" in result
        mock_repo.delete_by_key.assert_awaited_once()
