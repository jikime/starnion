"""URL and text summarization tools using Gemini LLM."""

import logging
import re

import httpx
from langchain_core.messages import HumanMessage
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

from jiki_agent.config import settings
from jiki_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

# Maximum download size for URL fetch (5 MB).
_MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024

# Maximum text length to send to LLM (~15K chars).
_MAX_LLM_INPUT_CHARS = 15000

# Style -> Korean instruction mapping.
_STYLE_INSTRUCTIONS: dict[str, str] = {
    "concise": "200자 이내로 핵심만 간결하게 요약하세요.",
    "detailed": "500자 내외로 주요 내용을 상세히 요약하세요.",
    "bullets": "핵심 내용을 3~7개 항목별 불릿 포인트(•)로 정리하세요.",
}


# ---------------------------------------------------------------------------
# Input schemas
# ---------------------------------------------------------------------------
class SummarizeUrlInput(BaseModel):
    """Input schema for summarize_url tool."""

    url: str = Field(description="요약할 웹페이지 URL")
    style: str = Field(
        default="concise",
        description="요약 스타일: concise(짧게), detailed(상세), bullets(항목별)",
    )


class SummarizeTextInput(BaseModel):
    """Input schema for summarize_text tool."""

    text: str = Field(description="요약할 텍스트")
    style: str = Field(
        default="concise",
        description="요약 스타일: concise(짧게), detailed(상세), bullets(항목별)",
    )


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


def _build_summary_prompt(text: str, style: str) -> str:
    """Build a Korean summarization prompt for Gemini."""
    style_instruction = _STYLE_INSTRUCTIONS.get(style, _STYLE_INSTRUCTIONS["concise"])

    if len(text) > _MAX_LLM_INPUT_CHARS:
        text = text[:_MAX_LLM_INPUT_CHARS] + "\n\n... (원문이 잘려있음)"

    return (
        "당신은 전문 요약가입니다. 아래 텍스트를 한국어로 요약하세요.\n\n"
        f"요약 스타일: {style_instruction}\n\n"
        "규칙:\n"
        "- 반드시 한국어로 요약하세요\n"
        "- 원문의 핵심 정보를 빠뜨리지 마세요\n"
        "- 요약만 출력하세요 (다른 설명 없이)\n\n"
        f"원문:\n{text}"
    )


async def _fetch_url_text(url: str) -> str:
    """Fetch URL and extract readable text.

    Returns extracted text on success, or ``"ERROR:..."`` on failure.
    """
    try:
        async with httpx.AsyncClient(
            timeout=30,
            follow_redirects=True,
            headers={"User-Agent": "JikiBot/1.0"},
        ) as client:
            response = await client.get(url)
            response.raise_for_status()
    except httpx.TimeoutException:
        return "ERROR:웹페이지 로딩 시간이 초과됐어요. URL을 확인하거나 잠시 후 다시 시도해주세요."
    except httpx.HTTPStatusError as e:
        return f"ERROR:웹페이지에 접속할 수 없어요. (HTTP {e.response.status_code})"
    except Exception:
        logger.debug("summarize URL fetch failed", exc_info=True)
        return "ERROR:웹페이지에 접속할 수 없어요. URL을 확인해주세요."

    content_length = response.headers.get("content-length")
    if content_length and int(content_length) > _MAX_DOWNLOAD_BYTES:
        return "ERROR:파일 크기가 너무 커요 (5MB 초과)."

    content_type = response.headers.get("content-type", "")

    if any(
        t in content_type
        for t in ("pdf", "image/", "audio/", "video/", "octet-stream")
    ):
        return "ERROR:이 URL은 바이너리 파일이에요. 텍스트 콘텐츠 URL을 사용해주세요."

    if any(
        t in content_type
        for t in ("text/plain", "application/json", "text/xml")
    ):
        return response.text

    try:
        text = _extract_readable_text(response.text)
    except Exception:
        logger.debug("Readability extraction failed, falling back", exc_info=True)
        text = _strip_html_tags(response.text)

    return text


async def _call_gemini(prompt: str) -> str:
    """Call Gemini LLM and return the response content."""
    llm = ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=settings.gemini_api_key,
    )
    response = await llm.ainvoke([HumanMessage(content=prompt)])
    return response.content


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------
@tool(args_schema=SummarizeUrlInput)
@skill_guard("summarize")
async def summarize_url(url: str, style: str = "concise") -> str:
    """URL 웹페이지의 내용을 AI로 요약합니다. 기사, 블로그, 문서 등의 핵심 내용을 빠르게 파악할 때 사용합니다."""
    if not settings.gemini_api_key:
        return "요약 기능을 사용하려면 Gemini API 키가 필요해요."

    if not url.startswith(("http://", "https://")):
        return "올바른 URL을 입력해주세요. (http:// 또는 https://로 시작)"

    if style not in _STYLE_INSTRUCTIONS:
        style = "concise"

    text = await _fetch_url_text(url)

    if text.startswith("ERROR:"):
        return text[6:]

    if not text.strip():
        return "웹페이지에서 요약할 내용을 추출할 수 없었어요."

    prompt = _build_summary_prompt(text, style)
    try:
        return await _call_gemini(prompt)
    except Exception:
        logger.debug("summarize_url LLM call failed", exc_info=True)
        return "요약 중 오류가 발생했어요. 잠시 후 다시 시도해주세요."


@tool(args_schema=SummarizeTextInput)
@skill_guard("summarize")
async def summarize_text(text: str, style: str = "concise") -> str:
    """주어진 텍스트를 AI로 요약합니다. 긴 글, 문서 내용, 다른 도구의 결과를 간단히 정리할 때 사용합니다."""
    if not settings.gemini_api_key:
        return "요약 기능을 사용하려면 Gemini API 키가 필요해요."

    if not text or not text.strip():
        return "요약할 텍스트를 입력해주세요."

    if style not in _STYLE_INSTRUCTIONS:
        style = "concise"

    prompt = _build_summary_prompt(text, style)
    try:
        return await _call_gemini(prompt)
    except Exception:
        logger.debug("summarize_text LLM call failed", exc_info=True)
        return "요약 중 오류가 발생했어요. 잠시 후 다시 시도해주세요."
