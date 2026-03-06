"""Web search and URL content extraction tools."""

import logging
import re

import httpx
from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starpion_agent.config import settings
from starpion_agent.context import get_current_user
from starpion_agent.db.pool import get_pool
from starpion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)


async def _get_tavily_api_key() -> str:
    """Return the Tavily API key for the current user.

    Priority:
    1. User-specific key from integration_keys table
    2. Global TAVILY_API_KEY from environment
    """
    user_id = get_current_user()
    if user_id:
        try:
            from psycopg.rows import dict_row

            pool = get_pool()
            async with pool.connection() as conn:
                async with conn.cursor(row_factory=dict_row) as cur:
                    await cur.execute(
                        "SELECT api_key FROM integration_keys WHERE user_id = %s AND provider = 'tavily'",
                        (user_id,),
                    )
                    row = await cur.fetchone()
                    if row and row.get("api_key"):
                        logger.debug("[Tavily] user=%s | using user-specific key", user_id)
                        return row["api_key"]
        except Exception:
            logger.debug("Failed to fetch user Tavily key, falling back to global", exc_info=True)
    return settings.tavily_api_key

# Maximum download size for web_fetch (5 MB).
_MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024


# ---------------------------------------------------------------------------
# Input schemas
# ---------------------------------------------------------------------------
class WebSearchInput(BaseModel):
    """Input schema for web_search tool."""

    query: str = Field(description="검색할 키워드나 질문")
    max_results: int = Field(default=5, description="최대 검색 결과 수 (1~10)")


class WebFetchInput(BaseModel):
    """Input schema for web_fetch tool."""

    url: str = Field(description="내용을 가져올 웹페이지 URL")
    max_length: int = Field(default=8000, description="반환할 최대 텍스트 길이 (문자 수)")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _strip_html_tags(html: str) -> str:
    """Remove HTML tags and collapse whitespace."""
    text = re.sub(r"<[^>]+>", "", html)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _extract_readable_text(html: str) -> str:
    """Extract main readable content from HTML using readability-lxml."""
    from readability import Document  # type: ignore[import-untyped]

    doc = Document(html)
    title = doc.title() or ""
    summary_html = doc.summary() or ""
    body_text = _strip_html_tags(summary_html)

    if title and body_text:
        return f"{title}\n\n{body_text}"
    return body_text or title or ""


def _format_search_results(results: list[dict]) -> str:
    """Format Tavily search results into a readable string."""
    if not results:
        return "검색 결과가 없어요."

    lines: list[str] = []
    for i, r in enumerate(results, 1):
        title = r.get("title", "(제목 없음)")
        url = r.get("url", "")
        content = r.get("content", "")
        lines.append(f"{i}. **{title}**\n   URL: {url}\n   {content}")
    return "\n\n".join(lines)


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------
@tool(args_schema=WebSearchInput)
@skill_guard("websearch")
async def web_search(query: str, max_results: int = 5) -> str:
    """인터넷에서 최신 정보를 검색합니다. 실시간 뉴스, 사실 확인, 최신 데이터가 필요할 때 사용합니다."""
    api_key = await _get_tavily_api_key()
    if not api_key:
        return (
            "웹 검색 기능을 사용하려면 Tavily API 키가 필요해요. "
            "설정 → 연동 메뉴에서 Tavily API 키를 등록해주세요."
        )

    max_results = max(1, min(max_results, 10))

    try:
        from tavily import AsyncTavilyClient  # type: ignore[import-untyped]

        client = AsyncTavilyClient(api_key=api_key)
        response = await client.search(
            query=query,
            max_results=max_results,
            search_depth="basic",
        )
    except Exception:
        logger.debug("Tavily search failed", exc_info=True)
        return "웹 검색 중 오류가 발생했어요. 잠시 후 다시 시도해주세요."

    results = response.get("results", [])
    return _format_search_results(results)


@tool(args_schema=WebFetchInput)
@skill_guard("websearch")
async def web_fetch(url: str, max_length: int = 8000) -> str:
    """웹페이지의 내용을 가져와 읽기 쉬운 텍스트로 변환합니다. 특정 URL의 상세 내용이 필요할 때 사용합니다."""
    if not url.startswith(("http://", "https://")):
        return "올바른 URL을 입력해주세요. (http:// 또는 https://로 시작)"

    max_length = max(500, min(max_length, 50000))

    try:
        async with httpx.AsyncClient(
            timeout=30,
            follow_redirects=True,
            headers={"User-Agent": "JikiBot/1.0"},
        ) as client:
            response = await client.get(url)
            response.raise_for_status()
    except httpx.TimeoutException:
        return "웹페이지 로딩 시간이 초과됐어요. URL을 확인하거나 잠시 후 다시 시도해주세요."
    except httpx.HTTPStatusError as e:
        return f"웹페이지에 접속할 수 없어요. (HTTP {e.response.status_code})"
    except Exception:
        logger.debug("web_fetch HTTP request failed", exc_info=True)
        return "웹페이지에 접속할 수 없어요. URL을 확인해주세요."

    # Check content size.
    content_length = response.headers.get("content-length")
    if content_length and int(content_length) > _MAX_DOWNLOAD_BYTES:
        return "파일 크기가 너무 커요 (5MB 초과). 문서 파일은 parse_document 도구를 사용해주세요."

    content_type = response.headers.get("content-type", "")

    # Binary content: suggest parse_document.
    if any(t in content_type for t in ("pdf", "image/", "audio/", "video/", "octet-stream")):
        return "이 URL은 바이너리 파일이에요. 문서 파일은 parse_document 도구를 사용해주세요."

    # Plain text / JSON / XML: return raw text.
    if any(t in content_type for t in ("text/plain", "application/json", "text/xml")):
        text = response.text[:max_length]
        if len(response.text) > max_length:
            text += "\n\n... (내용이 잘렸어요)"
        return text

    # HTML: extract readable content.
    try:
        text = _extract_readable_text(response.text)
    except Exception:
        logger.debug("Readability extraction failed, falling back", exc_info=True)
        text = _strip_html_tags(response.text)

    if not text.strip():
        return "웹페이지에서 텍스트 내용을 추출할 수 없었어요."

    if len(text) > max_length:
        text = text[:max_length] + "\n\n... (내용이 잘렸어요)"

    return text
