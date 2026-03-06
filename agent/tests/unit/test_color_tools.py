"""Unit tests for starpion_agent.skills.color.tools module.

Tests cover:
- ``ConvertColorInput``: Pydantic schema
- ``convert_color`` tool: HEX, RGB, HSL, named colors
"""

from __future__ import annotations

import pytest

from starpion_agent.skills.color.tools import ConvertColorInput, convert_color


# =========================================================================
# Pydantic input schema
# =========================================================================
class TestConvertColorInput:
    def test_required_color(self):
        model = ConvertColorInput(color="#FF0000")
        assert model.color == "#FF0000"


# =========================================================================
# convert_color: HEX input
# =========================================================================
class TestConvertColorHex:
    @pytest.mark.asyncio
    async def test_hex_6digit(self):
        result = await convert_color.ainvoke({"color": "#FF5733"})
        assert "#FF5733" in result
        assert "rgb(255, 87, 51)" in result
        assert "hsl(" in result

    @pytest.mark.asyncio
    async def test_hex_3digit(self):
        result = await convert_color.ainvoke({"color": "#F00"})
        assert "#FF0000" in result
        assert "rgb(255, 0, 0)" in result

    @pytest.mark.asyncio
    async def test_hex_without_hash(self):
        result = await convert_color.ainvoke({"color": "00FF00"})
        assert "#00FF00" in result
        assert "rgb(0, 255, 0)" in result


# =========================================================================
# convert_color: RGB input
# =========================================================================
class TestConvertColorRgb:
    @pytest.mark.asyncio
    async def test_rgb_function(self):
        result = await convert_color.ainvoke({"color": "rgb(255, 0, 0)"})
        assert "#FF0000" in result

    @pytest.mark.asyncio
    async def test_rgb_comma_separated(self):
        result = await convert_color.ainvoke({"color": "0,0,255"})
        assert "#0000FF" in result


# =========================================================================
# convert_color: named colors
# =========================================================================
class TestConvertColorNamed:
    @pytest.mark.asyncio
    async def test_english_name(self):
        result = await convert_color.ainvoke({"color": "red"})
        assert "#FF0000" in result

    @pytest.mark.asyncio
    async def test_korean_name(self):
        result = await convert_color.ainvoke({"color": "빨강"})
        assert "#FF0000" in result

    @pytest.mark.asyncio
    async def test_case_insensitive(self):
        result = await convert_color.ainvoke({"color": "BLUE"})
        assert "#0000FF" in result

    @pytest.mark.asyncio
    async def test_korean_sky_blue(self):
        result = await convert_color.ainvoke({"color": "하늘색"})
        assert "#87CEEB" in result


# =========================================================================
# convert_color: HSL output
# =========================================================================
class TestConvertColorHsl:
    @pytest.mark.asyncio
    async def test_pure_red_hsl(self):
        result = await convert_color.ainvoke({"color": "#FF0000"})
        assert "hsl(0°" in result

    @pytest.mark.asyncio
    async def test_white_hsl(self):
        result = await convert_color.ainvoke({"color": "white"})
        assert "100%" in result


# =========================================================================
# convert_color: validation
# =========================================================================
class TestConvertColorValidation:
    @pytest.mark.asyncio
    async def test_empty_input(self):
        result = await convert_color.ainvoke({"color": ""})
        assert "입력" in result

    @pytest.mark.asyncio
    async def test_invalid_color(self):
        result = await convert_color.ainvoke({"color": "not-a-color"})
        assert "인식할 수 없" in result

    @pytest.mark.asyncio
    async def test_emoji_in_output(self):
        result = await convert_color.ainvoke({"color": "#FF0000"})
        assert "🎨" in result

    @pytest.mark.asyncio
    async def test_color_emoji_red(self):
        result = await convert_color.ainvoke({"color": "red"})
        assert "🔴" in result

    @pytest.mark.asyncio
    async def test_color_emoji_black(self):
        result = await convert_color.ainvoke({"color": "black"})
        assert "⚫" in result

    @pytest.mark.asyncio
    async def test_color_emoji_white(self):
        result = await convert_color.ainvoke({"color": "white"})
        assert "⚪" in result
