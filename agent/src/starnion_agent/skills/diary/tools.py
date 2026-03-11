"""Daily log tools for recording diary entries."""

from datetime import date

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starnion_agent.context import get_current_user
from starnion_agent.db.pool import get_pool
from starnion_agent.db.repositories import daily_log as daily_log_repo
from starnion_agent.db.repositories import diary_entry as diary_entry_repo
from starnion_agent.embedding.service import embed_text
from starnion_agent.skills.guard import skill_guard
from starnion_agent.skills.memory.auto_tag import schedule_auto_tag

# Canonical mood values recognised by the UI (wellness page MOOD_CONFIG).
# Any free-form sentiment string from the LLM is mapped to one of these.
_VALID_MOODS = {"매우좋음", "좋음", "보통", "나쁨", "매우나쁨"}

_MOOD_ALIASES: dict[str, str] = {
    # 매우좋음
    "매우좋음": "매우좋음", "매우 좋음": "매우좋음", "최고": "매우좋음",
    "행복": "매우좋음", "기쁨": "매우좋음", "신남": "매우좋음", "흥분": "매우좋음",
    "설렘": "매우좋음", "즐거움": "매우좋음", "뿌듯": "매우좋음",
    "great": "매우좋음", "excellent": "매우좋음", "amazing": "매우좋음",
    "happy": "매우좋음", "joyful": "매우좋음",
    # 좋음
    "좋음": "좋음", "좋아": "좋음", "괜찮음": "좋음", "평온": "좋음",
    "편안": "좋음", "안정": "좋음", "산뜻": "좋음",
    "good": "좋음", "nice": "좋음", "calm": "좋음", "peaceful": "좋음",
    # 보통
    "보통": "보통", "그냥": "보통", "무난": "보통", "중립": "보통",
    "neutral": "보통", "okay": "보통", "ok": "보통", "normal": "보통",
    # 나쁨
    "나쁨": "나쁨", "안좋음": "나쁨", "피곤": "나쁨", "지침": "나쁨",
    "스트레스": "나쁨", "슬픔": "나쁨", "슬프다": "나쁨", "우울": "나쁨",
    "화남": "나쁨", "짜증": "나쁨", "걱정": "나쁨", "불안": "나쁨",
    "sad": "나쁨", "tired": "나쁨", "stressed": "나쁨", "bad": "나쁨",
    "anxious": "나쁨", "angry": "나쁨", "worried": "나쁨",
    # 매우나쁨
    "매우나쁨": "매우나쁨", "매우 나쁨": "매우나쁨", "최악": "매우나쁨",
    "절망": "매우나쁨", "힘듦": "매우나쁨", "너무힘듦": "매우나쁨",
    "terrible": "매우나쁨", "awful": "매우나쁨", "depressed": "매우나쁨",
}


def _normalize_mood(raw: str) -> str:
    """Map a free-form mood/sentiment string to one of the 5 canonical values."""
    if not raw:
        return "보통"
    key = raw.strip().lower()
    if raw.strip() in _VALID_MOODS:
        return raw.strip()
    return _MOOD_ALIASES.get(key, _MOOD_ALIASES.get(raw.strip(), "보통"))


class SaveDailyLogInput(BaseModel):
    """Input schema for save_daily_log tool."""

    content: str = Field(
        description="기록할 일상 내용 (예: '오늘 회의가 길었어', '날씨가 좋아서 산책했다')",
    )
    sentiment: str = Field(
        default="",
        description="감정 상태 (매우좋음/좋음/보통/나쁨/매우나쁨 또는 기쁨·피곤·슬픔 등 자유 형식). 비워두면 자동 분석합니다.",
    )


class SaveDiaryEntryInput(BaseModel):
    """Input schema for save_diary_entry tool."""

    content: str = Field(description="일기 내용")
    title: str = Field(default="", description="제목 (선택)")
    mood: str = Field(
        default="보통",
        description="기분 상태 (매우좋음/좋음/보통/나쁨/매우나쁨 또는 기쁨·피곤·슬픔·화남 등 자유 형식)",
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
    """사용자의 일상 기록을 저장합니다.

    일상 대화, 컨디션, 기분, 하루 일과 등을 기록합니다.
    AI 메모리(daily_logs)와 다이어리 UI(diary_entries) 모두에 저장됩니다.
    """
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    pool = get_pool()
    embedding = await embed_text(content)

    # Save to AI memory (daily_logs)
    await daily_log_repo.create(
        pool,
        user_id=user_id,
        content=content,
        sentiment=sentiment,
        embedding=embedding,
    )

    # Also save to diary_entries so it appears in the Diary UI
    mood = _normalize_mood(sentiment)
    title = content[:50] + ("…" if len(content) > 50 else "")
    await diary_entry_repo.create(
        pool,
        user_id=user_id,
        content=content,
        title=title,
        mood=mood,
        tags=[],
        entry_date=None,
        embedding=embedding,
    )

    # Auto-tag the saved diary entry (fire-and-forget)
    diary_row = await diary_entry_repo.list_entries(pool, user_id, limit=1)
    if diary_row:
        schedule_auto_tag(user_id, "diary", diary_row[0]["id"], title, content)

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

    # Normalise mood to one of the 5 canonical values recognised by the UI
    mood = _normalize_mood(mood)

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

    # Auto-tag the saved diary entry (fire-and-forget)
    schedule_auto_tag(user_id, "diary", entry["id"], title, content)

    result_date = entry.get("entry_date", parsed_date or date.today())
    lines = [f"일기를 저장했어요! ({result_date})"]
    if title:
        lines.append(f"제목: {title}")
    lines.append(f"기분: {mood}")
    if tags:
        lines.append(f"태그: {', '.join(tags)}")

    return "\n".join(lines)
