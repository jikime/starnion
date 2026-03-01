"""Multimodal tools for processing images, voice, and documents."""

from langchain_core.messages import HumanMessage
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

from jiki_agent.config import settings
from jiki_agent.context import get_current_user
from jiki_agent.db.pool import get_pool
from jiki_agent.db.repositories import document as document_repo
from jiki_agent.document.chunker import chunk_and_store
from jiki_agent.document.parser import extract_text_from_pdf, fetch_file


class ProcessImageInput(BaseModel):
    """Input schema for process_image tool."""

    file_url: str = Field(description="이미지 파일의 URL")
    user_query: str = Field(
        default="이 이미지를 분석해주세요.",
        description="이미지에 대한 질문이나 요청",
    )


class ProcessDocumentInput(BaseModel):
    """Input schema for process_document tool."""

    file_url: str = Field(description="문서 파일의 URL")
    file_name: str = Field(default="document.pdf", description="원본 파일명")


class ProcessVoiceInput(BaseModel):
    """Input schema for process_voice tool."""

    file_url: str = Field(description="음성 파일의 URL")


@tool(args_schema=ProcessImageInput)
async def process_image(file_url: str, user_query: str = "이 이미지를 분석해주세요.") -> str:
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


@tool(args_schema=ProcessDocumentInput)
async def process_document(file_url: str, file_name: str = "document.pdf") -> str:
    """PDF 문서를 처리합니다. 텍스트를 추출하고 벡터 DB에 저장하여 나중에 검색할 수 있게 합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    data = await fetch_file(file_url)
    text = extract_text_from_pdf(data)

    if not text.strip():
        return "문서에서 텍스트를 추출할 수 없었어요."

    pool = get_pool()
    doc = await document_repo.create_document(
        pool,
        user_id=user_id,
        title=file_name,
        file_type="pdf",
        file_url=file_url,
    )

    section_count = await chunk_and_store(
        user_id=user_id,
        doc_id=doc["id"],
        text=text,
    )

    preview = text[:200] + "..." if len(text) > 200 else text
    return (
        f"문서 '{file_name}'를 처리했어요.\n"
        f"- 추출된 텍스트: {len(text)}자\n"
        f"- 저장된 섹션: {section_count}개\n\n"
        f"미리보기:\n{preview}"
    )


@tool(args_schema=ProcessVoiceInput)
async def process_voice(file_url: str) -> str:
    """음성 메시지를 텍스트로 변환합니다."""
    import base64

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
