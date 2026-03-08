"""Video analysis and generation tools."""

import base64
import logging

from langchain_core.messages import HumanMessage
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

from starnion_agent.config import settings
from starnion_agent.document.parser import fetch_file
from starnion_agent.skills.file_context import add_pending_file
from starnion_agent.skills.gemini_key import get_gemini_api_key, no_key_message
from starnion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)


class AnalyzeVideoInput(BaseModel):
    """Input schema for analyze_video tool."""

    file_url: str = Field(description="비디오 파일의 URL")
    user_query: str = Field(
        default="이 비디오를 분석해주세요.",
        description="비디오에 대한 질문이나 요청",
    )


class GenerateVideoInput(BaseModel):
    """Input schema for generate_video tool."""

    prompt: str = Field(description="생성할 영상에 대한 설명")
    frames: int = Field(default=5, description="생성할 프레임 수 (1-10)")


@tool(args_schema=AnalyzeVideoInput)
@skill_guard("video")
async def analyze_video(
    file_url: str, user_query: str = "이 비디오를 분석해주세요.",
) -> str:
    """비디오를 분석합니다. 내용 요약, 장면 설명, 텍스트 추출 등을 수행합니다."""
    api_key = await get_gemini_api_key()
    if not api_key:
        return no_key_message()

    data = await fetch_file(file_url)
    encoded = base64.b64encode(data).decode("utf-8")

    llm = ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=api_key,
    )

    message = HumanMessage(
        content=[
            {"type": "text", "text": user_query},
            {"type": "media", "mime_type": "video/mp4", "data": encoded},
        ],
    )

    response = await llm.ainvoke([message])
    return response.content


@tool(args_schema=GenerateVideoInput)
@skill_guard("video")
async def generate_video(prompt: str, frames: int = 5) -> str:
    """요청한 설명으로 이미지 슬라이드쇼 영상을 생성합니다."""
    api_key = await get_gemini_api_key()
    if not api_key:
        return no_key_message()

    import subprocess
    import tempfile
    from pathlib import Path

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    frames = max(1, min(frames, 10))

    # Generate frames using Imagen 3.
    image_files: list[Path] = []
    tmpdir = tempfile.mkdtemp()

    for i in range(frames):
        frame_prompt = f"{prompt} (frame {i + 1}/{frames})"
        try:
            response = client.models.generate_images(
                model="imagen-3.0-generate-002",
                prompt=frame_prompt,
                config=types.GenerateImagesConfig(number_of_images=1),
            )
            if response.generated_images:
                img_path = Path(tmpdir) / f"frame_{i:03d}.png"
                img_path.write_bytes(response.generated_images[0].image.image_bytes)
                image_files.append(img_path)
        except Exception:
            logger.warning("Failed to generate frame %d/%d", i + 1, frames, exc_info=True)

    if not image_files:
        return "영상 프레임을 생성할 수 없었어요. 다른 설명으로 다시 시도해주세요."

    # Combine frames into MP4 using ffmpeg.
    output_path = Path(tmpdir) / "video.mp4"
    try:
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-framerate", "1",
                "-i", str(Path(tmpdir) / "frame_%03d.png"),
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
                str(output_path),
            ],
            check=True,
            capture_output=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        logger.warning("ffmpeg failed, returning first frame as image", exc_info=True)
        # Fallback: return first frame as image.
        add_pending_file(
            image_files[0].read_bytes(), "generated.png", "image/png",
        )
        return f"영상 생성에 실패하여 첫 번째 프레임을 이미지로 전달해요. ({len(image_files)}개 프레임 생성됨)"

    mp4_bytes = output_path.read_bytes()
    add_pending_file(mp4_bytes, "video.mp4", "video/mp4")
    return f"'{prompt}' 영상을 생성했어요. ({len(image_files)}개 프레임)"
