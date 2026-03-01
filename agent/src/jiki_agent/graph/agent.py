"""ReAct agent setup with LangGraph and Gemini."""

from typing import Any

from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.prebuilt import create_react_agent

from jiki_agent.config import settings
from jiki_agent.tools.finance import get_monthly_total, save_finance

# Module-level reference for cleanup during shutdown.
_checkpointer_cm: Any = None

SYSTEM_PROMPT = """당신은 'jiki(지기)'입니다.
사용자의 디지털 트윈으로서 일상 속 의사결정 피로를 줄여주는 개인 AI 비서입니다.

핵심 역할:
- 사용자가 자연어로 말하는 수입/지출을 정확하게 파싱하여 기록합니다.
- 월별, 카테고리별 지출 현황을 친절하게 안내합니다.
- 항상 한국어로 응답하며, 친근하고 도움이 되는 톤을 유지합니다.

금액 파싱 규칙:
- "만원" = 10,000원
- "삼만오천원" = 35,000원
- "350만원" = 3,500,000원
- 금액이 명확하지 않으면 사용자에게 확인합니다.

카테고리 가이드:
- 식비: 식사, 간식, 카페, 배달, 음료
- 교통: 택시, 버스, 지하철, 주유, 주차
- 쇼핑: 의류, 전자제품, 생활용품
- 문화: 영화, 공연, 도서, 게임
- 의료: 병원, 약국, 건강
- 수입: 월급, 부수입, 용돈
- 구독: 넷플릭스, 유튜브, 앱 구독
- 기타: 분류가 어려운 항목

도구 사용 지침:
- 수입이나 지출 내용이 포함된 메시지 → save_finance 도구를 호출하세요.
- 월별 합계 또는 지출 현황 질문 → get_monthly_total 도구를 호출하세요.
- 일반 대화나 질문 → 도구 호출 없이 자연스럽게 대화하세요.
- 금액 없이 지출 언급만 있는 경우 → 금액을 물어보세요.

응답 스타일:
- 존댓말을 사용하되 딱딱하지 않게 (예: "~했어요", "~할게요")
- 간결하고 핵심적인 정보 제공
- 적절한 맥락 정보 추가 (누적 금액, 비율 등)
"""


async def create_agent(database_url: str):
    """Create and return the ReAct agent graph with checkpointer.

    Args:
        database_url: PostgreSQL connection string for the checkpointer.

    Returns:
        The compiled LangGraph agent.
    """
    global _checkpointer_cm

    llm = ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=settings.gemini_api_key,
    )

    tools = [
        save_finance,
        get_monthly_total,
    ]

    _checkpointer_cm = AsyncPostgresSaver.from_conn_string(database_url)
    checkpointer: AsyncPostgresSaver = await _checkpointer_cm.__aenter__()
    await checkpointer.setup()

    agent = create_react_agent(
        model=llm,
        tools=tools,
        checkpointer=checkpointer,
        state_modifier=SYSTEM_PROMPT,
    )

    return agent


async def close_checkpointer() -> None:
    """Close the checkpointer connection pool."""
    global _checkpointer_cm
    if _checkpointer_cm is not None:
        await _checkpointer_cm.__aexit__(None, None, None)
        _checkpointer_cm = None
