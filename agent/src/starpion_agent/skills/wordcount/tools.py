"""Text analysis tools (pure Python, no external API)."""

import logging
import re

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starpion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

MAX_TEXT_LENGTH = 100_000


class CountTextInput(BaseModel):
    """Input schema for count_text tool."""

    text: str = Field(description="분석할 텍스트")


@tool(args_schema=CountTextInput)
@skill_guard("wordcount")
async def count_text(text: str) -> str:
    """텍스트의 글자수, 단어수, 문장수, 줄수, 바이트수를 분석합니다."""
    if not text or not text.strip():
        return "분석할 텍스트를 입력해 주세요."

    if len(text) > MAX_TEXT_LENGTH:
        return f"텍스트가 너무 길어요. {MAX_TEXT_LENGTH:,}자 이하로 입력해 주세요."

    # Character counts.
    char_total = len(text)
    char_no_space = len(text.replace(" ", "").replace("\t", "").replace("\n", "").replace("\r", ""))

    # Word count: split by whitespace.
    words = text.split()
    word_count = len(words)

    # Sentence count: split by sentence-ending punctuation.
    sentences = re.split(r"[.!?。！？]+", text)
    sentence_count = len([s for s in sentences if s.strip()])

    # Line count.
    lines = text.split("\n")
    line_count = len(lines)

    # Byte count (UTF-8).
    byte_count = len(text.encode("utf-8"))

    return (
        f"✏️ 텍스트 분석 결과\n"
        f"- 글자수: {char_total:,} (공백 제외: {char_no_space:,})\n"
        f"- 단어수: {word_count:,}\n"
        f"- 문장수: {sentence_count:,}\n"
        f"- 줄수: {line_count:,}\n"
        f"- 바이트: {byte_count:,} bytes (UTF-8)"
    )
