"""Encoding/decoding tools (pure Python, no external API)."""

import base64
import binascii
import html
import logging
import urllib.parse

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starnion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

MAX_INPUT_LENGTH = 50_000

_VALID_FORMATS = {"base64", "url", "html"}
_VALID_ACTIONS = {"encode", "decode"}


class EncodeDecodeInput(BaseModel):
    """Input schema for encode_decode tool."""

    text: str = Field(description="인코딩/디코딩할 텍스트")
    format: str = Field(
        default="base64",
        description="형식: base64, url, html",
    )
    action: str = Field(
        default="encode",
        description="동작: encode (인코딩) 또는 decode (디코딩)",
    )


@tool(args_schema=EncodeDecodeInput)
@skill_guard("encode")
async def encode_decode(
    text: str,
    format: str = "base64",
    action: str = "encode",
) -> str:
    """텍스트를 Base64, URL, HTML 형식으로 인코딩 또는 디코딩합니다."""
    if not text:
        return "인코딩/디코딩할 텍스트를 입력해 주세요."

    if len(text) > MAX_INPUT_LENGTH:
        return f"텍스트가 너무 길어요. {MAX_INPUT_LENGTH:,}자 이하로 입력해 주세요."

    fmt = format.strip().lower()
    act = action.strip().lower()

    if fmt not in _VALID_FORMATS:
        return f"지원하지 않는 형식이에요. 사용 가능: {', '.join(sorted(_VALID_FORMATS))}"

    if act not in _VALID_ACTIONS:
        return "동작은 encode 또는 decode만 가능해요."

    act_label = "인코딩" if act == "encode" else "디코딩"
    fmt_label = fmt.upper() if fmt != "html" else "HTML"

    try:
        if fmt == "base64":
            if act == "encode":
                result = base64.b64encode(text.encode("utf-8")).decode("ascii")
            else:
                result = base64.b64decode(text.encode("ascii")).decode("utf-8")

        elif fmt == "url":
            if act == "encode":
                result = urllib.parse.quote(text, safe="")
            else:
                result = urllib.parse.unquote(text)

        else:  # html
            if act == "encode":
                result = html.escape(text)
            else:
                result = html.unescape(text)

    except (binascii.Error, UnicodeDecodeError):
        return f"{fmt_label} {act_label}에 실패했어요. 입력값이 올바른지 확인해 주세요."
    except Exception:
        logger.debug("Encode/decode error", exc_info=True)
        return f"{fmt_label} {act_label} 중 오류가 발생했어요."

    return f"🔐 {fmt_label} {act_label} 결과:\n`{result}`"
