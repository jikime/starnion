"""World timezone tools (pure Python, no external API)."""

import logging
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from jiki_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

# City name → IANA timezone mapping.
_CITY_TZ: dict[str, str] = {
    # Korean names
    "서울": "Asia/Seoul",
    "도쿄": "Asia/Tokyo",
    "베이징": "Asia/Shanghai",
    "상하이": "Asia/Shanghai",
    "뉴욕": "America/New_York",
    "로스앤젤레스": "America/Los_Angeles",
    "런던": "Europe/London",
    "파리": "Europe/Paris",
    "베를린": "Europe/Berlin",
    "시드니": "Australia/Sydney",
    "두바이": "Asia/Dubai",
    "모스크바": "Europe/Moscow",
    "싱가포르": "Asia/Singapore",
    "방콕": "Asia/Bangkok",
    "홍콩": "Asia/Hong_Kong",
    "타이베이": "Asia/Taipei",
    "자카르타": "Asia/Jakarta",
    "하노이": "Asia/Ho_Chi_Minh",
    "뭄바이": "Asia/Kolkata",
    "카이로": "Africa/Cairo",
    "이스탄불": "Europe/Istanbul",
    # English aliases
    "seoul": "Asia/Seoul",
    "tokyo": "Asia/Tokyo",
    "beijing": "Asia/Shanghai",
    "shanghai": "Asia/Shanghai",
    "new york": "America/New_York",
    "la": "America/Los_Angeles",
    "los angeles": "America/Los_Angeles",
    "london": "Europe/London",
    "paris": "Europe/Paris",
    "berlin": "Europe/Berlin",
    "sydney": "Australia/Sydney",
    "dubai": "Asia/Dubai",
    "moscow": "Europe/Moscow",
    "singapore": "Asia/Singapore",
    "bangkok": "Asia/Bangkok",
    "hong kong": "Asia/Hong_Kong",
    "taipei": "Asia/Taipei",
    "jakarta": "Asia/Jakarta",
    "mumbai": "Asia/Kolkata",
    "cairo": "Africa/Cairo",
    "istanbul": "Europe/Istanbul",
}


def _resolve_tz(name: str) -> ZoneInfo | None:
    """Resolve a city name or IANA timezone string to ZoneInfo."""
    key = name.strip().lower()
    iana = _CITY_TZ.get(key)
    if iana:
        try:
            return ZoneInfo(iana)
        except (ZoneInfoNotFoundError, KeyError):
            return None
    # Try as raw IANA timezone.
    try:
        return ZoneInfo(name.strip())
    except (ZoneInfoNotFoundError, KeyError):
        return None


def _format_utc_offset(dt: datetime) -> str:
    """Format UTC offset as string like 'UTC+9' or 'UTC-5'."""
    offset = dt.utcoffset()
    if offset is None:
        return "UTC"
    total_seconds = int(offset.total_seconds())
    hours, remainder = divmod(abs(total_seconds), 3600)
    minutes = remainder // 60
    sign = "+" if total_seconds >= 0 else "-"
    if minutes:
        return f"UTC{sign}{hours}:{minutes:02d}"
    return f"UTC{sign}{hours}"


class GetWorldTimeInput(BaseModel):
    """Input schema for get_world_time tool."""

    city: str = Field(
        description="도시 이름 또는 IANA 타임존 (예: 서울, 뉴욕, Asia/Tokyo)",
    )


class ConvertTimezoneInput(BaseModel):
    """Input schema for convert_timezone tool."""

    time_str: str = Field(
        description="변환할 시간 (예: 14:30, 2024-01-15 09:00)",
    )
    from_tz: str = Field(
        default="서울",
        description="원본 도시 또는 타임존 (기본: 서울)",
    )
    to_tz: str = Field(
        description="대상 도시 또는 타임존 (예: 뉴욕, Europe/London)",
    )


@tool(args_schema=GetWorldTimeInput)
@skill_guard("timezone")
async def get_world_time(city: str) -> str:
    """세계 각 도시의 현재 시간을 조회합니다."""
    if not city or not city.strip():
        return "도시 이름 또는 타임존을 입력해 주세요."

    tz = _resolve_tz(city)
    if tz is None:
        cities = ", ".join(
            k for k in _CITY_TZ if not k.isascii()
        )
        return (
            f"'{city}'을(를) 찾을 수 없어요.\n"
            f"사용 가능한 도시: {cities}\n"
            f"또는 IANA 타임존을 직접 입력하세요 (예: America/New_York)"
        )

    now = datetime.now(tz)
    utc_offset = _format_utc_offset(now)
    iana_name = str(tz)

    return (
        f"🕐 {city} ({iana_name})\n"
        f"현재 시간: {now.strftime('%Y-%m-%d %H:%M:%S')}\n"
        f"{utc_offset}"
    )


@tool(args_schema=ConvertTimezoneInput)
@skill_guard("timezone")
async def convert_timezone(
    time_str: str,
    from_tz: str = "서울",
    to_tz: str = "",
) -> str:
    """시간대를 변환합니다. 특정 시간을 다른 도시의 시간으로 변환합니다."""
    if not time_str or not time_str.strip():
        return "변환할 시간을 입력해 주세요. (예: 14:30, 2024-01-15 09:00)"

    if not to_tz or not to_tz.strip():
        return "대상 도시 또는 타임존을 입력해 주세요."

    src_tz = _resolve_tz(from_tz)
    if src_tz is None:
        return f"원본 타임존 '{from_tz}'을(를) 찾을 수 없어요."

    dst_tz = _resolve_tz(to_tz)
    if dst_tz is None:
        return f"대상 타임존 '{to_tz}'을(를) 찾을 수 없어요."

    time_str = time_str.strip()

    # Parse time string.
    parsed: datetime | None = None
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%H:%M", "%H:%M:%S"):
        try:
            parsed = datetime.strptime(time_str, fmt)
            break
        except ValueError:
            continue

    if parsed is None:
        return "시간 형식을 인식할 수 없어요. (예: 14:30, 2024-01-15 09:00)"

    # If only time was given, use today's date.
    if parsed.year == 1900:  # strptime default year for time-only
        today = datetime.now(src_tz).date()
        parsed = parsed.replace(year=today.year, month=today.month, day=today.day)

    # Attach source timezone and convert.
    src_dt = parsed.replace(tzinfo=src_tz)
    dst_dt = src_dt.astimezone(dst_tz)

    # Check if date changed.
    date_note = ""
    day_diff = (dst_dt.date() - src_dt.date()).days
    if day_diff == 1:
        date_note = " (다음날)"
    elif day_diff == -1:
        date_note = " (전날)"
    elif day_diff != 0:
        date_note = f" ({dst_dt.strftime('%m/%d')})"

    src_offset = _format_utc_offset(src_dt)
    dst_offset = _format_utc_offset(dst_dt)

    return (
        f"🕐 시간대 변환\n"
        f"{from_tz} {src_dt.strftime('%H:%M')} ({src_offset})\n"
        f"→ {to_tz} {dst_dt.strftime('%H:%M')}{date_note} ({dst_offset})"
    )
