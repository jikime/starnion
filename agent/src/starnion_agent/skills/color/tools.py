"""Color conversion tools (pure Python, no external API)."""

import colorsys
import logging
import re

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starnion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

# CSS named colors → HEX.
_CSS_COLORS: dict[str, str] = {
    "red": "#FF0000",
    "green": "#008000",
    "blue": "#0000FF",
    "white": "#FFFFFF",
    "black": "#000000",
    "yellow": "#FFFF00",
    "cyan": "#00FFFF",
    "magenta": "#FF00FF",
    "orange": "#FFA500",
    "purple": "#800080",
    "pink": "#FFC0CB",
    "gray": "#808080",
    "grey": "#808080",
    "lime": "#00FF00",
    "navy": "#000080",
    "teal": "#008080",
    "maroon": "#800000",
    "olive": "#808000",
    "silver": "#C0C0C0",
    "aqua": "#00FFFF",
    "coral": "#FF7F50",
    "gold": "#FFD700",
    "indigo": "#4B0082",
    "violet": "#EE82EE",
    "brown": "#A52A2A",
    "salmon": "#FA8072",
    "tan": "#D2B48C",
    "tomato": "#FF6347",
    "turquoise": "#40E0D0",
    # Korean names
    "빨강": "#FF0000",
    "빨간색": "#FF0000",
    "초록": "#008000",
    "초록색": "#008000",
    "파랑": "#0000FF",
    "파란색": "#0000FF",
    "하양": "#FFFFFF",
    "하얀색": "#FFFFFF",
    "검정": "#000000",
    "검은색": "#000000",
    "노랑": "#FFFF00",
    "노란색": "#FFFF00",
    "주황": "#FFA500",
    "주황색": "#FFA500",
    "보라": "#800080",
    "보라색": "#800080",
    "분홍": "#FFC0CB",
    "분홍색": "#FFC0CB",
    "회색": "#808080",
    "갈색": "#A52A2A",
    "남색": "#000080",
    "하늘색": "#87CEEB",
}

# Color emoji approximation by hue.
_COLOR_EMOJIS = [
    (0, "🔴"),     # red
    (30, "🟠"),    # orange
    (60, "🟡"),    # yellow
    (120, "🟢"),   # green
    (240, "🔵"),   # blue
    (270, "🟣"),   # purple
]


def _parse_color(color_str: str) -> tuple[int, int, int] | None:
    """Parse a color string to (R, G, B) tuple. Returns None if invalid."""
    s = color_str.strip()

    # Try CSS name (case-insensitive).
    name_hex = _CSS_COLORS.get(s.lower())
    if name_hex:
        s = name_hex

    # HEX: #RGB or #RRGGBB
    hex_match = re.match(r"^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$", s)
    if hex_match:
        h = hex_match.group(1)
        if len(h) == 3:
            h = h[0] * 2 + h[1] * 2 + h[2] * 2
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)

    # rgb(R, G, B) or R,G,B
    rgb_match = re.match(
        r"^(?:rgb\s*\(\s*)?(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)?$",
        s,
        re.IGNORECASE,
    )
    if rgb_match:
        r, g, b = int(rgb_match.group(1)), int(rgb_match.group(2)), int(rgb_match.group(3))
        if all(0 <= v <= 255 for v in (r, g, b)):
            return r, g, b

    return None


def _rgb_to_hsl(r: int, g: int, b: int) -> tuple[int, int, int]:
    """Convert RGB (0-255) to HSL (degrees, percent, percent)."""
    h_raw, l_raw, s_raw = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    h = round(h_raw * 360) % 360
    s = round(s_raw * 100)
    l_val = round(l_raw * 100)
    return h, s, l_val


def _get_color_emoji(r: int, g: int, b: int) -> str:
    """Get approximate color emoji."""
    # Handle grayscale.
    if r == g == b:
        if r < 50:
            return "⚫"
        if r > 200:
            return "⚪"
        return "🔘"

    h, _, _ = _rgb_to_hsl(r, g, b)
    closest = "🔴"
    min_diff = 360
    for hue, emoji in _COLOR_EMOJIS:
        diff = min(abs(h - hue), 360 - abs(h - hue))
        if diff < min_diff:
            min_diff = diff
            closest = emoji
    return closest


class ConvertColorInput(BaseModel):
    """Input schema for convert_color tool."""

    color: str = Field(
        description="색상 값 (예: #FF5733, rgb(255,87,51), red, 빨강)",
    )


@tool(args_schema=ConvertColorInput)
@skill_guard("color")
async def convert_color(color: str) -> str:
    """색상 코드를 HEX, RGB, HSL 형식으로 변환합니다."""
    if not color or not color.strip():
        return "색상 값을 입력해 주세요. (예: #FF5733, rgb(255,87,51), red, 빨강)"

    rgb = _parse_color(color)
    if rgb is None:
        return (
            "색상을 인식할 수 없어요.\n"
            "지원 형식: HEX (#FF5733), RGB (rgb(255,87,51) 또는 255,87,51), "
            "색상 이름 (red, 빨강)"
        )

    r, g, b = rgb
    hex_str = f"#{r:02X}{g:02X}{b:02X}"
    h, s, l_val = _rgb_to_hsl(r, g, b)
    emoji = _get_color_emoji(r, g, b)

    return (
        f"🎨 색상 변환 결과 {emoji}\n"
        f"- HEX: {hex_str}\n"
        f"- RGB: rgb({r}, {g}, {b})\n"
        f"- HSL: hsl({h}\u00b0, {s}%, {l_val}%)"
    )
