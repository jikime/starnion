#!/usr/bin/env python3
"""starnion-naver-search — Naver Search API CLI for StarNion agent.

Supports 10 search types via a single `search` command:
  shop, blog, news, book, encyc, cafearticle, kin, local, webkr, doc

NAVER_SEARCH_CLIENT_ID and NAVER_SEARCH_CLIENT_SECRET are injected
into the subprocess environment by the agent runner.
"""
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

_BASE_URL = "https://openapi.naver.com/v1/search"

_SEARCH_TYPES: dict[str, str] = {
    "shop":        "Shopping",
    "blog":        "Blog",
    "news":        "News",
    "book":        "Book",
    "encyc":       "Encyclopedia",
    "cafearticle": "Cafe post",
    "kin":         "Knowledge iN",
    "local":       "Local",
    "webkr":       "Web",
    "doc":         "Academic",
}


# ── DB helpers ────────────────────────────────────────────────────────────────
def esc(s: str) -> str:
    return (s or "").replace("'", "''")


def get_naver_credentials(user_id: str) -> tuple[str, str] | None:
    """Return (client_id, client_secret) injected by the agent runner via env vars."""
    env_id = os.environ.get("NAVER_SEARCH_CLIENT_ID")
    env_secret = os.environ.get("NAVER_SEARCH_CLIENT_SECRET")
    if env_id and env_secret:
        return env_id, env_secret
    return None


def _not_linked() -> str:
    return (
        "Naver Search API is not connected. "
        "Please register your Client ID and Client Secret in the skill settings. "
        "(Naver Developers: developers.naver.com)"
    )


# ── Utilities ─────────────────────────────────────────────────────────────────
def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text).strip()


def _fmt_price(price) -> str:
    try:
        p = int(price or 0)
        return f"{p:,}원" if p > 0 else "-"
    except (ValueError, TypeError):
        return "-"


def _truncate(text: str, max_len: int) -> str:
    return text[:max_len] + "..." if len(text) > max_len else text


def _parse_pubdate(pubdate: str) -> str:
    try:
        from email.utils import parsedate
        t = parsedate(pubdate)
        if t:
            return f"{t[0]}-{t[1]:02d}-{t[2]:02d} {t[3]:02d}:{t[4]:02d}"
    except Exception:
        pass
    return pubdate


# ── Naver API caller ───────────────────────────────────────────────────────────
def _naver_api(client_id: str, client_secret: str, search_type: str,
               query: str, display: int = 5, start: int = 1, sort: str = "sim") -> dict:
    params = urllib.parse.urlencode({
        "query": query,
        "display": display,
        "start": start,
        "sort": sort,
    })
    url = f"{_BASE_URL}/{search_type}.json?{params}"
    req = urllib.request.Request(url, headers={
        "X-Naver-Client-Id": client_id,
        "X-Naver-Client-Secret": client_secret,
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 401:
            return {"error": "Invalid Client ID or Secret. Please re-register your credentials in the skill settings."}
        if e.code == 403:
            return {"error": "No permission to use this search API. Check your API access on the Naver Developers console."}
        return {"error": f"Naver API error (HTTP {e.code})"}
    except Exception as e:
        return {"error": f"Naver Search API error: {e}"}


# ── Per-type formatters ────────────────────────────────────────────────────────
def _format_shop_items(items: list, total: int, query: str) -> str:
    lines = [f"🛍️ Naver Shopping '{query}' ({len(items)} of {total:,} results)\n"]
    for i, item in enumerate(items, 1):
        title  = _strip_html(item.get("title", ""))
        lprice = _fmt_price(item.get("lprice"))
        hprice = _fmt_price(item.get("hprice"))
        mall   = item.get("mallName", "")
        brand  = item.get("brand", "")
        maker  = item.get("maker", "")
        cat    = " > ".join(filter(None, [
            item.get("category1", ""), item.get("category2", ""),
            item.get("category3", ""), item.get("category4", ""),
        ]))
        link   = item.get("link", "")

        line = f"{i}. **{title}**\n"
        line += f"   💰 min: {lprice}"
        if hprice != "-":
            line += f" ~ max: {hprice}"
        line += f"\n   🏪 {mall}"
        if brand:
            line += f" | Brand: {brand}"
        if maker and maker != brand:
            line += f" | Maker: {maker}"
        if cat:
            line += f"\n   📂 {cat}"
        line += f"\n   🔗 {link}"
        lines.append(line)
    return "\n\n".join(lines)


def _format_blog_items(items: list, total: int, query: str) -> str:
    lines = [f"📝 Naver Blog '{query}' ({len(items)} of {total:,} results)\n"]
    for i, item in enumerate(items, 1):
        title       = _strip_html(item.get("title", ""))
        desc        = _strip_html(item.get("description", ""))
        blogger     = item.get("bloggername", "")
        bloggerlink = item.get("bloggerlink", "")
        postdate    = item.get("postdate", "")
        link        = item.get("link", "")
        blogger_str = f"[{blogger}]({bloggerlink})" if blogger and bloggerlink else blogger
        line = f"{i}. **{title}**\n   ✍️ {blogger_str}"
        if len(postdate) == 8:
            line += f"  ({postdate[:4]}-{postdate[4:6]}-{postdate[6:]})"
        if desc:
            line += f"\n   {_truncate(desc, 150)}"
        line += f"\n   🔗 {link}"
        lines.append(line)
    return "\n\n".join(lines)


def _format_news_items(items: list, total: int, query: str) -> str:
    lines = [f"📰 Naver News '{query}' ({len(items)} of {total:,} results)\n"]
    for i, item in enumerate(items, 1):
        title        = _strip_html(item.get("title", ""))
        desc         = _strip_html(item.get("description", ""))
        pubdate      = _parse_pubdate(item.get("pubDate", ""))
        originallink = item.get("originallink", "")
        link         = item.get("link", "")
        url          = originallink or link
        line = f"{i}. **{title}**"
        if pubdate:
            line += f"\n   🕐 {pubdate}"
        if desc:
            line += f"\n   {_truncate(desc, 150)}"
        if url:
            line += f"\n   🔗 {url}"
        lines.append(line)
    return "\n\n".join(lines)


def _format_book_items(items: list, total: int, query: str) -> str:
    lines = [f"📚 Naver Book '{query}' ({len(items)} of {total:,} results)\n"]
    for i, item in enumerate(items, 1):
        title     = _strip_html(item.get("title", ""))
        author    = item.get("author", "")
        publisher = item.get("publisher", "")
        pubdate   = item.get("pubdate", "")
        price     = item.get("price", "")
        discount  = item.get("discount", "")
        isbn_raw  = item.get("isbn", "")
        desc      = _strip_html(item.get("description", ""))
        link      = item.get("link", "")

        meta = []
        if author:
            meta.append(f"Author: {author}")
        if publisher:
            meta.append(f"Publisher: {publisher}")
        if len(pubdate) >= 6:
            meta.append(f"{pubdate[:4]}-{pubdate[4:6]}")

        price_str = ""
        try:
            if discount and int(discount or 0) > 0:
                if price and int(price or 0) > 0:
                    price_str = f"List {int(price):,} → {int(discount):,}"
                else:
                    price_str = f"{int(discount):,}"
            elif price and int(price or 0) > 0:
                price_str = f"{int(price):,}"
        except (ValueError, TypeError):
            pass

        isbn_13 = next((x for x in isbn_raw.split() if len(x) == 13), "")
        isbn_str = isbn_13 or (isbn_raw.split()[0] if isbn_raw else "")

        line = f"{i}. **{title}**"
        if meta:
            line += f"\n   📖 {' | '.join(meta)}"
        if price_str:
            line += f"\n   💰 {price_str}"
        if isbn_str:
            line += f" | ISBN: {isbn_str}"
        if desc:
            line += f"\n   {_truncate(desc, 120)}"
        line += f"\n   🔗 {link}"
        lines.append(line)
    return "\n\n".join(lines)


def _format_encyc_items(items: list, total: int, query: str) -> str:
    lines = [f"📖 Naver Encyclopedia '{query}' ({len(items)} of {total:,} results)\n"]
    for i, item in enumerate(items, 1):
        title = _strip_html(item.get("title", ""))
        desc  = _strip_html(item.get("description", ""))
        link  = item.get("link", "")
        line = f"{i}. **{title}**"
        if desc:
            line += f"\n   {_truncate(desc, 300)}"
        line += f"\n   🔗 {link}"
        lines.append(line)
    return "\n\n".join(lines)


def _format_cafearticle_items(items: list, total: int, query: str) -> str:
    lines = [f"☕ Naver Cafe '{query}' ({len(items)} of {total:,} results)\n"]
    for i, item in enumerate(items, 1):
        title    = _strip_html(item.get("title", ""))
        desc     = _strip_html(item.get("description", ""))
        cafename = item.get("cafename", "")
        cafeurl  = item.get("cafeurl", "")
        link     = item.get("link", "")
        cafe_str = f"[{cafename}]({cafeurl})" if cafename and cafeurl else cafename
        line = f"{i}. **{title}**"
        if cafe_str:
            line += f"\n   ☕ {cafe_str}"
        if desc:
            line += f"\n   {_truncate(desc, 150)}"
        line += f"\n   🔗 {link}"
        lines.append(line)
    return "\n\n".join(lines)


def _format_kin_items(items: list, total: int, query: str) -> str:
    lines = [f"💡 Naver Knowledge iN '{query}' ({len(items)} of {total:,} results)\n"]
    for i, item in enumerate(items, 1):
        title = _strip_html(item.get("title", ""))
        desc  = _strip_html(item.get("description", ""))
        link  = item.get("link", "")
        line = f"{i}. **{title}**"
        if desc:
            line += f"\n   {_truncate(desc, 200)}"
        line += f"\n   🔗 {link}"
        lines.append(line)
    return "\n\n".join(lines)


def _format_local_items(items: list, total: int, query: str) -> str:
    lines = [f"📍 Naver Local '{query}' ({len(items)} of {total:,} results)\n"]
    for i, item in enumerate(items, 1):
        title     = _strip_html(item.get("title", ""))
        category  = item.get("category", "")
        tel       = item.get("telephone", "")
        road_addr = item.get("roadAddress", "").strip()
        addr      = item.get("address", "").strip()
        address   = road_addr or addr
        desc      = _strip_html(item.get("description", ""))
        link      = item.get("link", "")
        line = f"{i}. **{title}**"
        if category:
            line += f" [{category}]"
        if tel:
            line += f"\n   📞 {tel}"
        if address:
            line += f"\n   📍 {address}"
        if desc:
            line += f"\n   {_truncate(desc, 100)}"
        if link:
            line += f"\n   🔗 {link}"
        lines.append(line)
    return "\n\n".join(lines)


def _format_webkr_items(items: list, total: int, query: str) -> str:
    lines = [f"🌐 Naver Web '{query}' ({len(items)} of {total:,} results)\n"]
    for i, item in enumerate(items, 1):
        title = _strip_html(item.get("title", ""))
        desc  = _strip_html(item.get("description", ""))
        link  = item.get("link", "")
        line = f"{i}. **{title}**"
        if desc:
            line += f"\n   {_truncate(desc, 150)}"
        line += f"\n   🔗 {link}"
        lines.append(line)
    return "\n\n".join(lines)


def _format_doc_items(items: list, total: int, query: str) -> str:
    lines = [f"📑 Naver Academic '{query}' ({len(items)} of {total:,} results)\n"]
    for i, item in enumerate(items, 1):
        title = _strip_html(item.get("title", ""))
        desc  = " ".join(_strip_html(item.get("description", "")).split())
        link  = item.get("link", "")
        line = f"{i}. **{title}**"
        if desc:
            line += f"\n   {_truncate(desc, 150)}"
        line += f"\n   🔗 {link}"
        lines.append(line)
    return "\n\n".join(lines)


_FORMATTERS = {
    "shop":        _format_shop_items,
    "blog":        _format_blog_items,
    "news":        _format_news_items,
    "book":        _format_book_items,
    "encyc":       _format_encyc_items,
    "cafearticle": _format_cafearticle_items,
    "kin":         _format_kin_items,
    "local":       _format_local_items,
    "webkr":       _format_webkr_items,
    "doc":         _format_doc_items,
}


# ── CLI ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="StarNion Naver Search")
    parser.add_argument("--user-id", required=True, help="User ID")

    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("search", help="Search via Naver API")
    p.add_argument("--query", required=True, help="Search keyword")
    p.add_argument(
        "--search-type",
        choices=list(_SEARCH_TYPES.keys()),
        default="webkr",
        help="Search type (default: webkr)",
    )
    p.add_argument("--display", type=int, default=5, help="Number of results (1-100)")
    p.add_argument("--start", type=int, default=1, help="Start position (1-1000)")
    p.add_argument(
        "--sort",
        choices=["sim", "date", "asc", "dsc"],
        default="sim",
        help="Sort order (sim=relevance, date=newest, asc/dsc=price for shop)",
    )

    args = parser.parse_args()

    creds = get_naver_credentials(args.user_id)
    if not creds:
        print(_not_linked())
        return

    client_id, client_secret = creds

    display = max(1, min(args.display, 100))
    start   = max(1, min(args.start, 1000))

    data = _naver_api(client_id, client_secret, args.search_type,
                      args.query, display=display, start=start, sort=args.sort)
    if "error" in data:
        print(data["error"], file=sys.stderr)
        print(data["error"])
        return

    items = data.get("items", [])
    total = int(data.get("total", 0))

    if not items:
        label = _SEARCH_TYPES[args.search_type]
        print(f"No Naver {label} results for '{args.query}'.")
        return

    formatter = _FORMATTERS.get(args.search_type)
    if formatter:
        print(formatter(items, total, args.query))
    else:
        label = _SEARCH_TYPES.get(args.search_type, args.search_type)
        lines = [f"🔍 Naver {label} '{args.query}' ({len(items)} results)\n"]
        for i, item in enumerate(items, 1):
            title = _strip_html(item.get("title", ""))
            link  = item.get("link", "")
            lines.append(f"{i}. {title}\n   🔗 {link}")
        print("\n\n".join(lines))


if __name__ == "__main__":
    main()
