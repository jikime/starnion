"""ReAct agent setup with LangGraph and Gemini.

Uses a custom StateGraph instead of create_react_agent to support
dynamic tool binding — LLM only sees tools for enabled skills.
"""

import hashlib
import logging
from typing import Any

from langchain_core.messages import SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.graph import END, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition

from starpion_agent.config import settings
from starpion_agent.context import get_current_user
from starpion_agent.db.pool import get_pool
from starpion_agent.db.repositories import profile as profile_repo
from starpion_agent.db.repositories import skill as skill_repo
from starpion_agent.db.repositories import provider as provider_repo
from starpion_agent.db.repositories import usage as usage_repo
from starpion_agent.pricing import calculate_cost, get_provider
from starpion_agent.persona import DEFAULT_PERSONA, build_system_prompt
from starpion_agent.skills.audio.tools import generate_audio, transcribe_audio
from starpion_agent.skills.budget.tools import get_budget_status, set_budget
from starpion_agent.skills.diary.tools import save_daily_log, save_diary_entry
from starpion_agent.skills.documents.tools import generate_document, parse_document
from starpion_agent.skills.finance.tools import get_monthly_total, save_finance
from starpion_agent.skills.goals.tools import get_goals, set_goal, update_goal_progress, update_goal_status
from starpion_agent.skills.image.tools import analyze_image, edit_image, generate_image
from starpion_agent.skills.loader import (
    build_skill_catalog,
    build_skill_instructions,
    load_all_skill_docs,
)
from starpion_agent.skills.memory.tools import retrieve_memory
from starpion_agent.skills.google.tools import (
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
from starpion_agent.skills.registry import SKILLS
from starpion_agent.skills.schedule.tools import (
    cancel_schedule,
    create_schedule,
    list_schedules,
)
from starpion_agent.skills.video.tools import analyze_video, generate_video
from starpion_agent.skills.weather.tools import get_forecast, get_weather
from starpion_agent.skills.summarize.tools import summarize_text, summarize_url
from starpion_agent.skills.translate.tools import translate_text
from starpion_agent.skills.qrcode.tools import generate_qrcode
from starpion_agent.skills.calculator.tools import calculate
from starpion_agent.skills.reminder.tools import (
    delete_reminder,
    list_reminders,
    set_reminder,
)
from starpion_agent.skills.currency.tools import convert_currency, get_exchange_rate
from starpion_agent.skills.dday.tools import delete_dday, list_ddays, set_dday
from starpion_agent.skills.random.tools import random_pick
from starpion_agent.skills.memo.tools import delete_memo, list_memos, save_memo
from starpion_agent.skills.unitconv.tools import convert_unit
from starpion_agent.skills.timezone.tools import convert_timezone, get_world_time
from starpion_agent.skills.wordcount.tools import count_text
from starpion_agent.skills.encode.tools import encode_decode
from starpion_agent.skills.hash.tools import generate_hash
from starpion_agent.skills.color.tools import convert_color
from starpion_agent.skills.horoscope.tools import get_horoscope
from starpion_agent.skills.ip.tools import lookup_ip
from starpion_agent.skills.notion.tools import (
    notion_block_append,
    notion_page_create,
    notion_page_read,
    notion_search,
)
from starpion_agent.skills.websearch.tools import web_fetch, web_search

logger = logging.getLogger(__name__)

# Module-level reference for cleanup during shutdown.
_checkpointer_cm: Any = None

# All available tools — ToolNode holds all, but LLM only sees enabled subset.
ALL_TOOLS = [
    save_finance,
    get_monthly_total,
    retrieve_memory,
    save_daily_log,
    save_diary_entry,
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
    update_goal_progress,
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
    notion_search,
    notion_page_create,
    notion_page_read,
    notion_block_append,
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

# Module-level default LLM instance (fallback when no user persona is configured).
_llm: ChatGoogleGenerativeAI | None = None

# LLM instance cache: (provider, model, key_hash) → LLM object.
# Avoids recreating identical clients on every request.
_MAX_LLM_CACHE = 50
_llm_cache: dict[tuple[str, str, str], Any] = {}


def _make_llm(provider: str, model: str, api_key: str, base_url: str = "") -> Any:
    """Return a cached LangChain chat model for the given (provider, model, key).

    Falls back to the global default Gemini instance if provider is unknown.
    """
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()[:16]
    cache_key = (provider, model, key_hash)
    if cache_key in _llm_cache:
        return _llm_cache[cache_key]

    llm: Any
    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic  # lazy import
        llm = ChatAnthropic(model=model, api_key=api_key)  # type: ignore[call-arg]
    elif provider == "gemini":
        llm = ChatGoogleGenerativeAI(model=model, google_api_key=api_key)
    elif provider == "openai":
        from langchain_openai import ChatOpenAI  # lazy import
        llm = ChatOpenAI(model=model, api_key=api_key)  # type: ignore[call-arg]
    elif provider == "zai":
        from langchain_openai import ChatOpenAI  # lazy import
        llm = ChatOpenAI(
            model=model,
            api_key=api_key,  # type: ignore[call-arg]
            base_url=base_url or "https://api.z.ai/api/paas/v4",
        )
    elif provider == "custom" and base_url:
        from langchain_openai import ChatOpenAI  # lazy import
        llm = ChatOpenAI(
            model=model,
            api_key=api_key or "sk-none",  # type: ignore[call-arg]
            base_url=base_url,
        )
    else:
        return _llm  # global default Gemini

    # Evict oldest entry when cache is full.
    if len(_llm_cache) >= _MAX_LLM_CACHE:
        _llm_cache.pop(next(iter(_llm_cache)))
    _llm_cache[cache_key] = llm
    return llm


async def _get_enabled_context(
    user_id: str | None,
) -> tuple[str, list[str], str, str, Any, str | None]:
    """Query user persona, enabled skills, and LLM override in a single pass.

    Returns:
        (persona_id, enabled_tool_names, catalog_text, instructions_text,
         llm_override, custom_system_prompt)

        ``llm_override`` is None when the default Gemini instance should be used.
        ``custom_system_prompt`` is the raw text from user_personas.system_prompt.
    """
    persona_id = DEFAULT_PERSONA
    enabled_tool_names: list[str] = []
    catalog_text = ""
    instructions_text = ""
    llm_override = None
    custom_system_prompt: str | None = None

    if not user_id:
        return persona_id, enabled_tool_names, catalog_text, instructions_text, llm_override, custom_system_prompt

    pool = get_pool()

    # 1. User's default persona (user_personas table) — highest priority.
    persona_row = await provider_repo.get_default_persona_with_provider(pool, user_id)
    if persona_row:
        prov = persona_row.get("provider", "")
        model = persona_row.get("model", "")
        api_key = persona_row.get("api_key", "")
        base_url = persona_row.get("base_url", "")
        persona_name = persona_row.get("persona_name", "")
        custom_system_prompt = persona_row.get("system_prompt") or None

        if prov and model and api_key:
            llm_override = _make_llm(prov, model, api_key, base_url)
            logger.info(
                "[Persona] user=%s | persona='%s' | provider=%s | model=%s | custom_prompt=%s",
                user_id, persona_name, prov, model,
                "yes" if custom_system_prompt else "no",
            )
        else:
            logger.info(
                "[Persona] user=%s | persona='%s' | provider/model not configured → using default LLM",
                user_id, persona_name,
            )
    else:
        logger.info("[Persona] user=%s | no default persona found → using default LLM", user_id)

    # 2. Fall back to legacy persona preference in profiles table.
    if llm_override is None:
        prof = await profile_repo.get_by_uuid_id(pool, user_id)
        if prof:
            prefs = prof.get("preferences") or {}
            persona_id = prefs.get("persona", DEFAULT_PERSONA)

    # 3. Enabled skills (single DB query).
    enabled = await skill_repo.get_enabled_skills(pool, user_id)

    for sid in enabled:
        skill_def = SKILLS.get(sid)
        if skill_def:
            enabled_tool_names.extend(skill_def.tools)

    skill_docs = load_all_skill_docs(enabled)
    catalog_text = build_skill_catalog(skill_docs)
    instructions_text = build_skill_instructions(skill_docs)

    return persona_id, enabled_tool_names, catalog_text, instructions_text, llm_override, custom_system_prompt


def _build_prompt(
    persona_id: str,
    enabled_tool_names: list[str],
    catalog_text: str,
    instructions_text: str,
    custom_system_prompt: str | None = None,
) -> str:
    """Assemble the system prompt with progressive skill disclosure."""
    prompt_text = build_system_prompt(persona_id, custom_prompt=custom_system_prompt)

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
    """LLM node with dynamic tool binding and per-user model selection.

    On each invocation:
      1. Queries the user's default persona (provider + model + api_key).
      2. Creates/reuses a cached LLM instance for that provider/model.
      3. Queries enabled skills and builds the system prompt.
      4. Binds **only** the enabled tools to the LLM.
      5. Invokes the model and returns the response.
    """
    assert _llm is not None, "LLM not initialised — call create_agent() first"

    user_id = get_current_user()

    try:
        (
            persona_id,
            enabled_tool_names,
            catalog_text,
            instructions_text,
            llm_override,
            custom_system_prompt,
        ) = await _get_enabled_context(user_id)
    except Exception:
        logger.warning("Failed to load persona/skills, using defaults", exc_info=True)
        persona_id = DEFAULT_PERSONA
        enabled_tool_names = []
        catalog_text = ""
        instructions_text = ""
        llm_override = None
        custom_system_prompt = None

    # Resolve which LLM instance to use for this request.
    active_llm = llm_override if llm_override is not None else _llm

    if llm_override is None:
        logger.info(
            "[LLM] user=%s | using default LLM: %s / %s",
            user_id,
            type(_llm).__name__,
            getattr(_llm, "model", getattr(_llm, "model_name", "unknown")),
        )
    else:
        logger.info(
            "[LLM] user=%s | using override LLM: %s / %s",
            user_id,
            type(active_llm).__name__,
            getattr(active_llm, "model", getattr(active_llm, "model_name", "unknown")),
        )

    # Build system prompt (custom_system_prompt takes priority over persona_id tone).
    prompt_text = _build_prompt(
        persona_id,
        enabled_tool_names,
        catalog_text,
        instructions_text,
        custom_system_prompt=custom_system_prompt,
    )
    messages = [SystemMessage(content=prompt_text)] + state["messages"]

    # Dynamic tool binding: LLM only sees enabled tools.
    if enabled_tool_names:
        enabled_tools = [t for t in ALL_TOOLS if t.name in set(enabled_tool_names)]
        logger.info("[Tools] user=%s | enabled=%s", user_id, enabled_tool_names)
    else:
        enabled_tools = ALL_TOOLS
        logger.info("[Tools] user=%s | no skill context, binding ALL_TOOLS", user_id)

    bound_model = active_llm.bind_tools(enabled_tools)

    # Determine model name and provider for usage logging.
    active_model = getattr(active_llm, "model", getattr(active_llm, "model_name", "unknown"))
    active_provider = get_provider(active_model) if llm_override is not None else "gemini"

    llm_status = "error"
    response = None
    try:
        response = await bound_model.ainvoke(messages)
        llm_status = "success"
    except Exception:
        raise
    finally:
        # Extract token counts from response usage metadata (best-effort).
        if llm_status == "success":
            try:
                um = getattr(response, "usage_metadata", {}) or {}
                raw_input     = int(um.get("input_tokens", 0))
                output_tokens = int(um.get("output_tokens", 0))

                # ── Provider-specific token extraction ──────────────────────
                # Anthropic API semantics (via langchain-anthropic):
                #   input_tokens            = standard-rate tokens ONLY
                #                             (excludes cache_read and cache_creation)
                #   cache_read_input_tokens = tokens served from cache
                #   cache_creation_input_tokens = tokens written to cache
                #
                # OpenAI / Gemini / ZAI semantics:
                #   input_tokens            = TOTAL prompt tokens (including cached)
                #   input_token_details.cache_read = cached portion
                #
                # calculate_cost() formula:
                #   non_cached_input = input_tokens - cached_tokens   (billed at inp_price)
                #   + cached_tokens at cache_read_price
                #   + cache_write_tokens at cache_write_price
                #
                # For Anthropic we must normalize: cost_input = standard + cache_read
                # so that (cost_input - cache_read) = standard ✓
                if active_provider == "anthropic":
                    cache_read         = int(um.get("cache_read_input_tokens", 0))
                    cache_write_tokens = int(um.get("cache_creation_input_tokens", 0))
                    # DB: store true total prompt tokens for display
                    input_tokens  = raw_input + cache_read + cache_write_tokens
                    cached_tokens = cache_read
                    # For cost formula: exclude cache_write (it has its own price bucket)
                    cost_input    = raw_input + cache_read
                else:
                    # OpenAI / Gemini / ZAI: input_tokens already = total
                    itd                = um.get("input_token_details") or {}
                    cached_tokens      = int(itd.get("cache_read", 0))
                    cache_write_tokens = int(itd.get("cache_creation", 0))
                    input_tokens       = raw_input
                    cost_input         = raw_input

                cost = calculate_cost(
                    active_model,
                    cost_input,
                    output_tokens,
                    cached_tokens,
                    cache_write_tokens,
                )
                if user_id:
                    pool = get_pool()
                    await usage_repo.save_usage_log(
                        pool,
                        user_id,
                        active_model,
                        active_provider,
                        input_tokens,
                        output_tokens,
                        cached_tokens,
                        cost,
                        status="success",
                    )
            except Exception:
                logger.debug("Usage log extraction failed", exc_info=True)

    assert response is not None
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
