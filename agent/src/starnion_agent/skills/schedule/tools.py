"""User-created schedule management tools.

Allows users to create, list, and cancel scheduled notifications via
natural language. Schedules are stored in the knowledge_base table
and polled by the Gateway scheduler every 15 minutes.
"""

import json
import logging
import uuid
from datetime import datetime

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starnion_agent.context import get_current_user
from starnion_agent.db.pool import get_pool
from starnion_agent.db.repositories import knowledge as knowledge_repo
from starnion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

SCHEDULE_KEY_PREFIX = "schedule:"
MAX_ACTIVE_SCHEDULES = 10
VALID_REPORT_TYPES = {
    "weekly",
    "daily_summary",
    "monthly_closing",
    "pattern_insight",
    "goal_status",
    "custom_reminder",
}
VALID_DAYS_OF_WEEK = {
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
}
DAY_NAMES_KO = {
    "monday": "월요일",
    "tuesday": "화요일",
    "wednesday": "수요일",
    "thursday": "목요일",
    "friday": "금요일",
    "saturday": "토요일",
    "sunday": "일요일",
}
REPORT_TYPE_NAMES_KO = {
    "weekly": "주간 리포트",
    "daily_summary": "일간 요약",
    "monthly_closing": "월간 마감",
    "pattern_insight": "패턴 인사이트",
    "goal_status": "목표 현황",
    "custom_reminder": "커스텀 알림",
}


class CreateScheduleInput(BaseModel):
    """Input schema for create_schedule tool."""

    title: str = Field(
        description="스케줄 제목 (예: '주간 리포트', '아침 알림')",
    )
    report_type: str = Field(
        description=(
            "알림 유형: weekly(주간 리포트), daily_summary(일간 요약), "
            "monthly_closing(월간 마감), pattern_insight(패턴 인사이트), "
            "goal_status(목표 현황), custom_reminder(커스텀 메시지)"
        ),
    )
    schedule_type: str = Field(
        description="스케줄 유형: one_time(1회) 또는 recurring(반복)",
    )
    hour: int = Field(
        description="발송 시각 (0-23, KST 기준)",
    )
    minute: int = Field(
        default=0,
        description="발송 분 (0-59)",
    )
    day_of_week: str = Field(
        default="",
        description="반복 요일 (recurring용): monday~sunday. 매일이면 빈 문자열",
    )
    date: str = Field(
        default="",
        description="1회 발송 날짜 (one_time용): YYYY-MM-DD",
    )
    message: str = Field(
        default="",
        description="커스텀 알림 메시지 (custom_reminder 전용)",
    )


class ListSchedulesInput(BaseModel):
    """Input schema for list_schedules tool."""

    include_completed: bool = Field(
        default=False,
        description="완료/취소된 스케줄도 포함할지 여부",
    )


class CancelScheduleInput(BaseModel):
    """Input schema for cancel_schedule tool."""

    schedule_id: str = Field(
        description="취소할 스케줄 ID (예: a1b2c3d4)",
    )


@tool(args_schema=CreateScheduleInput)
@skill_guard("schedule")
async def create_schedule(
    title: str,
    report_type: str,
    schedule_type: str,
    hour: int,
    minute: int = 0,
    day_of_week: str = "",
    date: str = "",
    message: str = "",
) -> str:
    """알림 스케줄을 생성합니다. 1회 또는 반복 알림을 예약할 수 있습니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    if report_type not in VALID_REPORT_TYPES:
        return (
            f"알림 유형이 올바르지 않아요. "
            f"가능한 유형: {', '.join(sorted(VALID_REPORT_TYPES))}"
        )

    if schedule_type not in ("one_time", "recurring"):
        return "스케줄 유형은 one_time(1회) 또는 recurring(반복)만 가능해요."

    if not (0 <= hour <= 23):
        return "시간은 0~23 사이여야 해요."
    if not (0 <= minute <= 59):
        return "분은 0~59 사이여야 해요."

    if day_of_week and day_of_week not in VALID_DAYS_OF_WEEK:
        return (
            f"요일이 올바르지 않아요. "
            f"가능한 요일: {', '.join(sorted(VALID_DAYS_OF_WEEK))}"
        )

    if schedule_type == "one_time":
        if not date:
            return "1회 알림은 날짜(YYYY-MM-DD)가 필요해요."
        try:
            datetime.strptime(date, "%Y-%m-%d")
        except ValueError:
            return "날짜 형식이 올바르지 않아요. YYYY-MM-DD 형식으로 입력해 주세요."

    if report_type == "custom_reminder" and not message:
        return "커스텀 알림은 메시지가 필요해요."

    pool = get_pool()

    existing = await knowledge_repo.get_by_key_prefix(pool, user_id, SCHEDULE_KEY_PREFIX)
    active_count = sum(
        1
        for e in existing
        if _parse_json(e["value"]).get("status") == "active"
    )
    if active_count >= MAX_ACTIVE_SCHEDULES:
        return (
            f"활성 스케줄은 최대 {MAX_ACTIVE_SCHEDULES}개까지 설정할 수 있어요. "
            "기존 스케줄을 취소한 후 다시 시도해 주세요."
        )

    schedule_id = uuid.uuid4().hex[:8]
    now = datetime.now()

    schedule_data = {
        "title": title,
        "type": schedule_type,
        "report_type": report_type,
        "schedule": {
            "hour": hour,
            "minute": minute,
            "day_of_week": day_of_week,
            "date": date,
        },
        "status": "active",
        "message": message,
        "last_sent": "",
        "created_at": now.isoformat(timespec="seconds"),
    }

    await knowledge_repo.upsert(
        pool,
        user_id=user_id,
        key=f"{SCHEDULE_KEY_PREFIX}{schedule_id}",
        value=json.dumps(schedule_data, ensure_ascii=False),
        source="user_chat",
    )

    type_name = REPORT_TYPE_NAMES_KO.get(report_type, report_type)
    time_str = f"{hour:02d}:{minute:02d}"

    if schedule_type == "recurring":
        if day_of_week:
            day_name = DAY_NAMES_KO.get(day_of_week, day_of_week)
            when_str = f"매주 {day_name} {time_str}"
        else:
            when_str = f"매일 {time_str}"
    else:
        when_str = f"{date} {time_str}"

    lines = [
        f"알림을 예약했어요! '{title}'",
        f"스케줄 ID: {schedule_id}",
        f"유형: {type_name}",
        f"발송: {when_str} (KST)",
    ]
    if message:
        lines.append(f"메시지: {message[:50]}{'...' if len(message) > 50 else ''}")

    return "\n".join(lines)


@tool(args_schema=ListSchedulesInput)
@skill_guard("schedule")
async def list_schedules(include_completed: bool = False) -> str:
    """예약된 알림 스케줄 목록을 조회합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    pool = get_pool()
    entries = await knowledge_repo.get_by_key_prefix(pool, user_id, SCHEDULE_KEY_PREFIX)

    if not entries:
        return "예약된 알림이 없어요. 알림을 예약해 보세요!"

    lines = []
    for entry in entries:
        data = _parse_json(entry["value"])
        if not data:
            continue

        status = data.get("status", "unknown")
        if not include_completed and status != "active":
            continue

        schedule_id = entry["key"].replace(SCHEDULE_KEY_PREFIX, "")
        title = data.get("title", "")
        report_type = data.get("report_type", "")
        sched = data.get("schedule", {})
        sched_type = data.get("type", "")

        status_label = {
            "active": "활성",
            "completed": "완료",
            "cancelled": "취소",
        }.get(status, status)

        type_name = REPORT_TYPE_NAMES_KO.get(report_type, report_type)
        time_str = f"{sched.get('hour', 0):02d}:{sched.get('minute', 0):02d}"

        if sched_type == "recurring":
            dow = sched.get("day_of_week", "")
            if dow:
                day_name = DAY_NAMES_KO.get(dow, dow)
                when_str = f"매주 {day_name} {time_str}"
            else:
                when_str = f"매일 {time_str}"
        else:
            when_str = f"{sched.get('date', '')} {time_str}"

        line = f"[{status_label}] {title} (ID: {schedule_id})"
        line += f"\n  유형: {type_name}"
        line += f"\n  발송: {when_str}"

        if data.get("message"):
            msg_preview = data["message"][:40]
            line += f"\n  메시지: {msg_preview}{'...' if len(data['message']) > 40 else ''}"

        lines.append(line)

    if not lines:
        return "활성 스케줄이 없어요."

    return "\n\n".join(lines)


@tool(args_schema=CancelScheduleInput)
@skill_guard("schedule")
async def cancel_schedule(schedule_id: str) -> str:
    """예약된 알림을 취소합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    pool = get_pool()
    key = f"{SCHEDULE_KEY_PREFIX}{schedule_id}"
    entry = await knowledge_repo.get_by_key(pool, user_id, key)

    if not entry:
        return f"스케줄 ID '{schedule_id}'를 찾을 수 없어요."

    data = _parse_json(entry["value"])
    if not data:
        return "스케줄 데이터를 읽을 수 없어요."

    if data.get("status") != "active":
        return f"이 스케줄은 이미 '{data.get('status')}' 상태예요."

    data["status"] = "cancelled"

    await knowledge_repo.delete_by_key(pool, user_id, key)
    await knowledge_repo.upsert(
        pool,
        user_id=user_id,
        key=key,
        value=json.dumps(data, ensure_ascii=False),
        source="user_chat",
    )

    return f"'{data.get('title', '')}' 알림을 취소했어요."


def _parse_json(value: str) -> dict:
    """Safely parse a JSON string."""
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return {}
