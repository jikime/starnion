"""Voice/audio processing and generation tools."""

import base64
import io
import logging
import wave

from langchain_core.messages import HumanMessage
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

from starnion_agent.config import settings
from starnion_agent.context import get_current_language, get_current_user
from starnion_agent.document.parser import fetch_file
from starnion_agent.persona import LANGUAGE_INSTRUCTIONS, get_prompt_strings
from starnion_agent.skills.file_context import add_pending_file
from starnion_agent.skills.gemini_key import get_gemini_api_key, no_key_message
from starnion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

# Default TTS model — used when no model_assignment is configured.
_AUDIO_GEN_MODEL = "gemini-2.5-flash-preview-tts"

# Gemini TTS prebuilt voices.
# See: https://ai.google.dev/gemini-api/docs/speech-generation
GEMINI_TTS_VOICES = [
    "Kore", "Puck", "Charon", "Fenrir",
    "Aoede", "Leda", "Orus", "Zephyr",
]


class TranscribeAudioInput(BaseModel):
    """Input schema for transcribe_audio tool."""

    file_url: str = Field(description="음성 파일의 URL")


class GenerateAudioInput(BaseModel):
    """Input schema for generate_audio tool."""

    text: str = Field(description="음성으로 변환할 텍스트")
    voice: str = Field(
        default="Kore",
        description="음성 모델 (Kore, Puck, Charon, Fenrir, Aoede, Leda, Orus, Zephyr)",
    )


def _build_transcription_prompt(language: str = "ko") -> str:
    """Build the transcription instruction prompt for the LLM.

    Args:
        language: Response language code (ko, en, ja, zh). Defaults to "ko".
    """
    lang_instruction = LANGUAGE_INSTRUCTIONS.get(language, LANGUAGE_INSTRUCTIONS["ko"])
    return (
        f"{lang_instruction} "
        "이 음성을 정확하게 텍스트로 변환해주세요. 변환된 텍스트만 출력하세요."
    )


def _pcm_to_wav(pcm_data: bytes, sample_rate: int = 24000) -> bytes:
    """Wrap raw PCM (16-bit mono) data in a WAV container."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_data)
    return buf.getvalue()


@tool(args_schema=TranscribeAudioInput)
@skill_guard("audio")
async def transcribe_audio(file_url: str) -> str:
    """음성 메시지를 텍스트로 변환합니다."""
    api_key = await get_gemini_api_key()
    if not api_key:
        return no_key_message()

    data = await fetch_file(file_url)
    b64_data = base64.b64encode(data).decode("utf-8")

    llm = ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=api_key,
    )

    message = HumanMessage(
        content=[
            {
                "type": "text",
                "text": _build_transcription_prompt(language="ko"),
            },
            {"type": "media", "mime_type": "audio/ogg", "data": b64_data},
        ],
    )

    try:
        response = await llm.ainvoke([message])
    except Exception as e:
        logger.warning("transcribe_audio: LLM call failed: %s", e)
        return get_prompt_strings(get_current_language())["error_audio_transcribe"]
    return f"음성 인식 결과:\n{response.content}"


@tool(args_schema=GenerateAudioInput)
@skill_guard("audio")
async def generate_audio(text: str, voice: str = "Kore") -> str:
    """텍스트를 음성으로 변환(TTS)합니다."""
    from starnion_agent.graph.agent import get_model_config_for_use_case  # lazy

    user_id = get_current_user()
    config = await get_model_config_for_use_case(user_id, "audio_gen")

    model = config["model"] if config else _AUDIO_GEN_MODEL
    api_key = (config.get("api_key") or "") if config else ""
    if not api_key:
        api_key = await get_gemini_api_key()
    if not api_key:
        return no_key_message()

    from google import genai
    from google.genai import types

    if voice not in GEMINI_TTS_VOICES:
        voice = "Kore"

    client = genai.Client(api_key=api_key)

    try:
        response = await client.aio.models.generate_content(
            model=model,
            contents=text,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name=voice,
                        ),
                    ),
                ),
            ),
        )
        pcm_data = response.candidates[0].content.parts[0].inline_data.data
    except Exception as e:
        logger.warning("generate_audio: TTS call failed: %s", e)
        return get_prompt_strings(get_current_language())["error_audio_generate"]

    wav_bytes = _pcm_to_wav(pcm_data)
    add_pending_file(wav_bytes, "speech.wav", "audio/wav")
    return "음성을 생성했어요."
