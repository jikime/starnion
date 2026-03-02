"""Unit tests for jiki_agent.skills.translate.tools module.

Tests cover:
- ``TranslateTextInput``: Pydantic input schema
- ``_build_translate_prompt``: Prompt construction
- ``translate_text`` tool: Gemini-based translation
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

from jiki_agent.skills.translate.tools import (
    SUPPORTED_LANGS,
    TranslateTextInput,
    _build_translate_prompt,
    translate_text,
)


# =========================================================================
# Pydantic input schema
# =========================================================================
class TestTranslateTextInput:
    def test_valid_input(self):
        model = TranslateTextInput(text="Hello world")
        assert model.text == "Hello world"
        assert model.target_lang == "en"
        assert model.source_lang == "auto"

    def test_custom_langs(self):
        model = TranslateTextInput(text="Hello", target_lang="ko", source_lang="en")
        assert model.target_lang == "ko"
        assert model.source_lang == "en"

    def test_missing_text_raises(self):
        with pytest.raises(ValidationError):
            TranslateTextInput()  # type: ignore[call-arg]


# =========================================================================
# _build_translate_prompt
# =========================================================================
class TestBuildTranslatePrompt:
    def test_auto_source(self):
        prompt = _build_translate_prompt("Hello", "ko", "auto")
        assert "자동으로 감지" in prompt
        assert "한국어" in prompt
        assert "Hello" in prompt

    def test_explicit_source(self):
        prompt = _build_translate_prompt("Hello", "ja", "en")
        assert "영어에서" in prompt
        assert "일본어" in prompt

    def test_long_text_truncated(self):
        long_text = "A" * 15000
        prompt = _build_translate_prompt(long_text, "en", "auto")
        assert "잘려있음" in prompt

    def test_short_text_no_notice(self):
        prompt = _build_translate_prompt("short", "en", "auto")
        assert "잘려있음" not in prompt

    def test_translation_only_instruction(self):
        prompt = _build_translate_prompt("text", "en", "auto")
        assert "번역문만" in prompt
        assert "번역가" in prompt


# =========================================================================
# Helper: _patch_gemini
# =========================================================================
def _patch_gemini(content: str = "번역 결과입니다."):
    """Patch ChatGoogleGenerativeAI to return a mock response."""
    mock_llm = AsyncMock()
    mock_response = MagicMock()
    mock_response.content = content
    mock_llm.ainvoke = AsyncMock(return_value=mock_response)
    return patch(
        "jiki_agent.skills.translate.tools.ChatGoogleGenerativeAI",
        return_value=mock_llm,
    )


# =========================================================================
# translate_text tool
# =========================================================================
class TestTranslateText:
    @pytest.mark.asyncio
    @patch("jiki_agent.skills.translate.tools.settings")
    async def test_no_api_key(self, mock_settings):
        mock_settings.gemini_api_key = ""
        result = await translate_text.ainvoke({"text": "hello"})
        assert "Gemini API 키" in result

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.translate.tools.settings")
    async def test_empty_text(self, mock_settings):
        mock_settings.gemini_api_key = "test-key"
        result = await translate_text.ainvoke({"text": ""})
        assert "텍스트를 입력" in result

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.translate.tools.settings")
    async def test_whitespace_only(self, mock_settings):
        mock_settings.gemini_api_key = "test-key"
        result = await translate_text.ainvoke({"text": "   "})
        assert "텍스트를 입력" in result

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.translate.tools.settings")
    async def test_unsupported_target_lang(self, mock_settings):
        mock_settings.gemini_api_key = "test-key"
        result = await translate_text.ainvoke({"text": "hello", "target_lang": "xx"})
        assert "지원하지 않는 언어" in result

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.translate.tools.settings")
    async def test_invalid_source_lang(self, mock_settings):
        mock_settings.gemini_api_key = "test-key"
        result = await translate_text.ainvoke(
            {"text": "hello", "target_lang": "ko", "source_lang": "xx"}
        )
        assert "원본 언어 코드" in result

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.translate.tools.settings")
    async def test_successful_translation(self, mock_settings):
        mock_settings.gemini_api_key = "test-key"
        mock_settings.gemini_model = "gemini-2.0-flash"
        with _patch_gemini("안녕하세요"):
            result = await translate_text.ainvoke(
                {"text": "Hello", "target_lang": "ko"}
            )
        assert "안녕하세요" in result

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.translate.tools.settings")
    async def test_explicit_source_lang(self, mock_settings):
        mock_settings.gemini_api_key = "test-key"
        mock_settings.gemini_model = "gemini-2.0-flash"
        with _patch_gemini("Hello"):
            result = await translate_text.ainvoke(
                {"text": "안녕하세요", "target_lang": "en", "source_lang": "ko"}
            )
        assert "Hello" in result

    @pytest.mark.asyncio
    @patch("jiki_agent.skills.translate.tools.settings")
    async def test_llm_error(self, mock_settings):
        mock_settings.gemini_api_key = "test-key"
        mock_settings.gemini_model = "gemini-2.0-flash"
        with patch(
            "jiki_agent.skills.translate.tools.ChatGoogleGenerativeAI",
            side_effect=Exception("LLM error"),
        ):
            result = await translate_text.ainvoke(
                {"text": "hello", "target_lang": "ko"}
            )
        assert "오류가 발생했어요" in result

    def test_supported_langs_complete(self):
        expected = {"ko", "en", "ja", "zh", "es", "fr", "de"}
        assert set(SUPPORTED_LANGS.keys()) == expected
