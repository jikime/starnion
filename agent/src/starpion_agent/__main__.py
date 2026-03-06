"""Entry point for running the jiki agent as a gRPC server."""

import asyncio
import logging
import signal

from starpion_agent.config import settings
from starpion_agent.db.pool import close_pool, get_pool, init_pool
from starpion_agent.graph.agent import close_checkpointer, create_agent
from starpion_agent.grpc.server import serve
from starpion_agent.log_buffer import install as install_log_buffer, set_index_callback, start_http_server
from starpion_agent.skills.registry import register_skills

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
# Install in-memory log buffer after basicConfig so both the console StreamHandler
# (added by basicConfig) and the buffer handler are active.
install_log_buffer(level=logging.INFO)

logger = logging.getLogger(__name__)


async def _index_document(
    user_id: str,
    doc_id: int,
    file_url: str,
    file_name: str,
) -> None:
    """Fetch, extract, chunk, embed, and store a document uploaded via web UI.

    Called as a background task from the POST /index-document HTTP endpoint.
    The gateway has already inserted the row into user_documents; this
    function populates document_sections with vector embeddings.
    """
    from pathlib import Path

    from starpion_agent.db.pool import get_pool
    from starpion_agent.document.chunker import chunk_and_store
    from starpion_agent.document.parser import extract_text, fetch_file

    try:
        data = await fetch_file(file_url)
        ext = Path(file_name).suffix.lower().lstrip(".") or "pdf"
        text = extract_text(data, ext)

        if not text.strip() or text.startswith("("):
            logger.warning(
                "index_document: no extractable text from doc_id=%d file=%s", doc_id, file_name,
            )
            return

        pool = get_pool()
        section_count = await chunk_and_store(
            user_id=user_id,
            doc_id=doc_id,
            text=text,
        )
        logger.info(
            "index_document: indexed doc_id=%d (%d sections) for user=%s",
            doc_id, section_count, user_id,
        )

        # Mark the document as indexed in user_documents if the column exists.
        try:
            async with pool.connection() as conn:
                await conn.execute(
                    "UPDATE user_documents SET indexed = TRUE WHERE id = %s",
                    (doc_id,),
                )
                await conn.commit()
        except Exception:
            pass  # indexed column may not exist yet; non-fatal

    except Exception:
        logger.exception("index_document: failed for doc_id=%d file=%s", doc_id, file_name)


async def main() -> None:
    """Initialize resources and start the gRPC + log-HTTP servers."""
    await init_pool(settings.database_url)
    await register_skills(get_pool())
    agent = await create_agent(settings.database_url)

    # Register the document indexing callback so POST /index-document works.
    set_index_callback(_index_document)

    logger.info("Agent initialized, starting gRPC server on port %s", settings.grpc_port)

    loop = asyncio.get_running_loop()
    stop_event = asyncio.Event()

    def _handle_signal():
        logger.info("Received shutdown signal")
        stop_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _handle_signal)

    serve_task = asyncio.create_task(serve(agent, port=settings.grpc_port))
    # Start the minimal HTTP log server alongside gRPC (port 8082).
    log_http_task = asyncio.create_task(start_http_server(port=8082))

    await stop_event.wait()

    for task in (serve_task, log_http_task):
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    await close_checkpointer()
    await close_pool()
    logger.info("Agent shutdown complete")


if __name__ == "__main__":
    asyncio.run(main())
