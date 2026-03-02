"""Image analysis and generation tools."""

from langchain_core.messages import HumanMessage
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

from jiki_agent.config import settings
from jiki_agent.skills.file_context import add_pending_file
from jiki_agent.skills.guard import skill_guard


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
async def generate_image(prompt: str) -> str:
    """요청한 설명으로 이미지를 생성합니다."""
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.gemini_api_key)

    response = client.models.generate_images(
        model="imagen-3.0-generate-002",
        prompt=prompt,
        config=types.GenerateImagesConfig(number_of_images=1),
    )

    if not response.generated_images:
        return "이미지를 생성할 수 없었어요. 다른 설명으로 다시 시도해주세요."

    image_bytes = response.generated_images[0].image.image_bytes
    add_pending_file(image_bytes, "generated.png", "image/png")
    return f"'{prompt}' 이미지를 생성했어요."
