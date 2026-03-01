"""Entry point for running the jiki agent as a gRPC server."""

import asyncio
import logging
import signal

from jiki_agent.config import settings
from jiki_agent.db.pool import close_pool, init_pool
from jiki_agent.graph.agent import close_checkpointer, create_agent
from jiki_agent.grpc.server import serve

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)

logger = logging.getLogger(__name__)


async def main() -> None:
    """Initialize resources and start the gRPC server."""
    await init_pool(settings.database_url)
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

    await stop_event.wait()

    serve_task.cancel()
    try:
        await serve_task
    except asyncio.CancelledError:
        pass

    await close_checkpointer()
    await close_pool()
    logger.info("Agent shutdown complete")


if __name__ == "__main__":
    asyncio.run(main())
