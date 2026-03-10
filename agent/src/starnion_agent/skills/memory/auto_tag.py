"""Auto-tagging service: extracts tags from content using the user's LLM."""

import asyncio
import logging
from typing import Any, Literal

logger = logging.getLogger(__name__)

Source = Literal["diary", "memo"]

_TAG_PROMPT = (
    "다음 내용에서 핵심 태그를 3~7개 추출해주세요. "
    "태그는 한국어 단어나 짧은 구문으로 작성하고 쉼표로 구분해 반환하세요. "
    "다른 설명 없이 태그만 반환하세요.\n\n"
    "내용: {text}\n\n태그:"
)


def _make_llm(prov: str, model: str, api_key: str, base_url: str = "") -> Any:
    """Create a minimal LLM instance for tag extraction.

    Mirrors agent._make_llm without importing from agent to avoid circular deps.
    """
    if prov == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(model=model, api_key=api_key)  # type: ignore[call-arg]
    elif prov == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(model=model, google_api_key=api_key)
    elif prov in ("openai", "zai"):
        from langchain_openai import ChatOpenAI
        kw: dict[str, Any] = {"model": model, "api_key": api_key}  # type: ignore[assignment]
        if base_url:
            kw["base_url"] = base_url
        return ChatOpenAI(**kw)
    elif prov == "custom" and base_url:
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model=model, api_key=api_key or "sk-none", base_url=base_url)  # type: ignore[call-arg]
    return None


async def _do_auto_tag(
    user_id: str,
    source: Source,
    source_id: int,
    title: str,
    content: str,
) -> None:
    """Internal coroutine: calls LLM and stores tags. Non-fatal on any error."""
    try:
        from starnion_agent.db.pool import get_pool
        from starnion_agent.db.repositories import content_tags as tags_repo
        from starnion_agent.db.repositories import provider as provider_repo

        pool = get_pool()
        persona_row = await provider_repo.get_default_persona_with_provider(pool, user_id)
        if not persona_row:
            return

        prov = persona_row.get("provider", "")
        model = persona_row.get("model", "")
        api_key = persona_row.get("api_key", "")
        base_url = persona_row.get("base_url", "") or ""

        if not (prov and model and api_key):
            return

        llm = _make_llm(prov, model, api_key, base_url)
        if llm is None:
            return

        text = f"{title}\n{content}".strip()[:500]
        prompt = _TAG_PROMPT.format(text=text)
        response = await llm.ainvoke(prompt)
        raw: str = response.content if hasattr(response, "content") else str(response)

        tags = [t.strip().lstrip("#") for t in raw.split(",") if t.strip()]
        tags = [t for t in tags if t and len(t) <= 20][:7]

        if tags:
            await tags_repo.upsert_tags(pool, user_id, source, source_id, tags)
            logger.info("auto_tag: %s/%s → %s", source, source_id, tags)

    except Exception:
        logger.debug("auto_tag failed (non-critical)", exc_info=True)


def schedule_auto_tag(
    user_id: str,
    source: Source,
    source_id: int,
    title: str,
    content: str,
) -> None:
    """Fire-and-forget auto-tagging from within a running event loop.

    Safe to call from any async tool — failure is silently logged.
    """
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(
            _do_auto_tag(user_id, source, source_id, title, content),
            name=f"auto_tag_{source}_{source_id}",
        )
    except RuntimeError:
        pass  # No running loop — skip silently
