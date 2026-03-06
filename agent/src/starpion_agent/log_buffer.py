"""In-memory log buffer with HTTP server for real-time log streaming."""

import asyncio
import collections
import json
import logging
import time
from datetime import datetime, timezone


MAX_ENTRIES = 2000


class LogEntry:
    __slots__ = ("time_iso", "time_ms", "level", "message", "source", "raw")

    def __init__(self, record: logging.LogRecord) -> None:
        ts = datetime.fromtimestamp(record.created, tz=timezone.utc)
        self.time_iso = ts.isoformat()
        self.time_ms = int(record.created * 1000)
        self.level = record.levelname.lower()
        self.message = record.getMessage()
        self.source = record.name.split(".")[-1] if record.name else "agent"
        self.raw = f"{self.time_iso} [{self.level.upper()}] {self.source}: {self.message}"

    def to_dict(self) -> dict:
        return {
            "time": self.time_iso,
            "time_ms": self.time_ms,
            "level": self.level,
            "message": self.message,
            "source": self.source,
            "raw": self.raw,
        }


class LogBufferHandler(logging.Handler):
    """logging.Handler that stores records in an in-memory deque."""

    def __init__(self) -> None:
        super().__init__()
        self._entries: collections.deque[LogEntry] = collections.deque(maxlen=MAX_ENTRIES)
        self._subscribers: list[asyncio.Queue] = []
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def emit(self, record: logging.LogRecord) -> None:
        try:
            entry = LogEntry(record)
            self._entries.append(entry)
            # Notify async subscribers from the logging thread.
            if self._loop and self._loop.is_running():
                for q in list(self._subscribers):
                    try:
                        self._loop.call_soon_threadsafe(q.put_nowait, entry)
                    except Exception:
                        pass
        except Exception:
            self.handleError(record)

    def recent(self, n: int = 500) -> list[dict]:
        entries = list(self._entries)
        return [e.to_dict() for e in entries[-n:]]

    def subscribe(self) -> "asyncio.Queue[LogEntry]":
        q: asyncio.Queue[LogEntry] = asyncio.Queue(maxsize=256)
        self._subscribers.append(q)
        return q

    def unsubscribe(self, q: "asyncio.Queue") -> None:
        try:
            self._subscribers.remove(q)
        except ValueError:
            pass


# Singleton handler — install once at startup.
_handler = LogBufferHandler()


def get_handler() -> LogBufferHandler:
    return _handler


def install(level: int = logging.DEBUG) -> LogBufferHandler:
    """Install the buffer handler on the root logger."""
    _handler.setLevel(level)
    root = logging.getLogger()
    if _handler not in root.handlers:
        root.addHandler(_handler)
    # basicConfig() does nothing if handlers already exist, so set the root
    # logger level explicitly so INFO/DEBUG messages are not silently dropped.
    if root.level == logging.NOTSET or root.level > level:
        root.setLevel(level)
    return _handler


# ── Minimal async HTTP server ──────────────────────────────────────────────────

async def _handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        raw = await asyncio.wait_for(reader.read(4096), timeout=5)
        if not raw:
            return
        request_line = raw.split(b"\r\n")[0].decode()
        parts = request_line.split(" ")
        if len(parts) < 2:
            return
        method, path = parts[0], parts[1]

        if method != "GET":
            _write_response(writer, 405, b"Method Not Allowed")
            return

        # Parse path and query string.
        if "?" in path:
            path, qs = path.split("?", 1)
        else:
            qs = ""

        params: dict[str, str] = {}
        for kv in qs.split("&"):
            if "=" in kv:
                k, v = kv.split("=", 1)
                params[k] = v

        if path == "/logs":
            limit = min(int(params.get("limit", 500)), 2000)
            level_f = params.get("level", "").lower()
            source_f = params.get("source", "").lower()
            search_f = params.get("search", "").lower()

            entries = _handler.recent(limit)
            if level_f:
                entries = [e for e in entries if e["level"] == level_f]
            if source_f:
                entries = [e for e in entries if source_f in e["source"].lower()]
            if search_f:
                entries = [e for e in entries if search_f in e["message"].lower()]

            stats = {"info": 0, "warn": 0, "warning": 0, "error": 0}
            sources: set[str] = set()
            for e in entries:
                lv = e["level"]
                if lv in stats:
                    stats[lv] += 1
                sources.add(e["source"])

            payload = json.dumps({
                "entries": entries,
                "total": len(entries),
                "stats": {"info": stats["info"], "warn": stats["warn"] + stats["warning"], "error": stats["error"]},
                "sources": list(sources),
            }).encode()
            _write_response(writer, 200, payload, content_type="application/json")

        elif path == "/logs/stream":
            # SSE endpoint.
            writer.write(
                b"HTTP/1.1 200 OK\r\n"
                b"Content-Type: text/event-stream\r\n"
                b"Cache-Control: no-cache\r\n"
                b"Connection: keep-alive\r\n"
                b"\r\n"
            )
            await writer.drain()

            # Send snapshot.
            for entry in _handler.recent(100):
                data = json.dumps(entry).encode()
                writer.write(b"data: " + data + b"\n\n")
            await writer.drain()

            q = _handler.subscribe()
            try:
                while True:
                    try:
                        entry = await asyncio.wait_for(q.get(), timeout=20)
                        data = json.dumps(entry.to_dict()).encode()
                        writer.write(b"data: " + data + b"\n\n")
                        await writer.drain()
                    except asyncio.TimeoutError:
                        writer.write(b": ping\n\n")
                        await writer.drain()
            except (ConnectionResetError, BrokenPipeError):
                pass
            finally:
                _handler.unsubscribe(q)
        else:
            _write_response(writer, 404, b"Not Found")

    except Exception:
        pass
    finally:
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass


def _write_response(
    writer: asyncio.StreamWriter,
    status: int,
    body: bytes,
    content_type: str = "text/plain",
) -> None:
    status_text = {200: "OK", 404: "Not Found", 405: "Method Not Allowed"}.get(status, "Unknown")
    response = (
        f"HTTP/1.1 {status} {status_text}\r\n"
        f"Content-Type: {content_type}\r\n"
        f"Content-Length: {len(body)}\r\n"
        f"Access-Control-Allow-Origin: *\r\n"
        f"\r\n"
    ).encode() + body
    writer.write(response)


async def start_http_server(host: str = "0.0.0.0", port: int = 8082) -> None:
    """Start the minimal HTTP log server."""
    loop = asyncio.get_running_loop()
    _handler.set_loop(loop)

    server = await asyncio.start_server(_handle, host, port)
    logging.getLogger(__name__).info("Log HTTP server listening on %s:%d", host, port)
    async with server:
        await server.serve_forever()
