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

if TYPE_CHECKING:
    from playwright.async_api import Browser, BrowserContext, Page, Playwright

logger = logging.getLogger(__name__)

IDLE_TIMEOUT = 300  # seconds — auto-close after inactivity


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


async def _create_session() -> BrowserSession:
    from playwright.async_api import async_playwright

    pw = await async_playwright().start()
    browser = await pw.chromium.launch(
        headless=True,
        args=[
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-extensions",
        ],
    )
    context = await browser.new_context(
        viewport={"width": 1280, "height": 800},
        user_agent=(
            "Mozilla/5.0 (X11; Linux x86_64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        locale="ko-KR",
        timezone_id="Asia/Seoul",
    )
    page = await context.new_page()
    return BrowserSession(playwright=pw, browser=browser, context=context, page=page)
