"""Report generation for weekly/monthly/daily financial summaries."""

from datetime import datetime, timedelta

from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from starpion_agent.config import settings
from starpion_agent.db.pool import get_pool
from starpion_agent.db.repositories import finance as finance_repo
from starpion_agent.db.repositories import profile as profile_repo
from starpion_agent.persona import DEFAULT_PERSONA, get_tone_instruction


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

    # Budget and persona info.
    profile = await profile_repo.get_by_uuid_id(pool, uuid_id=user_id)
    budget = {}
    persona_id = DEFAULT_PERSONA
    if profile:
        preferences = profile.get("preferences", {}) or {}
        budget = preferences.get("budget", {})
        persona_id = preferences.get("persona", DEFAULT_PERSONA)

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

    tone = get_tone_instruction(persona_id)
    prompt = (
        f"당신은 개인 재정 AI 비서 '지기'입니다.\n{tone}\n\n"
        "아래 사용자의 주간 재정 데이터를 바탕으로 간결한 주간 리포트를 작성해주세요.\n\n"
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


async def generate_daily_summary(user_id: str) -> str:
    """Generate a natural-language daily spending summary for *user_id*.

    Called by the gRPC GenerateReport RPC with report_type="daily_summary".
    """
    pool = get_pool()

    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = now

    # Today's spending by category.
    today_records = await finance_repo.get_weekly_summary(
        pool, user_id=user_id, start_date=today_start, end_date=today_end,
    )

    # Budget and persona info.
    profile = await profile_repo.get_by_uuid_id(pool, uuid_id=user_id)
    budget = {}
    persona_id = DEFAULT_PERSONA
    if profile:
        preferences = profile.get("preferences", {}) or {}
        budget = preferences.get("budget", {})
        persona_id = preferences.get("persona", DEFAULT_PERSONA)

    # Build data summary.
    data_lines = [f"날짜: {now.strftime('%Y-%m-%d (%A)')}"]
    data_lines.append("\n[오늘 지출]")
    if today_records:
        total = sum(r["total"] for r in today_records)
        data_lines.append(f"합계: {total:,}원 ({sum(r['count'] for r in today_records)}건)")
        for r in today_records:
            data_lines.append(f"  {r['category']}: {r['total']:,}원 ({r['count']}건)")
    else:
        data_lines.append("오늘은 지출 기록이 없어요.")

    if budget:
        data_lines.append("\n[예산 현황]")
        # Current month spending for budget comparison.
        month = now.strftime("%Y-%m")
        monthly = await finance_repo.get_monthly_summary(pool, user_id=user_id, month=month)
        monthly_by_cat = {r["category"]: r["total"] for r in monthly} if monthly else {}
        for cat, amt in budget.items():
            spent = monthly_by_cat.get(cat, 0)
            pct = (spent / amt * 100) if amt > 0 else 0
            data_lines.append(f"  {cat}: {spent:,}원 / {amt:,}원 ({pct:.0f}%)")

    data_summary = "\n".join(data_lines)

    llm = ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=settings.gemini_api_key,
    )

    tone = get_tone_instruction(persona_id)
    prompt = (
        f"당신은 개인 재정 AI 비서 '지기'입니다.\n{tone}\n\n"
        "아래 사용자의 오늘 하루 지출 데이터를 바탕으로 간결한 일간 요약을 작성해주세요.\n\n"
        "포함할 내용:\n"
        "1. 오늘 총 지출과 카테고리별 분석\n"
        "2. 예산 대비 사용률 (예산이 설정된 경우)\n"
        "3. 한 줄 응원이나 조언\n\n"
        "길이: 2-3문단으로 짧게.\n\n"
        f"데이터:\n{data_summary}"
    )

    response = await llm.ainvoke([HumanMessage(content=prompt)])
    return response.content


async def generate_monthly_closing(user_id: str) -> str:
    """Generate a month-end closing report for *user_id*.

    Called by the gRPC GenerateReport RPC with report_type="monthly_closing".
    """
    pool = get_pool()

    now = datetime.now()
    month = now.strftime("%Y-%m")

    # This month's spending.
    monthly = await finance_repo.get_monthly_summary(pool, user_id=user_id, month=month)

    # Previous month for comparison.
    if now.month == 1:
        prev_month = f"{now.year - 1}-12"
    else:
        prev_month = f"{now.year}-{now.month - 1:02d}"
    prev_monthly = await finance_repo.get_monthly_summary(pool, user_id=user_id, month=prev_month)

    # Budget and persona info.
    profile = await profile_repo.get_by_uuid_id(pool, uuid_id=user_id)
    budget = {}
    persona_id = DEFAULT_PERSONA
    if profile:
        preferences = profile.get("preferences", {}) or {}
        budget = preferences.get("budget", {})
        persona_id = preferences.get("persona", DEFAULT_PERSONA)

    # Build data summary.
    data_lines = [f"마감 월: {month}"]

    data_lines.append("\n[이번 달 지출]")
    if monthly:
        total = sum(r["total"] for r in monthly)
        data_lines.append(f"합계: {total:,}원")
        for r in monthly:
            data_lines.append(f"  {r['category']}: {r['total']:,}원")
    else:
        data_lines.append("기록 없음")

    data_lines.append(f"\n[지난 달 ({prev_month}) 지출]")
    if prev_monthly:
        prev_total = sum(r["total"] for r in prev_monthly)
        data_lines.append(f"합계: {prev_total:,}원")
        for r in prev_monthly:
            data_lines.append(f"  {r['category']}: {r['total']:,}원")
    else:
        data_lines.append("기록 없음")

    if budget:
        data_lines.append("\n[예산 대비 사용률]")
        monthly_by_cat = {r["category"]: r["total"] for r in monthly} if monthly else {}
        for cat, amt in budget.items():
            spent = monthly_by_cat.get(cat, 0)
            pct = (spent / amt * 100) if amt > 0 else 0
            status = "✅ 예산 내" if pct <= 100 else "❌ 초과"
            data_lines.append(f"  {cat}: {spent:,}원 / {amt:,}원 ({pct:.0f}%) {status}")

    data_summary = "\n".join(data_lines)

    llm = ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=settings.gemini_api_key,
    )

    tone = get_tone_instruction(persona_id)
    prompt = (
        f"당신은 개인 재정 AI 비서 '지기'입니다.\n{tone}\n\n"
        "아래 사용자의 월간 데이터를 바탕으로 이번 달 마감 요약 리포트를 작성해주세요.\n\n"
        "포함할 내용:\n"
        "1. 이번 달 총 지출과 카테고리별 분석\n"
        "2. 지난 달 대비 변화 (증가/감소/유지)\n"
        "3. 예산 대비 사용률과 달성 여부 (예산이 설정된 경우)\n"
        "4. 잘한 점과 개선할 점\n"
        "5. 다음 달을 위한 한 줄 조언\n\n"
        f"데이터:\n{data_summary}"
    )

    response = await llm.ainvoke([HumanMessage(content=prompt)])
    return response.content
