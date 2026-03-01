"""Budget management tools for setting and querying spending limits."""

from datetime import datetime

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from jiki_agent.context import get_current_user
from jiki_agent.db.pool import get_pool
from jiki_agent.db.repositories import finance as finance_repo
from jiki_agent.db.repositories import profile as profile_repo


class SetBudgetInput(BaseModel):
    """Input schema for set_budget tool."""

    category: str = Field(
        description="예산을 설정할 카테고리 (예: 식비, 교통, 쇼핑, 전체)",
    )
    amount: int = Field(
        description="월 예산 금액 (원 단위 정수)",
    )


class GetBudgetStatusInput(BaseModel):
    """Input schema for get_budget_status tool."""

    category: str = Field(
        default="",
        description="조회할 카테고리. 빈 문자열이면 전체 예산 현황을 보여줍니다.",
    )


@tool(args_schema=SetBudgetInput)
async def set_budget(category: str, amount: int) -> str:
    """월별 예산을 카테고리별로 설정합니다.

    예산을 설정하면 지출 기록 시 자동으로 예산 대비 사용률을 알려드립니다.
    """
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    pool = get_pool()
    profile = await profile_repo.get_by_telegram_id(pool, telegram_id=user_id)
    if not profile:
        return "프로필 정보를 찾을 수 없어요."

    preferences = profile.get("preferences", {}) or {}
    budget = preferences.get("budget", {})
    budget[category] = amount
    preferences["budget"] = budget

    await profile_repo.update_preferences(pool, telegram_id=user_id, preferences=preferences)

    return f"{category} 월 예산을 {amount:,}원으로 설정했어요."


@tool(args_schema=GetBudgetStatusInput)
async def get_budget_status(category: str = "") -> str:
    """현재 예산 대비 지출 현황을 조회합니다.

    카테고리를 지정하면 해당 카테고리만, 비워두면 전체 예산 현황을 보여줍니다.
    """
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    pool = get_pool()
    profile = await profile_repo.get_by_telegram_id(pool, telegram_id=user_id)
    if not profile:
        return "프로필 정보를 찾을 수 없어요."

    preferences = profile.get("preferences", {}) or {}
    budget = preferences.get("budget", {})

    if not budget:
        return "설정된 예산이 없어요. set_budget으로 예산을 설정해 주세요."

    now = datetime.now()
    month = now.strftime("%Y-%m")

    if category:
        budget_amount = budget.get(category)
        if budget_amount is None:
            return f"{category} 카테고리에 설정된 예산이 없어요."

        spent = await finance_repo.get_monthly_total(
            pool, user_id=user_id, category=category, month=month,
        )
        pct = (spent / budget_amount * 100) if budget_amount > 0 else 0
        status = _budget_status_emoji(pct)
        return f"{category} 예산 현황: {spent:,}원 / {budget_amount:,}원 ({pct:.0f}%) {status}"

    # Show all categories.
    lines = ["이번 달 예산 현황:"]
    for cat, budget_amount in budget.items():
        spent = await finance_repo.get_monthly_total(
            pool, user_id=user_id, category=cat, month=month,
        )
        pct = (spent / budget_amount * 100) if budget_amount > 0 else 0
        status = _budget_status_emoji(pct)
        lines.append(f"  {cat}: {spent:,}원 / {budget_amount:,}원 ({pct:.0f}%) {status}")

    return "\n".join(lines)


def _budget_status_emoji(percentage: float) -> str:
    """Return a status indicator based on budget usage percentage."""
    if percentage >= 100:
        return "(초과!)"
    if percentage >= 80:
        return "(주의)"
    return ""
