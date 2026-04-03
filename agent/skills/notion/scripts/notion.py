#!/usr/bin/env python3
"""starnion-notion — Notion integration CLI for StarNion agent.

NOTION_API_KEY is injected into the subprocess environment by the agent runner.
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

_NOTION_VERSION = "2025-09-03"
_BASE_URL = "https://api.notion.com/v1"


def get_notion_key(user_id: str) -> str | None:
    """Return Notion API key injected by the agent runner via NOTION_API_KEY env var."""
    return os.environ.get("NOTION_API_KEY") or None


# ── HTTP helpers ───────────────────────────────────────────────────────────────
def _headers(api_key: str) -> dict:
    return {
        "Authorization": f"Bearer {api_key}",
        "Notion-Version": _NOTION_VERSION,
        "Content-Type": "application/json",
    }


def _notion_get(api_key: str, path: str, params: dict | None = None) -> dict:
    import urllib.parse as _up
    url = f"{_BASE_URL}{path}"
    if params:
        url += "?" + _up.urlencode(params)
    req = urllib.request.Request(url, headers=_headers(api_key))
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}") from e


def _notion_post(api_key: str, path: str, body: dict) -> dict:
    url = f"{_BASE_URL}{path}"
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url, data=data, headers=_headers(api_key), method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body_bytes = e.read()
        try:
            detail = json.loads(body_bytes).get("message", "")
        except Exception:
            detail = ""
        raise RuntimeError(f"HTTP {e.code}: {detail}") from e


def _notion_patch(api_key: str, path: str, body: dict) -> dict:
    url = f"{_BASE_URL}{path}"
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url, data=data, headers=_headers(api_key), method="PATCH",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body_bytes = e.read()
        try:
            detail = json.loads(body_bytes).get("message", "")
        except Exception:
            detail = ""
        raise RuntimeError(f"HTTP {e.code}: {detail}") from e


def _not_linked() -> str:
    return (
        "Notion is not connected. "
        "Please register your Notion Integration Token in the skill settings."
    )


# ── Page ID utilities ─────────────────────────────────────────────────────────
def _normalize_page_id(page_id: str) -> str:
    """Extract and normalize Notion page ID to UUID format."""
    pid = page_id.strip()
    if "notion.so" in pid:
        pid = pid.split("/")[-1].split("?")[0]
        if "-" in pid:
            pid = pid.split("-")[-1]
    pid = pid.replace("-", "")
    if len(pid) == 32:
        pid = f"{pid[:8]}-{pid[8:12]}-{pid[12:16]}-{pid[16:20]}-{pid[20:]}"
    return pid


# ── Block/Rich-text builders ───────────────────────────────────────────────────
def _build_rich_text(content: str) -> list:
    chunks = [content[i:i + 2000] for i in range(0, len(content), 2000)]
    return [{"type": "text", "text": {"content": chunk}} for chunk in chunks]


def _build_blocks_from_text(content: str) -> list:
    blocks = []
    for para in content.split("\n\n"):
        para = para.strip()
        if not para:
            continue
        for chunk in [para[i:i + 2000] for i in range(0, len(para), 2000)]:
            blocks.append({
                "object": "block",
                "type": "paragraph",
                "paragraph": {"rich_text": [{"type": "text", "text": {"content": chunk}}]},
            })
    return blocks or [{
        "object": "block", "type": "paragraph",
        "paragraph": {"rich_text": [{"type": "text", "text": {"content": content}}]},
    }]


def _blocks_to_text(blocks: list) -> str:
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


# ── Commands ───────────────────────────────────────────────────────────────────
def cmd_search(api_key: str, query: str, filter_type: str) -> str:
    body: dict = {"query": query, "page_size": 10}
    if filter_type == "page":
        body["filter"] = {"value": "page", "property": "object"}
    elif filter_type == "database":
        body["filter"] = {"value": "data_source", "property": "object"}

    try:
        data = _notion_post(api_key, "/search", body)
    except RuntimeError as e:
        if "401" in str(e):
            return "Notion API key is invalid. Please re-register your key in the skill settings."
        return f"Error searching Notion. ({e})"

    results = data.get("results", [])
    if not results:
        return f"No Notion pages found for '{query}'."

    lines = [f"Search results for '{query}' ({len(results)}):"]
    for r in results:
        obj_type = r.get("object", "")
        rid = r.get("id", "").replace("-", "")
        if obj_type == "page":
            props = r.get("properties", {})
            title_prop = props.get("title") or props.get("Name") or {}
            title_parts = title_prop.get("title", []) if "title" in title_prop else title_prop.get("rich_text", [])
            title = "".join(t.get("plain_text", "") for t in title_parts) or "(no title)"
            lines.append(f"  📄 [page] {title} | ID: {rid}")
        elif obj_type in ("database", "data_source"):
            db_title = r.get("title", [])
            title = "".join(t.get("plain_text", "") for t in db_title) or "(no title)"
            ds_id = r.get("data_source_id", "").replace("-", "") or rid
            lines.append(f"  🗄️ [database] {title} | ID: {rid} | data_source_id: {ds_id}")
    return "\n".join(lines)


def cmd_read_page(api_key: str, page_id: str) -> str:
    pid = _normalize_page_id(page_id)
    try:
        meta = _notion_get(api_key, f"/pages/{pid}")
        blocks_data = _notion_get(api_key, f"/blocks/{pid}/children", {"page_size": 100})
    except RuntimeError as e:
        if "401" in str(e):
            return "Notion API key is invalid."
        if "404" in str(e):
            return "Page not found. Check the ID or verify the page is shared with your Integration."
        return f"Failed to read Notion page. ({e})"

    props = meta.get("properties", {})
    title_prop = props.get("title") or props.get("Name") or {}
    title_parts = title_prop.get("title", []) if "title" in title_prop else title_prop.get("rich_text", [])
    title = "".join(t.get("plain_text", "") for t in title_parts) or "(no title)"

    blocks = blocks_data.get("results", [])
    body_text = _blocks_to_text(blocks)

    result = f"📄 **{title}**\nURL: {meta.get('url', '')}\n\n"
    result += body_text if body_text else "(no content)"
    if len(result) > 3000:
        result = result[:3000] + "\n\n... (content truncated)"
    return result


def cmd_create_page(api_key: str, title: str, content: str, parent_page_id: str) -> str:
    if parent_page_id:
        pid = _normalize_page_id(parent_page_id)
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
        page = _notion_post(api_key, "/pages", body)
    except RuntimeError as e:
        if "401" in str(e):
            return "Notion API key is invalid."
        if "403" in str(e):
            return (
                "No permission to create page. "
                "Check that the Integration has access to the workspace or parent page."
            )
        return f"Failed to create Notion page. ({e})"

    page_id = page.get("id", "").replace("-", "")
    page_url = page.get("url", "")
    return f"✅ Notion page created!\nTitle: {title}\nURL: {page_url}\nID: {page_id}"


def cmd_append_blocks(api_key: str, page_id: str, content: str) -> str:
    pid = _normalize_page_id(page_id)
    blocks = _build_blocks_from_text(content)

    try:
        _notion_patch(api_key, f"/blocks/{pid}/children", {"children": blocks})
    except RuntimeError as e:
        if "401" in str(e):
            return "Notion API key is invalid."
        if "404" in str(e):
            return "Page not found. Check the ID."
        return f"Failed to append blocks to Notion page. ({e})"

    return "✅ Content appended to Notion page."


def cmd_query_database(api_key: str, database_id: str, filter_json: str,
                       sort_by: str, sort_direction: str, limit: int) -> str:
    dsid = database_id.strip().replace("-", "")
    if len(dsid) == 32:
        dsid = f"{dsid[:8]}-{dsid[8:12]}-{dsid[12:16]}-{dsid[16:20]}-{dsid[20:]}"

    body: dict = {"page_size": min(limit, 50)}

    if filter_json.strip():
        try:
            body["filter"] = json.loads(filter_json)
        except json.JSONDecodeError:
            return "filter_json is not valid JSON."

    if sort_by.strip():
        direction = sort_direction if sort_direction in ("ascending", "descending") else "descending"
        body["sorts"] = [{"property": sort_by.strip(), "direction": direction}]

    try:
        data = _notion_post(api_key, f"/data_sources/{dsid}/query", body)
    except RuntimeError as e:
        if "401" in str(e):
            return "Notion API key is invalid."
        if "404" in str(e):
            return (
                "Database not found. "
                "Use the search command to find the data_source_id and "
                "verify the database is shared with your Integration."
            )
        return f"Failed to query database. ({e})"

    results = data.get("results", [])
    if not results:
        return "No items match the filter."

    lines = [f"Database query results ({len(results)}):"]
    for r in results:
        props = r.get("properties", {})
        title = "(no title)"
        for prop in props.values():
            ptype = prop.get("type", "")
            if ptype == "title":
                parts = prop.get("title", [])
                title = "".join(t.get("plain_text", "") for t in parts) or "(no title)"
                break

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
        lines.append("\n... More items available. Increase --limit to see more.")

    return "\n".join(lines)


def cmd_update_page(api_key: str, page_id: str, properties_json: str) -> str:
    pid = _normalize_page_id(page_id)

    try:
        properties = json.loads(properties_json)
    except json.JSONDecodeError:
        return "properties_json is not valid JSON."

    try:
        page = _notion_patch(api_key, f"/pages/{pid}", {"properties": properties})
    except RuntimeError as e:
        if "401" in str(e):
            return "Notion API key is invalid."
        if "404" in str(e):
            return "Page not found. Check the ID."
        if "400" in str(e):
            return f"Failed to update properties. ({e})"
        return f"Failed to update page. ({e})"

    url = page.get("url", "")
    return f"✅ Notion page properties updated.\nURL: {url}"


# ── CLI ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="StarNion Notion integration")
    parser.add_argument("--user-id", required=True, help="User ID")

    sub = parser.add_subparsers(dest="command", required=True)

    # search
    p = sub.add_parser("search", help="Search pages/databases")
    p.add_argument("--query", required=True)
    p.add_argument("--filter-type", choices=["page", "database"], default="",
                   help="Filter by type (omit for all)")

    # read-page
    p = sub.add_parser("read-page", help="Read page content")
    p.add_argument("--page-id", required=True, help="Page ID or URL")

    # create-page
    p = sub.add_parser("create-page", help="Create a new page")
    p.add_argument("--title", required=True)
    p.add_argument("--content", default="")
    p.add_argument("--parent-page-id", default="",
                   help="Parent page ID (omit for workspace root)")

    # append-blocks
    p = sub.add_parser("append-blocks", help="Append text blocks to a page")
    p.add_argument("--page-id", required=True, help="Page ID or URL")
    p.add_argument("--content", required=True)

    # query-database
    p = sub.add_parser("query-database", help="Query a database")
    p.add_argument("--database-id", required=True, help="data_source_id from search")
    p.add_argument("--filter-json", default="",
                   help='Notion filter JSON e.g. \'{"property":"Status","select":{"equals":"Done"}}\'')
    p.add_argument("--sort-by", default="", help="Property name to sort by")
    p.add_argument("--sort-direction", choices=["ascending", "descending"], default="descending")
    p.add_argument("--limit", type=int, default=10)

    # update-page
    p = sub.add_parser("update-page", help="Update page properties")
    p.add_argument("--page-id", required=True, help="Page ID or URL")
    p.add_argument("--properties-json", required=True,
                   help='Notion properties JSON e.g. \'{"Status":{"select":{"name":"Done"}}}\'')

    args = parser.parse_args()

    api_key = get_notion_key(args.user_id)
    if not api_key:
        print(_not_linked())
        return

    if args.command == "search":
        print(cmd_search(api_key, args.query, args.filter_type))
    elif args.command == "read-page":
        print(cmd_read_page(api_key, args.page_id))
    elif args.command == "create-page":
        print(cmd_create_page(api_key, args.title, args.content, args.parent_page_id))
    elif args.command == "append-blocks":
        print(cmd_append_blocks(api_key, args.page_id, args.content))
    elif args.command == "query-database":
        print(cmd_query_database(
            api_key, args.database_id, args.filter_json,
            args.sort_by, args.sort_direction, args.limit,
        ))
    elif args.command == "update-page":
        print(cmd_update_page(api_key, args.page_id, args.properties_json))


if __name__ == "__main__":
    main()
