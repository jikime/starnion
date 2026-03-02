"""Unit tests for jiki_agent.skills.hash.tools module.

Tests cover:
- ``GenerateHashInput``: Pydantic schema
- ``generate_hash`` tool: MD5, SHA1, SHA256, SHA512 hash generation
"""

from __future__ import annotations

import hashlib

import pytest

from jiki_agent.skills.hash.tools import GenerateHashInput, generate_hash


# =========================================================================
# Pydantic input schema
# =========================================================================
class TestGenerateHashInput:
    def test_defaults(self):
        model = GenerateHashInput(text="hello")
        assert model.algorithm == "sha256"


# =========================================================================
# generate_hash
# =========================================================================
class TestGenerateHash:
    @pytest.mark.asyncio
    async def test_sha256_default(self):
        result = await generate_hash.ainvoke({"text": "hello"})
        expected = hashlib.sha256(b"hello").hexdigest()
        assert expected in result
        assert "SHA256" in result

    @pytest.mark.asyncio
    async def test_md5(self):
        result = await generate_hash.ainvoke(
            {"text": "hello", "algorithm": "md5"}
        )
        expected = hashlib.md5(b"hello").hexdigest()
        assert expected in result
        assert "MD5" in result

    @pytest.mark.asyncio
    async def test_sha1(self):
        result = await generate_hash.ainvoke(
            {"text": "hello", "algorithm": "sha1"}
        )
        expected = hashlib.sha1(b"hello").hexdigest()
        assert expected in result
        assert "SHA1" in result

    @pytest.mark.asyncio
    async def test_sha512(self):
        result = await generate_hash.ainvoke(
            {"text": "hello", "algorithm": "sha512"}
        )
        expected = hashlib.sha512(b"hello").hexdigest()
        assert expected in result
        assert "SHA512" in result

    @pytest.mark.asyncio
    async def test_invalid_algorithm(self):
        result = await generate_hash.ainvoke(
            {"text": "hello", "algorithm": "unknown"}
        )
        assert "지원하지 않는 알고리즘" in result

    @pytest.mark.asyncio
    async def test_empty_text(self):
        result = await generate_hash.ainvoke({"text": ""})
        assert "입력" in result

    @pytest.mark.asyncio
    async def test_too_long(self):
        text = "x" * 100_001
        result = await generate_hash.ainvoke({"text": text})
        assert "너무 길" in result

    @pytest.mark.asyncio
    async def test_korean_text(self):
        result = await generate_hash.ainvoke({"text": "한글"})
        expected = hashlib.sha256("한글".encode("utf-8")).hexdigest()
        assert expected in result

    @pytest.mark.asyncio
    async def test_emoji_in_output(self):
        result = await generate_hash.ainvoke({"text": "test"})
        assert "🔑" in result
