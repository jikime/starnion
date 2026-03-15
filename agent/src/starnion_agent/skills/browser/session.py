"""Browser session manager — one Playwright browser instance per user.

Sessions are created on first use and closed after IDLE_TIMEOUT seconds
of inactivity, or when browser_close() is called explicitly.

Concurrency note
----------------
LangGraph may dispatch several tool calls from a single LLM response in
parallel (e.g. navigate + type + screenshot all at once). Each browser
tool must acquire ``get_exec_lock(user_id)`` before touching the page so
that actions run sequentially for the same user.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from starnion_agent.config import settings

if TYPE_CHECKING:
    from playwright.async_api import Browser, BrowserContext, Page, Playwright

logger = logging.getLogger(__name__)

IDLE_TIMEOUT = 300  # seconds — auto-close after inactivity

# headless 모드는 환경 자동 감지로 결정됨 (config.py _detect_headless_mode 참고).
# BROWSER_HEADLESS 환경변수 또는 starnion.yaml browser.headless 로 명시적 override 가능.
_HEADLESS: bool = settings.browser.headless


@dataclass
class BrowserSession:
    playwright: "Playwright"
    browser: "Browser"
    context: "BrowserContext"
    page: "Page"
    last_used: float = field(default_factory=time.monotonic)

    def touch(self) -> None:
        self.last_used = time.monotonic()

    def is_idle(self) -> bool:
        return time.monotonic() - self.last_used > IDLE_TIMEOUT


# ── Internal state ────────────────────────────────────────────────────────────

_sessions: dict[str, BrowserSession] = {}
_session_lock = asyncio.Lock()       # guards _sessions dict mutations

# Per-user serialization locks: prevent concurrent page access
_exec_locks: dict[str, asyncio.Lock] = {}


# ── Public API ────────────────────────────────────────────────────────────────

def get_exec_lock(user_id: str) -> asyncio.Lock:
    """Return (or create) the per-user serialization lock.

    Each browser tool should do::

        async with get_exec_lock(user_id):
            session = await get_session(user_id)
            ...
    """
    if user_id not in _exec_locks:
        _exec_locks[user_id] = asyncio.Lock()
    return _exec_locks[user_id]


async def get_session(user_id: str) -> BrowserSession:
    """Return (or create) the browser session for the given user.

    Must be called while already holding ``get_exec_lock(user_id)``.
    """
    async with _session_lock:
        session = _sessions.get(user_id)
        if session is not None:
            # is_closed() is safe to call at any time; title() throws during navigation
            if not session.page.is_closed():
                session.touch()
                return session
            logger.warning("browser: stale page for %s — recreating session", user_id)
            await _close_session(user_id)

        session = await _create_session()
        _sessions[user_id] = session
        logger.info("browser: session created for user %s", user_id)
        return session


async def close_session(user_id: str) -> bool:
    """Close and remove the session for the given user. Returns True if closed."""
    async with _session_lock:
        return await _close_session(user_id)


async def cleanup_idle_sessions() -> None:
    """Close sessions idle past IDLE_TIMEOUT. Suitable for a periodic cron task."""
    async with _session_lock:
        idle = [uid for uid, s in _sessions.items() if s.is_idle()]
    for uid in idle:
        logger.info("browser: closing idle session for %s", uid)
        await close_session(uid)


# ── Internals ─────────────────────────────────────────────────────────────────

async def _close_session(user_id: str) -> bool:
    """Close session — caller must hold _session_lock."""
    session = _sessions.pop(user_id, None)
    if session is None:
        return False
    try:
        await session.context.close()
        await session.browser.close()
        await session.playwright.stop()
    except Exception as e:
        logger.warning("browser: error closing session for %s: %s", user_id, e)
    logger.info("browser: session closed for user %s", user_id)
    return True


async def _ensure_chromium() -> None:
    """Install Playwright Chromium and its system dependencies.

    On Debian/Ubuntu: playwright install --with-deps handles everything.
    On RHEL/Rocky/Fedora: dnf/yum installs system libs first, then playwright
    installs the browser binary (--with-deps uses apt-get and would fail).
    On macOS or unknown systems: install browser binary only and hope system
    libs are already present.
    """
    import shutil
    import sys

    # ── Detect package manager ────────────────────────────────────────────────
    if shutil.which("apt-get"):
        await _playwright_install(sys.executable, with_deps=True)
    elif shutil.which("dnf") or shutil.which("yum"):
        await _install_rhel_deps(shutil.which("dnf") or shutil.which("yum"))
        await _playwright_install(sys.executable, with_deps=False)
    else:
        # macOS or other — just install the binary
        await _playwright_install(sys.executable, with_deps=False)


async def _playwright_install(python: str, *, with_deps: bool) -> None:
    args = [python, "-m", "playwright", "install"]
    if with_deps:
        args.append("--with-deps")
    args.append("chromium")
    flag = "--with-deps " if with_deps else ""
    logger.warning("browser: running 'playwright install %schromium'", flag)
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        logger.error(
            "browser: playwright install failed (rc=%d): %s",
            proc.returncode,
            stderr.decode(errors="replace"),
        )
        raise RuntimeError("playwright install chromium failed")
    logger.warning("browser: chromium installed successfully")


# Packages required by Playwright Chromium on RHEL/Rocky/CentOS/Fedora.
_RHEL_CHROMIUM_DEPS = [
    "alsa-lib", "atk", "at-spi2-atk", "at-spi2-core", "cairo", "cups-libs",
    "dbus-libs", "expat", "libdrm", "libgbm", "libX11", "libXcomposite",
    "libXdamage", "libXext", "libXfixes", "libXrandr", "libxcb",
    "libxkbcommon", "mesa-libgbm", "nspr", "nss", "pango",
]


async def _install_rhel_deps(pkg_manager: str) -> None:
    logger.warning("browser: installing Chromium system deps via %s", pkg_manager)
    proc = await asyncio.create_subprocess_exec(
        pkg_manager, "install", "-y", *_RHEL_CHROMIUM_DEPS,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        # Non-fatal: some packages may already be installed or unavailable.
        logger.warning(
            "browser: dnf/yum install finished with rc=%d: %s",
            proc.returncode,
            stderr.decode(errors="replace"),
        )
    else:
        logger.warning("browser: RHEL system deps installed")


async def _create_session() -> BrowserSession:
    from playwright.async_api import async_playwright

    pw = await async_playwright().start()

    launch_args = [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        # --disable-gpu 는 WebGL/Canvas(지도·차트 등)를 깨뜨리므로 제거.
        # SwiftShader 소프트웨어 렌더러가 자동으로 GPU를 대체함.
    ]

    try:
        browser = await pw.chromium.launch(
            headless=_HEADLESS,
            args=launch_args,
        )
    except Exception as e:
        if "Executable doesn't exist" in str(e):
            await _ensure_chromium()
            browser = await pw.chromium.launch(
                headless=_HEADLESS,
                args=launch_args,
            )
        else:
            raise
    mode = "headless" if _HEADLESS else "headed"
    # 로그 레벨을 WARNING으로 올려 에이전트 로그에서 항상 보이도록 함
    logger.warning("browser: launched chromium mode=%s (BROWSER_HEADLESS env=%r)", mode, _HEADLESS)

    context = await browser.new_context(
        viewport={"width": 1280, "height": 900},
        user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        locale="ko-KR",
        timezone_id="Asia/Seoul",
    )
    page = await context.new_page()
    return BrowserSession(playwright=pw, browser=browser, context=context, page=page)
