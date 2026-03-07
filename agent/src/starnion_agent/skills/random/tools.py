"""Random selection tools (pure Python, no external API)."""

import logging
import random as random_lib
import string as string_lib

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starnion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

MAX_ITEMS = 100
MAX_RANGE = 1_000_000_000
MAX_COUNT = 100
MAX_STRING_LENGTH = 200

_VALID_MODES = {"choice", "number", "shuffle", "coin", "dice", "string"}


class RandomPickInput(BaseModel):
    """Input schema for random_pick tool."""

    mode: str = Field(
        default="choice",
        description=(
            "랜덤 모드: choice (목록에서 선택), number (숫자 범위), "
            "shuffle (섞기), coin (동전), dice (주사위), "
            "string (랜덤 문자열 생성)"
        ),
    )
    items: str = Field(
        default="",
        description="쉼표로 구분된 선택 항목 (choice/shuffle 모드)",
    )
    min_val: int = Field(default=1, description="최소값 (number 모드)")
    max_val: int = Field(default=100, description="최대값 (number 모드)")
    count: int = Field(
        default=1,
        description="선택 개수 (choice 모드) 또는 주사위/문자열 개수 (dice/string 모드)",
    )
    length: int = Field(
        default=16,
        description="문자열 길이 (string 모드, 1-200)",
    )
    charset: str = Field(
        default="alphanumeric",
        description=(
            "문자열 구성 (string 모드): "
            "alphanumeric (영숫자), alpha (영문만), numeric (숫자만), "
            "hex (16진수), password (영숫자+특수문자)"
        ),
    )


@tool(args_schema=RandomPickInput)
@skill_guard("random")
async def random_pick(
    mode: str = "choice",
    items: str = "",
    min_val: int = 1,
    max_val: int = 100,
    count: int = 1,
    length: int = 16,
    charset: str = "alphanumeric",
) -> str:
    """랜덤 선택, 숫자 뽑기, 동전 던지기, 주사위 굴리기, 문자열 생성 등을 수행합니다."""
    mode = mode.strip().lower()

    if mode not in _VALID_MODES:
        return (
            f"지원하지 않는 모드예요. "
            f"사용 가능: {', '.join(sorted(_VALID_MODES))}"
        )

    count = max(1, min(count, MAX_COUNT))

    if mode == "string":
        length = max(1, min(length, MAX_STRING_LENGTH))
        charset = charset.strip().lower()

        charset_map = {
            "alphanumeric": string_lib.ascii_letters + string_lib.digits,
            "alpha": string_lib.ascii_letters,
            "numeric": string_lib.digits,
            "hex": string_lib.hexdigits[:16],  # 0-9a-f
            "password": string_lib.ascii_letters + string_lib.digits + "!@#$%^&*()-_=+",
        }

        chars = charset_map.get(charset)
        if chars is None:
            return (
                "지원하지 않는 문자셋이에요. "
                "사용 가능: alphanumeric, alpha, numeric, hex, password"
            )

        results = [
            "".join(random_lib.choices(chars, k=length)) for _ in range(count)
        ]

        if count == 1:
            return f"🎲 랜덤 문자열 ({charset}, {length}자):\n`{results[0]}`"
        lines = [f"🎲 랜덤 문자열 {count}개 ({charset}, {length}자):"]
        for i, r in enumerate(results):
            lines.append(f"  {i + 1}. `{r}`")
        return "\n".join(lines)

    if mode == "coin":
        results = [random_lib.choice(["앞면 🪙", "뒷면 🪙"]) for _ in range(count)]
        if count == 1:
            return f"🎲 동전 던지기 결과: {results[0]}"
        return "🎲 동전 던지기 결과:\n" + "\n".join(
            f"  {i + 1}회: {r}" for i, r in enumerate(results)
        )

    if mode == "dice":
        results = [random_lib.randint(1, 6) for _ in range(count)]
        dice_emoji = {1: "⚀", 2: "⚁", 3: "⚂", 4: "⚃", 5: "⚄", 6: "⚅"}
        if count == 1:
            return f"🎲 주사위 결과: {dice_emoji[results[0]]} {results[0]}"
        lines = [f"🎲 주사위 {count}개 결과:"]
        for i, r in enumerate(results):
            lines.append(f"  {i + 1}번: {dice_emoji[r]} {r}")
        lines.append(f"  합계: {sum(results)}")
        return "\n".join(lines)

    if mode == "number":
        if min_val > max_val:
            return "최소값이 최대값보다 클 수 없어요."
        if abs(max_val - min_val) > MAX_RANGE:
            return f"범위가 너무 커요. 최대 {MAX_RANGE:,} 이내로 설정해주세요."

        if count == 1:
            result = random_lib.randint(min_val, max_val)
            return f"🎲 랜덤 숫자: {result:,} ({min_val:,}~{max_val:,})"

        # Multiple picks: try without duplicates if range allows.
        range_size = max_val - min_val + 1
        if count <= range_size:
            results = random_lib.sample(range(min_val, max_val + 1), count)
        else:
            results = [random_lib.randint(min_val, max_val) for _ in range(count)]

        formatted = ", ".join(str(r) for r in sorted(results))
        return f"🎲 랜덤 숫자 {count}개 ({min_val:,}~{max_val:,}):\n  {formatted}"

    # choice / shuffle modes need items.
    if not items or not items.strip():
        return "선택 항목을 입력해 주세요. (예: 짜장면,짬뽕,볶음밥)"

    item_list = [i.strip() for i in items.split(",") if i.strip()]

    if not item_list:
        return "유효한 항목이 없어요. 쉼표로 구분해서 입력해주세요."

    if len(item_list) > MAX_ITEMS:
        return f"항목이 너무 많아요. 최대 {MAX_ITEMS}개까지 가능해요."

    if mode == "shuffle":
        shuffled = item_list.copy()
        random_lib.shuffle(shuffled)
        lines = ["🎲 순서 섞기 결과:"]
        for i, item in enumerate(shuffled):
            lines.append(f"  {i + 1}. {item}")
        return "\n".join(lines)

    # choice mode.
    pick_count = min(count, len(item_list))
    if pick_count == 1:
        chosen = random_lib.choice(item_list)
        return f"🎲 선택 결과: **{chosen}**"

    chosen = random_lib.sample(item_list, pick_count)
    return "🎲 선택 결과:\n" + "\n".join(f"  {i + 1}. {c}" for i, c in enumerate(chosen))
