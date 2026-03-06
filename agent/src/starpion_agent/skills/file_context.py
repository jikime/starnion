"""File response context for tools that produce binary output.

Uses a ContextVar to pass generated files from tool execution back to
the gRPC handler.  The variable has no default to prevent cross-request
file leakage.

**Important**: ``init_pending_files()`` MUST be called in each gRPC
handler *before* invoking the agent.  LangGraph may execute tools in
child asyncio Tasks that inherit a *copy* of the parent context.
Pre-initialising ensures the child inherits a reference to the same
mutable list, so in-place ``append()`` is visible to the parent when
``pop_pending_files()`` is called after the agent returns.
"""

import logging
from contextvars import ContextVar

logger = logging.getLogger(__name__)

_pending_files: ContextVar[list] = ContextVar("pending_files")


def init_pending_files() -> None:
    """Pre-initialise the pending-files list for the current request.

    Must be called in the gRPC handler before ``ainvoke`` /
    ``astream_events`` so that child asyncio Tasks share the same
    list object via inherited context.
    """
    _pending_files.set([])


def add_pending_file(data: bytes, name: str, mime: str) -> None:
    """Add a generated file to the pending queue (called from tools)."""
    try:
        files = _pending_files.get()
    except LookupError:
        files = []
        _pending_files.set(files)
    files.append({"data": data, "name": name, "mime": mime})
    logger.debug("add_pending_file: name=%s mime=%s size=%d total=%d",
                 name, mime, len(data), len(files))


def pop_pending_files() -> list:
    """Pop all pending files and reset (called from gRPC stream)."""
    try:
        files = _pending_files.get()
    except LookupError:
        return []
    _pending_files.set([])
    return files
