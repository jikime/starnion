"""Unit tests for jiki_agent.skills.image.tools module.

Tests cover:
- _extract_image_bytes helper
- generate_image (mocked API)
- edit_image (mocked API)
- Input schema validation
- aspect_ratio validation
"""

from __future__ import annotations

import struct
import zlib
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from jiki_agent.skills.image.tools import (
    AnalyzeImageInput,
    EditImageInput,
    GenerateImageInput,
    _extract_image_bytes,
    _VALID_ASPECT_RATIOS,
)


def _make_tiny_png() -> bytes:
    """Create a minimal valid 1x1 PNG for PIL.Image.open."""
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr_data = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    ihdr_crc = zlib.crc32(b"IHDR" + ihdr_data) & 0xFFFFFFFF
    ihdr = struct.pack(">I", 13) + b"IHDR" + ihdr_data + struct.pack(">I", ihdr_crc)
    raw = zlib.compress(b"\x00\x00\x00\x00")
    idat_crc = zlib.crc32(b"IDAT" + raw) & 0xFFFFFFFF
    idat = struct.pack(">I", len(raw)) + b"IDAT" + raw + struct.pack(">I", idat_crc)
    iend_crc = zlib.crc32(b"IEND") & 0xFFFFFFFF
    iend = struct.pack(">I", 0) + b"IEND" + struct.pack(">I", iend_crc)
    return sig + ihdr + idat + iend


def _mock_genai_response(image_bytes: bytes | None = None):
    """Build a SimpleNamespace mimicking generate_content response."""
    if image_bytes is not None:
        part = SimpleNamespace(
            inline_data=SimpleNamespace(mime_type="image/png", data=image_bytes),
        )
        candidate = SimpleNamespace(content=SimpleNamespace(parts=[part]))
    else:
        text_part = SimpleNamespace(
            inline_data=SimpleNamespace(mime_type="text/plain", data=b"sorry"),
        )
        candidate = SimpleNamespace(content=SimpleNamespace(parts=[text_part]))
    return SimpleNamespace(candidates=[candidate])


# ---------------------------------------------------------------------------
# Schema validation
# ---------------------------------------------------------------------------

class TestAnalyzeImageInput:
    """Tests for AnalyzeImageInput schema."""

    def test_required_file_url(self):
        schema = AnalyzeImageInput(file_url="https://example.com/img.png")
        assert schema.file_url == "https://example.com/img.png"
        assert schema.user_query == "이 이미지를 분석해주세요."

    def test_custom_query(self):
        schema = AnalyzeImageInput(
            file_url="https://example.com/img.png",
            user_query="이 영수증의 금액을 알려줘",
        )
        assert schema.user_query == "이 영수증의 금액을 알려줘"


class TestGenerateImageInput:
    """Tests for GenerateImageInput schema."""

    def test_required_prompt(self):
        schema = GenerateImageInput(prompt="a cat on the moon")
        assert schema.prompt == "a cat on the moon"
        assert schema.aspect_ratio == "1:1"

    def test_custom_aspect_ratio(self):
        schema = GenerateImageInput(prompt="landscape", aspect_ratio="16:9")
        assert schema.aspect_ratio == "16:9"


class TestEditImageInput:
    """Tests for EditImageInput schema."""

    def test_required_fields(self):
        schema = EditImageInput(
            file_url="https://example.com/img.png",
            prompt="배경을 파란색으로 바꿔줘",
        )
        assert schema.file_url == "https://example.com/img.png"
        assert schema.prompt == "배경을 파란색으로 바꿔줘"


# ---------------------------------------------------------------------------
# _extract_image_bytes helper
# ---------------------------------------------------------------------------

class TestExtractImageBytes:
    """Tests for _extract_image_bytes helper."""

    def test_extracts_image_from_response(self):
        image_data = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        resp = _mock_genai_response(image_data)
        assert _extract_image_bytes(resp) == image_data

    def test_returns_none_for_no_image(self):
        resp = _mock_genai_response(None)
        assert _extract_image_bytes(resp) is None

    def test_returns_none_for_empty_candidates(self):
        resp = SimpleNamespace(candidates=[])
        assert _extract_image_bytes(resp) is None

    def test_returns_none_for_none_candidates(self):
        resp = SimpleNamespace(candidates=None)
        assert _extract_image_bytes(resp) is None

    def test_skips_text_parts_finds_image(self):
        text_part = SimpleNamespace(inline_data=None)
        image_data = b"FAKE_IMAGE_DATA"
        image_part = SimpleNamespace(
            inline_data=SimpleNamespace(mime_type="image/jpeg", data=image_data),
        )
        candidate = SimpleNamespace(
            content=SimpleNamespace(parts=[text_part, image_part]),
        )
        resp = SimpleNamespace(candidates=[candidate])
        assert _extract_image_bytes(resp) == image_data

    def test_handles_part_without_inline_data(self):
        part = SimpleNamespace(inline_data=None)
        candidate = SimpleNamespace(content=SimpleNamespace(parts=[part]))
        resp = SimpleNamespace(candidates=[candidate])
        assert _extract_image_bytes(resp) is None


# ---------------------------------------------------------------------------
# aspect_ratio validation
# ---------------------------------------------------------------------------

class TestAspectRatioValidation:

    def test_valid_ratios(self):
        for ratio in ["1:1", "3:4", "4:3", "9:16", "16:9"]:
            assert ratio in _VALID_ASPECT_RATIOS

    def test_invalid_ratio_not_in_set(self):
        assert "2:1" not in _VALID_ASPECT_RATIOS
        assert "square" not in _VALID_ASPECT_RATIOS


# ---------------------------------------------------------------------------
# generate_image (mocked genai.Client)
# ---------------------------------------------------------------------------

class TestGenerateImage:

    @pytest.mark.asyncio
    async def test_successful_generation(self):
        from jiki_agent.skills.image.tools import generate_image

        image_data = b"\x89PNG_GENERATED"
        mock_response = _mock_genai_response(image_data)

        mock_client_cls = MagicMock()
        mock_client_cls.return_value.models.generate_content.return_value = mock_response

        with (
            patch("jiki_agent.skills.image.tools.add_pending_file") as mock_add,
            patch("jiki_agent.skills.image.tools.settings", MagicMock(gemini_api_key="k", gemini_model="m")),
            patch("google.genai.Client", mock_client_cls),
        ):
            result = await generate_image.ainvoke({"prompt": "sunset", "aspect_ratio": "16:9"})

        assert "생성했어요" in result
        mock_add.assert_called_once()
        call_args = mock_add.call_args
        assert call_args[0][0] == image_data
        assert call_args[0][1] == "generated.png"

    @pytest.mark.asyncio
    async def test_no_image_returns_error(self):
        from jiki_agent.skills.image.tools import generate_image

        mock_response = _mock_genai_response(None)

        mock_client_cls = MagicMock()
        mock_client_cls.return_value.models.generate_content.return_value = mock_response

        with (
            patch("jiki_agent.skills.image.tools.add_pending_file") as mock_add,
            patch("jiki_agent.skills.image.tools.settings", MagicMock(gemini_api_key="k", gemini_model="m")),
            patch("google.genai.Client", mock_client_cls),
        ):
            result = await generate_image.ainvoke({"prompt": "impossible"})

        assert "생성할 수 없었어요" in result
        mock_add.assert_not_called()

    @pytest.mark.asyncio
    async def test_invalid_aspect_ratio_uses_default(self):
        from jiki_agent.skills.image.tools import generate_image

        image_data = b"\x89PNG"
        mock_response = _mock_genai_response(image_data)

        mock_client_cls = MagicMock()
        mock_client_cls.return_value.models.generate_content.return_value = mock_response

        with (
            patch("jiki_agent.skills.image.tools.add_pending_file"),
            patch("jiki_agent.skills.image.tools.settings", MagicMock(gemini_api_key="k", gemini_model="m")),
            patch("google.genai.Client", mock_client_cls),
        ):
            result = await generate_image.ainvoke({"prompt": "cat", "aspect_ratio": "invalid"})

        assert "생성했어요" in result
        # Verify the API was called (with fallback aspect_ratio "1:1")
        mock_client_cls.return_value.models.generate_content.assert_called_once()


# ---------------------------------------------------------------------------
# edit_image (mocked genai.Client + fetch_file)
# ---------------------------------------------------------------------------

class TestEditImage:

    @pytest.mark.asyncio
    async def test_successful_edit(self):
        from jiki_agent.skills.image.tools import edit_image

        image_data = b"\x89PNG_EDITED"
        mock_response = _mock_genai_response(image_data)

        mock_client_cls = MagicMock()
        mock_client_cls.return_value.models.generate_content.return_value = mock_response

        tiny_png = _make_tiny_png()

        with (
            patch("jiki_agent.skills.image.tools.add_pending_file") as mock_add,
            patch("jiki_agent.skills.image.tools.fetch_file", new_callable=AsyncMock, return_value=tiny_png),
            patch("jiki_agent.skills.image.tools.settings", MagicMock(gemini_api_key="k", gemini_model="m")),
            patch("google.genai.Client", mock_client_cls),
        ):
            result = await edit_image.ainvoke({
                "file_url": "https://example.com/img.png",
                "prompt": "배경을 바다로 바꿔줘",
            })

        assert "편집했어요" in result
        mock_add.assert_called_once()
        call_args = mock_add.call_args
        assert call_args[0][0] == image_data
        assert call_args[0][1] == "edited.png"

    @pytest.mark.asyncio
    async def test_edit_failure_returns_error(self):
        from jiki_agent.skills.image.tools import edit_image

        # Response with empty parts → no image
        candidate = SimpleNamespace(content=SimpleNamespace(parts=[]))
        mock_response = SimpleNamespace(candidates=[candidate])

        mock_client_cls = MagicMock()
        mock_client_cls.return_value.models.generate_content.return_value = mock_response

        tiny_png = _make_tiny_png()

        with (
            patch("jiki_agent.skills.image.tools.add_pending_file") as mock_add,
            patch("jiki_agent.skills.image.tools.fetch_file", new_callable=AsyncMock, return_value=tiny_png),
            patch("jiki_agent.skills.image.tools.settings", MagicMock(gemini_api_key="k", gemini_model="m")),
            patch("google.genai.Client", mock_client_cls),
        ):
            result = await edit_image.ainvoke({
                "file_url": "https://example.com/img.png",
                "prompt": "impossible edit",
            })

        assert "편집할 수 없었어요" in result
        mock_add.assert_not_called()
