"""Report generation tools for weekly/monthly financial summaries."""

from datetime import datetime, timedelta

from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from jiki_agent.config import settings
from jiki_agent.db.pool import get_pool
from jiki_agent.db.repositories import finance as finance_repo
from jiki_agent.db.repositories import profile as profile_repo


async def generate_weekly_report(user_id: str) -> str:
    """Generate a natural-language weekly financial report for *user_id*.

    This is called by the gRPC GenerateReport RPC (triggered by cron).
    """
    pool = get_pool()

    now = datetime.now()
    week_start = now - timedelta(days=now.weekday())  # Monday
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
    week_end = now

    # Current week spending by category.
    weekly = await finance_repo.get_weekly_summary(
        pool, user_id=user_id, start_date=week_start, end_date=week_end,
    )

    # Previous week for comparison.
    prev_start = week_start - timedelta(days=7)
    prev_end = week_start
    prev_weekly = await finance_repo.get_weekly_summary(
        pool, user_id=user_id, start_date=prev_start, end_date=prev_end,
    )

    # Month-to-date totals.
    month = now.strftime("%Y-%m")
    monthly = await finance_repo.get_monthly_summary(pool, user_id=user_id, month=month)

    # Budget info.
    profile = await profile_repo.get_by_telegram_id(pool, telegram_id=user_id)
    budget = {}
    if profile:
        preferences = profile.get("preferences", {}) or {}
        budget = preferences.get("budget", {})

    # Build data summary for LLM.
    data_lines = [f"기간: {week_start.strftime('%Y-%m-%d')} ~ {week_end.strftime('%Y-%m-%d')}"]
    data_lines.append("\n[이번 주 지출]")
    if weekly:
        total = sum(r["total"] for r in weekly)
        data_lines.append(f"합계: {total:,}원")
        for r in weekly:
            data_lines.append(f"  {r['category']}: {r['total']:,}원 ({r['count']}건)")
    else:
        data_lines.append("기록 없음")

    data_lines.append("\n[지난 주 지출]")
    if prev_weekly:
        prev_total = sum(r["total"] for r in prev_weekly)
        data_lines.append(f"합계: {prev_total:,}원")
        for r in prev_weekly:
            data_lines.append(f"  {r['category']}: {r['total']:,}원 ({r['count']}건)")
    else:
        data_lines.append("기록 없음")

    data_lines.append(f"\n[이번 달 누적 ({month})]")
    if monthly:
        month_total = sum(r["total"] for r in monthly)
        data_lines.append(f"합계: {month_total:,}원")
        for r in monthly:
            data_lines.append(f"  {r['category']}: {r['total']:,}원")
    else:
        data_lines.append("기록 없음")

    if budget:
        data_lines.append("\n[예산 설정]")
        for cat, amt in budget.items():
            data_lines.append(f"  {cat}: {amt:,}원/월")

    data_summary = "\n".join(data_lines)

    llm = ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=settings.gemini_api_key,
    )

    prompt = (
        "당신은 개인 재정 AI 비서 '지기'입니다. "
        "아래 사용자의 주간 재정 데이터를 바탕으로 친근하고 간결한 주간 리포트를 작성해주세요.\n\n"
        "포함할 내용:\n"
        "1. 이번 주 총 지출과 카테고리별 분석\n"
        "2. 지난 주 대비 변화 (증가/감소)\n"
        "3. 이번 달 누적 현황\n"
        "4. 예산 대비 사용률 (예산이 설정된 경우)\n"
        "5. 한 줄 조언\n\n"
        f"데이터:\n{data_summary}"
    )

    response = await llm.ainvoke([HumanMessage(content=prompt)])
    return response.content
