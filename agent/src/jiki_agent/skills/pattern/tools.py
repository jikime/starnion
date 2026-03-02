"""Pattern analysis for Level 2 proactive notifications.

Analyzes user spending and behavior patterns via LLM, stores results in
knowledge_base, and generates personalized insight notifications.
"""

import json
import logging
import re
from datetime import datetime

from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from jiki_agent.config import settings
from jiki_agent.db.pool import get_pool
from jiki_agent.db.repositories import daily_log as daily_log_repo
from jiki_agent.db.repositories import finance as finance_repo
from jiki_agent.db.repositories import knowledge as knowledge_repo
from jiki_agent.db.repositories import profile as profile_repo
from jiki_agent.persona import DEFAULT_PERSONA, get_tone_instruction

logger = logging.getLogger(__name__)

PATTERN_KEY = "pattern:analysis_result"

WEEKDAY_NAMES = {
    1: "월요일",
    2: "화요일",
    3: "수요일",
    4: "목요일",
    5: "금요일",
    6: "토요일",
    7: "일요일",
}


async def analyze_patterns(user_id: str) -> str:
    """Analyze user spending/behavior patterns and store in knowledge_base.

    Called daily via gRPC GenerateReport(report_type="pattern_analysis").
    Results are stored but NOT sent to the user.
    """
    pool = get_pool()

    # 1. Collect spending data.
    daily_totals = await finance_repo.get_daily_totals(pool, user_id, days=30)
    weekday_spending = await finance_repo.get_weekday_spending(pool, user_id, days=60)
    recent_records = await finance_repo.get_recent(pool, user_id, limit=100)

    now = datetime.now()
    month = now.strftime("%Y-%m")
    monthly = await finance_repo.get_monthly_summary(pool, user_id=user_id, month=month)

    # 2. Collect sentiment data from daily_logs.
    recent_logs = await daily_log_repo.get_recent(pool, user_id, limit=30)

    # 2b. Collect conversation analysis insights from knowledge_base.
    conversation_insights = await knowledge_repo.get_by_key_prefix(
        pool, user_id, "conversation:analysis:",
    )

    # 3. Check minimum data requirement.
    if len(daily_totals) < 7:
        logger.info(
            "User %s has insufficient data for pattern analysis (%d days)",
            user_id,
            len(daily_totals),
        )
        return "데이터 부족: 최소 7일 이상의 기록이 필요합니다."

    # 4. Build data summary for LLM.
    data_summary = _build_analysis_data(
        daily_totals, weekday_spending, recent_records, monthly, recent_logs,
        conversation_insights,
    )

    # 5. Call LLM for structured pattern detection.
    llm = ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=settings.gemini_api_key,
    )

    prompt = _build_analysis_prompt(data_summary)
    response = await llm.ainvoke([HumanMessage(content=prompt)])

    # 6. Parse and store patterns.
    patterns_json = _extract_json(response.content)
    if patterns_json:
        await knowledge_repo.delete_by_key(pool, user_id, PATTERN_KEY)
        await knowledge_repo.upsert(
            pool,
            user_id=user_id,
            key=PATTERN_KEY,
            value=json.dumps(patterns_json, ensure_ascii=False),
            source="pattern_analyzer",
        )
        pattern_count = len(patterns_json.get("patterns", []))
        logger.info("Stored %d patterns for user %s", pattern_count, user_id)
        return f"패턴 분석 완료: {pattern_count}개 패턴 감지"

    logger.warning("Failed to parse pattern analysis for user %s", user_id)
    return "패턴 분석 결과를 파싱할 수 없었습니다."


async def generate_pattern_insight(user_id: str) -> str:
    """Generate a personalized notification based on stored patterns.

    Called via gRPC GenerateReport(report_type="pattern_insight").
    """
    pool = get_pool()

    # 1. Read stored patterns.
    pattern_entry = await knowledge_repo.get_by_key(pool, user_id, PATTERN_KEY)
    if not pattern_entry:
        return ""

    try:
        patterns_data = json.loads(pattern_entry["value"])
    except (json.JSONDecodeError, KeyError):
        return ""

    patterns = patterns_data.get("patterns", [])
    if not patterns:
        return ""

    # 2. Get current spending context.
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_records = await finance_repo.get_weekly_summary(
        pool, user_id=user_id, start_date=today_start, end_date=now,
    )

    month = now.strftime("%Y-%m")
    monthly = await finance_repo.get_monthly_summary(pool, user_id=user_id, month=month)

    # Budget and persona info.
    profile = await profile_repo.get_by_telegram_id(pool, telegram_id=user_id)
    budget = {}
    persona_id = DEFAULT_PERSONA
    if profile:
        preferences = profile.get("preferences", {}) or {}
        budget = preferences.get("budget", {})
        persona_id = preferences.get("persona", DEFAULT_PERSONA)

    # 3. Build prompt and generate insight.
    llm = ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=settings.gemini_api_key,
    )

    prompt = _build_insight_prompt(patterns, today_records, monthly, budget, now, persona_id)
    response = await llm.ainvoke([HumanMessage(content=prompt)])
    return response.content


# --- Private helpers ---


def _build_analysis_data(
    daily_totals: list[dict],
    weekday_spending: list[dict],
    recent_records: list[dict],
    monthly: list[dict],
    recent_logs: list[dict],
    conversation_insights: list[dict] | None = None,
) -> str:
    """Build a text summary of user data for the LLM pattern analysis prompt."""
    lines: list[str] = []

    # Daily totals.
    lines.append("[최근 일별 지출]")
    for d in daily_totals[:30]:
        lines.append(f"  {d['date']}: {d['total']:,}원")

    # Weekday patterns.
    lines.append("\n[요일별 카테고리 평균 지출 (최근 60일)]")
    for w in weekday_spending:
        day_name = WEEKDAY_NAMES.get(w["weekday"], str(w["weekday"]))
        lines.append(
            f"  {day_name} - {w['category']}: 평균 {w['avg_amount']:,}원 ({w['total_count']}건)"
        )

    # Recent transactions (last 20 for context).
    lines.append("\n[최근 거래 내역 (최근 20건)]")
    for r in recent_records[:20]:
        created = r["created_at"]
        date_str = created.strftime("%m/%d %a") if hasattr(created, "strftime") else str(created)
        lines.append(f"  {date_str}: {r['category']} {r['amount']:,}원 - {r.get('description', '')}")

    # Monthly summary.
    lines.append("\n[이번 달 카테고리별 지출]")
    if monthly:
        for m in monthly:
            lines.append(f"  {m['category']}: {m['total']:,}원")
    else:
        lines.append("  기록 없음")

    # Sentiment from daily logs.
    if recent_logs:
        lines.append("\n[최근 일기/감정 기록]")
        for log in recent_logs[:10]:
            sentiment = log.get("sentiment", "")
            created = log["created_at"]
            date_str = created.strftime("%m/%d") if hasattr(created, "strftime") else str(created)
            content_preview = log["content"][:80]
            sentiment_str = f" [{sentiment}]" if sentiment else ""
            lines.append(f"  {date_str}{sentiment_str}: {content_preview}")

    # Conversation analysis insights.
    if conversation_insights:
        lines.append("\n[대화 분석 인사이트 (최근)]")
        for entry in conversation_insights[:7]:
            try:
                data = json.loads(entry["value"])
                date_key = entry["key"].replace("conversation:analysis:", "")
                mood = data.get("overall_mood", "")
                topics = ", ".join(data.get("topics", []))
                lines.append(f"  {date_key} ({mood}): {topics}")
                for insight in data.get("insights", [])[:3]:
                    lines.append(
                        f"    - [{insight.get('type', '')}] {insight.get('summary', '')}"
                    )
            except (json.JSONDecodeError, KeyError):
                continue

    return "\n".join(lines)


def _build_analysis_prompt(data_summary: str) -> str:
    """Build the LLM prompt for structured pattern analysis."""
    return (
        "당신은 재정 패턴 분석 전문가입니다. "
        "아래 사용자의 지출 및 행동 데이터를 분석하여 반복 패턴을 감지하세요.\n\n"
        "반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):\n"
        "```json\n"
        "{\n"
        '  "patterns": [\n'
        "    {\n"
        '      "type": "day_of_week_spending | recurring_payment | spending_velocity | emotional_trend",\n'
        '      "description": "사용자에게 보낼 한국어 설명 (1-2문장)",\n'
        '      "trigger": {\n'
        '        "day_of_week": "monday|tuesday|wednesday|thursday|friday|saturday|sunday (해당 시)",\n'
        '        "day_of_month_from": 1,\n'
        '        "day_of_month_to": 5,\n'
        '        "always": false\n'
        "      },\n"
        '      "category": "관련 카테고리 (해당 시)",\n'
        '      "confidence": 0.85\n'
        "    }\n"
        "  ]\n"
        "}\n"
        "```\n\n"
        "감지할 패턴 유형:\n"
        "1. day_of_week_spending: 특정 요일에 반복되는 지출 패턴 (예: 금요일 외식)\n"
        "2. recurring_payment: 매월 특정 기간에 반복되는 결제 (예: 월초 구독료)\n"
        "3. spending_velocity: 최근 지출 속도가 평소 대비 크게 다름 (trigger.always=true)\n"
        "4. emotional_trend: 감정/스트레스 패턴 변화 (일기 데이터 기반, trigger.always=true)\n\n"
        "규칙:\n"
        "- confidence가 0.6 미만인 패턴은 제외\n"
        "- 최대 5개 패턴까지만 반환\n"
        "- 데이터가 부족하면 빈 patterns 배열 반환\n"
        "- day_of_week는 영어 소문자로 (monday, tuesday, ...)\n"
        "- trigger 필드에서 해당 안 되는 필드는 생략\n\n"
        f"데이터:\n{data_summary}"
    )


def _build_insight_prompt(
    patterns: list[dict],
    today_records: list[dict],
    monthly: list[dict],
    budget: dict,
    now: datetime,
    persona_id: str = DEFAULT_PERSONA,
) -> str:
    """Build the LLM prompt for generating a personalized pattern insight notification."""
    lines: list[str] = []

    # Pattern descriptions.
    lines.append("[감지된 패턴]")
    for i, p in enumerate(patterns, 1):
        lines.append(f"  {i}. [{p.get('type', '')}] {p.get('description', '')}")
        if p.get("category"):
            lines.append(f"     카테고리: {p['category']}")

    # Today's spending.
    lines.append(f"\n[오늘 지출 ({now.strftime('%Y-%m-%d %A')})]")
    if today_records:
        total = sum(r["total"] for r in today_records)
        lines.append(f"  합계: {total:,}원")
        for r in today_records:
            lines.append(f"  {r['category']}: {r['total']:,}원 ({r['count']}건)")
    else:
        lines.append("  아직 지출 없음")

    # Budget status.
    if budget and monthly:
        lines.append("\n[예산 현황]")
        monthly_by_cat = {r["category"]: r["total"] for r in monthly}
        for cat, amt in budget.items():
            spent = monthly_by_cat.get(cat, 0)
            pct = (spent / amt * 100) if amt > 0 else 0
            lines.append(f"  {cat}: {spent:,}원 / {amt:,}원 ({pct:.0f}%)")

    data_summary = "\n".join(lines)

    tone = get_tone_instruction(persona_id)

    return (
        f"당신은 개인 재정 AI 비서 '지기'입니다.\n{tone}\n\n"
        "사용자의 지출 패턴을 바탕으로 오늘 도움이 될 만한 맞춤 알림을 작성해주세요.\n\n"
        "포함할 내용:\n"
        "1. 감지된 패턴 중 오늘과 관련 있는 내용 언급\n"
        "2. 구체적인 숫자나 카테고리 포함\n"
        "3. 실용적인 제안이나 질문\n\n"
        "길이: 2-3문장으로 짧고 자연스럽게. 이모지는 적절히 1-2개만 사용.\n\n"
        f"데이터:\n{data_summary}"
    )


def _extract_json(text: str) -> dict | None:
    """Extract JSON from LLM response, handling markdown code blocks."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    return None
