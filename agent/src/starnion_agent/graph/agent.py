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

import json

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.errors import GraphInterrupt  # noqa: F401 — re-exported for server.py
from langgraph.graph import MessagesState, StateGraph
from langgraph.prebuilt import ToolNode
from langgraph.types import Command, interrupt  # noqa: F401 — re-exported for server.py

from starnion_agent.context import get_current_user
from starnion_agent.db.pool import get_pool
from starnion_agent.db.repositories import skill as skill_repo
from starnion_agent.db.repositories import provider as provider_repo
from starnion_agent.db.repositories import usage as usage_repo
from starnion_agent.db.repositories.profile import get_user_language, get_user_timezone
from starnion_agent.pricing import calculate_cost, get_provider
from starnion_agent.persona import DEFAULT_PERSONA, NAME_TO_ID, build_system_prompt, get_persona, get_prompt_strings
from starnion_agent.context import set_current_language
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


def _drop_orphaned_human_messages(messages: list) -> list:
    """Remove orphaned HumanMessages when multiple consecutive ones trail the history.

    When the agent crashes before generating an AIMessage (e.g. the LLM call
    raises an exception), the triggering HumanMessage is saved in the LangGraph
    checkpoint but no AIMessage follows it.  On the next turn a new HumanMessage
    is appended, creating a run of consecutive HumanMessages at the tail.

    Gemini interprets two consecutive 'save memo' HumanMessages as 'I already
    handled the first one' and generates a fake completion without calling the
    tool.  By keeping only the *latest* HumanMessage from the trailing run we
    prevent this hallucination trigger.
    """
    if len(messages) < 2:
        return messages

    # Walk backwards to find the start of a trailing HumanMessage run.
    tail_start = len(messages)
    for i in range(len(messages) - 1, -1, -1):
        if isinstance(messages[i], HumanMessage):
            tail_start = i
        else:
            break

    trailing = len(messages) - tail_start
    if trailing > 1:
        logger.debug(
            "_drop_orphaned_human_messages: dropping %d orphaned HumanMessage(s)",
            trailing - 1,
        )
        return messages[:tail_start] + [messages[-1]]

    return messages


def _sanitize_image_urls(messages: list) -> list:
    """Replace expired Telegram CDN image_url blocks in historical messages.

    langchain_google_genai fetches every image_url content block to send raw
    bytes to Gemini.  Telegram CDN URLs (api.telegram.org) expire quickly and
    return 404, which crashes the entire stream — even for messages that contain
    no image at all, because the *history* being replayed still has the old URL.

    Any image_url pointing to api.telegram.org is replaced with a text
    placeholder so the conversation history remains safe to replay.
    """
    sanitized = []
    for msg in messages:
        if not isinstance(msg, HumanMessage) or not isinstance(msg.content, list):
            sanitized.append(msg)
            continue

        new_content = []
        modified = False
        for block in msg.content:
            if (
                isinstance(block, dict)
                and block.get("type") == "image_url"
                and isinstance(block.get("image_url"), dict)
                and "api.telegram.org" in block["image_url"].get("url", "")
            ):
                new_content.append({"type": "text", "text": "[이전 이미지 - 만료됨]"})
                modified = True
            else:
                new_content.append(block)

        sanitized.append(msg.model_copy(update={"content": new_content}) if modified else msg)

    n = sum(1 for o, n in zip(messages, sanitized) if o is not n)
    if n:
        logger.debug("_sanitize_image_urls: replaced expired Telegram URLs in %d message(s)", n)
    return sanitized


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

# Tools that require explicit user approval before execution.
# When the LLM decides to call one of these, the graph pauses via interrupt()
# and a PENDING_APPROVAL event is streamed to the gateway.  Execution resumes
# only after the user confirms (SubmitApproval RPC) or cancels.
RISKY_TOOLS: frozenset[str] = frozenset({
    "google_calendar_delete",
    "google_tasks_delete",
    "google_mail_send",
})


def _format_risky_calls(tool_calls: list[dict]) -> str:
    """Build a concise Korean description of risky tool calls for user display."""
    labels = {
        "google_calendar_delete": "캘린더 일정 삭제",
        "google_tasks_delete": "할 일 삭제",
        "google_mail_send": "이메일 발송",
    }
    parts = []
    for tc in tool_calls:
        label = labels.get(tc["name"], tc["name"])
        args = tc.get("args", {})
        detail = ""
        if tc["name"] == "google_calendar_delete":
            detail = f" (event_id: {args.get('event_id', '')})"
        elif tc["name"] == "google_tasks_delete":
            detail = f" (task_id: {args.get('task_id', '')})"
        elif tc["name"] == "google_mail_send":
            detail = f" → {args.get('to', '')} 제목: {args.get('subject', '')}"
        parts.append(f"• {label}{detail}")
    return "\n".join(parts)


async def _approval_gate_node(state: MessagesState) -> dict:
    """Pause execution when a risky tool call is pending and request approval.

    Inserts itself between the agent node and the tools node.  If no risky
    tools are pending the function returns immediately (pass-through).  When a
    risky tool is detected it calls ``interrupt()`` which checkpoints the graph
    and raises ``GraphInterrupt`` to the caller.

    On resume (``Command(resume=True)``), returns {} so the tools node runs.
    On cancellation (``Command(resume=False)``), injects ToolMessage stubs for
    every pending tool call so the graph skips ToolNode and returns to the agent.
    """
    last = state["messages"][-1]
    if not hasattr(last, "tool_calls") or not last.tool_calls:
        return {}

    risky = [tc for tc in last.tool_calls if tc["name"] in RISKY_TOOLS]
    if not risky:
        return {}

    desc = _format_risky_calls(risky)
    tool_detail = json.dumps(
        [{"name": tc["name"], "args": tc.get("args", {})} for tc in risky],
        ensure_ascii=False,
    )
    first_risky_name = risky[0]["name"]

    # Blocks here — raises GraphInterrupt, resumes when Command(resume=value) arrives.
    approved = interrupt({
        "description": desc,
        "tool_name": first_risky_name,
        "tool_detail": tool_detail,
    })

    if approved:
        return {}  # Proceed to ToolNode unchanged.

    # Cancelled: inject stub ToolMessages for ALL pending calls so ToolNode is
    # bypassed and the agent can acknowledge the cancellation gracefully.
    cancel_msgs = [
        ToolMessage(
            tool_call_id=tc["id"],
            content=f"작업이 취소됐어요: {tc['name']}",
        )
        for tc in last.tool_calls
    ]
    return {"messages": cancel_msgs}


def _route_agent_to_gate_or_end(state: MessagesState) -> str:
    """Route from agent node: to approval_gate if tool calls exist, else END."""
    last = state["messages"][-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "approval_gate"
    return "__end__"


def _route_after_gate(state: MessagesState) -> str:
    """Route after approval_gate: to tools if approved, back to agent if cancelled."""
    last = state["messages"][-1]
    # If cancellation ToolMessages were injected, last message is a ToolMessage.
    if isinstance(last, ToolMessage):
        return "agent"
    return "tools"


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
    language: str = "ko",
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
    catalog_text = build_skill_catalog(skill_docs, language=language)
    instructions_text = build_skill_instructions(skill_docs, language=language)

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


async def log_tool_usage(
    llm: Any,
    response: Any,
    user_id: str,
    call_type: str = "tool",
) -> None:
    """Best-effort usage logging for secondary LLM calls inside tool functions.

    Extracts token counts from the LangChain response, normalises provider
    semantics (Anthropic vs OpenAI/Gemini), and inserts a usage_logs row.
    Never raises — errors are silently logged at DEBUG level.
    """
    try:
        active_model: str = (
            getattr(llm, "model", None) or getattr(llm, "model_name", "") or ""
        )
        active_provider = get_provider(active_model)
        um: dict = getattr(response, "usage_metadata", {}) or {}
        raw_input     = int(um.get("input_tokens", 0))
        output_tokens = int(um.get("output_tokens", 0))

        if active_provider == "anthropic":
            cache_read         = int(um.get("cache_read_input_tokens", 0))
            cache_write_tokens = int(um.get("cache_creation_input_tokens", 0))
            input_tokens       = raw_input + cache_read + cache_write_tokens
            cached_tokens      = cache_read
            cost_input         = raw_input + cache_read
        else:
            itd                = um.get("input_token_details") or {}
            cached_tokens      = int(itd.get("cache_read", 0))
            cache_write_tokens = int(itd.get("cache_creation", 0))
            input_tokens       = raw_input
            cost_input         = raw_input

        cost = calculate_cost(
            active_model, cost_input, output_tokens, cached_tokens, cache_write_tokens,
        )
        if user_id:
            pool = get_pool()
            await usage_repo.save_usage_log(
                pool, user_id, active_model, active_provider,
                input_tokens, output_tokens, cached_tokens, cost,
                status="success", call_type=call_type,
            )
    except Exception:
        logger.debug("log_tool_usage failed", exc_info=True)


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

    _strings = get_prompt_strings(language)

    # Level 1: Skill catalog — name + tools + description per skill.
    # The catalog already includes tool names (e.g. "**메모** (save_memo, ...):")
    # so the LLM can directly map user intent to the correct tool call.
    if catalog_text:
        prompt_text += "\n\n" + catalog_text
        prompt_text += "\n" + _strings["catalog_no_other_tools"]

    # Level 2: Full instructions (tool usage guidelines).
    if instructions_text:
        prompt_text += "\n\n" + instructions_text

    # Repeat persona tone at the END for recency effect —
    # long tool instructions can cause the LLM to "forget" early style rules.
    p = get_persona(persona_id)
    prompt_text += (
        f"\n\n[{_strings['persona_final_header']} '{p['name']}']\n"
        f"{p['tone'].split(chr(10))[0]}"  # first line (the most critical rule)
    )

    # Repeat tool-priority rules at the very END for recency effect.
    # This is the last thing the LLM reads before generating a response,
    # so it has the strongest influence on whether tool_calls are emitted.
    # The catalog above maps each skill to its tools — use it as the guide.
    if enabled_tool_names:
        prompt_text += (
            f"\n\n{_strings['tool_rules_header']}\n"
            + _strings["tool_rules_body"]
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

    # Fetch user language and timezone first — language is passed to skill catalog/instructions
    # builders so their headers are localized, and set in lang_ctx for tools/guard access.
    user_language = "ko"
    user_tz_str = "Asia/Seoul"
    if user_id:
        pool = get_pool()
        user_language, user_tz_str = await asyncio.gather(
            get_user_language(pool, user_id),
            get_user_timezone(pool, user_id),
        )
    set_current_language(user_language)

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
        ) = await _get_enabled_context(user_id, language=user_language)
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
        "[LLM] user=%s | lang=%s | %s",
        user_id, user_language,
        _model_tag(_llm_provider, _llm_model, "(chat)"),
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

    # Compute ISO-week boundaries (Monday-start) so the LLM never has to
    # guess what "이번 주" / "다음 주" / "next week" means.
    from datetime import timedelta
    _today = _now.date()
    _this_mon = _today - timedelta(days=_today.weekday())       # Monday of current week
    _this_sun = _this_mon + timedelta(days=6)                   # Sunday of current week
    _next_mon = _this_mon + timedelta(days=7)                   # Monday of next week
    _next_sun = _next_mon + timedelta(days=6)                   # Sunday of next week

    _week_labels = {
        "ko": ("이번 주", "다음 주"),
        "en": ("this week", "next week"),
        "ja": ("今週", "来週"),
        "zh": ("本周", "下周"),
    }
    _this_lbl, _next_lbl = _week_labels.get(user_language, _week_labels["en"])

    now_str = (
        f"[{_label}: {_now.strftime('%Y-%m-%d')} ({_wd}) "
        f"{_now.strftime('%H:%M')} {_tz_abbr} | "
        f"{_this_lbl}: {_this_mon} ~ {_this_sun} | "
        f"{_next_lbl}: {_next_mon} ~ {_next_sun}]"
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
    messages = [SystemMessage(content=prompt_text)] + _drop_orphaned_human_messages(
        _sanitize_image_urls(
            _filter_stale_tool_errors(state["messages"])
        )
    )

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
    # agent → approval_gate → tools → agent (or approval_gate → agent on cancel)
    builder = StateGraph(MessagesState)
    builder.add_node("agent", _agent_node)
    builder.add_node("approval_gate", _approval_gate_node)
    builder.add_node("tools", tool_node)
    builder.set_entry_point("agent")
    builder.add_conditional_edges(
        "agent",
        _route_agent_to_gate_or_end,
        {"approval_gate": "approval_gate", "__end__": "__end__"},
    )
    builder.add_conditional_edges(
        "approval_gate",
        _route_after_gate,
        {"tools": "tools", "agent": "agent"},
    )
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
