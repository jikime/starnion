"""ReAct agent setup with LangGraph and Gemini."""

import logging
from typing import Any

from langchain_core.messages import SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.prebuilt import create_react_agent

from jiki_agent.config import settings
from jiki_agent.context import get_current_user
from jiki_agent.db.pool import get_pool
from jiki_agent.db.repositories import profile as profile_repo
from jiki_agent.persona import DEFAULT_PERSONA, build_system_prompt
from jiki_agent.tools.budget import get_budget_status, set_budget
from jiki_agent.tools.daily_log import save_daily_log
from jiki_agent.tools.finance import get_monthly_total, save_finance
from jiki_agent.tools.goal import get_goals, set_goal, update_goal_status
from jiki_agent.tools.memory import retrieve_memory
from jiki_agent.tools.multimodal import process_document, process_image, process_voice

logger = logging.getLogger(__name__)

# Module-level reference for cleanup during shutdown.
_checkpointer_cm: Any = None


async def dynamic_prompt(state: dict) -> list:
    """Build a dynamic system prompt based on the user's persona setting.

    Reads the persona preference from the user's profile and constructs
    a system prompt with the appropriate response tone.  Falls back to
    the default persona on any error.

    Args:
        state: LangGraph state dict containing ``messages``.

    Returns:
        A list starting with a ``SystemMessage`` followed by the
        conversation messages.
    """
    persona_id = DEFAULT_PERSONA
    try:
        user_id = get_current_user()
        if user_id:
            pool = get_pool()
            prof = await profile_repo.get_by_telegram_id(pool, user_id)
            if prof:
                prefs = prof.get("preferences") or {}
                persona_id = prefs.get("persona", DEFAULT_PERSONA)
    except Exception:
        logger.debug("Failed to load persona, using default", exc_info=True)

    prompt_text = build_system_prompt(persona_id)
    return [SystemMessage(content=prompt_text)] + state["messages"]


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
        retrieve_memory,
        save_daily_log,
        set_budget,
        get_budget_status,
        process_image,
        process_document,
        process_voice,
        set_goal,
        get_goals,
        update_goal_status,
    ]

    _checkpointer_cm = AsyncPostgresSaver.from_conn_string(database_url)
    checkpointer: AsyncPostgresSaver = await _checkpointer_cm.__aenter__()
    await checkpointer.setup()

    agent = create_react_agent(
        model=llm,
        tools=tools,
        checkpointer=checkpointer,
        prompt=dynamic_prompt,
    )

    return agent


async def close_checkpointer() -> None:
    """Close the checkpointer connection pool."""
    global _checkpointer_cm
    if _checkpointer_cm is not None:
        await _checkpointer_cm.__aexit__(None, None, None)
        _checkpointer_cm = None
