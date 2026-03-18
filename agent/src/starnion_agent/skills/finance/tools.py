"""Finance tracking tools for saving and querying expenses."""

from datetime import datetime

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starnion_agent.context import get_current_user
from starnion_agent.db.pool import get_pool
from starnion_agent.db.repositories import finance as finance_repo
from starnion_agent.db.repositories import profile as profile_repo
from starnion_agent.skills.guard import skill_guard


class SaveFinanceInput(BaseModel):
    """Input schema for save_finance tool."""

    category: str = Field(
        description="카테고리 (예: 식비, 교통, 쇼핑, 문화, 의료, 수입, 구독, 기타)",
    )
    amount: int = Field(
        description=(
            "금액 (원 단위 정수). "
            "지출(소비)은 반드시 음수로 입력 (예: 식비 12000원 → -12000). "
            "수입은 양수로 입력 (예: 월급 3000000원 → 3000000). "
            "사용자가 '썼어', '결제했어', '샀어' 등 소비 표현을 쓰면 무조건 음수."
        )
    )
    description: str = Field(default="", description="내역에 대한 간단한 설명")


class GetMonthlyTotalInput(BaseModel):
    """Input schema for get_monthly_total tool."""

    category: str = Field(
        default="",
        description="카테고리별 필터. 빈 문자열이면 전체 카테고리 합계를 반환합니다.",
    )


@tool(args_schema=SaveFinanceInput)
@skill_guard("finance")
async def save_finance(category: str, amount: int, description: str = "") -> str:
    """수입·지출 내역 기록. 사용자가 돈을 쓰거나 벌었다고 말하면 반드시 호출.

    한국어 트리거 (구어체 포함):
      '기록해', '기록해줘', '적어줘', '써줘',
      '썼어', '결제했어', '샀어', '지출했어', '소비했어', '사용했어',
      '밥 먹었어', '택시 탔어', '커피 샀어', '쇼핑했어',
      '수입 생겼어', '용돈 받았어', '월급 들어왔어', '돈 들어왔어',
      '가계부 써줘', '지출 기록', '수입 기록'
    영어: 'record expense', 'log spending', 'add income', 'spent', 'bought', 'paid for'
    일본어: '支出記録', '出費を記録', '収入記録', '買った' | 중국어: '记录支出', '记账', '花了', '消费'

    중요: amount 부호 규칙 —
    - 지출(식비, 교통, 쇼핑 등 소비)은 반드시 음수 (예: -12000)
    - 수입(월급, 용돈 등)은 양수 (예: 3000000)
    """
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

    display_amount = abs(amount)
    result = f"{category} {display_amount:,}원 기록했어요. 이번 달 {category} 누적: {monthly_total:,}원"

    # Check budget and warn if approaching/exceeding limit.
    profile = await profile_repo.get_by_uuid_id(pool, uuid_id=user_id)
    if profile:
        preferences = profile.get("preferences", {}) or {}
        budget = preferences.get("budget", {})
        budget_amount = budget.get(category)
        if budget_amount and budget_amount > 0:
            pct = monthly_total / budget_amount * 100
            if pct >= 100:
                result += f"\n⚠️ {category} 예산 {budget_amount:,}원을 초과했어요! ({pct:.0f}%)"
            elif pct >= 80:
                result += f"\n📊 {category} 예산의 {pct:.0f}%를 사용했어요. ({monthly_total:,}원 / {budget_amount:,}원)"

    return result


@tool(args_schema=GetMonthlyTotalInput)
@skill_guard("finance")
async def get_monthly_total(category: str = "") -> str:
    """이번 달 지출 현황 조회. ('이번 달 얼마 썼어', '지출 보여줘', '가계부 보여줘', 'monthly expenses', '今月の支出', '本月支出')"""
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
