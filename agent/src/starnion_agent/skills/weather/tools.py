"""Weather tools using wttr.in API (free, no API key required)."""

from __future__ import annotations

import logging
from urllib.parse import quote

import httpx
from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starnion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

_WTTR_URL = "https://wttr.in/{location}"

# wttr.in weather codes → (Korean description, emoji)
_WEATHER_CODES: dict[int, tuple[str, str]] = {
    113: ("맑음", "☀️"),
    116: ("부분 흐림", "⛅"),
    119: ("흐림", "☁️"),
    122: ("흐림", "☁️"),
    143: ("안개", "🌫️"),
    176: ("가벼운 비", "🌦️"),
    179: ("약한 눈", "🌨️"),
    182: ("진눈깨비", "🌨️"),
    185: ("동결 이슬비", "🌨️"),
    200: ("뇌우", "⛈️"),
    227: ("눈바람", "❄️"),
    230: ("눈보라", "❄️"),
    248: ("안개", "🌫️"),
    260: ("동결 안개", "🌫️"),
    263: ("이슬비", "🌦️"),
    266: ("이슬비", "🌦️"),
    281: ("동결 이슬비", "🌨️"),
    284: ("동결 폭우", "🌨️"),
    293: ("약한 비", "🌧️"),
    296: ("약한 비", "🌧️"),
    299: ("보통 비", "🌧️"),
    302: ("보통 비", "🌧️"),
    305: ("강한 비", "🌧️"),
    308: ("폭우", "🌧️"),
    311: ("동결비", "🌨️"),
    314: ("동결비", "🌨️"),
    317: ("진눈깨비", "🌨️"),
    320: ("진눈깨비", "🌨️"),
    323: ("약한 눈", "🌨️"),
    326: ("약한 눈", "🌨️"),
    329: ("보통 눈", "❄️"),
    332: ("보통 눈", "❄️"),
    335: ("폭설", "❄️"),
    338: ("폭설", "❄️"),
    350: ("우박", "❄️"),
    353: ("소나기", "🌦️"),
    356: ("강한 소나기", "🌦️"),
    359: ("폭우", "⛈️"),
    362: ("진눈깨비 소나기", "🌨️"),
    365: ("진눈깨비 소나기", "🌨️"),
    368: ("눈 소나기", "🌨️"),
    371: ("눈 소나기", "🌨️"),
    374: ("우박 소나기", "❄️"),
    377: ("우박 소나기", "❄️"),
    386: ("뇌우", "⛈️"),
    389: ("폭우 뇌우", "⛈️"),
    392: ("눈 뇌우", "⛈️"),
    395: ("폭설 뇌우", "⛈️"),
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _code_text(code: int) -> str:
    """Return Korean weather description for a wttr.in weather code."""
    return _WEATHER_CODES.get(code, ("알 수 없음", "🌈"))[0]


def _code_emoji(code: int) -> str:
    """Return emoji for a wttr.in weather code."""
    return _WEATHER_CODES.get(code, ("알 수 없음", "🌈"))[1]


def _display_name(data: dict) -> str:
    """Extract location display name from wttr.in JSON response."""
    try:
        area = data["nearest_area"][0]
        city = area["areaName"][0]["value"]
        country = area["country"][0]["value"]
        return f"{city}, {country}" if country else city
    except (KeyError, IndexError):
        return "알 수 없는 위치"


# ---------------------------------------------------------------------------
# Input schemas
# ---------------------------------------------------------------------------
class WeatherInput(BaseModel):
    """Input schema for get_weather tool."""

    location: str = Field(default="서울", description="날씨를 조회할 도시 이름")


class ForecastInput(BaseModel):
    """Input schema for get_forecast tool."""

    location: str = Field(default="서울", description="예보를 조회할 도시 이름")
    days: int = Field(default=3, description="예보 일수 (1~3)")


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------
@tool(args_schema=WeatherInput)
@skill_guard("weather")
async def get_weather(location: str = "서울") -> str:
    """현재 날씨를 조회합니다. 기온, 체감온도, 습도, 풍속, 날씨 상태를 알려줍니다."""
    try:
        url = _WTTR_URL.format(location=quote(location, safe=""))
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params={"format": "j1"})
            resp.raise_for_status()

        data = resp.json()
        cond = data["current_condition"][0]
        display = _display_name(data)
        code = int(cond["weatherCode"])

        return (
            f"{_code_emoji(code)} **{display}** 현재 날씨: {_code_text(code)}\n"
            f"🌡️ 기온: {cond['temp_C']}°C "
            f"(체감 {cond['FeelsLikeC']}°C)\n"
            f"💧 습도: {cond['humidity']}%\n"
            f"💨 풍속: {cond['windspeedKmph']} km/h"
        )
    except Exception:
        logger.debug("get_weather failed", exc_info=True)
        return "날씨 정보를 가져오는 중 오류가 발생했어요. 잠시 후 다시 시도해주세요."


@tool(args_schema=ForecastInput)
@skill_guard("weather")
async def get_forecast(location: str = "서울", days: int = 3) -> str:
    """일간 날씨 예보를 조회합니다. 최고/최저 기온, 날씨 상태, 강수확률을 알려줍니다."""
    days = max(1, min(days, 3))

    try:
        url = _WTTR_URL.format(location=quote(location, safe=""))
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params={"format": "j1"})
            resp.raise_for_status()

        data = resp.json()
        display = _display_name(data)
        forecast_days = data["weather"][:days]

        lines: list[str] = [f"📅 **{display}** {days}일 예보\n"]
        for day in forecast_days:
            date = day["date"]
            # index 4 = 12:00 (wttr.in provides 3-hourly: 0,3,6,9,12,15,18,21)
            code = int(day["hourly"][4]["weatherCode"])
            tmax = day["maxtempC"]
            tmin = day["mintempC"]
            precip = max(int(h.get("precipProbability", 0)) for h in day["hourly"])
            lines.append(
                f"{_code_emoji(code)} **{date}**: {_code_text(code)}, "
                f"{tmin}°C ~ {tmax}°C, 강수확률 {precip}%"
            )

        return "\n".join(lines)
    except Exception:
        logger.debug("get_forecast failed", exc_info=True)
        return "일기예보를 가져오는 중 오류가 발생했어요. 잠시 후 다시 시도해주세요."
