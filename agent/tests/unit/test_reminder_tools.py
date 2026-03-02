"""Unit tests for jiki_agent.skills.reminder.tools module.

Tests cover:
- ``SetReminderInput`` / ``ListRemindersInput`` / ``DeleteReminderInput``: Pydantic schemas
- ``set_reminder`` tool: Reminder creation with validation
- ``list_reminders`` tool: Active/all reminder listing
- ``delete_reminder`` tool: Reminder cancellation
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

from jiki_agent.context import set_current_user
from jiki_agent.skills.reminder.tools import (
    DeleteReminderInput,
    ListRemindersInput,
    SetReminderInput,
    delete_reminder,
    list_reminders,
    set_reminder,
)


# =========================================================================
# Pydantic input schemas
# =========================================================================
class TestSetReminderInput:
    def test_valid_input(self):
        model = SetReminderInput(message="회의", remind_at="2030-01-01 09:00")
        assert model.message == "회의"
        assert model.remind_at == "2030-01-01 09:00"
        assert model.title == ""

    def test_with_title(self):
        model = SetReminderInput(message="msg", remind_at="2030-01-01 09:00", title="제목")
        assert model.title == "제목"

    def test_missing_message_raises(self):
        with pytest.raises(ValidationError):
            SetReminderInput(remind_at="2030-01-01 09:00")  # type: ignore[call-arg]

    def test_missing_remind_at_raises(self):
        with pytest.raises(ValidationError):
            SetReminderInput(message="msg")  # type: ignore[call-arg]


class TestListRemindersInput:
    def test_default(self):
        model = ListRemindersInput()
        assert model.include_done is False

    def test_include_done(self):
        model = ListRemindersInput(include_done=True)
        assert model.include_done is True


class TestDeleteReminderInput:
    def test_valid(self):
        model = DeleteReminderInput(reminder_id="abc12345")
        assert model.reminder_id == "abc12345"

    def test_missing_id_raises(self):
        with pytest.raises(ValidationError):
            DeleteReminderInput()  # type: ignore[call-arg]


# =========================================================================
# Helper
# =========================================================================
def _future_time(hours: int = 1) -> str:
    """Return a datetime string in the future."""
    dt = datetime.now() + timedelta(hours=hours)
    return dt.strftime("%Y-%m-%d %H:%M")


# =========================================================================
# set_reminder tool
# =========================================================================
class TestSetReminder:
    @pytest.mark.asyncio
    async def test_no_user(self):
        set_current_user("")
        result = await set_reminder.ainvoke(
            {"message": "test", "remind_at": _future_time()}
        )
        assert "사용자 정보" in result

    @pytest.mark.asyncio
    async def test_empty_message(self):
        set_current_user("user1")
        result = await set_reminder.ainvoke(
            {"message": "", "remind_at": _future_time()}
        )
        assert "메시지를 입력" in result

    @pytest.mark.asyncio
    async def test_invalid_time_format(self):
        set_current_user("user1")
        result = await set_reminder.ainvoke(
            {"message": "test", "remind_at": "not-a-time"}
        )
        assert "형식이 올바르지" in result

    @pytest.mark.asyncio
    async def test_past_time(self):
        set_current_user("user1")
        result = await set_reminder.ainvoke(
            {"message": "test", "remind_at": "2020-01-01 09:00"}
        )
        assert "과거 시간" in result

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.reminder.tools.knowledge_repo")
    @patch("jiki_agent.skills.reminder.tools.get_pool")
    async def test_max_reminders(self, mock_get_pool, mock_repo):
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        # Return 20 active reminders.
        mock_repo.get_by_key_prefix = AsyncMock(
            return_value=[
                {"key": f"reminder:{i}", "value": json.dumps({"status": "active"})}
                for i in range(20)
            ]
        )
        set_current_user("user1")
        result = await set_reminder.ainvoke(
            {"message": "test", "remind_at": _future_time()}
        )
        assert "최대" in result

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.reminder.tools.knowledge_repo")
    @patch("jiki_agent.skills.reminder.tools.get_pool")
    async def test_successful_creation(self, mock_get_pool, mock_repo):
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_repo.get_by_key_prefix = AsyncMock(return_value=[])
        mock_repo.upsert = AsyncMock()

        set_current_user("user1")
        future = _future_time()
        result = await set_reminder.ainvoke(
            {"message": "회의 참석", "remind_at": future, "title": "회의"}
        )
        assert "설정했어요" in result
        assert "회의" in result
        assert "알림 ID" in result
        mock_repo.upsert.assert_awaited_once()

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.reminder.tools.knowledge_repo")
    @patch("jiki_agent.skills.reminder.tools.get_pool")
    async def test_no_title_uses_message(self, mock_get_pool, mock_repo):
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_repo.get_by_key_prefix = AsyncMock(return_value=[])
        mock_repo.upsert = AsyncMock()

        set_current_user("user1")
        result = await set_reminder.ainvoke(
            {"message": "약 먹기", "remind_at": _future_time()}
        )
        assert "약 먹기" in result


# =========================================================================
# list_reminders tool
# =========================================================================
class TestListReminders:
    @pytest.mark.asyncio
    async def test_no_user(self):
        set_current_user("")
        result = await list_reminders.ainvoke({"include_done": False})
        assert "사용자 정보" in result

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.reminder.tools.knowledge_repo")
    @patch("jiki_agent.skills.reminder.tools.get_pool")
    async def test_no_reminders(self, mock_get_pool, mock_repo):
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_repo.get_by_key_prefix = AsyncMock(return_value=[])
        set_current_user("user1")
        result = await list_reminders.ainvoke({"include_done": False})
        assert "없어요" in result

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.reminder.tools.knowledge_repo")
    @patch("jiki_agent.skills.reminder.tools.get_pool")
    async def test_list_active_only(self, mock_get_pool, mock_repo):
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_repo.get_by_key_prefix = AsyncMock(
            return_value=[
                {
                    "key": "reminder:abc1",
                    "value": json.dumps({
                        "title": "회의", "message": "회의 참석",
                        "remind_at": "2030-01-01 09:00", "status": "active",
                    }),
                },
                {
                    "key": "reminder:abc2",
                    "value": json.dumps({
                        "title": "지난알림", "message": "완료됨",
                        "remind_at": "2020-01-01 09:00", "status": "completed",
                    }),
                },
            ]
        )
        set_current_user("user1")
        result = await list_reminders.ainvoke({"include_done": False})
        assert "회의" in result
        assert "지난알림" not in result

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.reminder.tools.knowledge_repo")
    @patch("jiki_agent.skills.reminder.tools.get_pool")
    async def test_list_include_done(self, mock_get_pool, mock_repo):
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_repo.get_by_key_prefix = AsyncMock(
            return_value=[
                {
                    "key": "reminder:abc1",
                    "value": json.dumps({
                        "title": "활성", "message": "m",
                        "remind_at": "2030-01-01 09:00", "status": "active",
                    }),
                },
                {
                    "key": "reminder:abc2",
                    "value": json.dumps({
                        "title": "완료", "message": "m",
                        "remind_at": "2020-01-01 09:00", "status": "completed",
                    }),
                },
            ]
        )
        set_current_user("user1")
        result = await list_reminders.ainvoke({"include_done": True})
        assert "활성" in result
        assert "완료" in result


# =========================================================================
# delete_reminder tool
# =========================================================================
class TestDeleteReminder:
    @pytest.mark.asyncio
    async def test_no_user(self):
        set_current_user("")
        result = await delete_reminder.ainvoke({"reminder_id": "abc"})
        assert "사용자 정보" in result

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.reminder.tools.knowledge_repo")
    @patch("jiki_agent.skills.reminder.tools.get_pool")
    async def test_not_found(self, mock_get_pool, mock_repo):
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_repo.get_by_key = AsyncMock(return_value=None)
        set_current_user("user1")
        result = await delete_reminder.ainvoke({"reminder_id": "notexist"})
        assert "찾을 수 없" in result

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.reminder.tools.knowledge_repo")
    @patch("jiki_agent.skills.reminder.tools.get_pool")
    async def test_already_cancelled(self, mock_get_pool, mock_repo):
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_repo.get_by_key = AsyncMock(
            return_value={
                "key": "reminder:abc",
                "value": json.dumps({"status": "cancelled", "title": "test"}),
            }
        )
        set_current_user("user1")
        result = await delete_reminder.ainvoke({"reminder_id": "abc"})
        assert "이미" in result

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.reminder.tools.knowledge_repo")
    @patch("jiki_agent.skills.reminder.tools.get_pool")
    async def test_successful_deletion(self, mock_get_pool, mock_repo):
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_repo.get_by_key = AsyncMock(
            return_value={
                "key": "reminder:abc",
                "value": json.dumps({
                    "status": "active", "title": "회의 알림",
                    "message": "회의 참석", "remind_at": "2030-01-01 09:00",
                }),
            }
        )
        mock_repo.delete_by_key = AsyncMock()
        mock_repo.upsert = AsyncMock()

        set_current_user("user1")
        result = await delete_reminder.ainvoke({"reminder_id": "abc"})
        assert "삭제했어요" in result
        assert "회의 알림" in result
        mock_repo.delete_by_key.assert_awaited_once()
        mock_repo.upsert.assert_awaited_once()
