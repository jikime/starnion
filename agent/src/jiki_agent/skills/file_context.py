"""File response context for tools that produce binary output.

Uses ContextVar WITHOUT a mutable default to prevent cross-request
file leakage.  Each gRPC task gets its own asyncio context copy, so
a missing value simply means "no pending files".
"""

from contextvars import ContextVar

_pending_files: ContextVar[list] = ContextVar("pending_files")


def add_pending_file(data: bytes, name: str, mime: str) -> None:
    """Add a generated file to the pending queue (called from tools)."""
    try:
        files = _pending_files.get()
    except LookupError:
        files = []
        _pending_files.set(files)
    files.append({"data": data, "name": name, "mime": mime})


def pop_pending_files() -> list:
    """Pop all pending files and reset (called from gRPC stream)."""
    try:
        files = _pending_files.get()
    except LookupError:
        return []
    _pending_files.set([])
    return files
