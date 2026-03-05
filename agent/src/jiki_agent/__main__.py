"""Entry point for running the jiki agent as a gRPC server."""

import asyncio
import logging
import signal

from jiki_agent.config import settings
from jiki_agent.db.pool import close_pool, get_pool, init_pool
from jiki_agent.graph.agent import close_checkpointer, create_agent
from jiki_agent.grpc.server import serve
from jiki_agent.log_buffer import install as install_log_buffer, start_http_server
from jiki_agent.skills.registry import register_skills

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
# Install in-memory log buffer after basicConfig so both the console StreamHandler
# (added by basicConfig) and the buffer handler are active.
install_log_buffer(level=logging.INFO)

logger = logging.getLogger(__name__)


async def main() -> None:
    """Initialize resources and start the gRPC + log-HTTP servers."""
    await init_pool(settings.database_url)
    await register_skills(get_pool())
    agent = await create_agent(settings.database_url)

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
