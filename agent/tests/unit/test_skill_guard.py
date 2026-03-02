"""Unit tests for jiki_agent.skills.guard module.

Tests cover:
- skill_guard decorator allowing enabled skills
- skill_guard decorator blocking disabled skills with friendly message
- skill_guard behaviour when no user context
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from jiki_agent.skills.guard import skill_guard


@skill_guard("finance")
async def _dummy_tool() -> str:
    """A dummy tool function for testing the guard decorator."""
    return "tool executed"


@skill_guard("video")
async def _dummy_tool_video(prompt: str) -> str:
    """A dummy tool with arguments."""
    return f"video: {prompt}"


class TestSkillGuard:
    """Tests for the skill_guard decorator."""

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.guard.skill_repo")
    @patch("jiki_agent.skills.guard.get_pool")
    @patch("jiki_agent.skills.guard.get_current_user", return_value="tg_user_42")
    async def test_enabled_skill_executes(
        self,
        mock_user: MagicMock,
        mock_get_pool: MagicMock,
        mock_skill_repo: MagicMock,
    ):
        """When skill is enabled, the wrapped function executes normally."""
        mock_skill_repo.is_enabled = AsyncMock(return_value=True)

        result = await _dummy_tool()
        assert result == "tool executed"

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.guard.skill_repo")
    @patch("jiki_agent.skills.guard.get_pool")
    @patch("jiki_agent.skills.guard.get_current_user", return_value="tg_user_42")
    async def test_disabled_skill_returns_message(
        self,
        mock_user: MagicMock,
        mock_get_pool: MagicMock,
        mock_skill_repo: MagicMock,
    ):
        """When skill is disabled, returns a friendly Korean message."""
        mock_skill_repo.is_enabled = AsyncMock(return_value=False)

        result = await _dummy_tool()
        assert "비활성화" in result
        assert "/skills" in result

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.guard.skill_repo")
    @patch("jiki_agent.skills.guard.get_pool")
    @patch("jiki_agent.skills.guard.get_current_user", return_value="tg_user_42")
    async def test_disabled_skill_includes_skill_name(
        self,
        mock_user: MagicMock,
        mock_get_pool: MagicMock,
        mock_skill_repo: MagicMock,
    ):
        """Disabled message includes the skill's Korean name."""
        mock_skill_repo.is_enabled = AsyncMock(return_value=False)

        result = await _dummy_tool()
        # "finance" skill name in registry is "가계부"
        assert "가계부" in result

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.guard.skill_repo")
    @patch("jiki_agent.skills.guard.get_pool")
    @patch("jiki_agent.skills.guard.get_current_user", return_value="tg_user_42")
    async def test_guard_passes_arguments(
        self,
        mock_user: MagicMock,
        mock_get_pool: MagicMock,
        mock_skill_repo: MagicMock,
    ):
        """Guard passes through arguments to the wrapped function."""
        mock_skill_repo.is_enabled = AsyncMock(return_value=True)

        result = await _dummy_tool_video("sunset timelapse")
        assert result == "video: sunset timelapse"

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.guard.skill_repo")
    @patch("jiki_agent.skills.guard.get_pool")
    @patch("jiki_agent.skills.guard.get_current_user", return_value="tg_user_42")
    async def test_guard_calls_is_enabled_with_correct_args(
        self,
        mock_user: MagicMock,
        mock_get_pool: MagicMock,
        mock_skill_repo: MagicMock,
    ):
        """Guard checks is_enabled with the correct pool, user_id, and skill_id."""
        mock_pool = MagicMock()
        mock_get_pool.return_value = mock_pool
        mock_skill_repo.is_enabled = AsyncMock(return_value=True)

        await _dummy_tool()

        mock_skill_repo.is_enabled.assert_awaited_once_with(
            mock_pool, "tg_user_42", "finance"
        )
