"""Image analysis, generation, and editing tools."""

import base64
import logging
from io import BytesIO

from langchain_core.messages import HumanMessage
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

from starnion_agent.config import settings
from starnion_agent.context import get_current_user
from starnion_agent.db.pool import get_pool
from starnion_agent.db.repositories import image_db as image_db_repo
from starnion_agent.document.parser import fetch_file
from starnion_agent.skills.file_context import add_pending_file
from starnion_agent.skills.gemini_key import get_gemini_api_key, no_key_message
from starnion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

# Default models — used when no model_assignment is configured.
_IMAGE_GEN_MODEL = "gemini-3.1-flash-image-preview"

_VALID_ASPECT_RATIOS = {"1:1", "3:4", "4:3", "9:16", "16:9"}


def _extract_image_bytes(response) -> bytes | None:
    """Extract image bytes from a generate_content response."""
    if not response.candidates:
        return None
    for part in response.candidates[0].content.parts:
        if part.inline_data and part.inline_data.mime_type.startswith("image/"):
            return part.inline_data.data
    return None


async def _generate_image_gemini(
    model: str, api_key: str, prompt: str, aspect_ratio: str,
) -> str:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    response = await client.aio.models.generate_content(
        model=model,
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


async def _generate_image_ollama(model: str, base_url: str, prompt: str) -> str:
    """Call Ollama image generation API (e.g. x/z-image-turbo)."""
    import httpx

    base_url = base_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=300) as client:
            resp = await client.post(
                f"{base_url}/api/generate",
                json={"model": model, "prompt": prompt, "stream": False},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.error("Ollama image generation failed: %s", e)
        return f"이미지 생성 중 오류가 발생했어요: {e}"

    # Ollama image generation models return base64-encoded images in 'images' list.
    images = data.get("images")
    if images:
        image_bytes = base64.b64decode(images[0])
        add_pending_file(image_bytes, "generated.png", "image/png")
        return f"'{prompt}' 이미지를 생성했어요."

    # Some models embed image as base64 in 'response' field.
    response_text = data.get("response", "")
    if response_text:
        try:
            image_bytes = base64.b64decode(response_text)
            add_pending_file(image_bytes, "generated.png", "image/png")
            return f"'{prompt}' 이미지를 생성했어요."
        except Exception:
            pass

    return "이미지를 생성할 수 없었어요. 다른 설명으로 다시 시도해주세요."


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
    api_key = await get_gemini_api_key()
    if not api_key:
        return no_key_message()

    user_id = get_current_user()

    llm = ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=api_key,
    )

    message = HumanMessage(
        content=[
            {"type": "text", "text": user_query},
            {"type": "image_url", "image_url": {"url": file_url}},
        ],
    )

    response = await llm.ainvoke([message])
    analysis_text = response.content if isinstance(response.content, str) else str(response.content)

    if user_id:
        try:
            pool = get_pool()
            name = file_url.rstrip("/").split("/")[-1] or "image.png"
            await image_db_repo.create(
                pool,
                user_id=user_id,
                url=file_url,
                name=name,
                source="telegram" if "api.telegram.org" in file_url else "web",
                img_type="analyzed",
                prompt=user_query,
                analysis=analysis_text,
            )
            logger.info("analyze_image: saved to gallery for user %s", user_id)
        except Exception as e:
            logger.warning("analyze_image: gallery save failed for user %s: %s", user_id, e)

    return analysis_text


@tool(args_schema=GenerateImageInput)
@skill_guard("image")
async def generate_image(prompt: str, aspect_ratio: str = "1:1") -> str:
    """요청한 설명으로 이미지를 생성합니다."""
    from starnion_agent.graph.agent import get_model_config_for_use_case  # lazy

    if aspect_ratio not in _VALID_ASPECT_RATIOS:
        aspect_ratio = "1:1"

    user_id = get_current_user()
    config = await get_model_config_for_use_case(user_id, "image_gen")

    # Ollama path (e.g. x/z-image-turbo)
    if config and config.get("endpoint_type") == "ollama":
        return await _generate_image_ollama(
            config["model"],
            config.get("base_url", "http://localhost:11434"),
            prompt,
        )

    # Gemini path — use assigned model or hardcoded default.
    model = config["model"] if config else _IMAGE_GEN_MODEL
    api_key = (config.get("api_key") or "") if config else ""
    if not api_key:
        api_key = await get_gemini_api_key()
    if not api_key:
        return no_key_message()

    return await _generate_image_gemini(model, api_key, prompt, aspect_ratio)


@tool(args_schema=EditImageInput)
@skill_guard("image")
async def edit_image(file_url: str, prompt: str) -> str:
    """첨부된 이미지를 요청에 따라 편집합니다. 배경 변경, 스타일 변환, 객체 추가/제거 등."""
    from starnion_agent.graph.agent import get_model_config_for_use_case  # lazy

    user_id = get_current_user()
    config = await get_model_config_for_use_case(user_id, "image_gen")

    # Edit requires Gemini multimodal — ignore Ollama assignment for edit.
    model = config["model"] if config and config.get("endpoint_type") != "ollama" else _IMAGE_GEN_MODEL
    api_key = (config.get("api_key") or "") if config and config.get("endpoint_type") != "ollama" else ""
    if not api_key:
        api_key = await get_gemini_api_key()
    if not api_key:
        return no_key_message()

    from google import genai
    from google.genai import types
    from PIL import Image

    image_data = await fetch_file(file_url)
    image = Image.open(BytesIO(image_data))

    client = genai.Client(api_key=api_key)
    response = await client.aio.models.generate_content(
        model=model,
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
