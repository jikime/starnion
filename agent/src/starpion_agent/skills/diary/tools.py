"""Daily log tools for recording diary entries."""

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starpion_agent.context import get_current_user
from starpion_agent.db.pool import get_pool
from starpion_agent.db.repositories import daily_log as daily_log_repo
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


@tool(args_schema=SaveDailyLogInput)
@skill_guard("diary")
async def save_daily_log(content: str, sentiment: str = "") -> str:
    """사용자의 일상 기록을 저장합니다.

    일상 대화, 컨디션, 기분, 하루 일과 등을 기록하면 나중에 맥락으로 활용합니다.
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
