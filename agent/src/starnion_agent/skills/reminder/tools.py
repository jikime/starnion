"""Simple reminder management tools.

Allows users to set, list, and delete one-time reminders.
Reminders are stored in the knowledge_base table with a "reminder:" key prefix
and polled by the Gateway scheduler.
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

REMINDER_KEY_PREFIX = "reminder:"
MAX_ACTIVE_REMINDERS = 20


class SetReminderInput(BaseModel):
    """Input schema for set_reminder tool."""

    message: str = Field(description="알림 메시지")
    remind_at: str = Field(
        description="알림 시각 (YYYY-MM-DD HH:MM 형식, KST)",
    )
    title: str = Field(default="", description="알림 제목 (선택)")


class ListRemindersInput(BaseModel):
    """Input schema for list_reminders tool."""

    include_done: bool = Field(
        default=False,
        description="완료/취소된 알림도 포함할지 여부",
    )


class DeleteReminderInput(BaseModel):
    """Input schema for delete_reminder tool."""

    reminder_id: str = Field(description="삭제할 알림 ID")


def _parse_json(value: str) -> dict:
    """Safely parse a JSON string."""
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return {}


@tool(args_schema=SetReminderInput)
@skill_guard("reminder")
async def set_reminder(
    message: str,
    remind_at: str,
    title: str = "",
) -> str:
    """알림을 예약합니다. 지정된 시간에 메시지를 보내드립니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    if not message or not message.strip():
        return "알림 메시지를 입력해 주세요."

    # Parse remind_at.
    try:
        remind_dt = datetime.strptime(remind_at.strip(), "%Y-%m-%d %H:%M")
    except ValueError:
        return "시간 형식이 올바르지 않아요. YYYY-MM-DD HH:MM 형식으로 입력해 주세요."

    # Reject past times.
    if remind_dt < datetime.now():
        return "과거 시간에는 알림을 설정할 수 없어요."

    pool = get_pool()

    # Check active reminder count.
    existing = await knowledge_repo.get_by_key_prefix(pool, user_id, REMINDER_KEY_PREFIX)
    active_count = sum(
        1 for e in existing if _parse_json(e["value"]).get("status") == "active"
    )
    if active_count >= MAX_ACTIVE_REMINDERS:
        return (
            f"활성 알림은 최대 {MAX_ACTIVE_REMINDERS}개까지 설정할 수 있어요. "
            "기존 알림을 삭제한 후 다시 시도해 주세요."
        )

    reminder_id = uuid.uuid4().hex[:8]
    now = datetime.now()

    reminder_data = {
        "title": title or message[:30],
        "message": message,
        "remind_at": remind_at.strip(),
        "status": "active",
        "created_at": now.isoformat(timespec="seconds"),
    }

    await knowledge_repo.upsert(
        pool,
        user_id=user_id,
        key=f"{REMINDER_KEY_PREFIX}{reminder_id}",
        value=json.dumps(reminder_data, ensure_ascii=False),
        source="user_chat",
    )

    display_title = title if title else message[:30]
    lines = [
        f"알림을 설정했어요! '{display_title}'",
        f"알림 ID: {reminder_id}",
        f"시간: {remind_at.strip()} (KST)",
        f"메시지: {message[:50]}{'...' if len(message) > 50 else ''}",
    ]
    return "\n".join(lines)


@tool(args_schema=ListRemindersInput)
@skill_guard("reminder")
async def list_reminders(include_done: bool = False) -> str:
    """예약된 알림 목록을 조회합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    pool = get_pool()
    entries = await knowledge_repo.get_by_key_prefix(pool, user_id, REMINDER_KEY_PREFIX)

    if not entries:
        return "예약된 알림이 없어요. 알림을 설정해 보세요!"

    lines = []
    for entry in entries:
        data = _parse_json(entry["value"])
        if not data:
            continue

        status = data.get("status", "unknown")
        if not include_done and status != "active":
            continue

        reminder_id = entry["key"].replace(REMINDER_KEY_PREFIX, "")
        title = data.get("title", "")
        remind_at = data.get("remind_at", "")
        message = data.get("message", "")

        status_label = {
            "active": "활성",
            "completed": "완료",
            "cancelled": "취소",
        }.get(status, status)

        line = f"[{status_label}] {title} (ID: {reminder_id})"
        line += f"\n  시간: {remind_at}"
        if message:
            msg_preview = message[:40]
            line += f"\n  메시지: {msg_preview}{'...' if len(message) > 40 else ''}"

        lines.append(line)

    if not lines:
        return "활성 알림이 없어요."

    return "\n\n".join(lines)


@tool(args_schema=DeleteReminderInput)
@skill_guard("reminder")
async def delete_reminder(reminder_id: str) -> str:
    """예약된 알림을 삭제합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    pool = get_pool()
    key = f"{REMINDER_KEY_PREFIX}{reminder_id}"
    entry = await knowledge_repo.get_by_key(pool, user_id, key)

    if not entry:
        return f"알림 ID '{reminder_id}'를 찾을 수 없어요."

    data = _parse_json(entry["value"])
    if not data:
        return "알림 데이터를 읽을 수 없어요."

    if data.get("status") != "active":
        return f"이 알림은 이미 '{data.get('status')}' 상태예요."

    data["status"] = "cancelled"

    await knowledge_repo.delete_by_key(pool, user_id, key)
    await knowledge_repo.upsert(
        pool,
        user_id=user_id,
        key=key,
        value=json.dumps(data, ensure_ascii=False),
        source="user_chat",
    )

    return f"'{data.get('title', '')}' 알림을 삭제했어요."
