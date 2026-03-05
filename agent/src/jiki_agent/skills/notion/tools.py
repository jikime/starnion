"""Notion integration tools.

API key is fetched per-user from integration_keys table (provider='notion').
Falls back to nothing if the user has not connected Notion.
"""

from __future__ import annotations

import logging

import httpx
from langchain_core.tools import tool
from pydantic import BaseModel, Field

from jiki_agent.context import get_current_user
from jiki_agent.db.pool import get_pool
from jiki_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

_NOTION_VERSION = "2022-06-28"
_BASE_URL = "https://api.notion.com/v1"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_notion_key() -> str | None:
    """Return the Notion API key for the current user from integration_keys."""
    user_id = get_current_user()
    if not user_id:
        return None
    try:
        from psycopg.rows import dict_row

        pool = get_pool()
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "SELECT api_key FROM integration_keys WHERE user_id = %s AND provider = 'notion'",
                    (user_id,),
                )
                row = await cur.fetchone()
                return row["api_key"] if row and row.get("api_key") else None
    except Exception:
        logger.debug("Failed to fetch Notion key", exc_info=True)
        return None


def _headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Notion-Version": _NOTION_VERSION,
        "Content-Type": "application/json",
    }


def _not_linked() -> str:
    return (
        "노션(Notion) 연동이 되어 있지 않아요. "
        "설정 → 연동 메뉴에서 Notion Integration Token을 등록해주세요."
    )


def _blocks_to_text(blocks: list[dict]) -> str:
    """Convert Notion block list to plain text."""
    lines: list[str] = []
    for b in blocks:
        btype = b.get("type", "")
        block_data = b.get(btype, {})
        rich = block_data.get("rich_text", [])
        text = "".join(rt.get("plain_text", "") for rt in rich)
        if btype == "heading_1":
            lines.append(f"# {text}")
        elif btype == "heading_2":
            lines.append(f"## {text}")
        elif btype == "heading_3":
            lines.append(f"### {text}")
        elif btype in ("bulleted_list_item", "numbered_list_item"):
            lines.append(f"- {text}")
        elif btype == "to_do":
            checked = "✅" if block_data.get("checked") else "☐"
            lines.append(f"{checked} {text}")
        elif btype == "code":
            lang = block_data.get("language", "")
            lines.append(f"```{lang}\n{text}\n```")
        elif btype == "divider":
            lines.append("---")
        elif text:
            lines.append(text)
    return "\n".join(lines)


def _build_rich_text(content: str) -> list[dict]:
    """Split content into Notion rich_text chunks (≤2000 chars each)."""
    chunks = [content[i:i + 2000] for i in range(0, len(content), 2000)]
    return [{"type": "text", "text": {"content": chunk}} for chunk in chunks]


def _build_blocks_from_text(content: str) -> list[dict]:
    """Convert plain text to Notion paragraph blocks."""
    blocks = []
    for para in content.split("\n\n"):
        para = para.strip()
        if not para:
            continue
        # Split long paragraphs across multiple blocks
        for chunk in [para[i:i + 2000] for i in range(0, len(para), 2000)]:
            blocks.append({
                "object": "block",
                "type": "paragraph",
                "paragraph": {"rich_text": [{"type": "text", "text": {"content": chunk}}]},
            })
    return blocks or [{"object": "block", "type": "paragraph",
                       "paragraph": {"rich_text": [{"type": "text", "text": {"content": content}}]}}]


# ---------------------------------------------------------------------------
# Input schemas
# ---------------------------------------------------------------------------

class NotionSearchInput(BaseModel):
    query: str = Field(description="검색할 페이지 또는 데이터베이스 이름")
    filter_type: str = Field(
        default="",
        description="결과 필터: 'page' 또는 'database', 비워두면 전체 검색",
    )


class NotionPageCreateInput(BaseModel):
    title: str = Field(description="생성할 페이지 제목")
    content: str = Field(default="", description="페이지 본문 내용 (선택)")
    parent_page_id: str = Field(
        default="",
        description="상위 페이지 ID (비워두면 워크스페이스 최상위에 생성)",
    )


class NotionPageReadInput(BaseModel):
    page_id: str = Field(description="읽을 페이지 ID 또는 URL")


class NotionBlockAppendInput(BaseModel):
    page_id: str = Field(description="블록을 추가할 페이지 ID 또는 URL")
    content: str = Field(description="추가할 텍스트 내용")


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@tool(args_schema=NotionSearchInput)
@skill_guard("notion")
async def notion_search(query: str, filter_type: str = "") -> str:
    """노션에서 페이지나 데이터베이스를 검색합니다."""
    api_key = await _get_notion_key()
    if not api_key:
        return _not_linked()

    body: dict = {"query": query, "page_size": 10}
    if filter_type in ("page", "database"):
        body["filter"] = {"value": filter_type, "property": "object"}

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{_BASE_URL}/search",
                headers=_headers(api_key),
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            return "Notion API 키가 유효하지 않아요. 설정 → 연동에서 키를 다시 등록해주세요."
        return f"Notion 검색 중 오류가 발생했어요. (HTTP {e.response.status_code})"
    except Exception:
        logger.debug("notion_search failed", exc_info=True)
        return "Notion 검색 중 오류가 발생했어요. 잠시 후 다시 시도해주세요."

    results = data.get("results", [])
    if not results:
        return f"'{query}'에 해당하는 노션 페이지를 찾지 못했어요."

    lines = [f"'{query}' 검색 결과 ({len(results)}개):"]
    for r in results:
        obj_type = r.get("object", "")
        rid = r.get("id", "").replace("-", "")
        if obj_type == "page":
            props = r.get("properties", {})
            title_prop = props.get("title") or props.get("Name") or {}
            title_parts = title_prop.get("title", []) if "title" in title_prop else title_prop.get("rich_text", [])
            title = "".join(t.get("plain_text", "") for t in title_parts) or "(제목 없음)"
            lines.append(f"  📄 [페이지] {title} | ID: {rid}")
        elif obj_type == "database":
            db_title = r.get("title", [])
            title = "".join(t.get("plain_text", "") for t in db_title) or "(제목 없음)"
            lines.append(f"  🗄️ [데이터베이스] {title} | ID: {rid}")

    return "\n".join(lines)


@tool(args_schema=NotionPageCreateInput)
@skill_guard("notion")
async def notion_page_create(title: str, content: str = "", parent_page_id: str = "") -> str:
    """노션에 새 페이지를 생성합니다. 상위 페이지 ID를 지정하거나 워크스페이스 최상위에 생성할 수 있습니다."""
    api_key = await _get_notion_key()
    if not api_key:
        return _not_linked()

    # Build parent
    if parent_page_id:
        pid = parent_page_id.replace("-", "").strip()
        # Normalize to UUID format
        if len(pid) == 32:
            pid = f"{pid[:8]}-{pid[8:12]}-{pid[12:16]}-{pid[16:20]}-{pid[20:]}"
        parent = {"type": "page_id", "page_id": pid}
    else:
        parent = {"type": "workspace", "workspace": True}

    body: dict = {
        "parent": parent,
        "properties": {
            "title": {"title": _build_rich_text(title)},
        },
    }

    if content:
        body["children"] = _build_blocks_from_text(content)

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{_BASE_URL}/pages",
                headers=_headers(api_key),
                json=body,
            )
            resp.raise_for_status()
            page = resp.json()
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            return "Notion API 키가 유효하지 않아요. 설정 → 연동에서 키를 다시 등록해주세요."
        if e.response.status_code == 403:
            return (
                "페이지 생성 권한이 없어요. "
                "노션 워크스페이스에서 Integration에 페이지 접근 권한을 부여했는지 확인해주세요."
            )
        detail = ""
        try:
            detail = e.response.json().get("message", "")
        except Exception:
            pass
        return f"노션 페이지 생성에 실패했어요. {detail}".strip()
    except Exception:
        logger.debug("notion_page_create failed", exc_info=True)
        return "노션 페이지 생성 중 오류가 발생했어요."

    page_id = page.get("id", "").replace("-", "")
    page_url = page.get("url", "")
    return f"✅ 노션 페이지가 생성됐어요!\n제목: {title}\nURL: {page_url}\nID: {page_id}"


@tool(args_schema=NotionPageReadInput)
@skill_guard("notion")
async def notion_page_read(page_id: str) -> str:
    """노션 페이지의 내용을 읽어옵니다. 페이지 ID 또는 URL을 입력하세요."""
    api_key = await _get_notion_key()
    if not api_key:
        return _not_linked()

    # Extract ID from URL if needed
    pid = page_id.strip()
    if "notion.so" in pid:
        pid = pid.split("/")[-1].split("?")[0]
        if "-" in pid:
            pid = pid.split("-")[-1]
    pid = pid.replace("-", "")
    if len(pid) == 32:
        pid = f"{pid[:8]}-{pid[8:12]}-{pid[12:16]}-{pid[16:20]}-{pid[20:]}"

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Get page metadata
            meta_resp = await client.get(
                f"{_BASE_URL}/pages/{pid}",
                headers=_headers(api_key),
            )
            meta_resp.raise_for_status()
            meta = meta_resp.json()

            # Get page blocks (content)
            blocks_resp = await client.get(
                f"{_BASE_URL}/blocks/{pid}/children",
                headers=_headers(api_key),
                params={"page_size": 100},
            )
            blocks_resp.raise_for_status()
            blocks_data = blocks_resp.json()
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            return "Notion API 키가 유효하지 않아요."
        if e.response.status_code == 404:
            return "페이지를 찾을 수 없어요. ID를 확인하거나 Integration에 페이지를 공유했는지 확인해주세요."
        return f"노션 페이지 조회에 실패했어요. (HTTP {e.response.status_code})"
    except Exception:
        logger.debug("notion_page_read failed", exc_info=True)
        return "노션 페이지 읽기 중 오류가 발생했어요."

    # Extract title
    props = meta.get("properties", {})
    title_prop = props.get("title") or props.get("Name") or {}
    title_parts = title_prop.get("title", []) if "title" in title_prop else title_prop.get("rich_text", [])
    title = "".join(t.get("plain_text", "") for t in title_parts) or "(제목 없음)"

    blocks = blocks_data.get("results", [])
    body_text = _blocks_to_text(blocks)

    result = f"📄 **{title}**\nURL: {meta.get('url', '')}\n\n"
    result += body_text if body_text else "(내용 없음)"
    if len(result) > 3000:
        result = result[:3000] + "\n\n... (내용이 길어 잘렸어요)"
    return result


@tool(args_schema=NotionBlockAppendInput)
@skill_guard("notion")
async def notion_block_append(page_id: str, content: str) -> str:
    """노션 페이지에 텍스트 블록을 추가합니다."""
    api_key = await _get_notion_key()
    if not api_key:
        return _not_linked()

    pid = page_id.strip()
    if "notion.so" in pid:
        pid = pid.split("/")[-1].split("?")[0]
        if "-" in pid:
            pid = pid.split("-")[-1]
    pid = pid.replace("-", "")
    if len(pid) == 32:
        pid = f"{pid[:8]}-{pid[8:12]}-{pid[12:16]}-{pid[16:20]}-{pid[20:]}"

    blocks = _build_blocks_from_text(content)

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.patch(
                f"{_BASE_URL}/blocks/{pid}/children",
                headers=_headers(api_key),
                json={"children": blocks},
            )
            resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            return "Notion API 키가 유효하지 않아요."
        if e.response.status_code == 404:
            return "페이지를 찾을 수 없어요. ID를 확인해주세요."
        return f"노션 블록 추가에 실패했어요. (HTTP {e.response.status_code})"
    except Exception:
        logger.debug("notion_block_append failed", exc_info=True)
        return "노션 블록 추가 중 오류가 발생했어요."

    return f"✅ 노션 페이지에 내용이 추가됐어요."
