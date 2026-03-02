"""Image analysis, generation, and editing tools."""

from io import BytesIO

from langchain_core.messages import HumanMessage
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

from jiki_agent.config import settings
from jiki_agent.document.parser import fetch_file
from jiki_agent.skills.file_context import add_pending_file
from jiki_agent.skills.guard import skill_guard

# Dedicated model for image generation/editing (supports response_modalities=["IMAGE"]).
# Kept separate from settings.gemini_model which may be a chat-only model.
_IMAGE_MODEL = "gemini-3.1-flash-image-preview"

_VALID_ASPECT_RATIOS = {"1:1", "3:4", "4:3", "9:16", "16:9"}


def _extract_image_bytes(response) -> bytes | None:
    """Extract image bytes from a generate_content response."""
    if not response.candidates:
        return None
    for part in response.candidates[0].content.parts:
        if part.inline_data and part.inline_data.mime_type.startswith("image/"):
            return part.inline_data.data
    return None


class AnalyzeImageInput(BaseModel):
    """Input schema for analyze_image tool."""

    file_url: str = Field(description="이미지 파일의 URL")
    user_query: str = Field(
        default="이 이미지를 분석해주세요.",
        description="이미지에 대한 질문이나 요청",
    )


class GenerateImageInput(BaseModel):
    """Input schema for generate_image tool."""

    prompt: str = Field(description="생성할 이미지에 대한 설명")
    aspect_ratio: str = Field(
        default="1:1",
        description="이미지 비율 (1:1, 3:4, 4:3, 9:16, 16:9)",
    )


class EditImageInput(BaseModel):
    """Input schema for edit_image tool."""

    file_url: str = Field(description="편집할 이미지 파일의 URL")
    prompt: str = Field(description="이미지 편집 요청 (예: 배경을 파란색으로 바꿔줘)")


@tool(args_schema=AnalyzeImageInput)
@skill_guard("image")
async def analyze_image(
    file_url: str, user_query: str = "이 이미지를 분석해주세요.",
) -> str:
    """이미지를 분석합니다. 영수증, 사진, 스크린샷 등을 인식하고 내용을 설명합니다."""
    llm = ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=settings.gemini_api_key,
    )

    message = HumanMessage(
        content=[
            {"type": "text", "text": user_query},
            {"type": "image_url", "image_url": {"url": file_url}},
        ],
    )

    response = await llm.ainvoke([message])
    return response.content


@tool(args_schema=GenerateImageInput)
@skill_guard("image")
async def generate_image(prompt: str, aspect_ratio: str = "1:1") -> str:
    """요청한 설명으로 이미지를 생성합니다."""
    from google import genai
    from google.genai import types

    if aspect_ratio not in _VALID_ASPECT_RATIOS:
        aspect_ratio = "1:1"

    client = genai.Client(api_key=settings.gemini_api_key)

    response = client.models.generate_content(
        model=_IMAGE_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["TEXT", "IMAGE"],
            image_config=types.ImageConfig(aspect_ratio=aspect_ratio),
        ),
    )

    image_bytes = _extract_image_bytes(response)
    if not image_bytes:
        return "이미지를 생성할 수 없었어요. 다른 설명으로 다시 시도해주세요."

    add_pending_file(image_bytes, "generated.png", "image/png")
    return f"'{prompt}' 이미지를 생성했어요."


@tool(args_schema=EditImageInput)
@skill_guard("image")
async def edit_image(file_url: str, prompt: str) -> str:
    """첨부된 이미지를 요청에 따라 편집합니다. 배경 변경, 스타일 변환, 객체 추가/제거 등."""
    from google import genai
    from google.genai import types
    from PIL import Image

    image_data = await fetch_file(file_url)
    image = Image.open(BytesIO(image_data))

    client = genai.Client(api_key=settings.gemini_api_key)

    response = client.models.generate_content(
        model=_IMAGE_MODEL,
        contents=[prompt, image],
        config=types.GenerateContentConfig(
            response_modalities=["TEXT", "IMAGE"],
        ),
    )

    image_bytes = _extract_image_bytes(response)
    if not image_bytes:
        return "이미지를 편집할 수 없었어요. 다른 요청으로 다시 시도해주세요."

    add_pending_file(image_bytes, "edited.png", "image/png")
    return f"이미지를 편집했어요: {prompt}"
