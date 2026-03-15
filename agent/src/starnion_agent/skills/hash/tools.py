"""Hash generation tools (pure Python, no external API)."""

import hashlib
import logging

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starnion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

MAX_INPUT_LENGTH = 100_000

_VALID_ALGORITHMS = {"md5", "sha1", "sha256", "sha512"}


class GenerateHashInput(BaseModel):
    """Input schema for generate_hash tool."""

    text: str = Field(description="해시할 텍스트")
    algorithm: str = Field(
        default="sha256",
        description="해시 알고리즘: md5, sha1, sha256, sha512",
    )


@tool(args_schema=GenerateHashInput)
@skill_guard("hash")
async def generate_hash(text: str, algorithm: str = "sha256") -> str:
    """해시값 생성이 필요할 때 호출. ('해시', 'MD5', 'SHA256', 'hash value', '해시 생성', 'ハッシュ', '哈希值')"""
    if not text:
        return "해시할 텍스트를 입력해 주세요."

    if len(text) > MAX_INPUT_LENGTH:
        return f"텍스트가 너무 길어요. {MAX_INPUT_LENGTH:,}자 이하로 입력해 주세요."

    algo = algorithm.strip().lower()

    if algo not in _VALID_ALGORITHMS:
        return f"지원하지 않는 알고리즘이에요. 사용 가능: {', '.join(sorted(_VALID_ALGORITHMS))}"

    digest = hashlib.new(algo, text.encode("utf-8")).hexdigest()

    return f"🔑 {algo.upper()} 해시:\n`{digest}`"
