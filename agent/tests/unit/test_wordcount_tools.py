"""Unit tests for jiki_agent.skills.wordcount.tools module.

Tests cover:
- ``CountTextInput``: Pydantic schema
- ``count_text`` tool: character, word, sentence, line, byte counts
"""

from __future__ import annotations

import pytest

from jiki_agent.skills.wordcount.tools import CountTextInput, count_text


# =========================================================================
# Pydantic input schema
# =========================================================================
class TestCountTextInput:
    def test_required_text(self):
        model = CountTextInput(text="hello")
        assert model.text == "hello"


# =========================================================================
# count_text
# =========================================================================
class TestCountText:
    @pytest.mark.asyncio
    async def test_empty_text(self):
        result = await count_text.ainvoke({"text": ""})
        assert "입력" in result

    @pytest.mark.asyncio
    async def test_basic_english(self):
        result = await count_text.ainvoke({"text": "Hello World"})
        assert "글자수" in result
        assert "11" in result  # 11 chars
        assert "단어수" in result
        assert "2" in result  # 2 words

    @pytest.mark.asyncio
    async def test_korean_text(self):
        result = await count_text.ainvoke({"text": "안녕하세요 세계"})
        assert "글자수" in result
        assert "단어수" in result

    @pytest.mark.asyncio
    async def test_multiline(self):
        result = await count_text.ainvoke({"text": "Line 1\nLine 2\nLine 3"})
        assert "줄수" in result
        assert "3" in result

    @pytest.mark.asyncio
    async def test_sentence_count(self):
        result = await count_text.ainvoke(
            {"text": "First sentence. Second sentence! Third?"}
        )
        assert "문장수" in result
        assert "3" in result

    @pytest.mark.asyncio
    async def test_byte_count(self):
        result = await count_text.ainvoke({"text": "ABC"})
        assert "bytes" in result
        assert "3" in result  # 3 bytes for ASCII

    @pytest.mark.asyncio
    async def test_korean_byte_count(self):
        result = await count_text.ainvoke({"text": "가"})
        assert "bytes" in result
        # Korean char is 3 bytes in UTF-8

    @pytest.mark.asyncio
    async def test_spaces_excluded(self):
        result = await count_text.ainvoke({"text": "a b c"})
        assert "공백 제외: 3" in result

    @pytest.mark.asyncio
    async def test_too_long(self):
        text = "x" * 100_001
        result = await count_text.ainvoke({"text": text})
        assert "너무 길" in result

    @pytest.mark.asyncio
    async def test_emoji_in_output(self):
        result = await count_text.ainvoke({"text": "test"})
        assert "✏️" in result
