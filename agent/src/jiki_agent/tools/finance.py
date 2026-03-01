"""Finance tracking tools for saving and querying expenses."""

from datetime import datetime

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from jiki_agent.db.pool import get_pool
from jiki_agent.db.repositories import finance as finance_repo

# ---------------------------------------------------------------------------
# Module-level current user tracking (MVP simplification)
# The telegram handler calls set_current_user() before invoking the agent.
# ---------------------------------------------------------------------------
_current_user_id: str = ""


def set_current_user(user_id: str) -> None:
    """Set the current user ID for tool invocations."""
    global _current_user_id
    _current_user_id = user_id


def get_current_user() -> str:
    """Return the current user ID."""
    return _current_user_id


# ---------------------------------------------------------------------------
# Pydantic input schemas (no Optional[T] -- use base types with defaults)
# ---------------------------------------------------------------------------
class SaveFinanceInput(BaseModel):
    """Input schema for save_finance tool."""

    category: str = Field(
        description="지출 카테고리 (예: 식비, 교통, 쇼핑, 문화, 의료, 수입, 구독, 기타)",
    )
    amount: int = Field(description="금액 (원 단위 정수)")
    description: str = Field(default="", description="지출에 대한 간단한 설명")


class GetMonthlyTotalInput(BaseModel):
    """Input schema for get_monthly_total tool."""

    category: str = Field(
        default="",
        description="카테고리별 필터. 빈 문자열이면 전체 카테고리 합계를 반환합니다.",
    )


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------
@tool(args_schema=SaveFinanceInput)
async def save_finance(category: str, amount: int, description: str = "") -> str:
    """수입이나 지출 내역을 기록합니다. 카테고리, 금액, 설명을 받아 저장합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요. 다시 시도해 주세요."

    pool = get_pool()
    now = datetime.now()
    month = now.strftime("%Y-%m")

    await finance_repo.create(
        pool,
        user_id=user_id,
        amount=amount,
        category=category,
        description=description,
    )

    monthly_total = await finance_repo.get_monthly_total(
        pool,
        user_id=user_id,
        category=category,
        month=month,
    )

    return f"{category} {amount:,}원 기록했어요. 이번 달 {category} 누적: {monthly_total:,}원"


@tool(args_schema=GetMonthlyTotalInput)
async def get_monthly_total(category: str = "") -> str:
    """이번 달 지출 현황을 조회합니다.

    카테고리를 지정하면 해당 카테고리만, 비워두면 전체를 보여줍니다.
    """
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요. 다시 시도해 주세요."

    pool = get_pool()
    now = datetime.now()
    month = now.strftime("%Y-%m")

    if category:
        total = await finance_repo.get_monthly_total(
            pool,
            user_id=user_id,
            category=category,
            month=month,
        )
        return f"이번 달 {category} 총 지출: {total:,}원"

    summary = await finance_repo.get_monthly_summary(
        pool,
        user_id=user_id,
        month=month,
    )

    if not summary:
        return "이번 달 기록된 지출이 없어요."

    grand_total = sum(row["total"] for row in summary)
    lines = [f"이번 달 총 지출: {grand_total:,}원"]
    for row in summary:
        lines.append(f"  - {row['category']}: {row['total']:,}원")
    return "\n".join(lines)
