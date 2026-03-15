"""Unit tests for starnion_agent.skills.weather.tools module.

Tests cover:
- ``WeatherInput`` / ``ForecastInput``: Pydantic input schemas
- ``_code_text`` / ``_code_emoji``: wttr.in weather code helpers
- ``_display_name``: location name extraction helper
- ``get_weather`` tool: Current weather retrieval (wttr.in)
- ``get_forecast`` tool: Daily forecast retrieval (wttr.in, max 3 days)
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from starnion_agent.skills.weather.tools import (
    ForecastInput,
    WeatherInput,
    _code_emoji,
    _code_text,
    _display_name,
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
        model = ForecastInput(location="London", days=2)
        assert model.location == "London"
        assert model.days == 2


# =========================================================================
# wttr.in weather code helpers
# =========================================================================
class TestCodeHelpers:
    def test_code_text_clear(self):
        assert _code_text(113) == "맑음"

    def test_code_text_partly_cloudy(self):
        assert _code_text(116) == "부분 흐림"

    def test_code_text_heavy_rain(self):
        assert _code_text(308) == "폭우"

    def test_code_text_unknown(self):
        assert _code_text(9999) == "알 수 없음"

    def test_code_emoji_clear(self):
        assert _code_emoji(113) == "☀️"

    def test_code_emoji_cloudy(self):
        assert _code_emoji(119) == "☁️"

    def test_code_emoji_unknown(self):
        assert _code_emoji(9999) == "🌈"

    def test_code_thunderstorm(self):
        assert _code_text(386) == "뇌우"
        assert _code_emoji(386) == "⛈️"

    def test_code_snow(self):
        assert _code_text(338) == "폭설"
        assert _code_emoji(338) == "❄️"


# =========================================================================
# _display_name helper
# =========================================================================
class TestDisplayName:
    def test_city_and_country(self):
        data = {
            "nearest_area": [
                {
                    "areaName": [{"value": "Seoul"}],
                    "country": [{"value": "South Korea"}],
                }
            ]
        }
        assert _display_name(data) == "Seoul, South Korea"

    def test_city_only(self):
        data = {
            "nearest_area": [
                {
                    "areaName": [{"value": "Seoul"}],
                    "country": [{"value": ""}],
                }
            ]
        }
        assert _display_name(data) == "Seoul"

    def test_missing_data(self):
        assert _display_name({}) == "알 수 없는 위치"


# =========================================================================
# Shared helpers
# =========================================================================
def _make_wttr_response(
    city: str = "Seoul",
    country: str = "South Korea",
    temp_c: str = "22",
    feels_like_c: str = "21",
    humidity: str = "55",
    wind_kmph: str = "12",
    weather_code: str = "113",
    forecast_days: int = 3,
):
    """Build a mock wttr.in ?format=j1 response."""
    resp = MagicMock()

    hourly_template = [
        {"weatherCode": "113", "precipProbability": "0"},   # 0:00
        {"weatherCode": "113", "precipProbability": "0"},   # 3:00
        {"weatherCode": "116", "precipProbability": "5"},   # 6:00
        {"weatherCode": "116", "precipProbability": "5"},   # 9:00
        {"weatherCode": weather_code, "precipProbability": "20"},  # 12:00 (index 4)
        {"weatherCode": "293", "precipProbability": "60"},  # 15:00
        {"weatherCode": "293", "precipProbability": "60"},  # 18:00
        {"weatherCode": "296", "precipProbability": "50"},  # 21:00
    ]

    weather_days = [
        {
            "date": f"2026-03-{15 + i:02d}",
            "maxtempC": str(15 - i),
            "mintempC": str(5 - i),
            "hourly": hourly_template,
        }
        for i in range(forecast_days)
    ]

    resp.json.return_value = {
        "current_condition": [
            {
                "weatherCode": weather_code,
                "temp_C": temp_c,
                "FeelsLikeC": feels_like_c,
                "humidity": humidity,
                "windspeedKmph": wind_kmph,
            }
        ],
        "nearest_area": [
            {
                "areaName": [{"value": city}],
                "country": [{"value": country}],
            }
        ],
        "weather": weather_days,
    }
    resp.raise_for_status = MagicMock()
    return resp


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


# =========================================================================
# get_weather tool
# =========================================================================
class TestGetWeather:
    @pytest.mark.asyncio
    async def test_successful_weather(self):
        resp = _make_wttr_response(city="Seoul", temp_c="22", humidity="55", wind_kmph="12")
        with _patch_httpx(mock_response=resp):
            result = await get_weather.ainvoke({"location": "Seoul"})

        assert "Seoul" in result
        assert "22°C" in result
        assert "습도" in result
        assert "풍속" in result

    @pytest.mark.asyncio
    async def test_displays_city_country(self):
        resp = _make_wttr_response(city="Tokyo", country="Japan")
        with _patch_httpx(mock_response=resp):
            result = await get_weather.ainvoke({"location": "Tokyo"})

        assert "Tokyo" in result
        assert "Japan" in result

    @pytest.mark.asyncio
    async def test_api_error_returns_friendly_message(self):
        with _patch_httpx(side_effect=Exception("Network error")):
            result = await get_weather.ainvoke({"location": "서울"})
        assert "오류가 발생했어요" in result

    @pytest.mark.asyncio
    async def test_clear_weather_emoji(self):
        resp = _make_wttr_response(weather_code="113")
        with _patch_httpx(mock_response=resp):
            result = await get_weather.ainvoke({"location": "서울"})

        assert "☀️" in result
        assert "맑음" in result

    @pytest.mark.asyncio
    async def test_rainy_weather(self):
        resp = _make_wttr_response(weather_code="293")
        with _patch_httpx(mock_response=resp):
            result = await get_weather.ainvoke({"location": "서울"})

        assert "🌧️" in result
        assert "약한 비" in result

    @pytest.mark.asyncio
    async def test_feels_like_included(self):
        resp = _make_wttr_response(temp_c="20", feels_like_c="17")
        with _patch_httpx(mock_response=resp):
            result = await get_weather.ainvoke({"location": "서울"})

        assert "20°C" in result
        assert "17°C" in result
        assert "체감" in result


# =========================================================================
# get_forecast tool
# =========================================================================
class TestGetForecast:
    @pytest.mark.asyncio
    async def test_successful_3day_forecast(self):
        resp = _make_wttr_response(city="Seoul", forecast_days=3)
        with _patch_httpx(mock_response=resp):
            result = await get_forecast.ainvoke({"location": "Seoul", "days": 3})

        assert "Seoul" in result
        assert "3일 예보" in result
        assert "2026-03-15" in result
        assert "강수확률" in result

    @pytest.mark.asyncio
    async def test_single_day_forecast(self):
        resp = _make_wttr_response(forecast_days=1)
        with _patch_httpx(mock_response=resp):
            result = await get_forecast.ainvoke({"location": "서울", "days": 1})

        assert "1일 예보" in result
        assert "2026-03-15" in result

    @pytest.mark.asyncio
    async def test_api_error_returns_friendly_message(self):
        with _patch_httpx(side_effect=Exception("timeout")):
            result = await get_forecast.ainvoke({"location": "서울"})
        assert "오류가 발생했어요" in result

    @pytest.mark.asyncio
    async def test_days_clamped_above_3(self):
        """days > 3 should be clamped to 3 (wttr.in max)."""
        resp = _make_wttr_response(forecast_days=3)
        with _patch_httpx(mock_response=resp):
            result = await get_forecast.ainvoke({"location": "서울", "days": 10})

        assert "3일 예보" in result

    @pytest.mark.asyncio
    async def test_days_clamped_below_1(self):
        """days < 1 should be clamped to 1."""
        resp = _make_wttr_response(forecast_days=1)
        with _patch_httpx(mock_response=resp):
            result = await get_forecast.ainvoke({"location": "서울", "days": 0})

        assert "1일 예보" in result

    @pytest.mark.asyncio
    async def test_forecast_shows_temp_range(self):
        resp = _make_wttr_response(forecast_days=1)
        with _patch_httpx(mock_response=resp):
            result = await get_forecast.ainvoke({"location": "서울", "days": 1})

        # maxtempC=15, mintempC=5
        assert "15" in result
        assert "5" in result

    @pytest.mark.asyncio
    async def test_forecast_precipitation_probability(self):
        resp = _make_wttr_response(forecast_days=1)
        with _patch_httpx(mock_response=resp):
            result = await get_forecast.ainvoke({"location": "서울", "days": 1})

        assert "강수확률" in result
        # max precipProbability in hourly is 60
        assert "60%" in result
