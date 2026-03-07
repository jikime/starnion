"""Unit tests for starnion_agent.skills.memo.tools module.

Tests cover:
- ``SaveMemoInput`` / ``ListMemosInput`` / ``DeleteMemoInput``: Pydantic schemas
- ``save_memo`` tool: Memo creation with validation
- ``list_memos`` tool: Memo listing with tag filtering
- ``delete_memo`` tool: Memo deletion
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

from starnion_agent.context import set_current_user
from starnion_agent.skills.memo.tools import (
    DeleteMemoInput,
    ListMemosInput,
    SaveMemoInput,
    delete_memo,
    list_memos,
    save_memo,
)


# =========================================================================
# Pydantic input schemas
# =========================================================================
class TestSaveMemoInput:
    def test_valid_input(self):
        model = SaveMemoInput(content="메모 내용")
        assert model.content == "메모 내용"
        assert model.title == ""
        assert model.tag == ""

    def test_with_all_fields(self):
        model = SaveMemoInput(content="내용", title="제목", tag="업무")
        assert model.title == "제목"
        assert model.tag == "업무"

    def test_missing_content_raises(self):
        with pytest.raises(ValidationError):
            SaveMemoInput()  # type: ignore[call-arg]


class TestListMemosInput:
    def test_defaults(self):
        model = ListMemosInput()
        assert model.tag == ""
        assert model.limit == 10

    def test_custom(self):
        model = ListMemosInput(tag="업무", limit=20)
        assert model.tag == "업무"
        assert model.limit == 20


class TestDeleteMemoInput:
    def test_valid(self):
        model = DeleteMemoInput(memo_id="abc12345")
        assert model.memo_id == "abc12345"

    def test_missing_id_raises(self):
        with pytest.raises(ValidationError):
            DeleteMemoInput()  # type: ignore[call-arg]


# =========================================================================
# save_memo tool
# =========================================================================
class TestSaveMemo:
    @pytest.mark.asyncio
    async def test_no_user(self):
        set_current_user("")
        result = await save_memo.ainvoke({"content": "test"})
        assert "사용자 정보" in result

    @pytest.mark.asyncio
    async def test_empty_content(self):
        set_current_user("user1")
        result = await save_memo.ainvoke({"content": ""})
        assert "내용을 입력" in result

    @pytest.mark.asyncio
    async def test_too_long_content(self):
        set_current_user("user1")
        result = await save_memo.ainvoke({"content": "x" * 2001})
        assert "너무 길어" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.memo.tools.knowledge_repo")
    @patch("starnion_agent.skills.memo.tools.get_pool")
    async def test_max_memos(self, mock_get_pool, mock_repo):
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_repo.get_by_key_prefix = AsyncMock(
            return_value=[{"key": f"memo:{i}", "value": "{}"} for i in range(100)]
        )
        set_current_user("user1")
        result = await save_memo.ainvoke({"content": "test"})
        assert "최대" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.memo.tools.knowledge_repo")
    @patch("starnion_agent.skills.memo.tools.get_pool")
    async def test_successful_save(self, mock_get_pool, mock_repo):
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_repo.get_by_key_prefix = AsyncMock(return_value=[])
        mock_repo.upsert = AsyncMock()

        set_current_user("user1")
        result = await save_memo.ainvoke(
            {"content": "우유 사기", "title": "장보기", "tag": "개인"}
        )
        assert "저장했어요" in result
        assert "장보기" in result
        assert "개인" in result
        mock_repo.upsert.assert_awaited_once()

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.memo.tools.knowledge_repo")
    @patch("starnion_agent.skills.memo.tools.get_pool")
    async def test_no_title_uses_content(self, mock_get_pool, mock_repo):
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_repo.get_by_key_prefix = AsyncMock(return_value=[])
        mock_repo.upsert = AsyncMock()

        set_current_user("user1")
        result = await save_memo.ainvoke({"content": "간단한 메모"})
        assert "간단한 메모" in result


# =========================================================================
# list_memos tool
# =========================================================================
class TestListMemos:
    @pytest.mark.asyncio
    async def test_no_user(self):
        set_current_user("")
        result = await list_memos.ainvoke({})
        assert "사용자 정보" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.memo.tools.knowledge_repo")
    @patch("starnion_agent.skills.memo.tools.get_pool")
    async def test_no_memos(self, mock_get_pool, mock_repo):
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_repo.get_by_key_prefix = AsyncMock(return_value=[])
        set_current_user("user1")
        result = await list_memos.ainvoke({})
        assert "없어요" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.memo.tools.knowledge_repo")
    @patch("starnion_agent.skills.memo.tools.get_pool")
    async def test_list_all(self, mock_get_pool, mock_repo):
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_repo.get_by_key_prefix = AsyncMock(
            return_value=[
                {
                    "key": "memo:abc1",
                    "value": json.dumps({
                        "title": "장보기", "content": "우유 사기",
                        "tag": "개인", "created_at": "2026-03-01T10:00:00",
                    }),
                },
                {
                    "key": "memo:abc2",
                    "value": json.dumps({
                        "title": "회의록", "content": "월요일 회의",
                        "tag": "업무", "created_at": "2026-03-02T10:00:00",
                    }),
                },
            ]
        )
        set_current_user("user1")
        result = await list_memos.ainvoke({})
        assert "장보기" in result
        assert "회의록" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.memo.tools.knowledge_repo")
    @patch("starnion_agent.skills.memo.tools.get_pool")
    async def test_filter_by_tag(self, mock_get_pool, mock_repo):
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_repo.get_by_key_prefix = AsyncMock(
            return_value=[
                {
                    "key": "memo:abc1",
                    "value": json.dumps({
                        "title": "개인메모", "content": "c",
                        "tag": "개인", "created_at": "2026-03-01T10:00:00",
                    }),
                },
                {
                    "key": "memo:abc2",
                    "value": json.dumps({
                        "title": "업무메모", "content": "c",
                        "tag": "업무", "created_at": "2026-03-01T10:00:00",
                    }),
                },
            ]
        )
        set_current_user("user1")
        result = await list_memos.ainvoke({"tag": "업무"})
        assert "업무메모" in result
        assert "개인메모" not in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.memo.tools.knowledge_repo")
    @patch("starnion_agent.skills.memo.tools.get_pool")
    async def test_tag_not_found(self, mock_get_pool, mock_repo):
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_repo.get_by_key_prefix = AsyncMock(
            return_value=[
                {
                    "key": "memo:abc1",
                    "value": json.dumps({
                        "title": "test", "content": "c",
                        "tag": "개인", "created_at": "2026-03-01T10:00:00",
                    }),
                },
            ]
        )
        set_current_user("user1")
        result = await list_memos.ainvoke({"tag": "없는태그"})
        assert "없어요" in result


# =========================================================================
# delete_memo tool
# =========================================================================
class TestDeleteMemo:
    @pytest.mark.asyncio
    async def test_no_user(self):
        set_current_user("")
        result = await delete_memo.ainvoke({"memo_id": "abc"})
        assert "사용자 정보" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.memo.tools.knowledge_repo")
    @patch("starnion_agent.skills.memo.tools.get_pool")
    async def test_not_found(self, mock_get_pool, mock_repo):
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_repo.get_by_key = AsyncMock(return_value=None)
        set_current_user("user1")
        result = await delete_memo.ainvoke({"memo_id": "notexist"})
        assert "찾을 수 없" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.memo.tools.knowledge_repo")
    @patch("starnion_agent.skills.memo.tools.get_pool")
    async def test_successful_deletion(self, mock_get_pool, mock_repo):
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_repo.get_by_key = AsyncMock(
            return_value={
                "key": "memo:abc",
                "value": json.dumps({
                    "title": "장보기", "content": "우유 사기",
                    "tag": "개인",
                }),
            }
        )
        mock_repo.delete_by_key = AsyncMock()

        set_current_user("user1")
        result = await delete_memo.ainvoke({"memo_id": "abc"})
        assert "삭제했어요" in result
        assert "장보기" in result
        mock_repo.delete_by_key.assert_awaited_once()
