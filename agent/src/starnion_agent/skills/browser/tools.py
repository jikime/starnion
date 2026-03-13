"""Playwright browser control tools.

Exposes web browser automation as LLM-callable tools. Screenshots are
delivered as image attachments via the existing file_context pipeline,
so they appear inline in Telegram and web chat.

Session lifecycle:
  - A browser is started on first use (per user).
  - It stays alive for IDLE_TIMEOUT seconds after the last action.
  - Call browser_close() to release it immediately.
"""

from __future__ import annotations

import logging

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starnion_agent.context import get_current_user
from starnion_agent.skills.browser.session import _HEADLESS, close_session, get_exec_lock, get_session
from starnion_agent.skills.file_context import add_pending_file
from starnion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)


# ── Input schemas ─────────────────────────────────────────────────────────────


class BrowserNavigateInput(BaseModel):
    url: str = Field(description="이동할 URL (https:// 포함)")
    wait_until: str = Field(
        default="domcontentloaded",
        description="대기 조건: load | domcontentloaded | networkidle",
    )


class BrowserClickInput(BaseModel):
    selector: str = Field(
        description=(
            "클릭할 요소 선택자. CSS 선택자(#id, .class), "
            "텍스트('text=로그인'), ARIA('role=button[name=확인]') 모두 가능"
        )
    )


class BrowserTypeInput(BaseModel):
    selector: str = Field(description="입력할 요소 선택자")
    text: str = Field(description="입력할 텍스트")
    clear_first: bool = Field(default=True, description="입력 전 기존 텍스트 삭제 여부")


class BrowserPressInput(BaseModel):
    key: str = Field(description="누를 키 (예: Enter, Escape, Tab, ArrowDown)")


class BrowserSelectInput(BaseModel):
    selector: str = Field(description="<select> 요소 선택자")
    value: str = Field(description="선택할 옵션 value 또는 텍스트")


class BrowserHoverInput(BaseModel):
    selector: str = Field(
        description=(
            "호버할 요소 선택자. CSS 선택자(#id, .class), "
            "텍스트('text=메뉴'), ARIA('role=menuitem[name=설정]') 모두 가능"
        )
    )


class BrowserScreenshotInput(BaseModel):
    full_page: bool = Field(
        default=False,
        description="True면 전체 페이지 캡처, False면 현재 뷰포트만 캡처. 날씨·검색결과 등 스크롤 콘텐츠는 True 권장",
    )


class BrowserScrollInput(BaseModel):
    direction: str = Field(default="down", description="스크롤 방향: up | down")
    pixels: int = Field(default=500, description="스크롤할 픽셀 수")


class BrowserWaitMsInput(BaseModel):
    ms: int = Field(default=1500, description="대기할 시간 (밀리초). 동적 콘텐츠 렌더링 대기용")


class BrowserOpenScreenshotInput(BaseModel):
    url: str = Field(description="열 URL (https:// 포함)")
    wait_ms: int = Field(
        default=0,
        description=(
            "DOM 안정화 후 추가 대기 시간 (밀리초). "
            "대부분의 페이지는 0(자동 감지)으로 충분. "
            "지도·차트 등 GPU 렌더링이 필요한 경우 2000~3000 설정"
        ),
    )
    full_page: bool = Field(default=True, description="True면 전체 페이지 캡처 (권장), False면 현재 뷰포트만")


class BrowserEvaluateInput(BaseModel):
    code: str = Field(description="브라우저 컨텍스트에서 실행할 JavaScript 코드")


class BrowserWaitInput(BaseModel):
    selector: str = Field(description="나타날 때까지 기다릴 요소 선택자")
    timeout_ms: int = Field(default=10000, description="최대 대기 시간 (밀리초)")


# ── Tools ─────────────────────────────────────────────────────────────────────


@tool(args_schema=BrowserOpenScreenshotInput)
@skill_guard("browser")
async def browser_open_screenshot(url: str, wait_ms: int = 0, full_page: bool = True) -> str:
    """URL을 열고 페이지가 완전히 로딩된 후 스크린샷을 찍어 이미지로 첨부합니다.
    날씨·검색결과·뉴스 등 한 번에 보고 싶을 때 이 툴 하나만 사용하세요.
    개별 browser_navigate + browser_wait_ms + browser_screenshot 조합 대신 이 툴을 우선 사용하세요.

    스크린샷 후에도 세션이 유지되므로 browser_click, browser_type 등으로 바로 이어서 인터랙션할 수 있어요.
    작업이 모두 끝나면 browser_close()를 호출해 리소스를 해제하세요.
    """
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    mode_str = "headless" if _HEADLESS else "headed"
    logger.warning("browser_open_screenshot: mode=%s url=%s", mode_str, url)

    async with get_exec_lock(user_id):
        try:
            session = await get_session(user_id)

            # Step 1: DOM 먼저 로드
            await session.page.goto(url, wait_until="domcontentloaded", timeout=30000)

            # Step 2: networkidle 대기 (타임아웃 15초로 연장 — 검색결과 AJAX 완료 감지)
            try:
                await session.page.wait_for_load_state("networkidle", timeout=15000)
            except Exception:
                pass

            # Step 3: DOM 안정성 감지 — DOM 변화가 800ms 동안 없으면 로딩 완료로 판단.
            # 검색결과·뉴스 등 SPA 페이지의 "로딩 스피너 → 결과 표시" 전환을 정확히 감지.
            # MutationObserver로 실제 DOM 변화가 멈출 때까지 대기 (최대 12초).
            _DOM_STABILITY_JS = """
                () => new Promise(resolve => {
                    const STABLE_MS = 800;
                    const MAX_MS   = 12000;
                    let timer      = setTimeout(() => { observer.disconnect(); resolve('stable'); }, STABLE_MS);
                    const reset    = () => { clearTimeout(timer); timer = setTimeout(() => { observer.disconnect(); resolve('stable'); }, STABLE_MS); };
                    const observer = new MutationObserver(reset);
                    observer.observe(document.body || document.documentElement, {
                        childList: true, subtree: true
                    });
                    setTimeout(() => { observer.disconnect(); clearTimeout(timer); resolve('timeout'); }, MAX_MS);
                })
            """
            try:
                result = await session.page.evaluate(_DOM_STABILITY_JS)
                logger.warning("browser_open_screenshot: DOM stability=%s", result)
            except Exception:
                pass

            # Step 4: 사용자 지정 추가 대기 (지도·차트 등 GPU 렌더링이 필요한 경우)
            if wait_ms > 0:
                await session.page.wait_for_timeout(wait_ms)

            # Step 5: Canvas/WebGL 페이지(지도 등)는 타일 렌더링에 추가 시간 필요.
            # 지도 타일은 DOM 안정화 후에도 GPU 렌더링이 계속되므로 넉넉히 4초 대기.
            try:
                has_canvas: bool = await session.page.evaluate(
                    "() => document.querySelector('canvas') !== null"
                )
                if has_canvas:
                    logger.warning("browser_open_screenshot: canvas detected, waiting extra 4000ms for tile render")
                    await session.page.wait_for_timeout(4000)
            except Exception:
                pass

            png_bytes = await session.page.screenshot(
                full_page=full_page, type="png", animations="disabled"
            )
            title = await session.page.title()
            current_url = session.page.url
            add_pending_file(png_bytes, "screenshot.png", "image/png")
            cap_mode = "전체 페이지" if full_page else "현재 화면"
            logger.warning("browser_open_screenshot: captured %s title=%r", cap_mode, title)
            return f"스크린샷 첨부 완료. ({cap_mode} / 페이지: {title} / URL: {current_url})\n이어서 browser_click, browser_type 등으로 인터랙션하거나 browser_close()로 종료하세요."
        except Exception as e:
            logger.warning("browser_open_screenshot: error=%s", e)
            return f"오류: {e}"


@tool(args_schema=BrowserNavigateInput)
@skill_guard("browser")
async def browser_navigate(url: str, wait_until: str = "domcontentloaded") -> str:
    """브라우저로 URL을 탐색합니다. 페이지 로딩 후 제목을 반환합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    async with get_exec_lock(user_id):
        try:
            session = await get_session(user_id)
            await session.page.goto(url, wait_until=wait_until, timeout=30000)
            title = await session.page.title()
            current_url = session.page.url
            return f"페이지 이동 완료\n제목: {title}\nURL: {current_url}"
        except Exception as e:
            return f"페이지 이동 실패: {e}"


@tool
@skill_guard("browser")
async def browser_snapshot() -> str:
    """현재 페이지의 ARIA 접근성 트리를 텍스트로 반환합니다. 페이지 구조와 클릭 가능한 요소를 파악할 때 사용하세요."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    async with get_exec_lock(user_id):
        try:
            session = await get_session(user_id)
            snapshot = await session.page.accessibility.snapshot()
            if not snapshot:
                return "페이지 스냅샷을 가져올 수 없어요. 먼저 browser_navigate로 페이지를 열어주세요."

            title = await session.page.title()
            url = session.page.url
            text = _format_snapshot(snapshot)
            return f"[{title}] {url}\n\n{text[:4000]}"
        except Exception as e:
            return f"스냅샷 오류: {e}"


@tool(args_schema=BrowserScreenshotInput)
@skill_guard("browser")
async def browser_screenshot(full_page: bool = False) -> str:
    """현재 페이지의 스크린샷을 찍어 이미지로 첨부합니다. 날씨·검색결과처럼 스크롤 아래 콘텐츠가 있으면 full_page=True를 사용하세요."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    async with get_exec_lock(user_id):
        try:
            session = await get_session(user_id)
            png_bytes = await session.page.screenshot(full_page=full_page, type="png")
            title = await session.page.title()
            add_pending_file(png_bytes, "screenshot.png", "image/png")
            mode = "전체 페이지" if full_page else "현재 화면"
            return f"스크린샷을 찍었어요. ({mode} / 페이지: {title})"
        except Exception as e:
            return f"스크린샷 오류: {e}"


@tool(args_schema=BrowserClickInput)
@skill_guard("browser")
async def browser_click(selector: str) -> str:
    """페이지의 요소를 클릭합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    async with get_exec_lock(user_id):
        try:
            session = await get_session(user_id)
            await session.page.click(selector, timeout=10000)
            title = await session.page.title()
            return f"'{selector}' 클릭 완료. (현재 페이지: {title})"
        except Exception as e:
            return f"클릭 실패 ({selector}): {e}"


@tool(args_schema=BrowserTypeInput)
@skill_guard("browser")
async def browser_type(selector: str, text: str, clear_first: bool = True) -> str:
    """페이지의 입력 필드에 텍스트를 입력합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    async with get_exec_lock(user_id):
        try:
            session = await get_session(user_id)
            if clear_first:
                await session.page.fill(selector, text, timeout=10000)
            else:
                await session.page.type(selector, text, timeout=10000)
            return f"'{selector}' 에 텍스트 입력 완료."
        except Exception as e:
            return f"텍스트 입력 실패 ({selector}): {e}"


@tool(args_schema=BrowserPressInput)
@skill_guard("browser")
async def browser_press(key: str) -> str:
    """현재 포커스된 요소에 키를 입력합니다. (Enter, Escape, Tab 등)"""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    async with get_exec_lock(user_id):
        try:
            session = await get_session(user_id)
            await session.page.keyboard.press(key)
            return f"키 '{key}' 입력 완료."
        except Exception as e:
            return f"키 입력 실패 ({key}): {e}"


@tool(args_schema=BrowserSelectInput)
@skill_guard("browser")
async def browser_select(selector: str, value: str) -> str:
    """드롭다운(<select>)에서 옵션을 선택합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    async with get_exec_lock(user_id):
        try:
            session = await get_session(user_id)
            selected = await session.page.select_option(selector, value=value, timeout=10000)
            return f"드롭다운에서 '{selected}' 선택 완료."
        except Exception as e:
            return f"드롭다운 선택 실패 ({selector}): {e}"


@tool(args_schema=BrowserHoverInput)
@skill_guard("browser")
async def browser_hover(selector: str) -> str:
    """페이지의 요소 위로 마우스를 올립니다. 드롭다운 메뉴나 툴팁을 열 때 사용하세요."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    async with get_exec_lock(user_id):
        try:
            session = await get_session(user_id)
            await session.page.hover(selector, timeout=10000)
            return f"'{selector}' 요소에 마우스를 올렸어요."
        except Exception as e:
            return f"호버 실패 ({selector}): {e}"


@tool(args_schema=BrowserScrollInput)
@skill_guard("browser")
async def browser_scroll(direction: str = "down", pixels: int = 500) -> str:
    """페이지를 스크롤합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    async with get_exec_lock(user_id):
        try:
            session = await get_session(user_id)
            dy = pixels if direction == "down" else -pixels
            await session.page.evaluate(f"window.scrollBy(0, {dy})")
            return f"페이지를 {direction}으로 {pixels}px 스크롤했어요."
        except Exception as e:
            return f"스크롤 실패: {e}"


@tool(args_schema=BrowserEvaluateInput)
@skill_guard("browser")
async def browser_evaluate(code: str) -> str:
    """페이지에서 JavaScript를 실행하고 결과를 반환합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    async with get_exec_lock(user_id):
        try:
            session = await get_session(user_id)
            result = await session.page.evaluate(code)
            return f"실행 결과: {result}"
        except Exception as e:
            return f"JavaScript 실행 실패: {e}"


@tool(args_schema=BrowserWaitInput)
@skill_guard("browser")
async def browser_wait_for(selector: str, timeout_ms: int = 10000) -> str:
    """지정한 요소가 나타날 때까지 기다립니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    async with get_exec_lock(user_id):
        try:
            session = await get_session(user_id)
            await session.page.wait_for_selector(selector, timeout=timeout_ms)
            return f"요소 '{selector}' 가 나타났어요."
        except Exception as e:
            return f"대기 시간 초과 또는 오류 ({selector}): {e}"


@tool(args_schema=BrowserWaitMsInput)
@skill_guard("browser")
async def browser_wait_ms(ms: int = 1500) -> str:
    """지정한 시간(밀리초)만큼 대기합니다. 동적 콘텐츠(날씨 위젯, 차트 등)가 렌더링될 때까지 기다릴 때 사용하세요."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    clamped = max(100, min(ms, 10000))  # 100ms ~ 10s
    async with get_exec_lock(user_id):
        try:
            session = await get_session(user_id)
            await session.page.wait_for_timeout(clamped)
        except Exception:
            pass
    return f"{clamped}ms 대기 완료."


@tool
@skill_guard("browser")
async def browser_get_text() -> str:
    """현재 페이지의 전체 텍스트 내용을 반환합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    async with get_exec_lock(user_id):
        try:
            session = await get_session(user_id)
            text = await session.page.inner_text("body")
            # 연속 공백/줄바꿈 정리
            import re
            text = re.sub(r"\n{3,}", "\n\n", text.strip())
            return text[:5000] + ("..." if len(text) > 5000 else "")
        except Exception as e:
            return f"텍스트 추출 실패: {e}"


@tool
@skill_guard("browser")
async def browser_current_url() -> str:
    """현재 브라우저가 열고 있는 URL을 반환합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    async with get_exec_lock(user_id):
        try:
            session = await get_session(user_id)
            title = await session.page.title()
            return f"제목: {title}\nURL: {session.page.url}"
        except Exception as e:
            return f"URL 조회 실패: {e}"


@tool
@skill_guard("browser")
async def browser_close() -> str:
    """브라우저를 종료합니다. 작업이 완료되면 호출해 리소스를 해제하세요."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    async with get_exec_lock(user_id):
        closed = await close_session(user_id)
    return "브라우저를 종료했어요." if closed else "열린 브라우저가 없어요."


# ── Helpers ───────────────────────────────────────────────────────────────────


def _format_snapshot(node: dict, depth: int = 0) -> str:
    """Recursively format an accessibility snapshot node to readable text."""
    indent = "  " * depth
    role = node.get("role", "")
    name = node.get("name", "")
    value = node.get("value", "")

    parts = [role]
    if name:
        parts.append(f'"{name}"')
    if value:
        parts.append(f"= {value}")

    line = indent + " ".join(parts)
    lines = [line] if line.strip() else []

    for child in node.get("children", []):
        lines.append(_format_snapshot(child, depth + 1))

    return "\n".join(lines)
