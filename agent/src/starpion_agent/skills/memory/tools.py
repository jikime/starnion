"""Memory retrieval tool for RAG-based context search."""

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starpion_agent.context import get_current_user
from starpion_agent.memory import retriever
from starpion_agent.skills.guard import skill_guard


class RetrieveMemoryInput(BaseModel):
    """Input schema for retrieve_memory tool."""

    query: str = Field(
        description="검색할 내용을 자연어로 입력하세요 (예: '지난주 기분', '좋아하는 음식')",
    )


@tool(args_schema=RetrieveMemoryInput)
@skill_guard("memory")
async def retrieve_memory(query: str) -> str:
    """사용자의 과거 기록, 업로드된 문서, 지식 베이스에서 관련 정보를 검색합니다.

    다음 상황에서 반드시 이 도구를 먼저 호출하세요:
    - 업로드된 문서(PDF, DOCX, XLSX 등)의 내용에 대한 질문
    - 문서 요약 요청
    - 과거 기록, 일상, 사용자 선호도 질문
    - "이 문서에서 ~", "방금 보낸 파일 ~", "문서 내용이 뭐야?" 등
    이 도구 없이 문서 내용을 직접 답변하지 마세요.
    """
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    results = await retriever.search(query=query, user_id=user_id, top_k=5)

    if not results:
        return "관련된 기억을 찾지 못했어요."

    source_labels = {
        "daily_log": "일상기록",
        "knowledge": "지식",
        "finance": "가계부",
        "document": "문서",
    }
    lines = ["관련 기억을 찾았어요:"]
    for r in results:
        source = r.get("source", "unknown")
        label = source_labels.get(source, source)
        similarity = r.get("similarity", 0)

        if source == "finance":
            created = r.get("created_at", "")
            date_str = created.strftime("%m/%d") if hasattr(created, "strftime") else str(created)[:10]
            lines.append(f"  [{label}] {date_str} {r['content']}")
        elif source == "document":
            doc_title = r.get("doc_title", "")
            lines.append(f"  [{label}] ({doc_title}, 유사도 {similarity:.0%}) {r['content'][:200]}")
        elif source == "daily_log":
            lines.append(f"  [{label}] (유사도 {similarity:.0%}) {r['content']}")
        else:
            lines.append(
                f"  [{label}] (유사도 {similarity:.0%}) {r.get('key', '')}: {r.get('value', r.get('content', ''))}"
            )

    return "\n".join(lines)
