"""File response context for tools that produce binary output.

Phase 1 structure only — used in Phase 2+ for image/audio/video generation.
"""

from contextvars import ContextVar

_pending_files: ContextVar[list] = ContextVar("pending_files", default=[])


def add_pending_file(data: bytes, name: str, mime: str) -> None:
    """Add a generated file to the pending queue (called from tools)."""
    files = _pending_files.get()
    files.append({"data": data, "name": name, "mime": mime})


def pop_pending_files() -> list:
    """Pop all pending files and reset (called from gRPC stream)."""
    files = _pending_files.get()
    _pending_files.set([])
    return files
