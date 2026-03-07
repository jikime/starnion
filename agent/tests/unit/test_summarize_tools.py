"""Unit tests for starnion_agent.skills.summarize.tools module.

Tests cover:
- ``SummarizeUrlInput`` / ``SummarizeTextInput``: Pydantic input schemas
- ``_build_summary_prompt``: Prompt construction for each style
- ``_strip_html_tags``: HTML tag stripping helper
- ``summarize_url`` tool: URL fetch + Gemini summarization
- ``summarize_text`` tool: Direct text Gemini summarization
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from pydantic import ValidationError

from starnion_agent.skills.summarize.tools import (
    SummarizeTextInput,
    SummarizeUrlInput,
    _STYLE_INSTRUCTIONS,
    _build_summary_prompt,
    _strip_html_tags,
    summarize_text,
    summarize_url,
)


# =========================================================================
# Pydantic input schemas
# =========================================================================
class TestSummarizeUrlInput:
    def test_valid_input(self):
        model = SummarizeUrlInput(url="https://example.com")
        assert model.url == "https://example.com"
        assert model.style == "concise"

    def test_custom_style(self):
        model = SummarizeUrlInput(url="https://example.com", style="detailed")
        assert model.style == "detailed"

    def test_missing_url_raises(self):
        with pytest.raises(ValidationError):
            SummarizeUrlInput()  # type: ignore[call-arg]


class TestSummarizeTextInput:
    def test_valid_input(self):
        model = SummarizeTextInput(text="Some long text to summarize")
        assert model.text == "Some long text to summarize"
        assert model.style == "concise"

    def test_custom_style(self):
        model = SummarizeTextInput(text="text", style="bullets")
        assert model.style == "bullets"

    def test_missing_text_raises(self):
        with pytest.raises(ValidationError):
            SummarizeTextInput()  # type: ignore[call-arg]


# =========================================================================
# Helper: _build_summary_prompt
# =========================================================================
class TestBuildSummaryPrompt:
    def test_concise_style(self):
        prompt = _build_summary_prompt("Hello world", "concise")
        assert "200자" in prompt
        assert "Hello world" in prompt

    def test_detailed_style(self):
        prompt = _build_summary_prompt("Hello world", "detailed")
        assert "500자" in prompt

    def test_bullets_style(self):
        prompt = _build_summary_prompt("Hello world", "bullets")
        assert "불릿" in prompt

    def test_unknown_style_uses_concise(self):
        prompt = _build_summary_prompt("Hello world", "unknown_style")
        assert "200자" in prompt

    def test_long_text_truncated(self):
        long_text = "A" * 20000
        prompt = _build_summary_prompt(long_text, "concise")
        assert "잘려있음" in prompt

    def test_korean_instructions(self):
        prompt = _build_summary_prompt("text", "concise")
        assert "한국어" in prompt
        assert "요약" in prompt

    def test_all_styles_have_instructions(self):
        assert set(_STYLE_INSTRUCTIONS.keys()) == {"concise", "detailed", "bullets"}


# =========================================================================
# Helper: _strip_html_tags
# =========================================================================
class TestStripHtmlTags:
    def test_removes_tags(self):
        assert _strip_html_tags("<p>Hello <b>world</b></p>") == "Hello world"

    def test_collapses_whitespace(self):
        assert _strip_html_tags("hello   \n  world") == "hello world"

    def test_empty_string(self):
        assert _strip_html_tags("") == ""


# =========================================================================
# Mock helpers
# =========================================================================
def _make_mock_response(
    text: str = "",
    content_type: str = "text/html; charset=utf-8",
    content_length: str | None = None,
) -> MagicMock:
    """Create a mock httpx.Response."""
    resp = MagicMock()
    headers: dict[str, str] = {"content-type": content_type}
    if content_length is not None:
        headers["content-length"] = content_length
    resp.headers = headers
    resp.text = text
    resp.raise_for_status = MagicMock()
    return resp


def _patch_httpx(mock_response=None, side_effect=None):
    """Patch httpx.AsyncClient to return a mock response or raise."""
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)
    if side_effect:
        mock_ctx.get = AsyncMock(side_effect=side_effect)
    else:
        mock_ctx.get = AsyncMock(return_value=mock_response)
    return patch(
        "starnion_agent.skills.summarize.tools.httpx.AsyncClient",
        return_value=mock_ctx,
    )


def _patch_gemini(content: str = "요약 결과입니다."):
    """Patch ChatGoogleGenerativeAI to return a mock response."""
    mock_llm = AsyncMock()
    mock_response = MagicMock()
    mock_response.content = content
    mock_llm.ainvoke = AsyncMock(return_value=mock_response)
    return patch(
        "starnion_agent.skills.summarize.tools.ChatGoogleGenerativeAI",
        return_value=mock_llm,
    )


# =========================================================================
# summarize_url tool
# =========================================================================
class TestSummarizeUrl:
    @pytest.mark.asyncio
    @patch("starnion_agent.skills.summarize.tools.settings")
    async def test_no_api_key(self, mock_settings):
        mock_settings.gemini_api_key = ""
        result = await summarize_url.ainvoke({"url": "https://example.com"})
        assert "Gemini API 키" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.summarize.tools.settings")
    async def test_invalid_url(self, mock_settings):
        mock_settings.gemini_api_key = "test-key"
        result = await summarize_url.ainvoke({"url": "not-a-url"})
        assert "올바른 URL" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.summarize.tools.settings")
    async def test_timeout(self, mock_settings):
        mock_settings.gemini_api_key = "test-key"
        with _patch_httpx(side_effect=httpx.TimeoutException("timeout")):
            result = await summarize_url.ainvoke({"url": "https://example.com"})
        assert "시간이 초과" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.summarize.tools.settings")
    async def test_http_error(self, mock_settings):
        mock_settings.gemini_api_key = "test-key"
        err_resp = MagicMock()
        err_resp.status_code = 404
        with _patch_httpx(
            side_effect=httpx.HTTPStatusError("", request=MagicMock(), response=err_resp)
        ):
            result = await summarize_url.ainvoke({"url": "https://example.com/404"})
        assert "HTTP 404" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.summarize.tools.settings")
    async def test_binary_content(self, mock_settings):
        mock_settings.gemini_api_key = "test-key"
        resp = _make_mock_response(content_type="application/pdf")
        with _patch_httpx(mock_response=resp):
            result = await summarize_url.ainvoke({"url": "https://example.com/file.pdf"})
        assert "바이너리" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.summarize.tools.settings")
    async def test_oversized(self, mock_settings):
        mock_settings.gemini_api_key = "test-key"
        resp = _make_mock_response(content_length=str(10 * 1024 * 1024))
        with _patch_httpx(mock_response=resp):
            result = await summarize_url.ainvoke({"url": "https://example.com/big"})
        assert "5MB" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.summarize.tools._extract_readable_text", return_value="")
    @patch("starnion_agent.skills.summarize.tools.settings")
    async def test_empty_extraction(self, mock_settings, _mock_extract):
        mock_settings.gemini_api_key = "test-key"
        resp = _make_mock_response(text="<html></html>")
        with _patch_httpx(mock_response=resp):
            result = await summarize_url.ainvoke({"url": "https://example.com"})
        assert "추출할 수 없었어요" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.summarize.tools._extract_readable_text")
    @patch("starnion_agent.skills.summarize.tools.settings")
    async def test_successful_html(self, mock_settings, mock_extract):
        mock_settings.gemini_api_key = "test-key"
        mock_settings.gemini_model = "gemini-2.0-flash"
        mock_extract.return_value = "Article about Python programming."

        resp = _make_mock_response(text="<html><body>content</body></html>")
        with _patch_httpx(mock_response=resp), _patch_gemini("파이썬 프로그래밍 기사입니다."):
            result = await summarize_url.ainvoke({"url": "https://example.com"})

        assert "파이썬" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.summarize.tools.settings")
    async def test_plain_text_url(self, mock_settings):
        mock_settings.gemini_api_key = "test-key"
        mock_settings.gemini_model = "gemini-2.0-flash"

        resp = _make_mock_response(
            text="This is plain text content about AI.",
            content_type="text/plain",
        )
        with _patch_httpx(mock_response=resp), _patch_gemini("AI에 대한 텍스트입니다."):
            result = await summarize_url.ainvoke({"url": "https://example.com/text"})

        assert "AI" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.summarize.tools._extract_readable_text")
    @patch("starnion_agent.skills.summarize.tools.settings")
    async def test_llm_error(self, mock_settings, mock_extract):
        mock_settings.gemini_api_key = "test-key"
        mock_settings.gemini_model = "gemini-2.0-flash"
        mock_extract.return_value = "Some article text."

        resp = _make_mock_response(text="<html>content</html>")
        with _patch_httpx(mock_response=resp):
            with patch(
                "starnion_agent.skills.summarize.tools.ChatGoogleGenerativeAI",
                side_effect=Exception("LLM error"),
            ):
                result = await summarize_url.ainvoke({"url": "https://example.com"})

        assert "오류가 발생했어요" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.summarize.tools.settings")
    async def test_invalid_style_defaults(self, mock_settings):
        mock_settings.gemini_api_key = "test-key"
        mock_settings.gemini_model = "gemini-2.0-flash"

        resp = _make_mock_response(text="Plain text", content_type="text/plain")
        with _patch_httpx(mock_response=resp), _patch_gemini("요약 결과"):
            result = await summarize_url.ainvoke(
                {"url": "https://example.com", "style": "invalid"}
            )
        assert "요약 결과" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.summarize.tools.settings")
    async def test_network_error(self, mock_settings):
        mock_settings.gemini_api_key = "test-key"
        with _patch_httpx(side_effect=Exception("Connection refused")):
            result = await summarize_url.ainvoke({"url": "https://example.com"})
        assert "접속할 수 없어요" in result


# =========================================================================
# summarize_text tool
# =========================================================================
class TestSummarizeText:
    @pytest.mark.asyncio
    @patch("starnion_agent.skills.summarize.tools.settings")
    async def test_no_api_key(self, mock_settings):
        mock_settings.gemini_api_key = ""
        result = await summarize_text.ainvoke({"text": "some text"})
        assert "Gemini API 키" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.summarize.tools.settings")
    async def test_empty_text(self, mock_settings):
        mock_settings.gemini_api_key = "test-key"
        result = await summarize_text.ainvoke({"text": ""})
        assert "텍스트를 입력" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.summarize.tools.settings")
    async def test_whitespace_only(self, mock_settings):
        mock_settings.gemini_api_key = "test-key"
        result = await summarize_text.ainvoke({"text": "   "})
        assert "텍스트를 입력" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.summarize.tools.settings")
    async def test_successful_concise(self, mock_settings):
        mock_settings.gemini_api_key = "test-key"
        mock_settings.gemini_model = "gemini-2.0-flash"

        with _patch_gemini("핵심 요약입니다."):
            result = await summarize_text.ainvoke({"text": "A very long article..."})

        assert "핵심 요약" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.summarize.tools.settings")
    async def test_successful_bullets(self, mock_settings):
        mock_settings.gemini_api_key = "test-key"
        mock_settings.gemini_model = "gemini-2.0-flash"

        with _patch_gemini("• 포인트 1\n• 포인트 2\n• 포인트 3"):
            result = await summarize_text.ainvoke(
                {"text": "Long article text", "style": "bullets"}
            )

        assert "포인트" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.summarize.tools.settings")
    async def test_llm_error(self, mock_settings):
        mock_settings.gemini_api_key = "test-key"
        mock_settings.gemini_model = "gemini-2.0-flash"

        with patch(
            "starnion_agent.skills.summarize.tools.ChatGoogleGenerativeAI",
            side_effect=Exception("LLM error"),
        ):
            result = await summarize_text.ainvoke({"text": "some text"})

        assert "오류가 발생했어요" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.summarize.tools.settings")
    async def test_invalid_style_defaults(self, mock_settings):
        mock_settings.gemini_api_key = "test-key"
        mock_settings.gemini_model = "gemini-2.0-flash"

        with _patch_gemini("요약됨"):
            result = await summarize_text.ainvoke(
                {"text": "some text", "style": "wrong"}
            )

        assert "요약됨" in result
