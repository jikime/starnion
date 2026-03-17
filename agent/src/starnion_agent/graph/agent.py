"""ReAct agent setup with LangGraph and Gemini.

Uses a custom StateGraph instead of create_react_agent to support
dynamic tool binding — LLM only sees tools for enabled skills.
"""

import asyncio
import hashlib
import logging
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from langchain_core.messages import AIMessage, SystemMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.graph import MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition

from starnion_agent.context import get_current_user
from starnion_agent.db.pool import get_pool
from starnion_agent.db.repositories import skill as skill_repo
from starnion_agent.db.repositories import provider as provider_repo
from starnion_agent.db.repositories import usage as usage_repo
from starnion_agent.db.repositories.profile import get_user_language, get_user_timezone
from starnion_agent.pricing import calculate_cost, get_provider
from starnion_agent.persona import DEFAULT_PERSONA, NAME_TO_ID, build_system_prompt, get_persona
from starnion_agent.skills.audio.tools import generate_audio, transcribe_audio
from starnion_agent.skills.budget.tools import get_budget_status, set_budget
from starnion_agent.skills.diary.tools import save_daily_log, save_diary_entry
from starnion_agent.skills.documents.tools import generate_document, parse_document
from starnion_agent.skills.finance.tools import get_monthly_total, save_finance
from starnion_agent.skills.goals.tools import get_goals, set_goal, update_goal_progress, update_goal_status
from starnion_agent.skills.image.tools import analyze_image, edit_image, generate_image
from starnion_agent.skills.loader import (
    build_skill_catalog,
    build_skill_instructions,
    load_all_skill_docs,
)
from starnion_agent.skills.memory.tools import compare_periods, get_time_travel_insight, retrieve_memory, search_by_tags
from starnion_agent.skills.google.tools import (
    google_auth,
    google_calendar_create,
    google_calendar_list,
    google_calendar_delete,
    google_disconnect,
    google_docs_create,
    google_docs_read,
    google_drive_list,
    google_drive_upload,
    google_mail_list,
    google_mail_send,
    google_tasks_create,
    google_tasks_list,
    google_tasks_complete,
    google_tasks_delete,
)
from starnion_agent.skills.registry import SKILLS
from starnion_agent.skills.schedule.tools import (
    cancel_schedule,
    create_schedule,
    list_schedules,
)
from starnion_agent.skills.video.tools import analyze_video, generate_video
from starnion_agent.skills.usage.tools import get_usage_summary
from starnion_agent.skills.coding_agent.tools import run_coding_agent
from starnion_agent.skills.weather.tools import get_forecast, get_weather
from starnion_agent.skills.summarize.tools import summarize_text, summarize_url
from starnion_agent.skills.translate.tools import translate_text
from starnion_agent.skills.qrcode.tools import generate_qrcode
from starnion_agent.skills.calculator.tools import calculate
from starnion_agent.skills.reminder.tools import (
    delete_reminder,
    list_reminders,
    set_reminder,
)
from starnion_agent.skills.currency.tools import convert_currency, get_exchange_rate
from starnion_agent.skills.dday.tools import delete_dday, list_ddays, set_dday
from starnion_agent.skills.random.tools import random_pick
from starnion_agent.skills.memo.tools import delete_memo, list_memos, save_memo
from starnion_agent.skills.unitconv.tools import convert_unit
from starnion_agent.skills.timezone.tools import convert_timezone, get_world_time
from starnion_agent.skills.wordcount.tools import count_text
from starnion_agent.skills.encode.tools import encode_decode
from starnion_agent.skills.hash.tools import generate_hash
from starnion_agent.skills.color.tools import convert_color
from starnion_agent.skills.horoscope.tools import get_horoscope
from starnion_agent.skills.ip.tools import lookup_ip
from starnion_agent.skills.notion.tools import (
    notion_block_append,
    notion_database_query,
    notion_page_create,
    notion_page_read,
    notion_page_update,
    notion_search,
)
from starnion_agent.skills.github.tools import (
    github_create_issue,
    github_get_pr,
    github_list_issues,
    github_list_prs,
    github_list_repos,
    github_search_code,
)
from starnion_agent.skills.websearch.tools import web_fetch, web_search
from starnion_agent.skills.naver_search.tools import naver_search
from starnion_agent.skills.browser.tools import (
    browser_open_screenshot,
    browser_navigate,
    browser_snapshot,
    browser_screenshot,
    browser_click,
    browser_type,
    browser_press,
    browser_select,
    browser_hover,
    browser_scroll,
    browser_evaluate,
    browser_wait_for,
    browser_wait_ms,
    browser_get_text,
    browser_current_url,
    browser_close,
)

logger = logging.getLogger(__name__)


def _filter_stale_tool_errors(messages: list) -> list:
    """Remove failed tool interactions — including the LLM's follow-up response.

    A failed tool interaction consists of three parts that all get removed:
      1. AIMessage with tool_calls (the invocation)
      2. ToolMessage with '오류:' content (the error result)
      3. AIMessage without tool_calls immediately after (the LLM's "I can't do
         this" follow-up) — this is the part that previously remained in history
         and caused the LLM to self-judge and skip retrying the tool.

    Successful tool results and their surrounding messages are kept as-is.
    """
    # Work on a shallow copy so we never mutate the caller's list (which may be
    # a direct reference to LangGraph's checkpoint state).
    messages = list(messages)

    # Step 1: collect failed tool_call_ids from error ToolMessages.
    failed_ids: set[str] = set()
    for msg in messages:
        if isinstance(msg, ToolMessage):
            content = msg.content if isinstance(msg.content, str) else str(msg.content)
            if content.startswith("오류:"):
                failed_ids.add(msg.tool_call_id)

    if not failed_ids:
        return messages

    # Step 2: mark indices to remove.
    # Also track whether the previous "slot" was a fully-failed AI tool call
    # so we can remove its follow-up plain AIMessage as well.
    remove: set[int] = set()
    last_fully_failed_ai_idx: int | None = None

    for i, msg in enumerate(messages):
        if isinstance(msg, ToolMessage) and msg.tool_call_id in failed_ids:
            remove.add(i)

        elif isinstance(msg, AIMessage) and msg.tool_calls:
            failed_calls = [tc for tc in msg.tool_calls if tc["id"] in failed_ids]
            all_failed = len(failed_calls) == len(msg.tool_calls)

            if all_failed and not msg.content:
                # Entire AIMessage is just a failed tool invocation — remove it
                # and flag so the follow-up plain AIMessage is removed too.
                remove.add(i)
                last_fully_failed_ai_idx = i
            elif failed_calls:
                # Mixed: strip only the failed tool_calls, keep the rest.
                clean_calls = [tc for tc in msg.tool_calls if tc["id"] not in failed_ids]
                messages[i] = msg.model_copy(update={"tool_calls": clean_calls})

        elif isinstance(msg, AIMessage) and not msg.tool_calls:
            # Remove this plain AIMessage if it is the immediate follow-up to a
            # fully-failed tool invocation (with only removed messages in between).
            if last_fully_failed_ai_idx is not None:
                between = range(last_fully_failed_ai_idx + 1, i)
                if all(j in remove for j in between):
                    remove.add(i)
            last_fully_failed_ai_idx = None

        else:
            last_fully_failed_ai_idx = None

    filtered = [msg for i, msg in enumerate(messages) if i not in remove]

    removed = len(messages) - len(filtered)
    if removed:
        logger.debug("_filter_stale_tool_errors: removed %d stale error message(s)", removed)
    return filtered


# ── ANSI colour helpers ──────────────────────────────────────────────────────
_ANSI_RESET  = "\033[0m"
_ANSI_BOLD   = "\033[1m"
_ANSI_DIM    = "\033[2m"

_PROVIDER_COLORS: dict[str, str] = {
    "anthropic": "\033[95m",   # bright magenta
    "gemini":    "\033[94m",   # bright blue
    "openai":    "\033[92m",   # bright green
    "zai":       "\033[96m",   # bright cyan
    "custom":    "\033[93m",   # bright yellow
}


def _model_tag(provider: str, model: str, suffix: str = "") -> str:
    """Return a coloured '[provider/model]' tag for log messages."""
    color = _PROVIDER_COLORS.get(provider, "\033[97m")  # bright white fallback
    label = f"{provider}/{model}"
    dim_suffix = f" {_ANSI_DIM}{suffix}{_ANSI_RESET}" if suffix else ""
    return f"{_ANSI_BOLD}{color}[{label}]{_ANSI_RESET}{dim_suffix}"



# Module-level reference for cleanup during shutdown.
_checkpointer_cm: Any = None

# All available tools — ToolNode holds all, but LLM only sees enabled subset.
ALL_TOOLS = [
    save_finance,
    get_monthly_total,
    retrieve_memory,
    get_time_travel_insight,
    search_by_tags,
    compare_periods,
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
    google_calendar_delete,
    google_docs_create,
    google_docs_read,
    google_tasks_create,
    google_tasks_list,
    google_tasks_complete,
    google_tasks_delete,
    google_drive_upload,
    google_drive_list,
    google_mail_send,
    google_mail_list,
    notion_search,
    notion_page_create,
    notion_page_read,
    notion_block_append,
    notion_database_query,
    notion_page_update,
    github_list_repos,
    github_list_issues,
    github_create_issue,
    github_list_prs,
    github_get_pr,
    github_search_code,
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
    naver_search,
    get_usage_summary,
    run_coding_agent,
    # browser
    browser_open_screenshot,
    browser_navigate,
    browser_snapshot,
    browser_screenshot,
    browser_click,
    browser_type,
    browser_press,
    browser_select,
    browser_hover,
    browser_scroll,
    browser_evaluate,
    browser_wait_for,
    browser_wait_ms,
    browser_get_text,
    browser_current_url,
    browser_close,
]

# LLM instance cache: (provider, model, key_hash, endpoint_type) → LLM object.
# Avoids recreating identical clients on every request.
_MAX_LLM_CACHE = 50
_llm_cache: dict[tuple[str, str, str, str], Any] = {}


def _make_llm(
    provider: str,
    model: str,
    api_key: str,
    base_url: str = "",
    endpoint_type: str = "",
) -> Any:
    """Return a cached LangChain chat model for the given (provider, model, key).

    For custom endpoints:
      - endpoint_type="ollama"  → uses OpenAI-compatible API at {base_url}/v1
        (Ollama supports OpenAI-compatible /v1 since v0.1.24; no extra dependency needed)
      - endpoint_type="openai_compatible" or "" → uses base_url as-is

    Raises RuntimeError for unknown providers — callers must configure a valid provider.
    """
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()[:16]
    cache_key = (provider, model, key_hash, endpoint_type)
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
        if endpoint_type == "ollama":
            from langchain_ollama import ChatOllama  # lazy import
            llm = ChatOllama(model=model, base_url=base_url.rstrip("/"))
        else:
            from langchain_openai import ChatOpenAI  # lazy import
            llm = ChatOpenAI(
                model=model,
                api_key=api_key or "sk-none",  # type: ignore[call-arg]
                base_url=base_url,
            )
    else:
        raise RuntimeError(
            f"Unknown provider '{provider}' or missing base_url. "
            "Please configure a provider in Settings → AI Provider."
        )

    # Evict oldest entry when cache is full.
    if len(_llm_cache) >= _MAX_LLM_CACHE:
        _llm_cache.pop(next(iter(_llm_cache)))
    _llm_cache[cache_key] = llm
    return llm


def _is_assignment_valid(assign: dict[str, Any]) -> bool:
    """Return True when an assignment row has enough data to create an LLM."""
    provider = assign.get("provider", "")
    model = assign.get("model", "")
    api_key = assign.get("api_key", "")
    base_url = assign.get("base_url", "")

    if not provider or not model:
        return False
    if provider == "custom":
        # Custom endpoints need base_url; Ollama doesn't require api_key.
        return bool(base_url)
    return bool(api_key)


async def _get_enabled_context(
    user_id: str | None,
) -> tuple[str, list[str], str, str, Any, str | None, str, str]:
    """Query user persona, enabled skills, and LLM in a single pass.

    Chat model = persona's provider/model (no model_assignment override for chat).
    Model assignments are only used for dedicated tasks (image, audio, report).

    Returns:
        (persona_id, enabled_tool_names, catalog_text, instructions_text,
         llm_override, custom_system_prompt, endpoint_type, active_prov)

        ``llm_override`` is None when no provider is configured — the caller
        must raise an error in that case.
        ``custom_system_prompt`` is the raw text from personas.system_prompt.
        ``endpoint_type`` is the endpoint type of the selected LLM.
        ``active_prov`` is the resolved provider label for usage logging
        (e.g. "gemini", "anthropic", "openai", "ollama", "custom").
    """
    persona_id = DEFAULT_PERSONA
    enabled_tool_names: list[str] = []
    catalog_text = ""
    instructions_text = ""
    llm_override = None
    custom_system_prompt: str | None = None
    active_endpoint_type = ""
    active_prov = ""

    if not user_id:
        return persona_id, enabled_tool_names, catalog_text, instructions_text, llm_override, custom_system_prompt, active_endpoint_type, active_prov

    pool = get_pool()

    # 1. User's default persona (personas table) — for persona_id + system_prompt.
    persona_row = await provider_repo.get_default_persona_with_provider(pool, user_id)
    persona_provider_llm = None  # LLM built from persona's provider (fallback)

    persona_endpoint_type = ""
    if persona_row:
        prov = persona_row.get("provider", "")
        model = persona_row.get("model", "")
        api_key = persona_row.get("api_key", "")
        base_url = persona_row.get("base_url", "")
        endpoint_type = persona_row.get("endpoint_type", "")
        persona_name = persona_row.get("persona_name", "")
        custom_system_prompt = persona_row.get("system_prompt") or None

        # Map DB Korean display name → PERSONAS key (e.g. "친한 친구" → "buddy").
        # For built-in personas, use the Python-controlled tone from PERSONAS dict
        # so that tone strength is always under our control (not old DB text).
        resolved_id = NAME_TO_ID.get(persona_name, "")
        if resolved_id:
            persona_id = resolved_id
            custom_system_prompt = None  # Use Python built-in tone (always up-to-date)
        # else: truly custom persona → keep custom_system_prompt from DB

        if prov and model and (api_key or prov == "custom"):
            persona_provider_llm = _make_llm(prov, model, api_key, base_url, endpoint_type)
            persona_endpoint_type = endpoint_type
            active_prov = endpoint_type if (prov == "custom" and endpoint_type) else prov
            logger.info(
                "[Persona] user=%s | persona='%s' | %s | custom_prompt=%s",
                user_id, persona_name,
                _model_tag(prov, model, "(persona provider)"),
                "yes" if custom_system_prompt else "no",
            )
        else:
            logger.info(
                "[Persona] user=%s | persona='%s' | provider/model/key not fully configured",
                user_id, persona_name,
            )
    else:
        logger.info("[Persona] user=%s | no default persona found", user_id)

    # 2. Persona is the authoritative chat model — no model_assignment override.
    llm_override = persona_provider_llm
    active_endpoint_type = persona_endpoint_type

    # 3. Enabled skills (single DB query).
    enabled = await skill_repo.get_enabled_skills(pool, user_id)

    for sid in enabled:
        skill_def = SKILLS.get(sid)
        if skill_def:
            enabled_tool_names.extend(skill_def.tools)

    skill_docs = load_all_skill_docs(enabled)
    catalog_text = build_skill_catalog(skill_docs)
    instructions_text = build_skill_instructions(skill_docs)

    return persona_id, enabled_tool_names, catalog_text, instructions_text, llm_override, custom_system_prompt, active_endpoint_type, active_prov


async def get_llm_for_use_case(user_id: str, use_case: str) -> Any:
    """Return an LLM configured for the given use case.

    Fallback chain:
      1. model_assignments[use_case]  — specific assignment (image, audio, report)
      2. Default persona's provider   — persona-level configuration
      3. RuntimeError                 — no provider configured

    Intended for use by task-specific callers (report generation, image/audio
    processing) that want to honour the user's per-use-case model preference.
    """
    pool = get_pool()

    assignments = await provider_repo.get_all_model_assignments_with_provider(pool, user_id)

    assign = assignments.get(use_case)
    if assign and _is_assignment_valid(assign):
        logger.info(
            "[ModelAssignment] user=%s | use_case=%s | %s",
            user_id, use_case,
            _model_tag(assign["provider"], assign["model"], "(assignment)"),
        )
        return _make_llm(
            assign["provider"],
            assign["model"],
            assign.get("api_key", ""),
            assign.get("base_url", ""),
            assign.get("endpoint_type", ""),
        )

    # Fall back to persona provider.
    persona_row = await provider_repo.get_default_persona_with_provider(pool, user_id)
    if persona_row:
        prov = persona_row.get("provider", "")
        model = persona_row.get("model", "")
        api_key = persona_row.get("api_key", "")
        base_url = persona_row.get("base_url", "")
        endpoint_type = persona_row.get("endpoint_type", "")
        if prov and model and (api_key or prov == "custom"):
            logger.info(
                "[ModelAssignment] user=%s | use_case=%s | %s",
                user_id, use_case,
                _model_tag(prov, model, "(fallback: persona provider)"),
            )
            return _make_llm(prov, model, api_key, base_url, endpoint_type)

    raise RuntimeError("AI provider not configured")


async def get_model_config_for_use_case(user_id: str | None, use_case: str) -> dict | None:
    """Return the raw model assignment config for a generative use case, or None.

    Unlike get_llm_for_use_case, this does NOT build an LLM object and does NOT
    fall back to the persona provider.  Callers use their own hardcoded defaults
    when None is returned (e.g. image_gen → gemini-3.1-flash-image-preview).

    Used by image/audio generation tools that call provider-specific APIs directly
    (google-genai, ollama) rather than going through LangChain.
    """
    if not user_id:
        return None
    pool = get_pool()
    assignments = await provider_repo.get_all_model_assignments_with_provider(pool, user_id)
    assign = assignments.get(use_case)
    if assign and _is_assignment_valid(assign):
        logger.info(
            "[ModelAssignment] user=%s | use_case=%s | %s",
            user_id, use_case,
            _model_tag(assign["provider"], assign["model"], "(generative assignment)"),
        )
        return dict(assign)
    return None


def _build_prompt(
    persona_id: str,
    enabled_tool_names: list[str],
    catalog_text: str,
    instructions_text: str,
    custom_system_prompt: str | None = None,
    language: str = "ko",
    now_str: str = "",
) -> str:
    """Assemble the system prompt with progressive skill disclosure."""
    prompt_text = build_system_prompt(persona_id, custom_prompt=custom_system_prompt, language=language)

    # Inject current datetime as the first context block so the LLM always has
    # an accurate time reference — prevents stale date/time answers.
    if now_str:
        prompt_text = now_str + "\n\n" + prompt_text

    # Level 1: Skill catalog — name + tools + description per skill.
    # The catalog already includes tool names (e.g. "**메모** (save_memo, ...):")
    # so the LLM can directly map user intent to the correct tool call.
    if catalog_text:
        prompt_text += "\n\n" + catalog_text
        prompt_text += "\n위 카탈로그에 없는 도구는 절대 호출하지 마세요."

    # Level 2: Full instructions (tool usage guidelines).
    if instructions_text:
        prompt_text += "\n\n" + instructions_text

    # Repeat persona tone at the END for recency effect —
    # long tool instructions can cause the LLM to "forget" early style rules.
    p = get_persona(persona_id)
    prompt_text += (
        f"\n\n[최종 확인 — 페르소나 '{p['name']}']\n"
        f"{p['tone'].split(chr(10))[0]}"  # first line (the most critical rule)
    )

    # Repeat tool-priority rules at the very END for recency effect.
    # This is the last thing the LLM reads before generating a response,
    # so it has the strongest influence on whether tool_calls are emitted.
    # The catalog above maps each skill to its tools — use it as the guide.
    if enabled_tool_names:
        prompt_text += (
            "\n\n[도구 사용 최종 확인 — 절대 규칙]\n"
            "위 스킬 카탈로그에 나열된 도구로 처리 가능한 요청이면 반드시 해당 도구를 먼저 호출하세요. "
            "이전 실패 여부와 무관하게 지금 바로 도구를 호출하세요.\n"
            "도구가 성공 메시지를 반환하면 그 결과를 사용자에게 전달하세요. "
            "도구가 오류·실패 메시지를 반환하면 반드시 그 내용을 정직하게 사용자에게 전달하세요. "
            "도구를 호출하지 않고 저장·삭제·처리 등을 완료했다고 응답하는 것은 절대 금지입니다."
        )

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
    user_id = get_current_user()
    active_prov = ""

    try:
        (
            persona_id,
            enabled_tool_names,
            catalog_text,
            instructions_text,
            llm_override,
            custom_system_prompt,
            _,
            active_prov,
        ) = await _get_enabled_context(user_id)
    except Exception:
        logger.warning("Failed to load persona/skills, using defaults", exc_info=True)
        persona_id = DEFAULT_PERSONA
        enabled_tool_names = []
        catalog_text = ""
        instructions_text = ""
        llm_override = None
        custom_system_prompt = None

    if llm_override is None:
        raise RuntimeError("AI provider not configured")

    active_llm = llm_override
    _llm_provider = getattr(active_llm, "_provider", "") or ""
    _llm_model    = getattr(active_llm, "model", getattr(active_llm, "model_name", "unknown"))
    # Infer provider label from class name when _provider attr is absent.
    if not _llm_provider:
        _cls = type(active_llm).__name__.lower()
        if "anthropic" in _cls:   _llm_provider = "anthropic"
        elif "google"  in _cls:   _llm_provider = "gemini"
        elif "openai"  in _cls:   _llm_provider = "openai"
        else:                      _llm_provider = _cls
    logger.info(
        "[LLM] user=%s | %s",
        user_id,
        _model_tag(_llm_provider, _llm_model, "(chat)"),
    )

    # 사용자 선호 언어 및 타임존 조회 (DB 오류 시 기본값 반환).
    user_language = "ko"
    user_tz_str = "Asia/Seoul"
    if user_id:
        pool = get_pool()
        user_language, user_tz_str = await asyncio.gather(
            get_user_language(pool, user_id),
            get_user_timezone(pool, user_id),
        )

    # Compute current datetime in user's timezone for system prompt injection.
    try:
        tz = ZoneInfo(user_tz_str)
    except (ZoneInfoNotFoundError, KeyError):
        tz = ZoneInfo("Asia/Seoul")

    _now = datetime.now(tz)
    _weekdays = {
        "ko": ["월", "화", "수", "목", "금", "토", "일"],
        "en": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        "ja": ["月", "火", "水", "木", "金", "土", "日"],
        "zh": ["一", "二", "三", "四", "五", "六", "日"],
    }
    _wd = _weekdays.get(user_language, _weekdays["en"])[_now.weekday()]
    _labels = {
        "ko": "현재 날짜/시간",
        "en": "Current datetime",
        "ja": "現在の日時",
        "zh": "当前日期/时间",
    }
    _label = _labels.get(user_language, _labels["en"])
    _tz_abbr = _now.strftime("%Z") or user_tz_str
    now_str = (
        f"[{_label}: {_now.strftime('%Y-%m-%d')} ({_wd}) "
        f"{_now.strftime('%H:%M')} {_tz_abbr}]"
    )

    # Build system prompt (custom_system_prompt takes priority over persona_id tone).
    prompt_text = _build_prompt(
        persona_id,
        enabled_tool_names,
        catalog_text,
        instructions_text,
        custom_system_prompt=custom_system_prompt,
        language=user_language,
        now_str=now_str,
    )
    messages = [SystemMessage(content=prompt_text)] + _filter_stale_tool_errors(state["messages"])

    # Dynamic tool binding: LLM only sees enabled tools.
    if enabled_tool_names:
        enabled_tools = [t for t in ALL_TOOLS if t.name in set(enabled_tool_names)]
    else:
        enabled_tools = ALL_TOOLS

    bound_model = active_llm.bind_tools(enabled_tools)

    # Determine model name and provider for usage logging.
    active_model = getattr(active_llm, "model", getattr(active_llm, "model_name", "unknown"))
    active_provider = active_prov or get_provider(active_model)

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
    global _checkpointer_cm

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
