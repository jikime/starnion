"""Conversation analysis for background idle-time processing.

Analyzes today's daily_logs to extract insights (spending intent, emotional state,
key decisions) and stores results in knowledge_base for later retrieval by
pattern analysis and other features.
"""

import json
import logging
import re
from datetime import datetime

from langchain_core.messages import HumanMessage

from starnion_agent.db.pool import get_pool
from starnion_agent.db.repositories import daily_log as daily_log_repo
from starnion_agent.db.repositories import knowledge as knowledge_repo
from starnion_agent.persona import LANGUAGE_INSTRUCTIONS, get_prompt_strings

logger = logging.getLogger(__name__)

CONVERSATION_KEY_PREFIX = "conversation:analysis:"


async def analyze_conversation(user_id: str, language: str = "ko") -> str:
    """Analyze today's conversations and store insights in knowledge_base.

    Called via gRPC GenerateReport(report_type="conversation_analysis").
    Background-only: results are stored but NOT sent to the user.

    Args:
        user_id: UUID of the user.
        language: Response language code (``"ko"``, ``"en"``, ``"ja"``, ``"zh"``).
            Defaults to ``"ko"`` for backward compatibility.

    Returns:
        A summary string for logging.
    """
    pool = get_pool()

    # 1. Get today's daily logs.
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    today_logs = await daily_log_repo.get_by_date_range(
        pool, user_id, start_date=today_start, end_date=now,
    )

    if not today_logs:
        return "오늘 대화 기록 없음"

    if len(today_logs) < 2:
        return "분석하기에 대화가 부족합니다 (최소 2건)"

    # 2. Build data summary.
    logs_text = _build_logs_summary(today_logs, now)

    # 3. Call LLM for structured analysis.
    from starnion_agent.graph.agent import get_llm_for_use_case  # lazy to avoid circular
    try:
        llm = await get_llm_for_use_case(user_id, "report")
    except RuntimeError:
        return "AI 프로바이더가 설정되지 않아 대화 분석을 생성할 수 없습니다."

    prompt = _build_conversation_analysis_prompt(logs_text, language=language)
    try:
        response = await llm.ainvoke([HumanMessage(content=prompt)])
    except Exception as e:
        logger.warning("LLM call failed in analyze_conversation for user %s: %s", user_id, e)
        return get_prompt_strings(language)["error_try_later"]

    # 4. Parse and store insights.
    insights_json = _extract_json(response.content)
    if insights_json:
        today_key = f"{CONVERSATION_KEY_PREFIX}{now.strftime('%Y-%m-%d')}"

        await knowledge_repo.delete_by_key(pool, user_id, today_key)
        await knowledge_repo.upsert(
            pool,
            user_id=user_id,
            key=today_key,
            value=json.dumps(insights_json, ensure_ascii=False),
            source="conversation_analyzer",
        )

        insight_count = len(insights_json.get("insights", []))
        logger.info(
            "Stored %d conversation insights for user %s", insight_count, user_id,
        )
        return f"대화 분석 완료: {insight_count}개 인사이트 추출"

    logger.warning("Failed to parse conversation analysis for user %s", user_id)
    return "대화 분석 결과를 파싱할 수 없었습니다."


def _build_logs_summary(logs: list[dict], now: datetime) -> str:
    """Build a text summary of today's daily logs."""
    lines = [f"[오늘 대화 기록 ({now.strftime('%Y-%m-%d')})]"]
    for log_entry in logs:
        created = log_entry["created_at"]
        time_str = (
            created.strftime("%H:%M") if hasattr(created, "strftime") else str(created)
        )
        sentiment = log_entry.get("sentiment", "")
        sentiment_str = f" [{sentiment}]" if sentiment else ""
        content = log_entry["content"]
        lines.append(f"  {time_str}{sentiment_str}: {content}")
    return "\n".join(lines)


def _build_conversation_analysis_prompt(logs_text: str, language: str = "ko") -> str:
    """Build the LLM prompt for conversation analysis.

    Args:
        logs_text: Text summary of today's daily logs.
        language: Response language code (ko, en, ja, zh). Defaults to "ko".
    """
    lang_instruction = LANGUAGE_INSTRUCTIONS.get(language, LANGUAGE_INSTRUCTIONS["ko"])
    return (
        f"{lang_instruction}\n\n"
        "당신은 사용자 대화 분석 전문가입니다. "
        "아래 오늘의 대화/일기 기록을 분석하여 핵심 인사이트를 추출하세요.\n\n"
        "반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):\n"
        "```json\n"
        "{\n"
        '  "insights": [\n'
        "    {\n"
        '      "type": "spending_intent | emotional_state | key_decision | life_event | financial_concern",\n'
        '      "summary": "한국어 요약 (1문장)",\n'
        '      "detail": "상세 내용 (2-3문장)",\n'
        '      "confidence": 0.85\n'
        "    }\n"
        "  ],\n"
        '  "overall_mood": "positive | neutral | negative | mixed",\n'
        '  "topics": ["주제1", "주제2"]\n'
        "}\n"
        "```\n\n"
        "추출할 인사이트 유형:\n"
        "1. spending_intent: 지출 의향이나 구매 계획 (예: '노트북 사려고 고민 중')\n"
        "2. emotional_state: 감정/스트레스 상태 변화 (예: '회사 스트레스로 지침')\n"
        "3. key_decision: 재정 관련 중요 결정 (예: '저축 늘리기로 결심')\n"
        "4. life_event: 재정에 영향 줄 수 있는 생활 이벤트 (예: '이사 예정')\n"
        "5. financial_concern: 재정 걱정이나 불안 (예: '이번 달 지출이 너무 많은 것 같아')\n\n"
        "규칙:\n"
        "- confidence가 0.5 미만인 인사이트는 제외\n"
        "- 최대 5개 인사이트까지만 반환\n"
        "- 대화 내용이 재정과 무관하면 emotional_state만 추출\n"
        "- topics는 최대 3개\n\n"
        f"데이터:\n{logs_text}"
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
