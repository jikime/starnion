"""Unit tests for starnion_agent.skills.horoscope.tools module.

Tests cover:
- ``GetHoroscopeInput``: Pydantic schema
- ``get_horoscope`` tool: zodiac sign lookup, API call (mocked)
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from starnion_agent.skills.horoscope.tools import GetHoroscopeInput, get_horoscope


# =========================================================================
# Pydantic input schema
# =========================================================================
class TestGetHoroscopeInput:
    def test_required_sign(self):
        model = GetHoroscopeInput(sign="양자리")
        assert model.sign == "양자리"


# =========================================================================
# get_horoscope: validation
# =========================================================================
class TestGetHoroscopeValidation:
    @pytest.mark.asyncio
    async def test_empty_sign(self):
        result = await get_horoscope.ainvoke({"sign": ""})
        assert "입력" in result

    @pytest.mark.asyncio
    async def test_invalid_sign(self):
        result = await get_horoscope.ainvoke({"sign": "없는별자리"})
        assert "알 수 없는 별자리" in result
        # Should show available signs.
        assert "양자리" in result
        assert "♈" in result


# =========================================================================
# get_horoscope: API success (mocked)
# =========================================================================
class TestGetHoroscopeSuccess:
    @pytest.mark.asyncio
    async def test_korean_sign(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"horoscope": "Today is a great day!"}
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("starnion_agent.skills.horoscope.tools.httpx.AsyncClient", return_value=mock_client):
            result = await get_horoscope.ainvoke({"sign": "사자자리"})

        assert "사자자리" in result
        assert "♌" in result
        assert "Today is a great day!" in result

    @pytest.mark.asyncio
    async def test_english_sign(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"horoscope": "Good things ahead."}
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("starnion_agent.skills.horoscope.tools.httpx.AsyncClient", return_value=mock_client):
            result = await get_horoscope.ainvoke({"sign": "aries"})

        assert "양자리" in result
        assert "♈" in result


# =========================================================================
# get_horoscope: API errors (mocked)
# =========================================================================
class TestGetHoroscopeErrors:
    @pytest.mark.asyncio
    async def test_timeout(self):
        import httpx as httpx_mod

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=httpx_mod.TimeoutException("timeout"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("starnion_agent.skills.horoscope.tools.httpx.AsyncClient", return_value=mock_client):
            result = await get_horoscope.ainvoke({"sign": "양자리"})

        assert "느려요" in result or "다시 시도" in result

    @pytest.mark.asyncio
    async def test_http_error(self):
        import httpx as httpx_mod

        mock_resp = MagicMock()
        mock_resp.raise_for_status.side_effect = httpx_mod.HTTPStatusError(
            "500", request=MagicMock(), response=MagicMock()
        )

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("starnion_agent.skills.horoscope.tools.httpx.AsyncClient", return_value=mock_client):
            result = await get_horoscope.ainvoke({"sign": "양자리"})

        assert "접속할 수 없" in result

    @pytest.mark.asyncio
    async def test_empty_horoscope(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"horoscope": ""}
        mock_resp.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("starnion_agent.skills.horoscope.tools.httpx.AsyncClient", return_value=mock_client):
            result = await get_horoscope.ainvoke({"sign": "양자리"})

        assert "가져올 수 없" in result
