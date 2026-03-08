"""Memory compaction for long-term storage optimization.

Summarizes old daily_logs (30+ days) into weekly summaries stored in
knowledge_base, then deletes the original log entries to reduce storage
while preserving semantic memory.
"""

import json
import logging
import re
from datetime import datetime, timedelta

from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from starnion_agent.config import settings
from starnion_agent.db.pool import get_pool
from starnion_agent.skills.gemini_key import get_gemini_api_key
from starnion_agent.db.repositories import daily_log as daily_log_repo
from starnion_agent.db.repositories import knowledge as knowledge_repo
from starnion_agent.embedding.service import embed_text

logger = logging.getLogger(__name__)

MEMORY_KEY_PREFIX = "memory:weekly_summary:"


async def compact_memory(user_id: str) -> str:
    """Compact old daily logs into weekly summaries.

    Called via gRPC GenerateReport(report_type="memory_compaction").
    Background-only: operates silently.

    Safety protocol:
    1. Fetch all logs older than 30 days
    2. Group by week (Monday-Sunday)
    3. Summarize each week via LLM
    4. Store ALL summaries in knowledge_base first
    5. Only THEN delete original logs
    6. If any summary fails, abort entire deletion

    Returns:
        A summary string for logging.
    """
    pool = get_pool()

    # 1. Get logs older than 30 days.
    now = datetime.now()
    cutoff = now - timedelta(days=30)
    very_old = now - timedelta(days=365)

    old_logs = await daily_log_repo.get_by_date_range(
        pool, user_id, start_date=very_old, end_date=cutoff,
    )

    if len(old_logs) < 7:
        return f"압축 대상 부족: {len(old_logs)}개 로그 (최소 7개 필요)"

    # 2. Group logs by week.
    weekly_groups = _group_logs_by_week(old_logs)

    if not weekly_groups:
        return "주별 그룹이 없습니다."

    # 3. Summarize each week and collect results.
    api_key = await get_gemini_api_key(user_id)
    if not api_key:
        return "Gemini API 키가 설정되지 않아 메모리 압축을 건너뜁니다."

    llm = ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=api_key,
    )

    summaries: list[tuple[str, str, list[int]]] = []  # (key, summary_json, log_ids)
    all_ids_to_delete: list[int] = []

    for week_label, logs in sorted(weekly_groups.items()):
        if len(logs) < 2:
            continue

        prompt = _build_compaction_prompt(logs, week_label)
        try:
            response = await llm.ainvoke([HumanMessage(content=prompt)])
        except Exception:
            logger.exception(
                "Memory compaction: LLM failed for week %s, user %s. Aborting.",
                week_label, user_id,
            )
            return f"LLM 오류로 압축 중단 (주: {week_label})"

        summary_json = _extract_json(response.content)
        if not summary_json:
            logger.warning(
                "Memory compaction: failed to parse summary for week %s, user %s. Aborting.",
                week_label, user_id,
            )
            return f"요약 파싱 실패로 압축 중단 (주: {week_label})"

        key = f"{MEMORY_KEY_PREFIX}{week_label}"
        summary_value = json.dumps(summary_json, ensure_ascii=False)
        log_ids = [log_entry["id"] for log_entry in logs]

        summaries.append((key, summary_value, log_ids))
        all_ids_to_delete.extend(log_ids)

    if not summaries:
        return "압축할 주간 데이터가 없습니다."

    # 4. Store ALL summaries first (idempotent via delete_by_key + upsert).
    for key, summary_value, _ids in summaries:
        embedding = await embed_text(summary_value[:500])

        await knowledge_repo.delete_by_key(pool, user_id, key)
        await knowledge_repo.upsert(
            pool,
            user_id=user_id,
            key=key,
            value=summary_value,
            source="memory_compactor",
            embedding=embedding,
        )

    logger.info(
        "Stored %d weekly summaries for user %s, proceeding to delete %d logs",
        len(summaries), user_id, len(all_ids_to_delete),
    )

    # 5. Delete original logs only after all summaries are safely stored.
    deleted = await daily_log_repo.delete_by_ids(pool, user_id, all_ids_to_delete)

    return (
        f"메모리 압축 완료: {len(summaries)}주 요약 생성, "
        f"{deleted}개 로그 삭제 (원본 {len(all_ids_to_delete)}개)"
    )


def _group_logs_by_week(logs: list[dict]) -> dict[str, list[dict]]:
    """Group daily logs by ISO week (Monday start).

    Returns dict mapping 'YYYY-Www' labels to log lists.
    """
    groups: dict[str, list[dict]] = {}
    for log_entry in logs:
        created = log_entry["created_at"]
        if hasattr(created, "isocalendar"):
            iso = created.isocalendar()
            week_label = f"{iso[0]}-W{iso[1]:02d}"
        else:
            continue
        groups.setdefault(week_label, []).append(log_entry)
    return groups


def _build_compaction_prompt(logs: list[dict], week_label: str) -> str:
    """Build the LLM prompt for weekly log summarization."""
    lines = [f"[{week_label} 일기/대화 기록]"]
    for log_entry in logs:
        created = log_entry["created_at"]
        date_str = (
            created.strftime("%m/%d %a") if hasattr(created, "strftime") else str(created)
        )
        sentiment = log_entry.get("sentiment", "")
        sentiment_str = f" [{sentiment}]" if sentiment else ""
        lines.append(f"  {date_str}{sentiment_str}: {log_entry['content']}")

    logs_text = "\n".join(lines)

    return (
        "당신은 개인 기록 요약 전문가입니다. "
        "아래의 1주일간 일기/대화 기록을 읽고 핵심 내용을 요약하세요.\n\n"
        "반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):\n"
        "```json\n"
        "{\n"
        f'  "week": "{week_label}",\n'
        '  "summary": "이 주의 전체 요약 (2-3문장)",\n'
        '  "key_events": ["핵심 이벤트1", "핵심 이벤트2"],\n'
        '  "emotional_trend": "positive | neutral | negative | mixed",\n'
        '  "financial_context": "재정 관련 맥락 요약. 없으면 빈 문자열",\n'
        '  "topics": ["주제1", "주제2"]\n'
        "}\n"
        "```\n\n"
        "규칙:\n"
        "- 원본 기록의 핵심만 보존 (세부사항은 생략 가능)\n"
        "- key_events는 최대 5개\n"
        "- topics는 최대 3개\n"
        "- 재정과 관련 없는 내용도 emotional_trend는 반드시 포함\n"
        "- 개인정보(이름, 장소)는 일반화하지 말고 그대로 보존\n\n"
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
