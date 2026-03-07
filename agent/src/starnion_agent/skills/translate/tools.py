"""Text translation tool using Gemini LLM."""

import logging

from langchain_core.messages import HumanMessage
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

from starnion_agent.config import settings
from starnion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

_MAX_TEXT_CHARS = 10_000

SUPPORTED_LANGS: dict[str, str] = {
    "ko": "한국어",
    "en": "영어",
    "ja": "일본어",
    "zh": "중국어",
    "es": "스페인어",
    "fr": "프랑스어",
    "de": "독일어",
}


class TranslateTextInput(BaseModel):
    """Input schema for translate_text tool."""

    text: str = Field(description="번역할 텍스트")
    target_lang: str = Field(
        default="en",
        description="목표 언어 코드 (ko/en/ja/zh/es/fr/de)",
    )
    source_lang: str = Field(
        default="auto",
        description="원본 언어 코드 (auto=자동감지)",
    )


def _build_translate_prompt(text: str, target_lang: str, source_lang: str) -> str:
    """Build a translation prompt for Gemini."""
    target_name = SUPPORTED_LANGS.get(target_lang, target_lang)

    if source_lang == "auto":
        source_part = "원본 언어를 자동으로 감지하여"
    else:
        source_name = SUPPORTED_LANGS.get(source_lang, source_lang)
        source_part = f"{source_name}에서"

    truncated = text[:_MAX_TEXT_CHARS]
    notice = "\n\n(참고: 텍스트가 잘려있음)" if len(text) > _MAX_TEXT_CHARS else ""

    return (
        f"당신은 전문 번역가입니다. {source_part} {target_name}으로 번역하세요.\n"
        f"번역문만 출력하세요. 설명, 부연, 원문 반복은 하지 마세요.\n\n"
        f"--- 원문 ---\n{truncated}{notice}"
    )


@tool(args_schema=TranslateTextInput)
@skill_guard("translate")
async def translate_text(
    text: str,
    target_lang: str = "en",
    source_lang: str = "auto",
) -> str:
    """텍스트를 지정된 언어로 번역합니다. 한국어, 영어, 일본어, 중국어 등 7개 언어를 지원합니다."""
    if not settings.gemini_api_key:
        return "Gemini API 키가 설정되지 않았어요. 관리자에게 문의해 주세요."

    if not text or not text.strip():
        return "번역할 텍스트를 입력해 주세요."

    if target_lang not in SUPPORTED_LANGS:
        supported = ", ".join(f"{k}({v})" for k, v in SUPPORTED_LANGS.items())
        return f"지원하지 않는 언어예요. 지원 언어: {supported}"

    if source_lang != "auto" and source_lang not in SUPPORTED_LANGS:
        return "원본 언어 코드가 올바르지 않아요. 'auto'로 설정하면 자동 감지됩니다."

    prompt = _build_translate_prompt(text, target_lang, source_lang)

    try:
        llm = ChatGoogleGenerativeAI(
            model=settings.gemini_model,
            google_api_key=settings.gemini_api_key,
        )
        response = await llm.ainvoke([HumanMessage(content=prompt)])
        return response.content
    except Exception:
        logger.debug("Translation LLM error", exc_info=True)
        return "번역 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요."
