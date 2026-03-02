"""ReAct agent setup with LangGraph and Gemini.

Uses a custom StateGraph instead of create_react_agent to support
dynamic tool binding — LLM only sees tools for enabled skills.
"""

import logging
from typing import Any

from langchain_core.messages import SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.graph import END, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition

from jiki_agent.config import settings
from jiki_agent.context import get_current_user
from jiki_agent.db.pool import get_pool
from jiki_agent.db.repositories import profile as profile_repo
from jiki_agent.db.repositories import skill as skill_repo
from jiki_agent.persona import DEFAULT_PERSONA, build_system_prompt
from jiki_agent.skills.audio.tools import generate_audio, transcribe_audio
from jiki_agent.skills.budget.tools import get_budget_status, set_budget
from jiki_agent.skills.diary.tools import save_daily_log
from jiki_agent.skills.documents.tools import generate_document, parse_document
from jiki_agent.skills.finance.tools import get_monthly_total, save_finance
from jiki_agent.skills.goals.tools import get_goals, set_goal, update_goal_status
from jiki_agent.skills.image.tools import analyze_image, edit_image, generate_image
from jiki_agent.skills.loader import (
    build_skill_catalog,
    build_skill_instructions,
    load_all_skill_docs,
)
from jiki_agent.skills.memory.tools import retrieve_memory
from jiki_agent.skills.google.tools import (
    google_auth,
    google_calendar_create,
    google_calendar_list,
    google_disconnect,
    google_docs_create,
    google_docs_read,
    google_drive_list,
    google_drive_upload,
    google_mail_list,
    google_mail_send,
    google_tasks_create,
    google_tasks_list,
)
from jiki_agent.skills.registry import SKILLS
from jiki_agent.skills.schedule.tools import (
    cancel_schedule,
    create_schedule,
    list_schedules,
)
from jiki_agent.skills.video.tools import analyze_video, generate_video
from jiki_agent.skills.weather.tools import get_forecast, get_weather
from jiki_agent.skills.summarize.tools import summarize_text, summarize_url
from jiki_agent.skills.translate.tools import translate_text
from jiki_agent.skills.qrcode.tools import generate_qrcode
from jiki_agent.skills.calculator.tools import calculate
from jiki_agent.skills.reminder.tools import (
    delete_reminder,
    list_reminders,
    set_reminder,
)
from jiki_agent.skills.currency.tools import convert_currency, get_exchange_rate
from jiki_agent.skills.dday.tools import delete_dday, list_ddays, set_dday
from jiki_agent.skills.random.tools import random_pick
from jiki_agent.skills.memo.tools import delete_memo, list_memos, save_memo
from jiki_agent.skills.unitconv.tools import convert_unit
from jiki_agent.skills.timezone.tools import convert_timezone, get_world_time
from jiki_agent.skills.wordcount.tools import count_text
from jiki_agent.skills.encode.tools import encode_decode
from jiki_agent.skills.hash.tools import generate_hash
from jiki_agent.skills.color.tools import convert_color
from jiki_agent.skills.horoscope.tools import get_horoscope
from jiki_agent.skills.ip.tools import lookup_ip
from jiki_agent.skills.websearch.tools import web_fetch, web_search

logger = logging.getLogger(__name__)

# Module-level reference for cleanup during shutdown.
_checkpointer_cm: Any = None

# All available tools — ToolNode holds all, but LLM only sees enabled subset.
ALL_TOOLS = [
    save_finance,
    get_monthly_total,
    retrieve_memory,
    save_daily_log,
    set_budget,
    get_budget_status,
    analyze_image,
    generate_image,
    edit_image,
    parse_document,
    generate_document,
    transcribe_audio,
    generate_audio,
    analyze_video,
    generate_video,
    set_goal,
    get_goals,
    update_goal_status,
    create_schedule,
    list_schedules,
    cancel_schedule,
    google_auth,
    google_disconnect,
    google_calendar_create,
    google_calendar_list,
    google_docs_create,
    google_docs_read,
    google_tasks_create,
    google_tasks_list,
    google_drive_upload,
    google_drive_list,
    google_mail_send,
    google_mail_list,
    web_search,
    web_fetch,
    get_weather,
    get_forecast,
    summarize_url,
    summarize_text,
    translate_text,
    generate_qrcode,
    calculate,
    set_reminder,
    list_reminders,
    delete_reminder,
    convert_currency,
    get_exchange_rate,
    set_dday,
    list_ddays,
    delete_dday,
    random_pick,
    save_memo,
    list_memos,
    delete_memo,
    convert_unit,
    get_world_time,
    convert_timezone,
    count_text,
    encode_decode,
    generate_hash,
    convert_color,
    get_horoscope,
    lookup_ip,
]

# Module-level LLM instance (set during create_agent).
_llm: ChatGoogleGenerativeAI | None = None


async def _get_enabled_context(user_id: str | None) -> tuple[str, list[str], str, str]:
    """Query user persona and enabled skills in a single pass.

    Returns:
        (persona_id, enabled_tool_names, catalog_text, instructions_text)
    """
    persona_id = DEFAULT_PERSONA
    enabled_tool_names: list[str] = []
    catalog_text = ""
    instructions_text = ""

    if not user_id:
        return persona_id, enabled_tool_names, catalog_text, instructions_text

    pool = get_pool()

    # Persona preference.
    prof = await profile_repo.get_by_telegram_id(pool, user_id)
    if prof:
        prefs = prof.get("preferences") or {}
        persona_id = prefs.get("persona", DEFAULT_PERSONA)

    # Enabled skills (single DB query).
    enabled = await skill_repo.get_enabled_skills(pool, user_id)

    # Collect enabled tool names.
    for sid in enabled:
        skill_def = SKILLS.get(sid)
        if skill_def:
            enabled_tool_names.extend(skill_def.tools)

    # Progressive disclosure: SKILL.md parsing.
    skill_docs = load_all_skill_docs(enabled)
    catalog_text = build_skill_catalog(skill_docs)
    instructions_text = build_skill_instructions(skill_docs)

    return persona_id, enabled_tool_names, catalog_text, instructions_text


def _build_prompt(
    persona_id: str,
    enabled_tool_names: list[str],
    catalog_text: str,
    instructions_text: str,
) -> str:
    """Assemble the system prompt with progressive skill disclosure."""
    prompt_text = build_system_prompt(persona_id)

    # Level 1: Skill catalog (name + description for awareness).
    if catalog_text:
        prompt_text += "\n\n" + catalog_text

    # OpenClaw: tell LLM which tools are available.
    if enabled_tool_names:
        prompt_text += f"\n\n## 사용 가능한 도구\n{', '.join(enabled_tool_names)}"
        prompt_text += "\n위 목록에 없는 도구는 절대 호출하지 마세요."

    # Level 2: Full instructions (tool usage guidelines).
    if instructions_text:
        prompt_text += "\n\n" + instructions_text

    return prompt_text


async def _agent_node(state: MessagesState) -> dict:
    """LLM node with dynamic tool binding.

    On each invocation:
      1. Queries the user's enabled skills (single DB round-trip).
      2. Builds a system prompt with progressive disclosure.
      3. Binds **only** the enabled tools to the LLM — the model
         literally cannot see or call disabled tools.
      4. Invokes the model and returns the response.
    """
    assert _llm is not None, "LLM not initialised — call create_agent() first"

    user_id = get_current_user()

    try:
        persona_id, enabled_tool_names, catalog_text, instructions_text = (
            await _get_enabled_context(user_id)
        )
    except Exception:
        logger.debug("Failed to load persona/skills, using defaults", exc_info=True)
        persona_id = DEFAULT_PERSONA
        enabled_tool_names = []
        catalog_text = ""
        instructions_text = ""

    # Build system prompt.
    prompt_text = _build_prompt(
        persona_id, enabled_tool_names, catalog_text, instructions_text,
    )
    messages = [SystemMessage(content=prompt_text)] + state["messages"]

    # Dynamic tool binding: LLM only sees enabled tools.
    if enabled_tool_names:
        enabled_tools = [t for t in ALL_TOOLS if t.name in set(enabled_tool_names)]
    else:
        # Fallback: no user context → bind all tools.
        enabled_tools = ALL_TOOLS

    bound_model = _llm.bind_tools(enabled_tools)
    response = await bound_model.ainvoke(messages)

    return {"messages": [response]}


async def create_agent(database_url: str):
    """Create and return the ReAct agent graph with checkpointer.

    Uses a custom StateGraph for dynamic tool binding instead of
    create_react_agent, which statically binds all tools at creation.

    Args:
        database_url: PostgreSQL connection string for the checkpointer.

    Returns:
        The compiled LangGraph agent.
    """
    global _checkpointer_cm, _llm

    _llm = ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=settings.gemini_api_key,
    )

    # ToolNode holds ALL tools so it can execute any tool the LLM invokes.
    # (Even if dynamic binding is bypassed, skill_guard acts as safety net.)
    tool_node = ToolNode(ALL_TOOLS)

    # Build the graph.
    builder = StateGraph(MessagesState)
    builder.add_node("agent", _agent_node)
    builder.add_node("tools", tool_node)
    builder.set_entry_point("agent")
    builder.add_conditional_edges("agent", tools_condition)
    builder.add_edge("tools", "agent")

    # Checkpointer for conversation persistence.
    _checkpointer_cm = AsyncPostgresSaver.from_conn_string(database_url)
    checkpointer: AsyncPostgresSaver = await _checkpointer_cm.__aenter__()
    await checkpointer.setup()

    agent = builder.compile(checkpointer=checkpointer)

    return agent


async def close_checkpointer() -> None:
    """Close the checkpointer connection pool."""
    global _checkpointer_cm
    if _checkpointer_cm is not None:
        await _checkpointer_cm.__aexit__(None, None, None)
        _checkpointer_cm = None
