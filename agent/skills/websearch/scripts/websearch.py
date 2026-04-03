#!/usr/bin/env python3
"""starnion-websearch — Web search and URL content extraction CLI for StarNion agent.

Search backend priority:
  1. TAVILY_API_KEY env var (injected by agent runner)
  2. Basic search fallback (DuckDuckGo via starnion-search CLI)
"""
import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "_shared"))
from starnion_utils import _load_starnion_yaml, psql as _psql


_yaml = _load_starnion_yaml()
_db = _yaml.get("database", {}) if isinstance(_yaml.get("database"), dict) else {}

_db_url_default = (
    f"postgresql://{_db.get('user', 'postgres')}:{_db.get('password', '')}"
    f"@{_db.get('host', 'localhost')}:{_db.get('port', '5432')}"
    f"/{_db.get('name', 'starnion')}?sslmode={_db.get('ssl_mode', 'disable')}"
) if _db else ""

DB_URL = os.environ.get("DATABASE_URL") or _db_url_default

TAVILY_API_URL = "https://api.tavily.com/search"
TAVILY_EXTRACT_URL = "https://api.tavily.com/extract"
_MAX_FETCH_BYTES = 5 * 1024 * 1024  # 5 MB


# ── DB helpers ────────────────────────────────────────────────────────────────
def esc(s: str) -> str:
    return (s or "").replace("'", "''")


def get_tavily_api_key(user_id: str) -> str | None:
    """Return Tavily API key injected by the agent runner via TAVILY_API_KEY env var."""
    return os.environ.get("TAVILY_API_KEY") or None


def save_search(user_id: str, query: str, result: str) -> None:
    """Persist search query + result to the searches table (history)."""
    if not DB_URL:
        return
    tsv_src = esc((query + " " + result)[:1000])
    _psql(
        f"INSERT INTO searches (user_id, query, result, content_tsv) "
        f"VALUES ('{esc(user_id)}', '{esc(query)}', '{esc(result[:10000])}', "
        f"to_tsvector('simple', '{tsv_src}'))",
        DB_URL,
    )


# ── HTML helpers ──────────────────────────────────────────────────────────────
def _strip_html_tags(html: str) -> str:
    text = re.sub(r"<[^>]+>", "", html)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _extract_readable_text(html: str) -> str:
    """Extract main readable content from HTML. Uses readability if available."""
    try:
        from readability import Document  # type: ignore[import-untyped]
        doc = Document(html)
        title = doc.title() or ""
        body = _strip_html_tags(doc.summary() or "")
        if title and body:
            return f"{title}\n\n{body}"
        return body or title or ""
    except ImportError:
        pass
    return _strip_html_tags(html)


# ── Tavily search ─────────────────────────────────────────────────────────────
def tavily_search(
    api_key: str,
    query: str,
    max_results: int = 5,
    search_depth: str = "basic",
    topic: str = "general",
    time_range: str | None = None,
    include_answer: bool = False,
    include_domains: list[str] | None = None,
    exclude_domains: list[str] | None = None,
) -> dict:
    payload: dict = {
        "query": query[:400],
        "max_results": max(1, min(max_results, 10)),
        "search_depth": search_depth if search_depth in ("basic", "advanced") else "basic",
        "topic": topic if topic in ("general", "news", "finance") else "general",
        "include_answer": include_answer,
    }
    if time_range in ("day", "week", "month", "year"):
        payload["time_range"] = time_range
    if include_domains:
        payload["include_domains"] = include_domains
    if exclude_domains:
        payload["exclude_domains"] = exclude_domains

    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        TAVILY_API_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Tavily API error: HTTP {e.code}") from e
    except Exception as e:
        raise RuntimeError(f"Tavily API error: {e}") from e


def format_tavily_results(data: dict) -> str:
    answer = data.get("answer", "")
    results = data.get("results", [])

    lines: list[str] = []
    if answer:
        lines.append(f"**Summary:** {answer}\n")

    if not results:
        return (lines[0] if lines else "") + "No search results found."

    for i, r in enumerate(results, 1):
        title = r.get("title", "(no title)")
        url = r.get("url", "")
        content = r.get("content", "")
        lines.append(f"{i}. **{title}**\n   URL: {url}\n   {content}")

    return "\n\n".join(lines)


# ── Basic search fallback (starnion-search CLI) ───────────────────────────────
def basic_search(query: str, max_results: int = 5) -> str:
    try:
        result = subprocess.run(
            ["starnion-search", "search", "--query", query, "--limit", str(max_results)],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Final fallback: DuckDuckGo instant answer API (no key required)
    try:
        params = urllib.parse.urlencode({"q": query, "format": "json", "no_html": "1"})
        url = f"https://api.duckduckgo.com/?{params}"
        req = urllib.request.Request(url, headers={"User-Agent": "StarNion/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
        abstract = data.get("AbstractText", "")
        abstract_url = data.get("AbstractURL", "")
        if abstract:
            result_text = f"1. **{data.get('Heading', query)}**\n   URL: {abstract_url}\n   {abstract}"
            return result_text
    except Exception:
        pass

    return f"Could not retrieve search results for '{query}'. Set a Tavily API key for more accurate results."


# ── Web fetch ─────────────────────────────────────────────────────────────────
def web_fetch(url: str, max_length: int = 8000) -> str:
    if not url.startswith(("http://", "https://")):
        return "Please provide a valid URL starting with http:// or https://"

    max_length = max(500, min(max_length, 50000))

    req = urllib.request.Request(
        url,
        headers={"User-Agent": "StarNion/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            content_type = resp.headers.get("Content-Type", "")
            # Binary check
            if any(t in content_type for t in ("pdf", "image/", "audio/", "video/", "octet-stream")):
                return "This URL points to a binary file. Use a different method for document files."

            # Size limit
            raw = b""
            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                raw += chunk
                if len(raw) > _MAX_FETCH_BYTES:
                    return "File is too large (over 5MB)."

    except urllib.error.HTTPError as e:
        return f"Could not access the webpage. (HTTP {e.code})"
    except urllib.error.URLError as e:
        return f"Could not connect to URL: {e.reason}"
    except Exception as e:
        return f"Error fetching webpage: {e}"

    try:
        html = raw.decode("utf-8", errors="replace")
    except Exception:
        html = raw.decode("latin-1", errors="replace")

    if any(t in content_type for t in ("text/plain", "application/json", "text/xml")):
        text = html[:max_length]
        if len(html) > max_length:
            text += "\n\n... (truncated)"
        return text

    text = _extract_readable_text(html)
    if not text.strip():
        return "Could not extract text content from the webpage."

    if len(text) > max_length:
        text = text[:max_length] + "\n\n... (truncated)"
    return text


# ── CLI ───────────────────────────────────────────────────────────────────────
def main():
    import sys

    # Pre-extract --user-id from anywhere in argv (before or after subcommand)
    argv = sys.argv[1:]
    user_id: str | None = None
    cleaned: list[str] = []
    i = 0
    while i < len(argv):
        if argv[i] == "--user-id" and i + 1 < len(argv):
            user_id = argv[i + 1]
            i += 2
        else:
            cleaned.append(argv[i])
            i += 1

    if not user_id:
        print(json.dumps({"error": "--user-id is required"}))
        sys.exit(1)

    parser = argparse.ArgumentParser(description="StarNion web search and fetch")

    sub = parser.add_subparsers(dest="command", required=True)

    # search
    p_search = sub.add_parser("search", help="Search the web")
    p_search.add_argument("--query", required=True, help="Search query")
    p_search.add_argument("--max-results", type=int, default=5, help="Max results (1-10)")
    p_search.add_argument("--search-depth", choices=["basic", "advanced"], default="basic")
    p_search.add_argument("--topic", choices=["general", "news", "finance"], default="general")
    p_search.add_argument("--time-range", choices=["day", "week", "month", "year"], default=None)
    p_search.add_argument("--include-answer", action="store_true")
    p_search.add_argument("--include-domains", default="", help="Comma-separated domains")
    p_search.add_argument("--exclude-domains", default="", help="Comma-separated domains")

    # fetch
    p_fetch = sub.add_parser("fetch", help="Fetch URL content")
    p_fetch.add_argument("--url", required=True, help="URL to fetch")
    p_fetch.add_argument("--max-length", type=int, default=8000, help="Max text length")

    args = parser.parse_args(cleaned)
    args.user_id = user_id  # inject pre-extracted user_id

    if args.command == "search":
        api_key = get_tavily_api_key(args.user_id)

        if api_key:
            include_domains = [d.strip() for d in args.include_domains.split(",") if d.strip()] if args.include_domains else None
            exclude_domains = [d.strip() for d in args.exclude_domains.split(",") if d.strip()] if args.exclude_domains else None
            try:
                data = tavily_search(
                    api_key=api_key,
                    query=args.query,
                    max_results=args.max_results,
                    search_depth=args.search_depth,
                    topic=args.topic,
                    time_range=args.time_range,
                    include_answer=args.include_answer,
                    include_domains=include_domains,
                    exclude_domains=exclude_domains,
                )
                output = format_tavily_results(data)
            except RuntimeError as e:
                print(f"❌ {e}", file=sys.stderr)
                output = basic_search(args.query, args.max_results)
        else:
            output = basic_search(args.query, args.max_results)

        print(output)
        save_search(args.user_id, args.query, output)

    elif args.command == "fetch":
        print(web_fetch(args.url, args.max_length))


if __name__ == "__main__":
    main()
