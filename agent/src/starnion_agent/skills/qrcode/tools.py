"""QR code generation tool."""

import io
import logging

import qrcode as qrcode_lib
from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starnion_agent.skills.file_context import add_pending_file
from starnion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

_MAX_CONTENT_LENGTH = 4_000
_MIN_SIZE = 1
_MAX_SIZE = 40


class GenerateQrcodeInput(BaseModel):
    """Input schema for generate_qrcode tool."""

    content: str = Field(description="QR 코드에 담을 내용 (URL, 텍스트 등)")
    size: int = Field(default=10, description="QR 박스 크기 (1-40, 기본값 10)")


@tool(args_schema=GenerateQrcodeInput)
@skill_guard("qrcode")
async def generate_qrcode(content: str, size: int = 10) -> str:
    """텍스트나 URL로 QR 코드 이미지를 생성합니다."""
    if not content or not content.strip():
        return "QR 코드에 담을 내용을 입력해 주세요."

    if len(content) > _MAX_CONTENT_LENGTH:
        return f"내용이 너무 길어요. {_MAX_CONTENT_LENGTH}자 이하로 입력해 주세요."

    if not (_MIN_SIZE <= size <= _MAX_SIZE):
        return f"크기는 {_MIN_SIZE}~{_MAX_SIZE} 사이여야 해요."

    try:
        qr = qrcode_lib.QRCode(
            version=1,
            error_correction=qrcode_lib.constants.ERROR_CORRECT_M,
            box_size=size,
            border=4,
        )
        qr.add_data(content)
        qr.make(fit=True)

        img = qr.make_image(fill_color="black", back_color="white")

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        image_bytes = buf.getvalue()

        add_pending_file(image_bytes, "qrcode.png", "image/png")
        return "QR 코드를 생성했어요."

    except Exception:
        logger.debug("QR code generation error", exc_info=True)
        return "QR 코드 생성 중 오류가 발생했어요. 다시 시도해 주세요."
