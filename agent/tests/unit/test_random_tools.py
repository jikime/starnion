"""Unit tests for jiki_agent.skills.random.tools module.

Tests cover:
- ``RandomPickInput``: Pydantic schema
- ``random_pick`` tool: All modes (choice, number, shuffle, coin, dice, string)
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from jiki_agent.skills.random.tools import RandomPickInput, random_pick


# =========================================================================
# Pydantic input schema
# =========================================================================
class TestRandomPickInput:
    def test_defaults(self):
        model = RandomPickInput()
        assert model.mode == "choice"
        assert model.items == ""
        assert model.min_val == 1
        assert model.max_val == 100
        assert model.count == 1
        assert model.length == 16
        assert model.charset == "alphanumeric"

    def test_custom(self):
        model = RandomPickInput(mode="dice", count=3)
        assert model.mode == "dice"
        assert model.count == 3


# =========================================================================
# random_pick: invalid mode
# =========================================================================
class TestRandomPickInvalidMode:
    @pytest.mark.asyncio
    async def test_invalid_mode(self):
        result = await random_pick.ainvoke({"mode": "invalid"})
        assert "지원하지 않는 모드" in result


# =========================================================================
# random_pick: coin mode
# =========================================================================
class TestRandomPickCoin:
    @pytest.mark.asyncio
    async def test_single_coin(self):
        result = await random_pick.ainvoke({"mode": "coin"})
        assert "동전" in result
        assert ("앞면" in result or "뒷면" in result)

    @pytest.mark.asyncio
    async def test_multiple_coins(self):
        result = await random_pick.ainvoke({"mode": "coin", "count": 3})
        assert "동전" in result
        assert "1회" in result


# =========================================================================
# random_pick: dice mode
# =========================================================================
class TestRandomPickDice:
    @pytest.mark.asyncio
    async def test_single_dice(self):
        result = await random_pick.ainvoke({"mode": "dice"})
        assert "주사위" in result

    @pytest.mark.asyncio
    async def test_multiple_dice(self):
        result = await random_pick.ainvoke({"mode": "dice", "count": 3})
        assert "주사위" in result
        assert "합계" in result


# =========================================================================
# random_pick: number mode
# =========================================================================
class TestRandomPickNumber:
    @pytest.mark.asyncio
    async def test_single_number(self):
        result = await random_pick.ainvoke(
            {"mode": "number", "min_val": 1, "max_val": 10}
        )
        assert "랜덤 숫자" in result

    @pytest.mark.asyncio
    async def test_multiple_numbers(self):
        result = await random_pick.ainvoke(
            {"mode": "number", "min_val": 1, "max_val": 45, "count": 6}
        )
        assert "랜덤 숫자 6개" in result

    @pytest.mark.asyncio
    async def test_min_greater_than_max(self):
        result = await random_pick.ainvoke(
            {"mode": "number", "min_val": 100, "max_val": 1}
        )
        assert "클 수 없" in result

    @pytest.mark.asyncio
    async def test_range_too_large(self):
        result = await random_pick.ainvoke(
            {"mode": "number", "min_val": 1, "max_val": 2_000_000_000}
        )
        assert "너무 커" in result


# =========================================================================
# random_pick: choice mode
# =========================================================================
class TestRandomPickChoice:
    @pytest.mark.asyncio
    async def test_no_items(self):
        result = await random_pick.ainvoke({"mode": "choice", "items": ""})
        assert "항목을 입력" in result

    @pytest.mark.asyncio
    async def test_single_choice(self):
        result = await random_pick.ainvoke(
            {"mode": "choice", "items": "짜장면,짬뽕,볶음밥"}
        )
        assert "선택 결과" in result

    @pytest.mark.asyncio
    async def test_multiple_choice(self):
        result = await random_pick.ainvoke(
            {"mode": "choice", "items": "A,B,C,D,E", "count": 3}
        )
        assert "선택 결과" in result

    @pytest.mark.asyncio
    async def test_too_many_items(self):
        items = ",".join(f"item{i}" for i in range(101))
        result = await random_pick.ainvoke({"mode": "choice", "items": items})
        assert "너무 많" in result


# =========================================================================
# random_pick: shuffle mode
# =========================================================================
class TestRandomPickShuffle:
    @pytest.mark.asyncio
    async def test_no_items(self):
        result = await random_pick.ainvoke({"mode": "shuffle", "items": ""})
        assert "항목을 입력" in result

    @pytest.mark.asyncio
    async def test_shuffle(self):
        result = await random_pick.ainvoke(
            {"mode": "shuffle", "items": "A,B,C,D"}
        )
        assert "순서 섞기" in result
        assert "A" in result
        assert "B" in result


# =========================================================================
# random_pick: string mode
# =========================================================================
class TestRandomPickString:
    @pytest.mark.asyncio
    async def test_default_string(self):
        result = await random_pick.ainvoke({"mode": "string"})
        assert "랜덤 문자열" in result
        assert "alphanumeric" in result
        assert "16자" in result

    @pytest.mark.asyncio
    async def test_custom_length(self):
        result = await random_pick.ainvoke({"mode": "string", "length": 8})
        assert "8자" in result

    @pytest.mark.asyncio
    async def test_password_charset(self):
        result = await random_pick.ainvoke(
            {"mode": "string", "charset": "password", "length": 20}
        )
        assert "password" in result
        assert "20자" in result

    @pytest.mark.asyncio
    async def test_hex_charset(self):
        result = await random_pick.ainvoke(
            {"mode": "string", "charset": "hex", "length": 32}
        )
        assert "hex" in result
        assert "32자" in result

    @pytest.mark.asyncio
    async def test_numeric_charset(self):
        result = await random_pick.ainvoke(
            {"mode": "string", "charset": "numeric", "length": 6}
        )
        assert "numeric" in result
        # Extract the generated string between backticks.
        import re
        match = re.search(r"`([^`]+)`", result)
        assert match
        assert match.group(1).isdigit()

    @pytest.mark.asyncio
    async def test_alpha_charset(self):
        result = await random_pick.ainvoke(
            {"mode": "string", "charset": "alpha", "length": 10}
        )
        assert "alpha" in result
        import re
        match = re.search(r"`([^`]+)`", result)
        assert match
        assert match.group(1).isalpha()

    @pytest.mark.asyncio
    async def test_invalid_charset(self):
        result = await random_pick.ainvoke(
            {"mode": "string", "charset": "unknown"}
        )
        assert "지원하지 않는 문자셋" in result

    @pytest.mark.asyncio
    async def test_multiple_strings(self):
        result = await random_pick.ainvoke(
            {"mode": "string", "length": 8, "count": 3}
        )
        assert "3개" in result
        assert "1." in result
        assert "2." in result
        assert "3." in result

    @pytest.mark.asyncio
    async def test_length_clamped(self):
        """Length exceeding MAX_STRING_LENGTH is clamped to 200."""
        result = await random_pick.ainvoke(
            {"mode": "string", "length": 999}
        )
        assert "200자" in result
