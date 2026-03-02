"""Unit tests for jiki_agent.skills.timezone.tools module.

Tests cover:
- ``GetWorldTimeInput`` / ``ConvertTimezoneInput``: Pydantic schemas
- ``get_world_time`` tool: city lookup, IANA timezone, invalid city
- ``convert_timezone`` tool: time conversion, date change detection
"""

from __future__ import annotations

import pytest

from jiki_agent.skills.timezone.tools import (
    ConvertTimezoneInput,
    GetWorldTimeInput,
    convert_timezone,
    get_world_time,
)


# =========================================================================
# Pydantic input schemas
# =========================================================================
class TestGetWorldTimeInput:
    def test_required_city(self):
        model = GetWorldTimeInput(city="서울")
        assert model.city == "서울"


class TestConvertTimezoneInput:
    def test_defaults(self):
        model = ConvertTimezoneInput(time_str="14:30", to_tz="뉴욕")
        assert model.from_tz == "서울"
        assert model.to_tz == "뉴욕"


# =========================================================================
# get_world_time
# =========================================================================
class TestGetWorldTime:
    @pytest.mark.asyncio
    async def test_korean_city(self):
        result = await get_world_time.ainvoke({"city": "서울"})
        assert "서울" in result
        assert "Asia/Seoul" in result
        assert "🕐" in result

    @pytest.mark.asyncio
    async def test_english_city(self):
        result = await get_world_time.ainvoke({"city": "london"})
        assert "Europe/London" in result

    @pytest.mark.asyncio
    async def test_iana_timezone(self):
        result = await get_world_time.ainvoke({"city": "America/Chicago"})
        assert "America/Chicago" in result

    @pytest.mark.asyncio
    async def test_invalid_city(self):
        result = await get_world_time.ainvoke({"city": "없는도시"})
        assert "찾을 수 없" in result

    @pytest.mark.asyncio
    async def test_empty_city(self):
        result = await get_world_time.ainvoke({"city": ""})
        assert "입력" in result

    @pytest.mark.asyncio
    async def test_utc_offset_shown(self):
        result = await get_world_time.ainvoke({"city": "서울"})
        assert "UTC" in result


# =========================================================================
# convert_timezone
# =========================================================================
class TestConvertTimezone:
    @pytest.mark.asyncio
    async def test_basic_conversion(self):
        result = await convert_timezone.ainvoke(
            {"time_str": "14:30", "from_tz": "서울", "to_tz": "런던"}
        )
        assert "시간대 변환" in result
        assert "서울" in result
        assert "런던" in result

    @pytest.mark.asyncio
    async def test_full_datetime(self):
        result = await convert_timezone.ainvoke(
            {"time_str": "2024-06-15 09:00", "from_tz": "서울", "to_tz": "뉴욕"}
        )
        assert "시간대 변환" in result

    @pytest.mark.asyncio
    async def test_invalid_time_format(self):
        result = await convert_timezone.ainvoke(
            {"time_str": "not-a-time", "from_tz": "서울", "to_tz": "뉴욕"}
        )
        assert "인식할 수 없" in result

    @pytest.mark.asyncio
    async def test_invalid_from_tz(self):
        result = await convert_timezone.ainvoke(
            {"time_str": "14:30", "from_tz": "없는도시", "to_tz": "뉴욕"}
        )
        assert "찾을 수 없" in result

    @pytest.mark.asyncio
    async def test_invalid_to_tz(self):
        result = await convert_timezone.ainvoke(
            {"time_str": "14:30", "from_tz": "서울", "to_tz": "없는도시"}
        )
        assert "찾을 수 없" in result

    @pytest.mark.asyncio
    async def test_empty_time(self):
        result = await convert_timezone.ainvoke(
            {"time_str": "", "from_tz": "서울", "to_tz": "뉴욕"}
        )
        assert "입력" in result

    @pytest.mark.asyncio
    async def test_empty_to_tz(self):
        result = await convert_timezone.ainvoke(
            {"time_str": "14:30", "from_tz": "서울", "to_tz": ""}
        )
        assert "입력" in result

    @pytest.mark.asyncio
    async def test_iana_timezone_direct(self):
        result = await convert_timezone.ainvoke(
            {"time_str": "12:00", "from_tz": "Asia/Seoul", "to_tz": "Europe/London"}
        )
        assert "시간대 변환" in result
