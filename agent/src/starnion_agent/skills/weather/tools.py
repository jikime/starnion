"""Weather tools using Open-Meteo API (free, no API key required)."""

import logging

import httpx
from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starnion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

_GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

# WMO Weather Interpretation Code → (Korean text, emoji).
_WMO_CODES: dict[int, tuple[str, str]] = {
    0: ("맑음", "☀️"),
    1: ("대체로 맑음", "🌤️"),
    2: ("부분 흐림", "⛅"),
    3: ("흐림", "☁️"),
    45: ("안개", "🌫️"),
    48: ("안개", "🌫️"),
    51: ("이슬비", "🌦️"),
    53: ("이슬비", "🌦️"),
    55: ("이슬비", "🌦️"),
    61: ("비", "🌧️"),
    63: ("비", "🌧️"),
    65: ("폭우", "🌧️"),
    66: ("빙결비", "🌨️"),
    67: ("빙결비", "🌨️"),
    71: ("눈", "🌨️"),
    73: ("눈", "🌨️"),
    75: ("폭설", "❄️"),
    77: ("싸라기눈", "🌨️"),
    80: ("소나기", "🌦️"),
    81: ("소나기", "🌦️"),
    82: ("강한 소나기", "⛈️"),
    85: ("눈소나기", "🌨️"),
    86: ("눈소나기", "🌨️"),
    95: ("뇌우", "⛈️"),
    96: ("우박 뇌우", "⛈️"),
    99: ("우박 뇌우", "⛈️"),
}


# ---------------------------------------------------------------------------
# Input schemas
# ---------------------------------------------------------------------------
class WeatherInput(BaseModel):
    """Input schema for get_weather tool."""

    location: str = Field(default="서울", description="날씨를 조회할 도시 이름")


class ForecastInput(BaseModel):
    """Input schema for get_forecast tool."""

    location: str = Field(default="서울", description="예보를 조회할 도시 이름")
    days: int = Field(default=3, description="예보 일수 (1~7)")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _wmo_text(code: int) -> str:
    """Return Korean weather description for a WMO code."""
    return _WMO_CODES.get(code, ("알 수 없음", "🌈"))[0]


def _wmo_emoji(code: int) -> str:
    """Return emoji for a WMO weather code."""
    return _WMO_CODES.get(code, ("알 수 없음", "🌈"))[1]


async def _geocode(location: str) -> tuple[float, float, str] | None:
    """Resolve a city name to (latitude, longitude, display_name).

    Returns ``None`` when the location cannot be found.
    """
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            _GEOCODE_URL,
            params={"name": location, "count": 1, "language": "ko"},
        )
        resp.raise_for_status()

    data = resp.json()
    results = data.get("results")
    if not results:
        return None

    r = results[0]
    name = r.get("name", location)
    country = r.get("country", "")
    display = f"{name}, {country}" if country else name
    return r["latitude"], r["longitude"], display


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------
@tool(args_schema=WeatherInput)
@skill_guard("weather")
async def get_weather(location: str = "서울") -> str:
    """현재 날씨를 조회합니다. 기온, 체감온도, 습도, 풍속, 날씨 상태를 알려줍니다."""
    try:
        geo = await _geocode(location)
        if not geo:
            return f"'{location}' 도시를 찾을 수 없어요. 다른 이름으로 시도해주세요."

        lat, lon, display = geo

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                _FORECAST_URL,
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "current": (
                        "temperature_2m,relative_humidity_2m,"
                        "apparent_temperature,weather_code,wind_speed_10m"
                    ),
                    "timezone": "auto",
                },
            )
            resp.raise_for_status()

        current = resp.json()["current"]
        code = current["weather_code"]

        return (
            f"{_wmo_emoji(code)} **{display}** 현재 날씨: {_wmo_text(code)}\n"
            f"🌡️ 기온: {current['temperature_2m']}°C "
            f"(체감 {current['apparent_temperature']}°C)\n"
            f"💧 습도: {current['relative_humidity_2m']}%\n"
            f"💨 풍속: {current['wind_speed_10m']} km/h"
        )
    except Exception:
        logger.debug("get_weather failed", exc_info=True)
        return "날씨 정보를 가져오는 중 오류가 발생했어요. 잠시 후 다시 시도해주세요."


@tool(args_schema=ForecastInput)
@skill_guard("weather")
async def get_forecast(location: str = "서울", days: int = 3) -> str:
    """일간 날씨 예보를 조회합니다. 최고/최저 기온, 날씨 상태, 강수확률을 알려줍니다."""
    days = max(1, min(days, 7))

    try:
        geo = await _geocode(location)
        if not geo:
            return f"'{location}' 도시를 찾을 수 없어요. 다른 이름으로 시도해주세요."

        lat, lon, display = geo

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                _FORECAST_URL,
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "daily": (
                        "weather_code,temperature_2m_max,"
                        "temperature_2m_min,precipitation_probability_max"
                    ),
                    "timezone": "auto",
                    "forecast_days": days,
                },
            )
            resp.raise_for_status()

        daily = resp.json()["daily"]
        lines: list[str] = [f"📅 **{display}** {days}일 예보\n"]

        for i in range(len(daily["time"])):
            date = daily["time"][i]
            code = daily["weather_code"][i]
            tmax = daily["temperature_2m_max"][i]
            tmin = daily["temperature_2m_min"][i]
            precip = daily["precipitation_probability_max"][i]
            lines.append(
                f"{_wmo_emoji(code)} **{date}**: {_wmo_text(code)}, "
                f"{tmin}°C ~ {tmax}°C, 강수확률 {precip}%"
            )

        return "\n".join(lines)
    except Exception:
        logger.debug("get_forecast failed", exc_info=True)
        return "일기예보를 가져오는 중 오류가 발생했어요. 잠시 후 다시 시도해주세요."
