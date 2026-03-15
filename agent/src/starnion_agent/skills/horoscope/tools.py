"""Horoscope tools (httpx + ohmanda API)."""

import logging

import httpx
from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starnion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

_API_URL = "https://ohmanda.com/api/horoscope"

# Korean → English zodiac sign mapping.
_ZODIAC_MAP: dict[str, str] = {
    # Korean
    "양자리": "aries",
    "황소자리": "taurus",
    "쌍둥이자리": "gemini",
    "게자리": "cancer",
    "사자자리": "leo",
    "처녀자리": "virgo",
    "천칭자리": "libra",
    "전갈자리": "scorpio",
    "사수자리": "sagittarius",
    "염소자리": "capricorn",
    "물병자리": "aquarius",
    "물고기자리": "pisces",
    # English (pass-through)
    "aries": "aries",
    "taurus": "taurus",
    "gemini": "gemini",
    "cancer": "cancer",
    "leo": "leo",
    "virgo": "virgo",
    "libra": "libra",
    "scorpio": "scorpio",
    "sagittarius": "sagittarius",
    "capricorn": "capricorn",
    "aquarius": "aquarius",
    "pisces": "pisces",
}

# Zodiac sign metadata: (Korean name, emoji, date range)
_ZODIAC_INFO: dict[str, tuple[str, str, str]] = {
    "aries": ("양자리", "♈", "3/21-4/19"),
    "taurus": ("황소자리", "♉", "4/20-5/20"),
    "gemini": ("쌍둥이자리", "♊", "5/21-6/20"),
    "cancer": ("게자리", "♋", "6/21-7/22"),
    "leo": ("사자자리", "♌", "7/23-8/22"),
    "virgo": ("처녀자리", "♍", "8/23-9/22"),
    "libra": ("천칭자리", "♎", "9/23-10/22"),
    "scorpio": ("전갈자리", "♏", "10/23-11/21"),
    "sagittarius": ("사수자리", "♐", "11/22-12/21"),
    "capricorn": ("염소자리", "♑", "12/22-1/19"),
    "aquarius": ("물병자리", "♒", "1/20-2/18"),
    "pisces": ("물고기자리", "♓", "2/19-3/20"),
}


def _sign_list_text() -> str:
    """Build a formatted zodiac sign list for error messages."""
    lines = []
    for eng, (kor, emoji, dates) in _ZODIAC_INFO.items():
        lines.append(f"  {emoji} {kor} ({eng}) {dates}")
    return "\n".join(lines)


class GetHoroscopeInput(BaseModel):
    """Input schema for get_horoscope tool."""

    sign: str = Field(
        description="별자리 (예: 양자리, 사자자리, leo, aries)",
    )


@tool(args_schema=GetHoroscopeInput)
@skill_guard("horoscope")
async def get_horoscope(sign: str) -> str:
    """별자리 운세 조회가 필요할 때 호출. ('운세', '오늘 운세', '별자리', 'horoscope', 'zodiac', '占い', '星座运势')"""
    if not sign or not sign.strip():
        return f"별자리를 입력해 주세요.\n\n{_sign_list_text()}"

    key = sign.strip().lower()
    eng_sign = _ZODIAC_MAP.get(key)

    if eng_sign is None:
        return (
            f"'{sign}'은(는) 알 수 없는 별자리예요.\n"
            f"사용 가능한 별자리:\n{_sign_list_text()}"
        )

    kor_name, emoji, date_range = _ZODIAC_INFO[eng_sign]

    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(f"{_API_URL}/{eng_sign}")
            resp.raise_for_status()
            data = resp.json()
    except httpx.TimeoutException:
        return "운세 서비스 응답이 느려요. 잠시 후 다시 시도해 주세요."
    except httpx.HTTPStatusError:
        return "운세 서비스에 접속할 수 없어요. 잠시 후 다시 시도해 주세요."
    except Exception:
        logger.debug("Horoscope API error", exc_info=True)
        return "운세 조회 중 오류가 발생했어요."

    horoscope_text = data.get("horoscope", "")
    if not horoscope_text:
        return "운세 데이터를 가져올 수 없어요."

    return (
        f"{emoji} {kor_name} 오늘의 운세 ({date_range})\n\n"
        f"{horoscope_text}"
    )
