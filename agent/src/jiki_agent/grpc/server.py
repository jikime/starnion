"""gRPC server implementing AgentService."""

import logging
import sys

import grpc
from grpc import aio

# The generated stubs live under `jiki_agent/generated/jiki/v1`.
# We add the generated root to sys.path so the internal import
# `from jiki.v1 import agent_pb2` used by grpc_tools works correctly.
from pathlib import Path

_generated_root = str(Path(__file__).resolve().parent.parent / "generated")
if _generated_root not in sys.path:
    sys.path.insert(0, _generated_root)

from jiki.v1 import agent_pb2, agent_pb2_grpc  # noqa: E402

from jiki_agent.context import set_current_user
from jiki_agent.db.pool import get_pool
from jiki_agent.db.repositories import profile as profile_repo
from jiki_agent.tools.goal import evaluate_goals, generate_goal_status
from jiki_agent.tools.pattern import analyze_patterns, generate_pattern_insight
from jiki_agent.tools.report import (
    generate_daily_summary,
    generate_monthly_closing,
    generate_weekly_report,
)

logger = logging.getLogger(__name__)


class AgentServiceServicer(agent_pb2_grpc.AgentServiceServicer):
    """Concrete implementation of the AgentService gRPC interface."""

    def __init__(self, agent):
        self._agent = agent

    async def Chat(self, request, context):
        """Handle a unary Chat request."""
        user_id = request.user_id
        message = request.message

        if not user_id or not message:
            context.set_code(grpc.StatusCode.INVALID_ARGUMENT)
            context.set_details("user_id and message are required")
            return agent_pb2.ChatResponse(
                content="user_id and message are required",
                type=agent_pb2.ERROR,
            )

        set_current_user(user_id)

        try:
            pool = get_pool()
            await profile_repo.upsert(pool, telegram_id=user_id, user_name="")

            # Build human message, optionally with file input.
            human_parts: list = [message] if message else []
            file_input = request.file
            if file_input and file_input.file_url:
                file_text = (
                    f"[파일 첨부: type={file_input.file_type}, "
                    f"name={file_input.file_name}, "
                    f"url={file_input.file_url}]"
                )
                if not human_parts:
                    human_parts.append(file_text)
                else:
                    human_parts.append(file_text)

            combined_message = "\n".join(human_parts) if human_parts else message

            result = await self._invoke_agent(combined_message, user_id)

            raw_content = result["messages"][-1].content
            # Gemini may return content as a list of blocks; flatten to string.
            if isinstance(raw_content, list):
                content = "\n".join(
                    block.get("text", str(block)) if isinstance(block, dict) else str(block)
                    for block in raw_content
                )
            else:
                content = str(raw_content)
            return agent_pb2.ChatResponse(
                content=content,
                type=agent_pb2.TEXT,
            )
        except Exception:
            logger.exception("Error processing chat for user %s", user_id)
            return agent_pb2.ChatResponse(
                content="잠시 서비스에 문제가 있어요. 잠시 후 다시 시도해 주세요.",
                type=agent_pb2.ERROR,
            )

    async def _invoke_agent(self, message: str, thread_id: str):
        """Invoke agent with automatic history reset on corrupted state."""
        try:
            return await self._agent.ainvoke(
                {"messages": [("human", message)]},
                config={"configurable": {"thread_id": thread_id}},
            )
        except ValueError as e:
            if "tool_calls" in str(e) and "ToolMessage" in str(e):
                logger.warning(
                    "Corrupted chat history for thread %s, resetting", thread_id,
                )
                await self._clear_checkpoints(thread_id)
                return await self._agent.ainvoke(
                    {"messages": [("human", message)]},
                    config={"configurable": {"thread_id": thread_id}},
                )
            raise

    @staticmethod
    async def _clear_checkpoints(thread_id: str) -> None:
        """Remove all checkpoint data for a thread to reset conversation."""
        pool = get_pool()
        async with pool.connection() as conn:
            for table in ("checkpoint_writes", "checkpoint_blobs", "checkpoints"):
                await conn.execute(
                    f"DELETE FROM {table} WHERE thread_id = %s",  # noqa: S608
                    (thread_id,),
                )
            await conn.commit()
        logger.info("Cleared checkpoints for thread %s", thread_id)

    async def GenerateReport(self, request, context):
        """Generate a periodic report for the user."""
        user_id = request.user_id
        report_type = request.report_type or "weekly"

        if not user_id:
            context.set_code(grpc.StatusCode.INVALID_ARGUMENT)
            context.set_details("user_id is required")
            return agent_pb2.ReportResponse()

        set_current_user(user_id)

        try:
            if report_type == "weekly":
                content = await generate_weekly_report(user_id)
            elif report_type == "daily_summary":
                content = await generate_daily_summary(user_id)
            elif report_type == "monthly_closing":
                content = await generate_monthly_closing(user_id)
            elif report_type == "pattern_analysis":
                content = await analyze_patterns(user_id)
            elif report_type == "pattern_insight":
                content = await generate_pattern_insight(user_id)
            elif report_type == "goal_evaluate":
                content = await evaluate_goals(user_id)
            elif report_type == "goal_status":
                content = await generate_goal_status(user_id)
            else:
                content = await generate_weekly_report(user_id)

            return agent_pb2.ReportResponse(
                content=content,
                report_type=report_type,
            )
        except Exception:
            logger.exception("Error generating %s report for user %s", report_type, user_id)
            return agent_pb2.ReportResponse(
                content="리포트 생성 중 오류가 발생했어요.",
                report_type=report_type,
            )


async def serve(agent, port: int = 50051) -> None:
    """Start the async gRPC server."""
    server = aio.server()
    agent_pb2_grpc.add_AgentServiceServicer_to_server(
        AgentServiceServicer(agent), server,
    )
    listen_addr = f"[::]:{port}"
    server.add_insecure_port(listen_addr)

    logger.info("gRPC server starting on %s", listen_addr)
    await server.start()
    logger.info("gRPC server started on %s", listen_addr)
    await server.wait_for_termination()
