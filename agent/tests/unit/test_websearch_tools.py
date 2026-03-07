"""Unit tests for starnion_agent.skills.websearch.tools module.

Tests cover:
- ``WebSearchInput`` / ``WebFetchInput``: Pydantic input schemas
- ``web_search`` tool: Tavily search with Korean responses
- ``web_fetch`` tool: URL fetch with readability extraction
- Helper functions: ``_strip_html_tags``, ``_format_search_results``
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

from starnion_agent.skills.websearch.tools import (
    WebFetchInput,
    WebSearchInput,
    _format_search_results,
    _strip_html_tags,
    web_fetch,
    web_search,
)


# =========================================================================
# Pydantic input schemas
# =========================================================================
class TestWebSearchInput:
    def test_valid_input(self):
        model = WebSearchInput(query="python 3.13")
        assert model.query == "python 3.13"
        assert model.max_results == 5

    def test_custom_max_results(self):
        model = WebSearchInput(query="test", max_results=3)
        assert model.max_results == 3

    def test_missing_query_raises(self):
        with pytest.raises(ValidationError):
            WebSearchInput()  # type: ignore[call-arg]


class TestWebFetchInput:
    def test_valid_input(self):
        model = WebFetchInput(url="https://example.com")
        assert model.url == "https://example.com"
        assert model.max_length == 8000

    def test_custom_max_length(self):
        model = WebFetchInput(url="https://example.com", max_length=2000)
        assert model.max_length == 2000

    def test_missing_url_raises(self):
        with pytest.raises(ValidationError):
            WebFetchInput()  # type: ignore[call-arg]


# =========================================================================
# Helper functions
# =========================================================================
class TestStripHtmlTags:
    def test_removes_tags(self):
        assert _strip_html_tags("<p>Hello <b>world</b></p>") == "Hello world"

    def test_collapses_whitespace(self):
        assert _strip_html_tags("hello   \n  world") == "hello world"

    def test_empty_string(self):
        assert _strip_html_tags("") == ""


class TestFormatSearchResults:
    def test_empty_results(self):
        assert "검색 결과가 없어요" in _format_search_results([])

    def test_formats_results(self):
        results = [
            {"title": "Title 1", "url": "https://a.com", "content": "Summary 1"},
            {"title": "Title 2", "url": "https://b.com", "content": "Summary 2"},
        ]
        formatted = _format_search_results(results)
        assert "Title 1" in formatted
        assert "https://a.com" in formatted
        assert "Title 2" in formatted
        assert "1." in formatted
        assert "2." in formatted


# =========================================================================
# web_search tool
# =========================================================================
class TestWebSearchTool:
    @pytest.mark.asyncio
    @patch("starnion_agent.skills.websearch.tools.settings")
    async def test_no_api_key_returns_error(self, mock_settings):
        mock_settings.tavily_api_key = ""
        result = await web_search.ainvoke({"query": "test"})
        assert "Tavily API 키" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.websearch.tools.settings")
    async def test_successful_search(self, mock_settings):
        mock_settings.tavily_api_key = "test-key"

        mock_client = AsyncMock()
        mock_client.search = AsyncMock(return_value={
            "results": [
                {"title": "Result 1", "url": "https://example.com", "content": "Content 1"},
            ],
        })

        with patch(
            "tavily.AsyncTavilyClient",
            return_value=mock_client,
        ):
            result = await web_search.ainvoke({"query": "test query"})

        assert "Result 1" in result
        assert "https://example.com" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.websearch.tools.settings")
    async def test_search_api_error(self, mock_settings):
        mock_settings.tavily_api_key = "test-key"

        with patch(
            "tavily.AsyncTavilyClient",
            side_effect=Exception("API error"),
        ):
            result = await web_search.ainvoke({"query": "test"})
        assert "오류가 발생했어요" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.websearch.tools.settings")
    async def test_empty_results(self, mock_settings):
        mock_settings.tavily_api_key = "test-key"

        mock_client = AsyncMock()
        mock_client.search = AsyncMock(return_value={"results": []})

        with patch(
            "tavily.AsyncTavilyClient",
            return_value=mock_client,
        ):
            result = await web_search.ainvoke({"query": "obscure query"})

        assert "검색 결과가 없어요" in result


# =========================================================================
# web_fetch tool
# =========================================================================
def _make_mock_response(
    text: str = "",
    content_type: str = "text/html; charset=utf-8",
    content_length: str | None = None,
    status_code: int = 200,
) -> MagicMock:
    """Create a mock httpx.Response with the given properties."""
    resp = MagicMock()
    headers = {"content-type": content_type}
    if content_length is not None:
        headers["content-length"] = content_length
    resp.headers = headers
    resp.text = text
    resp.status_code = status_code
    resp.raise_for_status = MagicMock()
    return resp


def _patch_httpx(mock_response=None, side_effect=None):
    """Patch httpx.AsyncClient to return a mock response or raise an error."""
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)
    if side_effect:
        mock_ctx.get = AsyncMock(side_effect=side_effect)
    else:
        mock_ctx.get = AsyncMock(return_value=mock_response)
    return patch("starnion_agent.skills.websearch.tools.httpx.AsyncClient", return_value=mock_ctx)


class TestWebFetchTool:
    @pytest.mark.asyncio
    async def test_invalid_url_returns_error(self):
        result = await web_fetch.ainvoke({"url": "not-a-url"})
        assert "올바른 URL" in result

    @pytest.mark.asyncio
    async def test_timeout_returns_error(self):
        import httpx as _httpx

        with _patch_httpx(side_effect=_httpx.TimeoutException("timeout")):
            result = await web_fetch.ainvoke({"url": "https://example.com"})
        assert "시간이 초과" in result

    @pytest.mark.asyncio
    async def test_http_error_returns_status(self):
        import httpx as _httpx

        err_resp = MagicMock()
        err_resp.status_code = 404
        with _patch_httpx(side_effect=_httpx.HTTPStatusError("", request=None, response=err_resp)):
            result = await web_fetch.ainvoke({"url": "https://example.com/404"})
        assert "HTTP 404" in result

    @pytest.mark.asyncio
    async def test_binary_content_type_returns_error(self):
        resp = _make_mock_response(content_type="application/pdf")
        with _patch_httpx(mock_response=resp):
            result = await web_fetch.ainvoke({"url": "https://example.com/file.pdf"})
        assert "parse_document" in result

    @pytest.mark.asyncio
    async def test_oversized_content_returns_error(self):
        resp = _make_mock_response(content_length=str(10 * 1024 * 1024))
        with _patch_httpx(mock_response=resp):
            result = await web_fetch.ainvoke({"url": "https://example.com/big"})
        assert "5MB" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.websearch.tools._extract_readable_text")
    async def test_html_content_extracted(self, mock_extract):
        mock_extract.return_value = "Extracted article text"
        resp = _make_mock_response(text="<html><body><p>Hello</p></body></html>")
        with _patch_httpx(mock_response=resp):
            result = await web_fetch.ainvoke({"url": "https://example.com"})
        assert "Extracted article text" in result

    @pytest.mark.asyncio
    async def test_plain_text_returned_directly(self):
        resp = _make_mock_response(text="Plain text content", content_type="text/plain")
        with _patch_httpx(mock_response=resp):
            result = await web_fetch.ainvoke({"url": "https://example.com/data.txt"})
        assert "Plain text content" in result

    @pytest.mark.asyncio
    async def test_json_returned_directly(self):
        resp = _make_mock_response(text='{"key": "value"}', content_type="application/json")
        with _patch_httpx(mock_response=resp):
            result = await web_fetch.ainvoke({"url": "https://example.com/api"})
        assert '"key"' in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.websearch.tools._extract_readable_text")
    async def test_truncation_applied(self, mock_extract):
        mock_extract.return_value = "A" * 10000
        resp = _make_mock_response(text="<html>long</html>")
        with _patch_httpx(mock_response=resp):
            result = await web_fetch.ainvoke({"url": "https://example.com", "max_length": 500})
        assert len(result) < 600
        assert "잘렸어요" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.websearch.tools._extract_readable_text", side_effect=Exception)
    async def test_readability_fallback_to_strip(self, _mock_extract):
        resp = _make_mock_response(text="<p>Fallback text</p>")
        with _patch_httpx(mock_response=resp):
            result = await web_fetch.ainvoke({"url": "https://example.com"})
        assert "Fallback text" in result

    @pytest.mark.asyncio
    @patch("starnion_agent.skills.websearch.tools._extract_readable_text", return_value="")
    async def test_empty_extraction_returns_error(self, _mock_extract):
        resp = _make_mock_response(text="<html></html>")
        with _patch_httpx(mock_response=resp):
            result = await web_fetch.ainvoke({"url": "https://example.com"})
        assert "추출할 수 없었어요" in result
