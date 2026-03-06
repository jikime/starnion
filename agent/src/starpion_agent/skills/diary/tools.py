"""Daily log tools for recording diary entries."""

from datetime import date

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starpion_agent.context import get_current_user
from starpion_agent.db.pool import get_pool
from starpion_agent.db.repositories import daily_log as daily_log_repo
from starpion_agent.db.repositories import diary_entry as diary_entry_repo
from starpion_agent.embedding.service import embed_text
from starpion_agent.skills.guard import skill_guard


class SaveDailyLogInput(BaseModel):
    """Input schema for save_daily_log tool."""

    content: str = Field(
        description="기록할 일상 내용 (예: '오늘 회의가 길었어', '날씨가 좋아서 산책했다')",
    )
    sentiment: str = Field(
        default="",
        description="감정 상태 (예: 좋음, 보통, 나쁨, 피곤, 기쁨). 비워두면 자동 분석합니다.",
    )


class SaveDiaryEntryInput(BaseModel):
    """Input schema for save_diary_entry tool."""

    content: str = Field(description="일기 내용")
    title: str = Field(default="", description="제목 (선택)")
    mood: str = Field(
        default="보통",
        description="기분 상태 (예: 좋음, 보통, 나쁨, 피곤, 기쁨, 슬픔, 화남)",
    )
    tags: list[str] = Field(
        default_factory=list,
        description="태그 목록 (예: ['운동', '가족', '업무'])",
    )
    entry_date: str = Field(
        default="",
        description="날짜 (YYYY-MM-DD). 비워두면 오늘 날짜로 저장됩니다.",
    )


@tool(args_schema=SaveDailyLogInput)
@skill_guard("diary")
async def save_daily_log(content: str, sentiment: str = "") -> str:
    """사용자의 일상 기록을 AI 메모리에 저장합니다.

    일상 대화, 컨디션, 기분, 하루 일과 등을 기록하면 나중에 맥락으로 활용합니다.
    구조화된 일기 항목은 save_diary_entry를 사용하세요.
    """
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    pool = get_pool()
    embedding = await embed_text(content)

    await daily_log_repo.create(
        pool,
        user_id=user_id,
        content=content,
        sentiment=sentiment,
        embedding=embedding,
    )

    if sentiment:
        return f"일상 기록을 저장했어요. (감정: {sentiment})"
    return "일상 기록을 저장했어요."


@tool(args_schema=SaveDiaryEntryInput)
@skill_guard("diary")
async def save_diary_entry(
    content: str,
    title: str = "",
    mood: str = "보통",
    tags: list[str] | None = None,
    entry_date: str = "",
) -> str:
    """구조화된 일기를 저장합니다.

    사용자가 오늘의 일기, 감정 일기, 성찰 기록 등을 남길 때 사용합니다.
    다이어리 메뉴에서 볼 수 있도록 diary_entries 테이블에 저장하고,
    추후 RAG 검색을 위해 AI 메모리(daily_logs)에도 동시에 기록합니다.
    """
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    pool = get_pool()

    # Parse entry_date
    parsed_date: date | None = None
    if entry_date:
        try:
            from datetime import datetime
            parsed_date = datetime.strptime(entry_date.strip(), "%Y-%m-%d").date()
        except ValueError:
            return "날짜 형식이 올바르지 않아요. YYYY-MM-DD 형식으로 입력해 주세요."

    embedding = await embed_text(content)

    # Save to diary_entries (user-facing, shown in UI)
    entry = await diary_entry_repo.create(
        pool,
        user_id=user_id,
        content=content,
        title=title,
        mood=mood,
        tags=tags or [],
        entry_date=parsed_date,
        embedding=embedding,
    )

    # Save to daily_logs (AI memory for RAG retrieval)
    ai_content = f"[일기] {title + ': ' if title else ''}{content}"
    await daily_log_repo.create(
        pool,
        user_id=user_id,
        content=ai_content,
        sentiment=mood,
        embedding=embedding,
    )

    result_date = entry.get("entry_date", parsed_date or date.today())
    lines = [f"일기를 저장했어요! ({result_date})"]
    if title:
        lines.append(f"제목: {title}")
    lines.append(f"기분: {mood}")
    if tags:
        lines.append(f"태그: {', '.join(tags)}")

    return "\n".join(lines)
