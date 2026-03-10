"""Memory retrieval tool for RAG-based context search."""

import asyncio
from datetime import date, datetime, timedelta

from langchain_core.messages import HumanMessage
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

from starnion_agent.config import settings
from starnion_agent.context import get_current_user
from starnion_agent.db.pool import get_pool
from starnion_agent.db.repositories import content_tags as tags_repo
from starnion_agent.db.repositories import diary_entry as diary_repo
from starnion_agent.db.repositories import finance as finance_repo
from starnion_agent.memory import retriever
from starnion_agent.skills.gemini_key import get_gemini_api_key
from starnion_agent.skills.guard import skill_guard


class RetrieveMemoryInput(BaseModel):
    """Input schema for retrieve_memory tool."""

    query: str = Field(
        description="검색할 내용을 자연어로 입력하세요 (예: '지난주 기분', '좋아하는 음식')",
    )
    date_from: str | None = Field(
        default=None,
        description="검색 시작 날짜 (YYYY-MM-DD). '3년 전 이맘때'는 3년 전 날짜로 설정.",
    )
    date_to: str | None = Field(
        default=None,
        description="검색 종료 날짜 (YYYY-MM-DD).",
    )


@tool(args_schema=RetrieveMemoryInput)
@skill_guard("memory")
async def retrieve_memory(
    query: str,
    date_from: str | None = None,
    date_to: str | None = None,
) -> str:
    """사용자의 과거 기록, 업로드된 문서, 지식 베이스에서 관련 정보를 검색합니다.

    다음 상황에서 반드시 이 도구를 먼저 호출하세요:
    - 업로드된 문서(PDF, DOCX, XLSX 등)의 내용에 대한 질문
    - 문서 요약 요청
    - 과거 기록, 일상, 사용자 선호도 질문
    - "이 문서에서 ~", "방금 보낸 파일 ~", "문서 내용이 뭐야?" 등
    - "3년 전 이맘때", "작년 여름" 등 특정 시기 기록 조회 시 date_from/date_to 사용
    이 도구 없이 문서 내용을 직접 답변하지 마세요.
    """
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    dt_from: datetime | None = None
    dt_to: datetime | None = None
    try:
        if date_from:
            dt_from = datetime.fromisoformat(date_from)
        if date_to:
            dt_to = datetime.fromisoformat(date_to).replace(
                hour=23, minute=59, second=59
            )
    except ValueError:
        return "날짜 형식이 올바르지 않아요. YYYY-MM-DD 형식으로 입력해 주세요."

    results = await retriever.search(
        query=query, user_id=user_id, top_k=5,
        date_from=dt_from, date_to=dt_to,
    )

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


class TimeTravelInput(BaseModel):
    """Input schema for get_time_travel_insight tool."""

    date_from: str | None = Field(
        default=None,
        description="조회 시작 날짜 (YYYY-MM-DD). 미입력 시 7일 전부터.",
    )
    date_to: str | None = Field(
        default=None,
        description="조회 종료 날짜 (YYYY-MM-DD). 미입력 시 오늘까지.",
    )


@tool(args_schema=TimeTravelInput)
@skill_guard("memory")
async def get_time_travel_insight(
    date_from: str | None = None,
    date_to: str | None = None,
) -> str:
    """특정 날짜 범위의 일기와 지출 내역을 함께 조회합니다.

    사용자가 과거의 특정 시간대를 돌아보고 싶을 때 사용하세요:
    - "지난주에 뭐했어?", "이번 달 어떻게 보냈어?"
    - "3월에 기분이 어땠어?", "저번 달 소비는?"
    - "2주 전 일기랑 지출 같이 보여줘"
    날짜 없이 묻는 경우 최근 7일을 기본으로 사용합니다.
    """
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    today = date.today()
    try:
        d_from = date.fromisoformat(date_from) if date_from else today - timedelta(days=7)
        d_to = date.fromisoformat(date_to) if date_to else today
    except ValueError:
        return "날짜 형식이 올바르지 않아요. YYYY-MM-DD 형식으로 입력해 주세요."

    if d_from > d_to:
        d_from, d_to = d_to, d_from

    pool = get_pool()
    dt_from = datetime(d_from.year, d_from.month, d_from.day)
    dt_to = datetime(d_to.year, d_to.month, d_to.day) + timedelta(days=1)

    diary_entries, finance_records = await asyncio.gather(
        diary_repo.list_by_date_range(pool, user_id, d_from, d_to),
        finance_repo.list_by_date_range(pool, user_id, dt_from, dt_to),
    )

    if not diary_entries and not finance_records:
        period = f"{d_from.strftime('%m/%d')} ~ {d_to.strftime('%m/%d')}"
        return f"{period} 기간에 기록된 일기나 지출 내역이 없어요."

    period_label = f"{d_from.strftime('%Y/%m/%d')} ~ {d_to.strftime('%Y/%m/%d')}"
    lines = [f"📅 {period_label} 타임라인\n"]

    if diary_entries:
        lines.append("### 일기")
        for e in diary_entries:
            entry_date = e["entry_date"]
            date_str = entry_date.strftime("%m/%d") if hasattr(entry_date, "strftime") else str(entry_date)
            title = e.get("title") or ""
            mood = e.get("mood") or ""
            content = e.get("content") or ""
            snippet = content[:120] + ("..." if len(content) > 120 else "")
            mood_str = f" [{mood}]" if mood else ""
            title_str = f" {title}" if title else ""
            lines.append(f"  {date_str}{title_str}{mood_str}: {snippet}")

    if finance_records:
        lines.append("\n### 지출/수입")
        total_expense = 0
        total_income = 0
        for r in finance_records:
            created_at = r["created_at"]
            date_str = created_at.strftime("%m/%d") if hasattr(created_at, "strftime") else str(created_at)[:10]
            amount = int(r["amount"])
            category = r.get("category") or ""
            desc = r.get("description") or ""
            if amount < 0:
                total_expense += abs(amount)
                lines.append(f"  {date_str} [{category}] -{abs(amount):,}원 {desc}".rstrip())
            else:
                total_income += amount
                lines.append(f"  {date_str} [{category}] +{amount:,}원 {desc}".rstrip())
        lines.append(f"\n  총 지출: {total_expense:,}원 | 총 수입: {total_income:,}원")

    return "\n".join(lines)


class SearchByTagsInput(BaseModel):
    """Input schema for search_by_tags tool."""

    tags: list[str] = Field(
        description="검색할 태그 목록 (예: ['운동', '카페', '업무']). 하나 이상 필요.",
    )
    source: str = Field(
        default="",
        description="검색 대상: 'diary'(일기), 'memo'(메모), 또는 빈 값(전체).",
    )
    limit: int = Field(default=10, description="최대 결과 수 (1-30).")


@tool(args_schema=SearchByTagsInput)
@skill_guard("memory")
async def search_by_tags(
    tags: list[str],
    source: str = "",
    limit: int = 10,
) -> str:
    """태그로 일기와 메모를 검색합니다.

    다음 상황에서 사용하세요:
    - "운동 태그 달린 일기 보여줘"
    - "업무 관련 메모 찾아줘"
    - "#카페 #일상 태그 있는 것들 모아줘"
    """
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    if not tags:
        return "검색할 태그를 하나 이상 입력해 주세요."

    limit = max(1, min(limit, 30))
    src = source.strip().lower() if source.strip() in ("diary", "memo") else None

    pool = get_pool()
    matches = await tags_repo.search_by_tags(pool, user_id, tags, source=src, limit=limit)

    if not matches:
        tag_str = ", ".join(f"#{t}" for t in tags)
        scope = {"diary": "일기", "memo": "메모"}.get(src or "", "일기/메모")
        return f"{tag_str} 태그가 달린 {scope}를 찾지 못했어요."

    # Enrich: fetch content snippets for each match
    diary_ids = [m["source_id"] for m in matches if m["source"] == "diary"]
    memo_ids  = [m["source_id"] for m in matches if m["source"] == "memo"]

    diary_map: dict[int, dict] = {}
    memo_map:  dict[int, dict] = {}

    if diary_ids:
        for entry in await diary_repo.list_entries(pool, user_id, limit=len(diary_ids) + 10):
            if entry["id"] in diary_ids:
                diary_map[entry["id"]] = entry

    if memo_ids:
        from starnion_agent.db.repositories import memo_db as memo_repo
        for memo in await memo_repo.list_memos(pool, user_id, limit=len(memo_ids) + 10):
            if memo["id"] in memo_ids:
                memo_map[memo["id"]] = memo

    tag_str = ", ".join(f"#{t}" for t in tags)
    lines = [f"🏷️ {tag_str} 검색 결과 ({len(matches)}건)\n"]

    for m in matches:
        sid = m["source_id"]
        if m["source"] == "diary" and sid in diary_map:
            e = diary_map[sid]
            entry_date = e["entry_date"]
            date_str = entry_date.strftime("%Y/%m/%d") if hasattr(entry_date, "strftime") else str(entry_date)
            title = e.get("title") or ""
            content = e.get("content") or ""
            snippet = content[:80] + ("..." if len(content) > 80 else "")
            title_str = f" {title}" if title else ""
            lines.append(f"  📔 [일기] {date_str}{title_str}: {snippet}")
        elif m["source"] == "memo" and sid in memo_map:
            memo = memo_map[sid]
            title = memo.get("title") or ""
            content = memo.get("content") or ""
            snippet = content[:80] + ("..." if len(content) > 80 else "")
            title_str = f" {title}" if title else ""
            lines.append(f"  🗒️ [메모] ID:{sid}{title_str}: {snippet}")

    return "\n".join(lines)


class ComparePeriodsInput(BaseModel):
    """Input schema for compare_periods tool."""

    period_a_from: str = Field(description="비교 기간 A 시작 날짜 (YYYY-MM-DD)")
    period_a_to: str = Field(description="비교 기간 A 종료 날짜 (YYYY-MM-DD)")
    period_b_from: str = Field(description="비교 기간 B 시작 날짜 (YYYY-MM-DD)")
    period_b_to: str = Field(description="비교 기간 B 종료 날짜 (YYYY-MM-DD)")


@tool(args_schema=ComparePeriodsInput)
@skill_guard("memory")
async def compare_periods(
    period_a_from: str,
    period_a_to: str,
    period_b_from: str,
    period_b_to: str,
) -> str:
    """두 기간의 지출 패턴을 비교합니다.

    다음 상황에서 사용하세요:
    - "2년 전 자취 시작할 때랑 지금 지출 비교해줘"
    - "작년 이맘때랑 지금 소비 패턴이 비슷해?"
    - "요즘 지출이 예전이랑 얼마나 달라졌어?"
    """
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    try:
        a_from = datetime.fromisoformat(period_a_from)
        a_to = datetime.fromisoformat(period_a_to).replace(hour=23, minute=59, second=59)
        b_from = datetime.fromisoformat(period_b_from)
        b_to = datetime.fromisoformat(period_b_to).replace(hour=23, minute=59, second=59)
    except ValueError:
        return "날짜 형식이 올바르지 않아요. YYYY-MM-DD 형식으로 입력해 주세요."

    if a_from > a_to or b_from > b_to:
        return "시작 날짜가 종료 날짜보다 늦을 수 없어요."

    pool = get_pool()
    summary_a, summary_b = await asyncio.gather(
        finance_repo.get_period_summary(pool, user_id, a_from, a_to),
        finance_repo.get_period_summary(pool, user_id, b_from, b_to),
    )

    if summary_a["total"] == 0 and summary_b["total"] == 0:
        return "두 기간 모두 지출 기록이 없어요."

    def _fmt_period(label: str, d_from: datetime, d_to: datetime, s: dict) -> list[str]:
        lines = [
            f"**{label}** ({d_from.strftime('%Y/%m/%d')} ~ {d_to.strftime('%Y/%m/%d')}, {s['days']}일)",
            f"  총 지출: {s['total']:,}원  |  일 평균: {int(s['daily_avg']):,}원",
        ]
        for c in s["categories"][:5]:
            lines.append(f"  - {c['category']}: {c['total']:,}원")
        return lines

    result_lines = _fmt_period("기간 A", a_from, a_to, summary_a)
    result_lines.append("")
    result_lines += _fmt_period("기간 B", b_from, b_to, summary_b)

    # Compute change metrics.
    if summary_a["total"] > 0 and summary_b["total"] > 0:
        result_lines.append("")
        daily_diff = int(summary_b["daily_avg"]) - int(summary_a["daily_avg"])
        pct = (summary_b["daily_avg"] / summary_a["daily_avg"] - 1) * 100 if summary_a["daily_avg"] else 0
        direction = "증가" if daily_diff > 0 else "감소"
        result_lines.append(
            f"📊 일 평균 지출: {direction} {abs(daily_diff):,}원 ({pct:+.1f}%)"
        )

        # Category overlap.
        cats_a = {c["category"] for c in summary_a["categories"]}
        cats_b = {c["category"] for c in summary_b["categories"]}
        common = cats_a & cats_b
        if common:
            result_lines.append(f"  공통 지출 카테고리: {', '.join(sorted(common))}")

    # Use LLM for natural language insight if Gemini is available.
    api_key = await get_gemini_api_key(user_id)
    if api_key and (summary_a["total"] > 0 or summary_b["total"] > 0):
        try:
            llm = ChatGoogleGenerativeAI(
                model=settings.gemini_model,
                google_api_key=api_key,
            )
            data_text = "\n".join(result_lines)
            prompt = (
                "아래 두 기간의 지출 데이터를 보고, 패턴 변화를 2-3문장으로 자연스럽게 요약해줘. "
                "수치를 언급하고 사용자에게 도움이 되는 인사이트를 포함해. "
                "숫자 형식: 원 단위.\n\n"
                f"{data_text}"
            )
            response = await llm.ainvoke([HumanMessage(content=prompt)])
            result_lines.append("")
            result_lines.append(f"💬 {response.content}")
        except Exception:
            pass  # LLM 실패 시 수치 결과만 반환

    return "\n".join(result_lines)
