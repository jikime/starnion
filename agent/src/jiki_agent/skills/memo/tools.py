"""Simple memo management tools.

Allows users to save, list, and delete text memos.
Memos are stored in the knowledge_base table with a "memo:" key prefix.
"""

import json
import logging
import uuid
from datetime import datetime

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from jiki_agent.context import get_current_user
from jiki_agent.db.pool import get_pool
from jiki_agent.db.repositories import knowledge as knowledge_repo
from jiki_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

MEMO_KEY_PREFIX = "memo:"
MAX_MEMOS = 100
MAX_CONTENT_LENGTH = 2000


class SaveMemoInput(BaseModel):
    """Input schema for save_memo tool."""

    content: str = Field(description="메모 내용")
    title: str = Field(default="", description="메모 제목 (선택)")
    tag: str = Field(default="", description="메모 태그 (선택, 예: 업무, 개인)")


class ListMemosInput(BaseModel):
    """Input schema for list_memos tool."""

    tag: str = Field(default="", description="특정 태그로 필터링 (빈 값이면 전체)")
    limit: int = Field(default=10, description="조회 개수 (1-50)")


class DeleteMemoInput(BaseModel):
    """Input schema for delete_memo tool."""

    memo_id: str = Field(description="삭제할 메모 ID")


def _parse_json(value: str) -> dict:
    """Safely parse a JSON string."""
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return {}


@tool(args_schema=SaveMemoInput)
@skill_guard("memo")
async def save_memo(
    content: str,
    title: str = "",
    tag: str = "",
) -> str:
    """메모를 저장합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    if not content or not content.strip():
        return "메모 내용을 입력해 주세요."

    if len(content) > MAX_CONTENT_LENGTH:
        return f"메모가 너무 길어요. {MAX_CONTENT_LENGTH}자 이하로 입력해 주세요."

    pool = get_pool()

    # Check memo count.
    existing = await knowledge_repo.get_by_key_prefix(pool, user_id, MEMO_KEY_PREFIX)
    if len(existing) >= MAX_MEMOS:
        return (
            f"메모는 최대 {MAX_MEMOS}개까지 저장할 수 있어요. "
            "기존 메모를 삭제한 후 다시 시도해 주세요."
        )

    memo_id = uuid.uuid4().hex[:8]
    now = datetime.now()

    memo_data = {
        "title": title.strip() if title else content.strip()[:30],
        "content": content.strip(),
        "tag": tag.strip(),
        "created_at": now.isoformat(timespec="seconds"),
    }

    await knowledge_repo.upsert(
        pool,
        user_id=user_id,
        key=f"{MEMO_KEY_PREFIX}{memo_id}",
        value=json.dumps(memo_data, ensure_ascii=False),
        source="user_chat",
    )

    display_title = memo_data["title"]
    lines = [
        f"메모를 저장했어요! (ID: {memo_id})",
        f"제목: {display_title}",
    ]
    if tag.strip():
        lines.append(f"태그: {tag.strip()}")

    return "\n".join(lines)


@tool(args_schema=ListMemosInput)
@skill_guard("memo")
async def list_memos(tag: str = "", limit: int = 10) -> str:
    """저장된 메모 목록을 조회합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    limit = max(1, min(limit, 50))

    pool = get_pool()
    entries = await knowledge_repo.get_by_key_prefix(pool, user_id, MEMO_KEY_PREFIX)

    if not entries:
        return "저장된 메모가 없어요. 메모를 저장해 보세요!"

    # Parse and filter.
    items: list[tuple[str, str]] = []
    for entry in entries:
        data = _parse_json(entry["value"])
        if not data:
            continue

        # Tag filter.
        if tag.strip() and data.get("tag", "").lower() != tag.strip().lower():
            continue

        memo_id = entry["key"].replace(MEMO_KEY_PREFIX, "")
        title = data.get("title", "")
        content = data.get("content", "")
        memo_tag = data.get("tag", "")
        created = data.get("created_at", "")

        line = f"🗒️ {title} (ID: {memo_id})"
        if memo_tag:
            line += f" [{memo_tag}]"
        content_preview = content[:50]
        line += f"\n  {content_preview}{'...' if len(content) > 50 else ''}"
        if created:
            line += f"\n  작성: {created[:16]}"

        items.append((created, line))

    if not items:
        if tag.strip():
            return f"'{tag.strip()}' 태그의 메모가 없어요."
        return "저장된 메모가 없어요."

    # Sort by created_at descending (newest first).
    items.sort(key=lambda x: x[0], reverse=True)

    # Apply limit.
    items = items[:limit]

    total_msg = f"(총 {len(entries)}개 중 {len(items)}개 표시)"
    return "\n\n".join(line for _, line in items) + f"\n\n{total_msg}"


@tool(args_schema=DeleteMemoInput)
@skill_guard("memo")
async def delete_memo(memo_id: str) -> str:
    """메모를 삭제합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    pool = get_pool()
    key = f"{MEMO_KEY_PREFIX}{memo_id}"
    entry = await knowledge_repo.get_by_key(pool, user_id, key)

    if not entry:
        return f"메모 ID '{memo_id}'를 찾을 수 없어요."

    data = _parse_json(entry["value"])
    title = data.get("title", memo_id) if data else memo_id

    await knowledge_repo.delete_by_key(pool, user_id, key)

    return f"'{title}' 메모를 삭제했어요."
