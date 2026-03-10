"""Simple memo management tools.

Allows users to save, list, and delete text memos.
Memos are stored in the dedicated memos table with vector embeddings
for hybrid RAG search.
"""

import logging

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starnion_agent.context import get_current_user
from starnion_agent.db.pool import get_pool
from starnion_agent.db.repositories import memo_db as memo_db_repo
from starnion_agent.embedding.service import embed_text
from starnion_agent.skills.guard import skill_guard
from starnion_agent.skills.memory.auto_tag import schedule_auto_tag

logger = logging.getLogger(__name__)

MAX_MEMOS = 100
MAX_CONTENT_LENGTH = 2000


class SaveMemoInput(BaseModel):
    """Input schema for save_memo tool."""

    content: str = Field(description="메모 내용")
    title: str = Field(default="", description="메모 제목 (선택)")
    tag: str = Field(default="개인", description="메모 태그 (예: 업무, 개인, 아이디어)")


class ListMemosInput(BaseModel):
    """Input schema for list_memos tool."""

    tag: str = Field(default="", description="특정 태그로 필터링 (빈 값이면 전체)")
    limit: int = Field(default=10, description="조회 개수 (1-50)")


class DeleteMemoInput(BaseModel):
    """Input schema for delete_memo tool."""

    memo_id: int = Field(description="삭제할 메모 ID (숫자)")


@tool(args_schema=SaveMemoInput)
@skill_guard("memo")
async def save_memo(
    content: str,
    title: str = "",
    tag: str = "개인",
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
    existing = await memo_db_repo.list_memos(pool, user_id, limit=MAX_MEMOS + 1)
    if len(existing) >= MAX_MEMOS:
        return (
            f"메모는 최대 {MAX_MEMOS}개까지 저장할 수 있어요. "
            "기존 메모를 삭제한 후 다시 시도해 주세요."
        )

    embedding = await embed_text(content)

    memo = await memo_db_repo.create(
        pool,
        user_id=user_id,
        content=content.strip(),
        title=title.strip(),
        tag=tag.strip() or "개인",
        embedding=embedding,
    )

    # Auto-tag the saved memo (fire-and-forget)
    schedule_auto_tag(user_id, "memo", memo["id"], memo["title"], content)

    lines = [
        f"메모를 저장했어요! (ID: {memo['id']})",
        f"제목: {memo['title']}",
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
    memos = await memo_db_repo.list_memos(pool, user_id, tag=tag.strip(), limit=limit)

    if not memos:
        if tag.strip():
            return f"'{tag.strip()}' 태그의 메모가 없어요."
        return "저장된 메모가 없어요. 메모를 저장해 보세요!"

    lines = []
    for memo in memos:
        line = f"🗒️ {memo['title']} (ID: {memo['id']})"
        if memo.get("tag"):
            line += f" [{memo['tag']}]"
        content = memo.get("content", "")
        content_preview = content[:50]
        line += f"\n  {content_preview}{'...' if len(content) > 50 else ''}"
        created = memo.get("created_at")
        if created:
            line += f"\n  작성: {str(created)[:16]}"
        lines.append(line)

    return "\n\n".join(lines)


@tool(args_schema=DeleteMemoInput)
@skill_guard("memo")
async def delete_memo(memo_id: int) -> str:
    """메모를 삭제합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    pool = get_pool()
    deleted = await memo_db_repo.delete(pool, user_id, memo_id)

    if not deleted:
        return f"메모 ID '{memo_id}'를 찾을 수 없어요."

    return f"메모(ID: {memo_id})를 삭제했어요."
