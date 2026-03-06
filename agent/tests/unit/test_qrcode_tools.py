"""Unit tests for starpion_agent.skills.qrcode.tools module.

Tests cover:
- ``GenerateQrcodeInput``: Pydantic input schema
- ``generate_qrcode`` tool: QR code image generation
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from pydantic import ValidationError

from starpion_agent.skills.qrcode.tools import (
    GenerateQrcodeInput,
    generate_qrcode,
)


# =========================================================================
# Pydantic input schema
# =========================================================================
class TestGenerateQrcodeInput:
    def test_valid_input(self):
        model = GenerateQrcodeInput(content="https://example.com")
        assert model.content == "https://example.com"
        assert model.size == 10

    def test_custom_size(self):
        model = GenerateQrcodeInput(content="hello", size=20)
        assert model.size == 20

    def test_missing_content_raises(self):
        with pytest.raises(ValidationError):
            GenerateQrcodeInput()  # type: ignore[call-arg]


# =========================================================================
# generate_qrcode tool
# =========================================================================
class TestGenerateQrcode:
    @pytest.mark.asyncio
    async def test_empty_content(self):
        result = await generate_qrcode.ainvoke({"content": ""})
        assert "내용을 입력" in result

    @pytest.mark.asyncio
    async def test_whitespace_only(self):
        result = await generate_qrcode.ainvoke({"content": "   "})
        assert "내용을 입력" in result

    @pytest.mark.asyncio
    async def test_content_too_long(self):
        result = await generate_qrcode.ainvoke({"content": "A" * 5000})
        assert "너무 길어요" in result

    @pytest.mark.asyncio
    async def test_size_too_small(self):
        result = await generate_qrcode.ainvoke({"content": "hello", "size": 0})
        assert "사이여야" in result

    @pytest.mark.asyncio
    async def test_size_too_large(self):
        result = await generate_qrcode.ainvoke({"content": "hello", "size": 50})
        assert "사이여야" in result

    @pytest.mark.asyncio
    @patch("starpion_agent.skills.qrcode.tools.add_pending_file")
    async def test_successful_generation(self, mock_add_file):
        result = await generate_qrcode.ainvoke(
            {"content": "https://example.com"}
        )
        assert "생성했어요" in result
        mock_add_file.assert_called_once()
        call_args = mock_add_file.call_args
        assert call_args[0][1] == "qrcode.png"
        assert call_args[0][2] == "image/png"
        assert isinstance(call_args[0][0], bytes)
        assert len(call_args[0][0]) > 0

    @pytest.mark.asyncio
    @patch("starpion_agent.skills.qrcode.tools.add_pending_file")
    async def test_custom_size(self, mock_add_file):
        result = await generate_qrcode.ainvoke(
            {"content": "test", "size": 5}
        )
        assert "생성했어요" in result
        mock_add_file.assert_called_once()

    @pytest.mark.asyncio
    @patch("starpion_agent.skills.qrcode.tools.add_pending_file")
    async def test_url_content(self, mock_add_file):
        result = await generate_qrcode.ainvoke(
            {"content": "https://example.com/path?q=test"}
        )
        assert "생성했어요" in result

    @pytest.mark.asyncio
    @patch("starpion_agent.skills.qrcode.tools.qrcode_lib")
    async def test_library_error(self, mock_qr_lib):
        mock_qr_lib.QRCode.side_effect = Exception("QR error")
        result = await generate_qrcode.ainvoke({"content": "hello"})
        assert "오류가 발생했어요" in result

    @pytest.mark.asyncio
    async def test_boundary_size_min(self):
        """size=1 should be valid."""
        with patch("starpion_agent.skills.qrcode.tools.add_pending_file"):
            result = await generate_qrcode.ainvoke({"content": "x", "size": 1})
        assert "생성했어요" in result

    @pytest.mark.asyncio
    async def test_boundary_size_max(self):
        """size=40 should be valid."""
        with patch("starpion_agent.skills.qrcode.tools.add_pending_file"):
            result = await generate_qrcode.ainvoke({"content": "x", "size": 40})
        assert "생성했어요" in result
