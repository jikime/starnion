"""Voice/audio processing and generation tools."""

import base64

from langchain_core.messages import HumanMessage
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

from jiki_agent.config import settings
from jiki_agent.document.parser import fetch_file
from jiki_agent.skills.file_context import add_pending_file
from jiki_agent.skills.guard import skill_guard


class TranscribeAudioInput(BaseModel):
    """Input schema for transcribe_audio tool."""

    file_url: str = Field(description="음성 파일의 URL")


class GenerateAudioInput(BaseModel):
    """Input schema for generate_audio tool."""

    text: str = Field(description="음성으로 변환할 텍스트")
    voice: str = Field(
        default="ko-KR-Standard-A",
        description="음성 모델 (ko-KR-Standard-A, ko-KR-Standard-B 등)",
    )


@tool(args_schema=TranscribeAudioInput)
@skill_guard("audio")
async def transcribe_audio(file_url: str) -> str:
    """음성 메시지를 텍스트로 변환합니다."""
    data = await fetch_file(file_url)
    b64_data = base64.b64encode(data).decode("utf-8")

    llm = ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=settings.gemini_api_key,
    )

    message = HumanMessage(
        content=[
            {
                "type": "text",
                "text": "이 음성을 한국어로 정확하게 텍스트로 변환해주세요. 변환된 텍스트만 출력하세요.",
            },
            {"type": "media", "mime_type": "audio/ogg", "data": b64_data},
        ],
    )

    response = await llm.ainvoke([message])
    return f"음성 인식 결과:\n{response.content}"


@tool(args_schema=GenerateAudioInput)
@skill_guard("audio")
async def generate_audio(text: str, voice: str = "ko-KR-Standard-A") -> str:
    """텍스트를 음성으로 변환(TTS)합니다."""
    from google.cloud import texttospeech_v1 as tts

    client = tts.TextToSpeechAsyncClient()

    synthesis_input = tts.SynthesisInput(text=text)
    voice_params = tts.VoiceSelectionParams(
        language_code="ko-KR",
        name=voice,
    )
    audio_config = tts.AudioConfig(
        audio_encoding=tts.AudioEncoding.OGG_OPUS,
    )

    response = await client.synthesize_speech(
        input=synthesis_input,
        voice=voice_params,
        audio_config=audio_config,
    )

    add_pending_file(response.audio_content, "speech.ogg", "audio/ogg")
    return "음성을 생성했어요."
