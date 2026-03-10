"""Background task queue for document processing.

Prevents large document uploads from blocking the agent gRPC handler.
Uses asyncio.Queue + worker coroutines with semaphore-bounded concurrency.

Tasks are in-memory only — they are lost on process restart.
This is intentional: the queue exists solely to decouple the gRPC
request/response cycle from the Docling + embedding pipeline, which
can take several minutes for large PDFs.

Concurrency model
-----------------
- ``asyncio.Queue``         — FIFO ordering, backpressure-safe
- ``asyncio.Semaphore``     — caps simultaneous Docling workers (default 2)
  Docling is CPU-bound; running more than 2–3 workers concurrently on a
  typical host causes CPU contention without throughput gain.
- ``dict[str, DocumentTask]``— O(1) status lookup by task_id
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Number of concurrent Docling workers.  Docling is CPU-bound (PDF rendering +
# ML-based layout analysis), so the default is intentionally low.
MAX_WORKERS: int = int(os.environ.get("DOC_QUEUE_WORKERS", "2"))


# ---------------------------------------------------------------------------
# Task dataclass
# ---------------------------------------------------------------------------

@dataclass
class DocumentTask:
    """Represents a single document processing job."""

    task_id: str
    user_id: str
    doc_id: int
    data: bytes
    ext: str
    filename: str
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = "pending"   # pending | processing | done | error
    error: str | None = None
    section_count: int = 0


# ---------------------------------------------------------------------------
# Queue
# ---------------------------------------------------------------------------

class DocumentQueue:
    """Async document processing queue backed by worker coroutines.

    Usage::

        # At application startup (after the event loop is running):
        await document_queue.start()

        # Enqueue a document (non-blocking):
        task_id = document_queue.enqueue(user_id, doc_id, data, ext, filename)

        # Poll status:
        task = document_queue.get_status(task_id)

        # At shutdown:
        await document_queue.stop()
    """

    def __init__(self, max_workers: int = MAX_WORKERS) -> None:
        self._max_workers = max_workers
        self._queue: asyncio.Queue[DocumentTask] = asyncio.Queue()
        # Semaphore enforces max concurrency for Docling processing.
        self._semaphore: asyncio.Semaphore = asyncio.Semaphore(max_workers)
        # In-memory status registry: task_id → DocumentTask
        self._tasks: dict[str, DocumentTask] = {}
        # Tracks spawned worker tasks so we can cancel them on stop().
        self._worker_handles: list[asyncio.Task] = []
        self._started: bool = False

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def enqueue(
        self,
        user_id: str,
        doc_id: int,
        data: bytes,
        ext: str,
        filename: str,
    ) -> str:
        """Add a document processing job to the queue.

        This method is synchronous (non-blocking): it puts the task on the
        queue immediately without waiting for processing to start.

        Args:
            user_id:  The user who owns the document.
            doc_id:   The DB row id already inserted in ``documents``.
            data:     Raw file bytes.
            ext:      File extension without leading dot (e.g. ``"pdf"``).
            filename: Original file name, used by Docling's format detection.

        Returns:
            A unique ``task_id`` (UUID4 string) that callers can use to
            poll :meth:`get_status`.
        """
        task_id = str(uuid.uuid4())
        task = DocumentTask(
            task_id=task_id,
            user_id=user_id,
            doc_id=doc_id,
            data=data,
            ext=ext,
            filename=filename,
        )
        self._tasks[task_id] = task
        self._queue.put_nowait(task)
        logger.info(
            "document_queue: enqueued task_id=%s doc_id=%d user=%s size=%d bytes",
            task_id, doc_id, user_id, len(data),
        )
        return task_id

    def get_status(self, task_id: str) -> DocumentTask | None:
        """Return the current state of a task, or ``None`` if unknown."""
        return self._tasks.get(task_id)

    async def start(self) -> None:
        """Launch background worker coroutines.

        Idempotent: calling ``start()`` more than once is safe — subsequent
        calls are silently ignored if workers are already running.
        """
        if self._started:
            logger.debug("document_queue: already started, skipping")
            return

        self._started = True
        for i in range(self._max_workers):
            handle = asyncio.create_task(
                self._worker(), name=f"doc-queue-worker-{i}"
            )
            self._worker_handles.append(handle)

        logger.info(
            "document_queue: started %d worker(s)", self._max_workers
        )

    async def stop(self) -> None:
        """Cancel all worker coroutines and wait for them to finish.

        Pending tasks still in the queue will not be processed after stop()
        is called.  This is acceptable for an in-memory queue where tasks
        are not persisted across restarts anyway.
        """
        self._started = False
        for handle in self._worker_handles:
            handle.cancel()

        if self._worker_handles:
            await asyncio.gather(*self._worker_handles, return_exceptions=True)

        self._worker_handles.clear()
        logger.info("document_queue: stopped")

    # ------------------------------------------------------------------
    # Internal worker
    # ------------------------------------------------------------------

    async def _worker(self) -> None:
        """Continuously dequeue and process document tasks.

        The semaphore ensures that at most ``max_workers`` Docling invocations
        run concurrently even if the asyncio event loop schedules multiple
        worker coroutines at once.
        """
        while True:
            try:
                task = await self._queue.get()
            except asyncio.CancelledError:
                # Graceful shutdown: stop the loop.
                break

            async with self._semaphore:
                await self._process(task)

            self._queue.task_done()

    async def _process(self, task: DocumentTask) -> None:
        """Execute a single document processing task."""
        # Lazy import to avoid circular dependencies at module load time.
        from starnion_agent.document.chunker import process_and_store

        task.status = "processing"
        logger.info(
            "document_queue: processing task_id=%s doc_id=%d user=%s",
            task.task_id, task.doc_id, task.user_id,
        )

        try:
            _text, section_count = await process_and_store(
                user_id=task.user_id,
                doc_id=task.doc_id,
                data=task.data,
                ext=task.ext,
                filename=task.filename,
            )
            task.status = "done"
            task.section_count = section_count
            logger.info(
                "document_queue: task_id=%s done — %d sections stored",
                task.task_id, section_count,
            )
        except Exception as exc:  # noqa: BLE001
            task.status = "error"
            task.error = str(exc)
            logger.error(
                "document_queue: task_id=%s failed: %s",
                task.task_id, exc,
                exc_info=True,
            )


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

#: Global singleton.  Import and use this instance everywhere.
#: ``await document_queue.start()`` must be called once at application startup.
document_queue: DocumentQueue = DocumentQueue()
