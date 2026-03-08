"""Naver Search API tools.

Supports 11 search types via a single `naver_search` tool:
  shop, blog, news, book, encyc, cafearticle, kin, local, webkr, doc

Credentials (client_id:client_secret) are stored in integration_keys
with provider='naver_search'.

Extending:
  1. Add the new type to _SEARCH_TYPES
  2. Write a _format_<type>_items() function
  3. Register it in _FORMATTERS
  That's it — no new tool registration needed.
"""

from __future__ import annotations

import logging
import re

import httpx
from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starnion_agent.context import get_current_user
from starnion_agent.db.pool import get_pool
from starnion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

_BASE_URL = "https://openapi.naver.com/v1/search"

# endpoint_key → Korean label
_SEARCH_TYPES: dict[str, str] = {
    "shop":        "쇼핑",
    "blog":        "블로그",
    "news":        "뉴스",
    "book":        "책",
    "encyc":       "백과사전",
    "cafearticle": "카페글",
    "kin":         "지식iN",
    "local":       "지역",
    "webkr":       "웹문서",
    "doc":         "전문자료",
}

# ── Credentials ───────────────────────────────────────────────────────────────

async def _get_naver_credentials() -> tuple[str, str] | None:
    """Return (client_id, client_secret) from integration_keys for current user."""
    user_id = get_current_user()
    if not user_id:
        return None
    try:
        from psycopg.rows import dict_row

        pool = get_pool()
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "SELECT api_key FROM integration_keys"
                    " WHERE user_id = %s AND provider = 'naver_search'",
                    (user_id,),
                )
                row = await cur.fetchone()
                if not row or not row.get("api_key"):
                    return None
                client_id, _, client_secret = row["api_key"].partition(":")
                if not client_id or not client_secret:
                    return None
                return client_id, client_secret
    except Exception:
        logger.debug("Failed to fetch Naver Search credentials", exc_info=True)
        return None


def _not_linked() -> str:
    return (
        "네이버 검색 API 연동이 되어 있지 않아요. "
        "설정 → 연동 메뉴에서 Client ID와 Client Secret을 등록해주세요. "
        "(네이버 개발자 센터: developers.naver.com)"
    )


# ── Shared utilities ──────────────────────────────────────────────────────────

def _strip_html(text: str) -> str:
    """Remove HTML tags (e.g. <b>, </b>) from Naver API titles/descriptions."""
    return re.sub(r"<[^>]+>", "", text).strip()


def _fmt_price(price: str | int | None) -> str:
    """Format a price integer as '1,234원'; returns '-' for zero/None."""
    try:
        p = int(price or 0)
        return f"{p:,}원" if p > 0 else "-"
    except (ValueError, TypeError):
        return "-"


def _truncate(text: str, max_len: int) -> str:
    return text[:max_len] + "..." if len(text) > max_len else text


# ── Core API caller ───────────────────────────────────────────────────────────

async def _naver_api(
    search_type: str,
    query: str,
    display: int = 5,
    start: int = 1,
    sort: str = "sim",
) -> dict:
    """Call Naver Search REST API and return the JSON body (or {"error": ...})."""
    creds = await _get_naver_credentials()
    if not creds:
        return {"error": _not_linked()}

    client_id, client_secret = creds
    params: dict = {"query": query, "display": display, "start": start, "sort": sort}

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{_BASE_URL}/{search_type}.json",
                params=params,
                headers={
                    "X-Naver-Client-Id": client_id,
                    "X-Naver-Client-Secret": client_secret,
                },
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as e:
        code = e.response.status_code
        if code == 401:
            return {"error": "Client ID 또는 Secret이 유효하지 않아요. 설정 → 연동에서 다시 등록해주세요."}
        if code == 403:
            return {"error": "해당 검색 API 사용 권한이 없어요. 네이버 개발자 센터에서 API 사용 신청을 확인해주세요."}
        return {"error": f"Naver API 오류 (HTTP {code})"}
    except Exception:
        logger.debug("naver_api call failed", exc_info=True)
        return {"error": "네이버 검색 API 호출 중 오류가 발생했어요."}


# ── Per-type formatters ───────────────────────────────────────────────────────
# Each formatter receives (items: list[dict], total: int, query: str) → str.
# To add a new search type, write a _format_<type>_items function and
# register it in _FORMATTERS at the bottom of this section.

def _format_shop_items(items: list[dict], total: int, query: str) -> str:
    lines = [f"🛍️ 네이버 쇼핑 '{query}' 검색 결과 (총 {total:,}개 중 {len(items)}개)\n"]
    for i, item in enumerate(items, 1):
        title   = _strip_html(item.get("title", ""))
        lprice  = _fmt_price(item.get("lprice"))
        hprice  = _fmt_price(item.get("hprice"))
        mall    = item.get("mallName", "")
        brand   = item.get("brand", "")
        maker   = item.get("maker", "")
        cat     = " > ".join(filter(None, [
            item.get("category1", ""), item.get("category2", ""),
            item.get("category3", ""), item.get("category4", ""),
        ]))
        link    = item.get("link", "")

        line = f"{i}. **{title}**\n"
        line += f"   💰 최저가: {lprice}"
        if hprice != "-":
            line += f" ~ 최고가: {hprice}"
        line += f"\n   🏪 {mall}"
        if brand:
            line += f" | 브랜드: {brand}"
        if maker and maker != brand:
            line += f" | 제조사: {maker}"
        if cat:
            line += f"\n   📂 {cat}"
        line += f"\n   🔗 {link}"
        lines.append(line)
    return "\n\n".join(lines)


def _format_blog_items(items: list[dict], total: int, query: str) -> str:
    lines = [f"📝 네이버 블로그 '{query}' 검색 결과 (총 {total:,}개 중 {len(items)}개)\n"]
    for i, item in enumerate(items, 1):
        title       = _strip_html(item.get("title", ""))
        desc        = _strip_html(item.get("description", ""))
        blogger     = item.get("bloggername", "")
        bloggerlink = item.get("bloggerlink", "")
        postdate    = item.get("postdate", "")
        link        = item.get("link", "")

        # 블로그 이름: 링크가 있으면 클릭 가능하게
        blogger_str = f"[{blogger}]({bloggerlink})" if blogger and bloggerlink else blogger

        line = f"{i}. **{title}**\n   ✍️ {blogger_str}"
        if len(postdate) == 8:
            line += f"  ({postdate[:4]}-{postdate[4:6]}-{postdate[6:]})"
        if desc:
            line += f"\n   {_truncate(desc, 150)}"
        line += f"\n   🔗 {link}"
        lines.append(line)
    return "\n\n".join(lines)


def _parse_pubdate(pubdate: str) -> str:
    """Convert RFC 2822 pubDate ('Mon, 26 Sep 2016 07:50:00 +0900') to 'YYYY-MM-DD HH:MM'."""
    try:
        from email.utils import parsedate
        t = parsedate(pubdate)
        if t:
            return f"{t[0]}-{t[1]:02d}-{t[2]:02d} {t[3]:02d}:{t[4]:02d}"
    except Exception:
        pass
    return pubdate


def _format_news_items(items: list[dict], total: int, query: str) -> str:
    lines = [f"📰 네이버 뉴스 '{query}' 검색 결과 (총 {total:,}개 중 {len(items)}개)\n"]
    for i, item in enumerate(items, 1):
        title        = _strip_html(item.get("title", ""))
        desc         = _strip_html(item.get("description", ""))
        pubdate      = _parse_pubdate(item.get("pubDate", ""))
        originallink = item.get("originallink", "")
        link         = item.get("link", "")

        # 원문 링크 우선, 없으면 네이버 프록시 링크 사용
        url = originallink or link

        line = f"{i}. **{title}**"
        if pubdate:
            line += f"\n   🕐 {pubdate}"
        if desc:
            line += f"\n   {_truncate(desc, 150)}"
        if url:
            line += f"\n   🔗 {url}"
        lines.append(line)
    return "\n\n".join(lines)


def _format_book_items(items: list[dict], total: int, query: str) -> str:
    lines = [f"📚 네이버 책 '{query}' 검색 결과 (총 {total:,}개 중 {len(items)}개)\n"]
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

        # 출판 정보 줄
        meta = []
        if author:
            meta.append(f"저자: {author}")
        if publisher:
            meta.append(f"출판사: {publisher}")
        if len(pubdate) >= 6:
            meta.append(f"{pubdate[:4]}년 {pubdate[4:6]}월")

        # 가격: 할인가 있으면 "정가 16,000원 → 14,400원", 없으면 정가만
        price_str = ""
        if discount and int(discount or 0) > 0:
            if price and int(price or 0) > 0:
                price_str = f"정가 {int(price):,}원 → {int(discount):,}원"
            else:
                price_str = f"{int(discount):,}원"
        elif price and int(price or 0) > 0:
            price_str = f"{int(price):,}원"

        # ISBN: 공백으로 구분된 두 값 중 13자리 우선
        isbn_13 = next((x for x in isbn_raw.split() if len(x) == 13), "")
        isbn_str = isbn_13 or isbn_raw.split()[0] if isbn_raw else ""

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


def _format_encyc_items(items: list[dict], total: int, query: str) -> str:
    lines = [f"📖 네이버 백과사전 '{query}' 검색 결과 (총 {total:,}개 중 {len(items)}개)\n"]
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


def _format_cafearticle_items(items: list[dict], total: int, query: str) -> str:
    lines = [f"☕ 네이버 카페글 '{query}' 검색 결과 (총 {total:,}개 중 {len(items)}개)\n"]
    for i, item in enumerate(items, 1):
        title    = _strip_html(item.get("title", ""))
        desc     = _strip_html(item.get("description", ""))
        cafename = item.get("cafename", "")
        cafeurl  = item.get("cafeurl", "")
        link     = item.get("link", "")

        # 카페명을 링크로 표시
        cafe_str = f"[{cafename}]({cafeurl})" if cafename and cafeurl else cafename

        line = f"{i}. **{title}**"
        if cafe_str:
            line += f"\n   ☕ {cafe_str}"
        if desc:
            line += f"\n   {_truncate(desc, 150)}"
        line += f"\n   🔗 {link}"
        lines.append(line)
    return "\n\n".join(lines)


def _format_kin_items(items: list[dict], total: int, query: str) -> str:
    lines = [f"💡 네이버 지식iN '{query}' 검색 결과 (총 {total:,}개 중 {len(items)}개)\n"]
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


def _format_local_items(items: list[dict], total: int, query: str) -> str:
    lines = [f"📍 네이버 지역 '{query}' 검색 결과 (총 {total:,}개 중 {len(items)}개)\n"]
    for i, item in enumerate(items, 1):
        title       = _strip_html(item.get("title", ""))
        category    = item.get("category", "")
        tel         = item.get("telephone", "")
        road_addr   = item.get("roadAddress", "").strip()
        addr        = item.get("address", "").strip()
        address     = road_addr or addr
        desc        = _strip_html(item.get("description", ""))
        link        = item.get("link", "")

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


def _format_webkr_items(items: list[dict], total: int, query: str) -> str:
    lines = [f"🌐 네이버 웹문서 '{query}' 검색 결과 (총 {total:,}개 중 {len(items)}개)\n"]
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



def _format_doc_items(items: list[dict], total: int, query: str) -> str:
    lines = [f"📑 네이버 전문자료 '{query}' 검색 결과 (총 {total:,}개 중 {len(items)}개)\n"]
    for i, item in enumerate(items, 1):
        title = _strip_html(item.get("title", ""))
        # 목차형 description은 줄바꿈·공백이 많으므로 단일 공백으로 정규화
        desc  = " ".join(_strip_html(item.get("description", "")).split())
        link  = item.get("link", "")

        line = f"{i}. **{title}**"
        if desc:
            line += f"\n   {_truncate(desc, 150)}"
        line += f"\n   🔗 {link}"
        lines.append(line)
    return "\n\n".join(lines)


# Dispatch table — add new formatters here when extending search types
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


# ── Input schema ──────────────────────────────────────────────────────────────

_TYPE_DESC = "\n".join(
    f"- {k}: {v}" for k, v in _SEARCH_TYPES.items()
)


class NaverSearchInput(BaseModel):
    query: str = Field(description="검색할 키워드 (UTF-8)")
    search_type: str = Field(
        default="webkr",
        description=(
            "검색 유형 (기본값: webkr):\n"
            + _TYPE_DESC
        ),
    )
    display: int = Field(
        default=5,
        description=(
            "한 번에 표시할 검색 결과 개수 (기본값: 5, 최대: 100). "
            "사용자가 '많이', '전부', '10개 이상' 등을 요청하면 늘려서 사용."
        ),
    )
    start: int = Field(
        default=1,
        description=(
            "검색 시작 위치 (기본값: 1, 최대: 1000). "
            "다음 페이지 조회 시 start=이전_display+1 로 설정. "
            "예: 첫 페이지 display=10이면 두 번째 페이지는 start=11."
        ),
    )
    sort: str = Field(
        default="sim",
        description=(
            "검색 결과 정렬 방식 (기본값: sim):\n"
            "- sim: 정확도순 (기본)\n"
            "- date: 날짜순, 최신순 — '최신', '오늘', '최근' 요청 시 사용\n"
            "- asc: 가격 오름차순 — '저렴한', '싼', '최저가' 요청 시 사용 (쇼핑 전용)\n"
            "- dsc: 가격 내림차순 — '비싼', '고가' 요청 시 사용 (쇼핑 전용)"
        ),
    )


# ── Tool ──────────────────────────────────────────────────────────────────────

@tool(args_schema=NaverSearchInput)
@skill_guard("naver_search")
async def naver_search(
    query: str,
    search_type: str = "webkr",
    display: int = 5,
    start: int = 1,
    sort: str = "sim",
) -> str:
    """네이버 검색 API로 다양한 콘텐츠를 검색합니다.
    쇼핑(shop), 블로그(blog), 뉴스(news), 책(book), 백과사전(encyc),
    카페글(cafearticle), 지식iN(kin), 지역(local), 웹문서(webkr),
    전문자료(doc) 검색을 지원합니다.
    """
    if search_type not in _SEARCH_TYPES:
        types_str = ", ".join(f"{k}({v})" for k, v in _SEARCH_TYPES.items())
        return f"지원하지 않는 검색 유형이에요.\n가능한 유형: {types_str}"

    display = max(1, min(display, 100))
    start   = max(1, min(start, 1000))

    data = await _naver_api(search_type, query, display=display, start=start, sort=sort)
    if "error" in data:
        return data["error"]

    items = data.get("items", [])
    total = int(data.get("total", 0))

    if not items:
        label = _SEARCH_TYPES[search_type]
        return f"'{query}'에 대한 네이버 {label} 검색 결과가 없어요."

    # Format text result
    formatter = _FORMATTERS.get(search_type)
    if formatter:
        format_text = formatter(items, total, query)
    else:
        label = _SEARCH_TYPES.get(search_type, search_type)
        lines = [f"🔍 네이버 {label} '{query}' 검색 결과 ({len(items)}개)\n"]
        for i, item in enumerate(items, 1):
            title = _strip_html(item.get("title", ""))
            link  = item.get("link", "")
            lines.append(f"{i}. {title}\n   🔗 {link}")
        format_text = "\n\n".join(lines)

    return format_text
