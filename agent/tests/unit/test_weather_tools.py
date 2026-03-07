"""Unit tests for starnion_agent.skills.weather.tools module.

Tests cover:
- ``WeatherInput`` / ``ForecastInput``: Pydantic input schemas
- ``_wmo_text`` / ``_wmo_emoji``: WMO code helpers
- ``_geocode``: Geocoding API helper
- ``get_weather`` tool: Current weather retrieval
- ``get_forecast`` tool: Daily forecast retrieval
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from starnion_agent.skills.weather.tools import (
    ForecastInput,
    WeatherInput,
    _geocode,
    _wmo_emoji,
    _wmo_text,
    get_forecast,
    get_weather,
)


# =========================================================================
# Pydantic input schemas
# =========================================================================
class TestWeatherInput:
    def test_default_location(self):
        model = WeatherInput()
        assert model.location == "서울"

    def test_custom_location(self):
        model = WeatherInput(location="Tokyo")
        assert model.location == "Tokyo"


class TestForecastInput:
    def test_defaults(self):
        model = ForecastInput()
        assert model.location == "서울"
        assert model.days == 3

    def test_custom_values(self):
        model = ForecastInput(location="London", days=7)
        assert model.location == "London"
        assert model.days == 7


# =========================================================================
# WMO code helpers
# =========================================================================
class TestWmoHelpers:
    def test_wmo_text_clear(self):
        assert _wmo_text(0) == "맑음"

    def test_wmo_text_rain(self):
        assert _wmo_text(61) == "비"

    def test_wmo_text_snow(self):
        assert _wmo_text(71) == "눈"

    def test_wmo_text_unknown(self):
        assert _wmo_text(999) == "알 수 없음"

    def test_wmo_emoji_clear(self):
        assert _wmo_emoji(0) == "☀️"

    def test_wmo_emoji_cloudy(self):
        assert _wmo_emoji(3) == "☁️"

    def test_wmo_emoji_unknown(self):
        assert _wmo_emoji(999) == "🌈"

    def test_wmo_thunderstorm(self):
        assert _wmo_text(95) == "뇌우"
        assert _wmo_emoji(95) == "⛈️"


# =========================================================================
# _geocode helper
# =========================================================================
def _patch_httpx(mock_response=None, side_effect=None):
    """Patch httpx.AsyncClient to return a mock response or raise an error."""
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)
    if side_effect:
        mock_ctx.get = AsyncMock(side_effect=side_effect)
    else:
        mock_ctx.get = AsyncMock(return_value=mock_response)
    return patch(
        "starnion_agent.skills.weather.tools.httpx.AsyncClient",
        return_value=mock_ctx,
    )


def _make_geocode_response(
    name: str = "서울",
    country: str = "대한민국",
    lat: float = 37.57,
    lon: float = 126.98,
):
    """Create a mock geocode API response."""
    resp = MagicMock()
    resp.json.return_value = {
        "results": [
            {"name": name, "country": country, "latitude": lat, "longitude": lon},
        ],
    }
    resp.raise_for_status = MagicMock()
    return resp


def _make_empty_geocode_response():
    """Create a mock geocode API response with no results."""
    resp = MagicMock()
    resp.json.return_value = {}
    resp.raise_for_status = MagicMock()
    return resp


class TestGeocode:
    @pytest.mark.asyncio
    async def test_successful_geocode(self):
        resp = _make_geocode_response()
        with _patch_httpx(mock_response=resp):
            result = await _geocode("서울")
        assert result is not None
        lat, lon, display = result
        assert lat == 37.57
        assert lon == 126.98
        assert "서울" in display

    @pytest.mark.asyncio
    async def test_location_not_found(self):
        resp = _make_empty_geocode_response()
        with _patch_httpx(mock_response=resp):
            result = await _geocode("없는도시xyz")
        assert result is None

    @pytest.mark.asyncio
    async def test_geocode_api_error(self):
        with _patch_httpx(side_effect=Exception("API error")):
            with pytest.raises(Exception):
                await _geocode("서울")


# =========================================================================
# get_weather tool
# =========================================================================
def _make_weather_response(
    temp: float = 22.5,
    feels: float = 21.0,
    humidity: int = 55,
    wind: float = 12.3,
    code: int = 0,
):
    """Create a mock current weather API response."""
    resp = MagicMock()
    resp.json.return_value = {
        "current": {
            "temperature_2m": temp,
            "apparent_temperature": feels,
            "relative_humidity_2m": humidity,
            "wind_speed_10m": wind,
            "weather_code": code,
        },
    }
    resp.raise_for_status = MagicMock()
    return resp


class TestGetWeather:
    @pytest.mark.asyncio
    async def test_successful_weather(self):
        geocode_resp = _make_geocode_response()
        weather_resp = _make_weather_response()

        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_ctx.get = AsyncMock(side_effect=[geocode_resp, weather_resp])

        with patch(
            "starnion_agent.skills.weather.tools.httpx.AsyncClient",
            return_value=mock_ctx,
        ):
            result = await get_weather.ainvoke({"location": "서울"})

        assert "서울" in result
        assert "22.5°C" in result
        assert "습도" in result
        assert "풍속" in result

    @pytest.mark.asyncio
    async def test_location_not_found(self):
        resp = _make_empty_geocode_response()
        with _patch_httpx(mock_response=resp):
            result = await get_weather.ainvoke({"location": "없는도시"})
        assert "찾을 수 없어요" in result

    @pytest.mark.asyncio
    async def test_api_error(self):
        with _patch_httpx(side_effect=Exception("Network error")):
            result = await get_weather.ainvoke({"location": "서울"})
        assert "오류가 발생했어요" in result

    @pytest.mark.asyncio
    async def test_rainy_weather(self):
        geocode_resp = _make_geocode_response()
        weather_resp = _make_weather_response(code=61)

        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_ctx.get = AsyncMock(side_effect=[geocode_resp, weather_resp])

        with patch(
            "starnion_agent.skills.weather.tools.httpx.AsyncClient",
            return_value=mock_ctx,
        ):
            result = await get_weather.ainvoke({"location": "서울"})

        assert "비" in result
        assert "🌧️" in result


# =========================================================================
# get_forecast tool
# =========================================================================
def _make_forecast_response(days: int = 3):
    """Create a mock daily forecast API response."""
    resp = MagicMock()
    daily = {
        "time": [f"2026-03-{2 + i:02d}" for i in range(days)],
        "weather_code": [0, 61, 3][:days],
        "temperature_2m_max": [15.0, 12.0, 10.0][:days],
        "temperature_2m_min": [5.0, 3.0, 1.0][:days],
        "precipitation_probability_max": [0, 80, 30][:days],
    }
    resp.json.return_value = {"daily": daily}
    resp.raise_for_status = MagicMock()
    return resp


class TestGetForecast:
    @pytest.mark.asyncio
    async def test_successful_forecast(self):
        geocode_resp = _make_geocode_response()
        forecast_resp = _make_forecast_response(days=3)

        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_ctx.get = AsyncMock(side_effect=[geocode_resp, forecast_resp])

        with patch(
            "starnion_agent.skills.weather.tools.httpx.AsyncClient",
            return_value=mock_ctx,
        ):
            result = await get_forecast.ainvoke({"location": "서울", "days": 3})

        assert "서울" in result
        assert "3일 예보" in result
        assert "2026-03-02" in result
        assert "강수확률" in result

    @pytest.mark.asyncio
    async def test_location_not_found(self):
        resp = _make_empty_geocode_response()
        with _patch_httpx(mock_response=resp):
            result = await get_forecast.ainvoke({"location": "없는도시"})
        assert "찾을 수 없어요" in result

    @pytest.mark.asyncio
    async def test_api_error(self):
        with _patch_httpx(side_effect=Exception("timeout")):
            result = await get_forecast.ainvoke({"location": "서울"})
        assert "오류가 발생했어요" in result

    @pytest.mark.asyncio
    async def test_days_clamped_to_range(self):
        """days should be clamped to 1-7 range."""
        geocode_resp = _make_geocode_response()
        forecast_resp = _make_forecast_response(days=3)

        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_ctx.get = AsyncMock(side_effect=[geocode_resp, forecast_resp])

        with patch(
            "starnion_agent.skills.weather.tools.httpx.AsyncClient",
            return_value=mock_ctx,
        ):
            # days=20 should be clamped to 7
            result = await get_forecast.ainvoke({"location": "서울", "days": 20})

        # Should not error out — just clamp
        assert "예보" in result

    @pytest.mark.asyncio
    async def test_single_day_forecast(self):
        geocode_resp = _make_geocode_response()
        forecast_resp = _make_forecast_response(days=1)

        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_ctx.get = AsyncMock(side_effect=[geocode_resp, forecast_resp])

        with patch(
            "starnion_agent.skills.weather.tools.httpx.AsyncClient",
            return_value=mock_ctx,
        ):
            result = await get_forecast.ainvoke({"location": "서울", "days": 1})

        assert "1일 예보" in result
