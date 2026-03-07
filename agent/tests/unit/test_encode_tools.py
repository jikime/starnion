"""Unit tests for starnion_agent.skills.encode.tools module.

Tests cover:
- ``EncodeDecodeInput``: Pydantic schema
- ``encode_decode`` tool: base64, url, html encode/decode
"""

from __future__ import annotations

import pytest

from starnion_agent.skills.encode.tools import EncodeDecodeInput, encode_decode


# =========================================================================
# Pydantic input schema
# =========================================================================
class TestEncodeDecodeInput:
    def test_defaults(self):
        model = EncodeDecodeInput(text="hello")
        assert model.format == "base64"
        assert model.action == "encode"


# =========================================================================
# encode_decode: base64
# =========================================================================
class TestBase64:
    @pytest.mark.asyncio
    async def test_encode(self):
        result = await encode_decode.ainvoke(
            {"text": "Hello World", "format": "base64", "action": "encode"}
        )
        assert "SGVsbG8gV29ybGQ=" in result
        assert "인코딩" in result

    @pytest.mark.asyncio
    async def test_decode(self):
        result = await encode_decode.ainvoke(
            {"text": "SGVsbG8gV29ybGQ=", "format": "base64", "action": "decode"}
        )
        assert "Hello World" in result
        assert "디코딩" in result

    @pytest.mark.asyncio
    async def test_invalid_base64_decode(self):
        result = await encode_decode.ainvoke(
            {"text": "!!!invalid!!!", "format": "base64", "action": "decode"}
        )
        assert "실패" in result

    @pytest.mark.asyncio
    async def test_korean_base64(self):
        result = await encode_decode.ainvoke(
            {"text": "한글", "format": "base64", "action": "encode"}
        )
        assert "🔐" in result
        # Verify round-trip.
        import re
        match = re.search(r"`([^`]+)`", result)
        assert match
        encoded = match.group(1)
        result2 = await encode_decode.ainvoke(
            {"text": encoded, "format": "base64", "action": "decode"}
        )
        assert "한글" in result2


# =========================================================================
# encode_decode: url
# =========================================================================
class TestUrl:
    @pytest.mark.asyncio
    async def test_encode(self):
        result = await encode_decode.ainvoke(
            {"text": "hello world", "format": "url", "action": "encode"}
        )
        assert "hello%20world" in result

    @pytest.mark.asyncio
    async def test_decode(self):
        result = await encode_decode.ainvoke(
            {"text": "hello%20world", "format": "url", "action": "decode"}
        )
        assert "hello world" in result

    @pytest.mark.asyncio
    async def test_korean_url(self):
        result = await encode_decode.ainvoke(
            {"text": "한글", "format": "url", "action": "encode"}
        )
        assert "%" in result  # Percent-encoded


# =========================================================================
# encode_decode: html
# =========================================================================
class TestHtml:
    @pytest.mark.asyncio
    async def test_encode(self):
        result = await encode_decode.ainvoke(
            {"text": "<script>alert('xss')</script>", "format": "html", "action": "encode"}
        )
        assert "&lt;" in result
        assert "&gt;" in result

    @pytest.mark.asyncio
    async def test_decode(self):
        result = await encode_decode.ainvoke(
            {"text": "&lt;b&gt;bold&lt;/b&gt;", "format": "html", "action": "decode"}
        )
        assert "<b>bold</b>" in result


# =========================================================================
# encode_decode: validation
# =========================================================================
class TestEncodeDecodeValidation:
    @pytest.mark.asyncio
    async def test_empty_text(self):
        result = await encode_decode.ainvoke({"text": ""})
        assert "입력" in result

    @pytest.mark.asyncio
    async def test_invalid_format(self):
        result = await encode_decode.ainvoke(
            {"text": "hello", "format": "unknown"}
        )
        assert "지원하지 않는 형식" in result

    @pytest.mark.asyncio
    async def test_invalid_action(self):
        result = await encode_decode.ainvoke(
            {"text": "hello", "action": "unknown"}
        )
        assert "encode 또는 decode" in result

    @pytest.mark.asyncio
    async def test_too_long(self):
        text = "x" * 50_001
        result = await encode_decode.ainvoke({"text": text})
        assert "너무 길" in result
