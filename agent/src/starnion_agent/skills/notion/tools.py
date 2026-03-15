"""Notion integration tools.

API key is fetched per-user from integration_keys table (provider='notion').
Falls back to nothing if the user has not connected Notion.
"""

from __future__ import annotations

import logging

import httpx
from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starnion_agent.context import get_current_user
from starnion_agent.db.pool import get_pool
from starnion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

_NOTION_VERSION = "2025-09-03"
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


class NotionDatabaseQueryInput(BaseModel):
    data_source_id: str = Field(
        description=(
            "조회할 데이터베이스의 data_source_id (notion_search로 확인). "
            "대시 포함/미포함 UUID 형식 모두 지원."
        )
    )
    filter_json: str = Field(
        default="",
        description=(
            "Notion 필터 JSON 문자열 (선택). "
            "예: '{\"property\": \"Status\", \"select\": {\"equals\": \"Done\"}}'"
        ),
    )
    sort_by: str = Field(
        default="",
        description=(
            "정렬 기준 속성명 (선택). "
            "direction과 함께 사용 — 예: sort_by='Date', sort_direction='descending'"
        ),
    )
    sort_direction: str = Field(
        default="descending",
        description="정렬 방향: 'ascending' 또는 'descending' (기본 'descending')",
    )
    limit: int = Field(default=10, ge=1, le=50, description="반환할 최대 항목 수 (1~50)")


class NotionPageUpdateInput(BaseModel):
    page_id: str = Field(description="업데이트할 페이지 ID 또는 URL")
    properties_json: str = Field(
        description=(
            "업데이트할 속성을 Notion 형식 JSON 문자열로 지정. "
            "예: '{\"Status\": {\"select\": {\"name\": \"Done\"}}, "
            "\"Due\": {\"date\": {\"start\": \"2025-01-15\"}}}'"
        )
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
    if filter_type == "page":
        body["filter"] = {"value": "page", "property": "object"}
    elif filter_type == "database":
        # 2025-09-03: databases are now "data_source" in the API
        body["filter"] = {"value": "data_source", "property": "object"}

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
        elif obj_type in ("database", "data_source"):
            # 2025-09-03: databases return as "data_source" with data_source_id
            db_title = r.get("title", [])
            title = "".join(t.get("plain_text", "") for t in db_title) or "(제목 없음)"
            ds_id = r.get("data_source_id", "").replace("-", "") or rid
            lines.append(f"  🗄️ [데이터베이스] {title} | ID: {rid} | data_source_id: {ds_id}")

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


@tool(args_schema=NotionDatabaseQueryInput)
@skill_guard("notion")
async def notion_database_query(
    data_source_id: str,
    filter_json: str = "",
    sort_by: str = "",
    sort_direction: str = "descending",
    limit: int = 10,
) -> str:
    """노션 데이터베이스(데이터소스)의 항목을 필터/정렬하여 조회합니다.
    data_source_id는 notion_search로 확인할 수 있습니다."""
    import json as _json

    api_key = await _get_notion_key()
    if not api_key:
        return _not_linked()

    # Normalize data_source_id to UUID format
    dsid = data_source_id.strip().replace("-", "")
    if len(dsid) == 32:
        dsid = f"{dsid[:8]}-{dsid[8:12]}-{dsid[12:16]}-{dsid[16:20]}-{dsid[20:]}"

    body: dict = {"page_size": min(limit, 50)}

    if filter_json.strip():
        try:
            body["filter"] = _json.loads(filter_json)
        except _json.JSONDecodeError:
            return "filter_json이 올바른 JSON 형식이 아니에요."

    if sort_by.strip():
        direction = sort_direction if sort_direction in ("ascending", "descending") else "descending"
        body["sorts"] = [{"property": sort_by.strip(), "direction": direction}]

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # 2025-09-03: use /data_sources/{id}/query endpoint
            resp = await client.post(
                f"{_BASE_URL}/data_sources/{dsid}/query",
                headers=_headers(api_key),
                json=body,
            )
            if resp.status_code == 401:
                return "Notion API 키가 유효하지 않아요. 설정 → 연동에서 키를 다시 등록해주세요."
            if resp.status_code == 404:
                return (
                    "데이터베이스를 찾을 수 없어요. "
                    "notion_search로 data_source_id를 확인하고, "
                    "Integration에 데이터베이스를 공유했는지 확인해주세요."
                )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        return f"데이터베이스 조회에 실패했어요. (HTTP {e.response.status_code})"
    except Exception:
        logger.debug("notion_database_query failed", exc_info=True)
        return "데이터베이스 조회 중 오류가 발생했어요."

    results = data.get("results", [])
    if not results:
        return "조건에 해당하는 항목이 없어요."

    lines = [f"데이터베이스 조회 결과 ({len(results)}개):"]
    for r in results:
        props = r.get("properties", {})
        # Find title property
        title = "(제목 없음)"
        for prop in props.values():
            ptype = prop.get("type", "")
            if ptype == "title":
                parts = prop.get("title", [])
                title = "".join(t.get("plain_text", "") for t in parts) or "(제목 없음)"
                break

        # Collect other simple property values for context
        extra: list[str] = []
        for pname, prop in props.items():
            ptype = prop.get("type", "")
            if ptype == "title":
                continue
            val = None
            if ptype == "select":
                val = (prop.get("select") or {}).get("name")
            elif ptype == "status":
                val = (prop.get("status") or {}).get("name")
            elif ptype == "checkbox":
                val = "✅" if prop.get("checkbox") else "☐"
            elif ptype == "date":
                val = (prop.get("date") or {}).get("start")
            elif ptype == "number":
                val = prop.get("number")
            elif ptype == "rich_text":
                parts = prop.get("rich_text", [])
                val = "".join(t.get("plain_text", "") for t in parts[:1])
            if val is not None:
                extra.append(f"{pname}: {val}")

        extra_str = "  |  ".join(extra[:4])
        page_id = r.get("id", "").replace("-", "")
        line = f"  • {title}  (ID: {page_id})"
        if extra_str:
            line += f"\n    {extra_str}"
        lines.append(line)

    if data.get("has_more"):
        lines.append(f"\n... 더 많은 항목이 있어요. limit을 늘려서 조회하세요.")

    return "\n".join(lines)


@tool(args_schema=NotionPageUpdateInput)
@skill_guard("notion")
async def notion_page_update(page_id: str, properties_json: str) -> str:
    """노션 페이지의 속성(Status, Date 등)을 업데이트합니다.
    properties_json은 Notion API 형식의 JSON 문자열이어야 합니다."""
    import json as _json

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

    try:
        properties = _json.loads(properties_json)
    except _json.JSONDecodeError:
        return "properties_json이 올바른 JSON 형식이 아니에요."

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.patch(
                f"{_BASE_URL}/pages/{pid}",
                headers=_headers(api_key),
                json={"properties": properties},
            )
            if resp.status_code == 401:
                return "Notion API 키가 유효하지 않아요."
            if resp.status_code == 404:
                return "페이지를 찾을 수 없어요. ID를 확인해주세요."
            if resp.status_code == 400:
                detail = ""
                try:
                    detail = resp.json().get("message", "")
                except Exception:
                    pass
                return f"속성 업데이트에 실패했어요. {detail}".strip()
            resp.raise_for_status()
            page = resp.json()
    except httpx.HTTPStatusError as e:
        return f"페이지 업데이트에 실패했어요. (HTTP {e.response.status_code})"
    except Exception:
        logger.debug("notion_page_update failed", exc_info=True)
        return "페이지 업데이트 중 오류가 발생했어요."

    url = page.get("url", "")
    return f"✅ 노션 페이지 속성이 업데이트됐어요.\nURL: {url}"
