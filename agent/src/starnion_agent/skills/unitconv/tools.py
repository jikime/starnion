"""Unit conversion tool (pure Python, no external API)."""

import logging

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starnion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

# Conversion tables: category -> {unit: (base_unit, factor)}
# To convert: value_in_base = value * factor, result = value_in_base / target_factor
_CONVERSIONS: dict[str, dict[str, tuple[str, float | None]]] = {
    "length": {
        "mm": ("m", 0.001),
        "cm": ("m", 0.01),
        "m": ("m", 1.0),
        "km": ("m", 1000.0),
        "in": ("m", 0.0254),
        "ft": ("m", 0.3048),
        "yd": ("m", 0.9144),
        "mi": ("m", 1609.344),
    },
    "weight": {
        "mg": ("g", 0.001),
        "g": ("g", 1.0),
        "kg": ("g", 1000.0),
        "lb": ("g", 453.592),
        "oz": ("g", 28.3495),
        "ton": ("g", 1_000_000.0),
    },
    "temperature": {
        "C": ("C", None),
        "F": ("C", None),
        "K": ("C", None),
    },
    "volume": {
        "ml": ("l", 0.001),
        "l": ("l", 1.0),
        "gal": ("l", 3.78541),
        "cup": ("l", 0.236588),
        "fl_oz": ("l", 0.0295735),
    },
    "area": {
        "sqm": ("sqm", 1.0),
        "sqkm": ("sqm", 1_000_000.0),
        "sqft": ("sqm", 0.092903),
        "pyeong": ("sqm", 3.30579),
        "acre": ("sqm", 4046.86),
        "ha": ("sqm", 10000.0),
    },
    "data": {
        "B": ("B", 1.0),
        "KB": ("B", 1024.0),
        "MB": ("B", 1024.0**2),
        "GB": ("B", 1024.0**3),
        "TB": ("B", 1024.0**4),
    },
}

# Build reverse lookup: unit -> category.
_UNIT_TO_CATEGORY: dict[str, str] = {}
for _cat, _units in _CONVERSIONS.items():
    for _unit in _units:
        _UNIT_TO_CATEGORY[_unit] = _cat

# Unit display names for user-friendly output.
_UNIT_NAMES: dict[str, str] = {
    "mm": "밀리미터",
    "cm": "센티미터",
    "m": "미터",
    "km": "킬로미터",
    "in": "인치",
    "ft": "피트",
    "yd": "야드",
    "mi": "마일",
    "mg": "밀리그램",
    "g": "그램",
    "kg": "킬로그램",
    "lb": "파운드",
    "oz": "온스",
    "ton": "톤",
    "C": "섭씨",
    "F": "화씨",
    "K": "켈빈",
    "ml": "밀리리터",
    "l": "리터",
    "gal": "갤런",
    "cup": "컵",
    "fl_oz": "액량 온스",
    "sqm": "제곱미터",
    "sqkm": "제곱킬로미터",
    "sqft": "제곱피트",
    "pyeong": "평",
    "acre": "에이커",
    "ha": "헥타르",
    "B": "바이트",
    "KB": "킬로바이트",
    "MB": "메가바이트",
    "GB": "기가바이트",
    "TB": "테라바이트",
}


class ConvertUnitInput(BaseModel):
    """Input schema for convert_unit tool."""

    value: float = Field(description="변환할 값")
    from_unit: str = Field(description="원본 단위 (예: km, lb, C, pyeong)")
    to_unit: str = Field(description="대상 단위 (예: mi, kg, F, sqm)")


def _convert_temperature(value: float, from_u: str, to_u: str) -> float:
    """Convert between C, F, and K."""
    # First convert to Celsius.
    if from_u == "F":
        celsius = (value - 32) * 5 / 9
    elif from_u == "K":
        celsius = value - 273.15
    else:
        celsius = value

    # Then convert from Celsius to target.
    if to_u == "F":
        return celsius * 9 / 5 + 32
    if to_u == "K":
        return celsius + 273.15
    return celsius


def _format_result(value: float) -> str:
    """Format a numeric result for display."""
    if value == int(value) and abs(value) < 1e15:
        return f"{int(value):,}"
    return f"{value:,.6g}"


@tool(args_schema=ConvertUnitInput)
@skill_guard("unitconv")
async def convert_unit(
    value: float,
    from_unit: str,
    to_unit: str,
) -> str:
    """단위를 변환합니다. 길이, 무게, 온도, 부피, 면적, 데이터 단위를 지원합니다."""
    from_u = from_unit.strip()
    to_u = to_unit.strip()

    # Validate units exist.
    if from_u not in _UNIT_TO_CATEGORY:
        supported = ", ".join(sorted(_UNIT_TO_CATEGORY.keys()))
        return f"'{from_u}' 단위를 찾을 수 없어요.\n지원 단위: {supported}"

    if to_u not in _UNIT_TO_CATEGORY:
        supported = ", ".join(sorted(_UNIT_TO_CATEGORY.keys()))
        return f"'{to_u}' 단위를 찾을 수 없어요.\n지원 단위: {supported}"

    from_cat = _UNIT_TO_CATEGORY[from_u]
    to_cat = _UNIT_TO_CATEGORY[to_u]

    if from_cat != to_cat:
        return (
            f"'{from_u}'({from_cat})와 '{to_u}'({to_cat})는 "
            f"같은 카테고리가 아니라 변환할 수 없어요."
        )

    if from_u == to_u:
        return f"📐 {_format_result(value)} {from_u} = {_format_result(value)} {to_u}"

    # Temperature: special formula.
    if from_cat == "temperature":
        result = _convert_temperature(value, from_u, to_u)
    else:
        # General conversion via base unit.
        _, from_factor = _CONVERSIONS[from_cat][from_u]
        _, to_factor = _CONVERSIONS[from_cat][to_u]
        base_value = value * from_factor  # type: ignore[operator]
        result = base_value / to_factor  # type: ignore[operator]

    from_name = _UNIT_NAMES.get(from_u, from_u)
    to_name = _UNIT_NAMES.get(to_u, to_u)

    return (
        f"📐 {_format_result(value)} {from_u} ({from_name}) = "
        f"{_format_result(result)} {to_u} ({to_name})"
    )
