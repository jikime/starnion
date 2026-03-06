"""gRPC server implementing AgentService."""

import logging
import sys

import grpc
from grpc import aio

# The generated stubs live under `starpion_agent/generated/starpion/v1`.
# We add the generated root to sys.path so the internal import
# `from starpion.v1 import agent_pb2` used by grpc_tools works correctly.
from pathlib import Path

_generated_root = str(Path(__file__).resolve().parent.parent / "generated")
if _generated_root not in sys.path:
    sys.path.insert(0, _generated_root)

from starpion.v1 import agent_pb2, agent_pb2_grpc  # noqa: E402

from langchain_core.messages import HumanMessage

from starpion_agent.context import set_current_user
from starpion_agent.skills.file_context import init_pending_files, pop_pending_files
from starpion_agent.db.pool import get_pool
from starpion_agent.db.repositories import profile as profile_repo
from starpion_agent.skills.compaction.tools import compact_memory
from starpion_agent.skills.conversation.tools import analyze_conversation
from starpion_agent.skills.goals.tools import evaluate_goals, generate_goal_status
from starpion_agent.skills.pattern.tools import analyze_patterns, generate_pattern_insight
from starpion_agent.skills.report.tools import (
    generate_daily_summary,
    generate_monthly_closing,
    generate_weekly_report,
)

logger = logging.getLogger(__name__)


def _flatten_content(content) -> str:
    """Convert LangChain message content to a plain string.

    Gemini returns content as a list of blocks; other models return a string.
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            block.get("text", str(block)) if isinstance(block, dict) else str(block)
            for block in content
        )
    return str(content)


class AgentServiceServicer(agent_pb2_grpc.AgentServiceServicer):
    """Concrete implementation of the AgentService gRPC interface."""

    def __init__(self, agent):
        self._agent = agent

    @staticmethod
    def _build_message(request):
        """Build a LangChain message from a ChatRequest.

        For image files, returns a multimodal HumanMessage with an image_url
        content block so vision-capable models can analyze the image directly.
        For all other file types, appends a text annotation to the message.

        Returns either a (role, content) tuple or a HumanMessage instance —
        both are accepted by LangGraph as human turn inputs.
        """
        message = request.message
        file_input = request.file

        if not file_input or not file_input.file_url:
            return ("human", message)

        if file_input.file_type == "image":
            # True multimodal: pass the image URL directly to the LLM.
            content: list = []
            if message:
                content.append({"type": "text", "text": message})
            content.append({
                "type": "image_url",
                "image_url": {"url": file_input.file_url},
            })
            return HumanMessage(content=content)

        # Non-image files: append as text annotation.
        file_text = (
            f"[파일 첨부: type={file_input.file_type}, "
            f"name={file_input.file_name}, "
            f"url={file_input.file_url}]"
        )
        combined = f"{message}\n{file_text}" if message else file_text
        return ("human", combined)

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
        init_pending_files()

        try:
            pool = get_pool()
            await profile_repo.upsert(pool, uuid_id=user_id, user_name="")

            human_input = self._build_message(request)
            thread_id = request.thread_id or user_id
            result = await self._invoke_agent(human_input, thread_id)

            raw_content = result["messages"][-1].content
            # Gemini may return content as a list of blocks; flatten to string.
            if isinstance(raw_content, list):
                content = "\n".join(
                    block.get("text", str(block)) if isinstance(block, dict) else str(block)
                    for block in raw_content
                )
            else:
                content = str(raw_content)

            # Include the first pending file (if any) in the unary response.
            files = pop_pending_files()
            logger.debug("Chat: pop_pending_files returned %d file(s)", len(files))
            if files:
                pf = files[0]
                return agent_pb2.ChatResponse(
                    content=content,
                    type=agent_pb2.FILE,
                    file_data=pf["data"],
                    file_name=pf["name"],
                    file_mime=pf["mime"],
                )
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

    async def ChatStream(self, request, context):  # noqa: ARG002
        """Handle a server-side streaming Chat request.

        Streams token-level events from the LangGraph agent back to the
        client using ``astream_events(version="v2")``.
        """
        user_id = request.user_id
        message = request.message

        if not user_id or not message:
            yield agent_pb2.ChatResponse(
                content="user_id and message are required",
                type=agent_pb2.ERROR,
            )
            return

        set_current_user(user_id)
        init_pending_files()

        try:
            pool = get_pool()
            await profile_repo.upsert(pool, uuid_id=user_id, user_name="")

            human_input = self._build_message(request)
            thread_id = request.thread_id or user_id
            config = {"configurable": {"thread_id": thread_id}}
            input_data = {"messages": [human_input]}

            async for event in self._agent.astream_events(
                input_data, config=config, version="v2",
            ):
                kind = event["event"]

                if kind == "on_chat_model_stream":
                    chunk = event["data"]["chunk"]
                    token = ""
                    if hasattr(chunk, "content"):
                        raw = chunk.content
                        if isinstance(raw, str):
                            token = raw
                        elif isinstance(raw, list):
                            token = "".join(
                                b.get("text", str(b)) if isinstance(b, dict) else str(b)
                                for b in raw
                            )
                    if token:
                        yield agent_pb2.ChatResponse(
                            content=token,
                            type=agent_pb2.TEXT,
                        )

                elif kind == "on_tool_start":
                    tool_name = event.get("name", "")
                    logger.info("tool_call: %s", tool_name)
                    print(f"[tool_call] {tool_name}", flush=True)
                    yield agent_pb2.ChatResponse(
                        content="",
                        type=agent_pb2.TOOL_CALL,
                        tool_name=tool_name,
                    )

                elif kind == "on_tool_end":
                    output = str(event["data"].get("output", ""))[:500]
                    yield agent_pb2.ChatResponse(
                        content="",
                        type=agent_pb2.TOOL_RESULT,
                        tool_result=output,
                    )

            # Emit any pending file responses before closing the stream.
            for pf in pop_pending_files():
                yield agent_pb2.ChatResponse(
                    type=agent_pb2.FILE,
                    file_data=pf["data"],
                    file_name=pf["name"],
                    file_mime=pf["mime"],
                )

            yield agent_pb2.ChatResponse(
                content="",
                type=agent_pb2.STREAM_END,
            )

        except Exception:
            logger.exception("Stream error for user %s", user_id)
            pop_pending_files()  # Discard pending files on error.
            yield agent_pb2.ChatResponse(
                content="잠시 서비스에 문제가 있어요. 잠시 후 다시 시도해 주세요.",
                type=agent_pb2.ERROR,
            )

    async def _invoke_agent(self, message, thread_id: str):
        """Invoke agent with automatic history reset on corrupted state.

        ``message`` can be a ``("human", text)`` tuple or a ``HumanMessage``
        instance (used for multimodal inputs).
        """
        config = {"configurable": {"thread_id": thread_id}}
        try:
            return await self._agent.ainvoke(
                {"messages": [message]},
                config=config,
            )
        except ValueError as e:
            if "tool_calls" in str(e) and "ToolMessage" in str(e):
                logger.warning(
                    "Corrupted chat history for thread %s, resetting", thread_id,
                )
                await self._clear_checkpoints(thread_id)
                return await self._agent.ainvoke(
                    {"messages": [message]},
                    config=config,
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

    async def GetHistory(self, request, context):  # noqa: ARG002
        """Return prior messages for a conversation thread.

        Uses LangGraph ``aget_state`` to retrieve the persisted message list
        and returns only HumanMessage / AIMessage pairs (tool messages skipped).
        """
        thread_id = request.thread_id
        if not thread_id:
            context.set_code(grpc.StatusCode.INVALID_ARGUMENT)
            context.set_details("thread_id is required")
            return agent_pb2.HistoryResponse()

        try:
            state = await self._agent.aget_state(
                {"configurable": {"thread_id": thread_id}},
            )
            messages = state.values.get("messages", []) if state.values else []

            history: list[agent_pb2.HistoryMessage] = []
            for msg in messages:
                role = type(msg).__name__  # HumanMessage, AIMessage, ToolMessage…
                if role == "HumanMessage":
                    content = _flatten_content(msg.content)
                    if content:
                        history.append(agent_pb2.HistoryMessage(role="user", content=content))
                elif role == "AIMessage":
                    content = _flatten_content(msg.content)
                    if content:
                        history.append(agent_pb2.HistoryMessage(role="assistant", content=content))
                # ToolMessage / AIMessageChunk are skipped

            return agent_pb2.HistoryResponse(messages=history)

        except Exception:
            logger.exception("GetHistory failed for thread %s", thread_id)
            return agent_pb2.HistoryResponse()

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
            elif report_type == "conversation_analysis":
                content = await analyze_conversation(user_id)
            elif report_type == "memory_compaction":
                content = await compact_memory(user_id)
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
