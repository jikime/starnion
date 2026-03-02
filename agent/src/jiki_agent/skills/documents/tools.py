"""Document processing and generation tools."""

from pathlib import Path

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from jiki_agent.context import get_current_user
from jiki_agent.db.pool import get_pool
from jiki_agent.db.repositories import document as document_repo
from jiki_agent.document.chunker import chunk_and_store
from jiki_agent.document.generator import (
    generate_docx,
    generate_md,
    generate_pdf,
    generate_pptx,
    generate_txt,
    generate_xlsx,
)
from jiki_agent.document.parser import extract_text, fetch_file
from jiki_agent.skills.file_context import add_pending_file
from jiki_agent.skills.guard import skill_guard


class ParseDocumentInput(BaseModel):
    """Input schema for parse_document tool."""

    file_url: str = Field(description="문서 파일의 URL")
    file_name: str = Field(default="document.pdf", description="원본 파일명")


class GenerateDocumentInput(BaseModel):
    """Input schema for generate_document tool."""

    content: str = Field(description="문서에 들어갈 내용")
    format: str = Field(
        default="pdf",
        description="생성할 문서 포맷: pdf, docx(워드), xlsx(엑셀), pptx(PPT/발표자료), md(마크다운), txt(텍스트)",
    )
    title: str = Field(default="문서", description="문서 제목 (파일명에 사용)")


_MIME_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "md": "text/markdown",
    "txt": "text/plain",
}


@tool(args_schema=ParseDocumentInput)
@skill_guard("documents")
async def parse_document(file_url: str, file_name: str = "document.pdf") -> str:
    """문서를 처리합니다. 텍스트를 추출하고 벡터 DB에 저장하여 나중에 검색할 수 있게 합니다. PDF, DOCX, XLSX, PPTX, HWP, MD, TXT를 지원합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    data = await fetch_file(file_url)
    ext = Path(file_name).suffix.lower().lstrip(".")
    if not ext:
        ext = "pdf"
    text = extract_text(data, ext)

    if not text.strip() or text.startswith("("):
        return text if text.startswith("(") else "문서에서 텍스트를 추출할 수 없었어요."

    pool = get_pool()
    doc = await document_repo.create_document(
        pool,
        user_id=user_id,
        title=file_name,
        file_type=ext,
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


@tool(args_schema=GenerateDocumentInput)
@skill_guard("documents")
async def generate_document(
    content: str, format: str = "pdf", title: str = "문서",
) -> str:
    """요청한 내용으로 문서 파일을 생성합니다. 사용자가 워드, 엑셀, PDF, PPT, 발표자료 등 문서 파일 생성을 요청하면 반드시 이 도구를 호출하세요. 포맷: pdf, docx(워드), xlsx(엑셀), pptx(PPT/발표자료), md, txt."""
    fmt = format.lower().strip(".")
    mime = _MIME_TYPES.get(fmt)
    if not mime:
        return f"지원하지 않는 포맷이에요: {format}. pdf, docx, xlsx, pptx, md, txt 중에서 선택해주세요."

    if fmt == "pdf":
        data = generate_pdf(title, content)
    elif fmt == "docx":
        data = generate_docx(title, content)
    elif fmt == "pptx":
        data = generate_pptx(title, content)
    elif fmt == "xlsx":
        # Parse simple table: first line = headers, rest = rows.
        lines = [line for line in content.strip().split("\n") if line.strip()]
        if lines:
            headers = [h.strip() for h in lines[0].split(",")]
            rows = [[c.strip() for c in line.split(",")] for line in lines[1:]]
        else:
            headers, rows = ["내용"], [[content]]
        data = generate_xlsx(headers, rows)
    elif fmt == "md":
        data = generate_md(title, content)
    else:
        data = generate_txt(content)

    file_name = f"{title}.{fmt}"
    add_pending_file(data, file_name, mime)
    return f"'{file_name}' 문서를 생성했어요."
