"""D-day tracking tools.

Allows users to set, list, and delete D-day entries.
D-days are stored in the dedicated ddays table.
"""

import logging
from datetime import date, datetime

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starnion_agent.context import get_current_user
from starnion_agent.db.pool import get_pool
from starnion_agent.db.repositories import dday_db as dday_db_repo
from starnion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

MAX_ACTIVE_DDAYS = 30


class SetDdayInput(BaseModel):
    """Input schema for set_dday tool."""

    title: str = Field(description="디데이 이름 (예: 생일, 결혼기념일)")
    target_date: str = Field(description="목표 날짜 (YYYY-MM-DD 형식)")
    recurring: bool = Field(default=False, description="매년 반복 여부")
    icon: str = Field(default="📅", description="아이콘 이모지 (예: 🎂, 💍, ✈️)")
    description: str = Field(default="", description="메모 (선택)")


class ListDdaysInput(BaseModel):
    """Input schema for list_ddays tool."""

    include_past: bool = Field(
        default=False,
        description="지난 디데이도 포함할지 여부",
    )


class DeleteDdayInput(BaseModel):
    """Input schema for delete_dday tool."""

    dday_id: int = Field(description="삭제할 디데이 ID (숫자)")


def _calc_dday(target: date) -> str:
    """Calculate D-day string (D-N, D-Day, D+N)."""
    delta = (target - date.today()).days
    if delta > 0:
        return f"D-{delta}"
    if delta == 0:
        return "D-Day!"
    return f"D+{abs(delta)}"


@tool(args_schema=SetDdayInput)
@skill_guard("dday")
async def set_dday(
    title: str,
    target_date: str,
    recurring: bool = False,
    icon: str = "📅",
    description: str = "",
) -> str:
    """디데이를 설정합니다. 중요한 날짜까지 남은 일수를 추적합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    if not title or not title.strip():
        return "디데이 이름을 입력해 주세요."

    try:
        target_dt = datetime.strptime(target_date.strip(), "%Y-%m-%d").date()
    except ValueError:
        return "날짜 형식이 올바르지 않아요. YYYY-MM-DD 형식으로 입력해 주세요."

    pool = get_pool()

    # Check active dday count.
    existing = await dday_db_repo.list_ddays(pool, user_id)
    if len(existing) >= MAX_ACTIVE_DDAYS:
        return (
            f"디데이는 최대 {MAX_ACTIVE_DDAYS}개까지 설정할 수 있어요. "
            "기존 디데이를 삭제한 후 다시 시도해 주세요."
        )

    dday = await dday_db_repo.create(
        pool,
        user_id=user_id,
        title=title.strip(),
        target_date=target_dt,
        icon=icon or "📅",
        description=description,
        recurring=recurring,
    )

    dday_str = _calc_dday(target_dt)
    recurring_label = " (매년 반복)" if recurring else ""

    lines = [
        f"디데이를 설정했어요! '{title.strip()}'{recurring_label}",
        f"디데이 ID: {dday['id']}",
        f"날짜: {target_date.strip()}",
        f"남은 일수: {dday_str}",
    ]
    return "\n".join(lines)


@tool(args_schema=ListDdaysInput)
@skill_guard("dday")
async def list_ddays(include_past: bool = False) -> str:
    """디데이 목록을 조회합니다. 남은 일수를 함께 표시합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    pool = get_pool()
    all_ddays = await dday_db_repo.list_ddays(pool, user_id)

    if not all_ddays:
        return "등록된 디데이가 없어요. 디데이를 설정해 보세요!"

    items: list[tuple[date, str]] = []
    for dday in all_ddays:
        target_dt = dday["target_date"]
        if isinstance(target_dt, str):
            target_dt = datetime.strptime(target_dt, "%Y-%m-%d").date()

        # Filter past D-days (keep recurring ones even if past).
        if not include_past and target_dt < date.today():
            if not dday.get("recurring"):
                continue

        dday_str = _calc_dday(target_dt)
        recurring_label = " 🔄" if dday.get("recurring") else ""
        icon = dday.get("icon", "📆")

        line = f"{icon} {dday['title']}{recurring_label} — {dday_str} (ID: {dday['id']})"
        line += f"\n  날짜: {target_dt}"
        if dday.get("description"):
            line += f"\n  {dday['description']}"

        items.append((target_dt, line))

    if not items:
        return "활성 디데이가 없어요."

    items.sort(key=lambda x: x[0])
    return "\n\n".join(line for _, line in items)


@tool(args_schema=DeleteDdayInput)
@skill_guard("dday")
async def delete_dday(dday_id: int) -> str:
    """디데이를 삭제합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    pool = get_pool()
    deleted = await dday_db_repo.delete(pool, user_id, dday_id)

    if not deleted:
        return f"디데이 ID '{dday_id}'를 찾을 수 없어요."

    return f"디데이(ID: {dday_id})를 삭제했어요."
