"""Coding agent tool — delegates tasks to Claude Code SDK."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starnion_agent.context import get_current_user
from starnion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

_TIMEOUT = 120     # seconds per task
_MAX_OUTPUT = 4000  # chars — trim longer outputs before returning to LLM


def _ensure_workdir(user_id: str) -> str:
    """Return a per-user scratch directory (git-inited) under /tmp."""
    import subprocess

    work = Path("/tmp/starnion-coding") / user_id
    work.mkdir(parents=True, exist_ok=True)
    if not (work / ".git").exists():
        subprocess.run(["git", "init", "-q", str(work)], check=False)
    return str(work)


class CodingAgentInput(BaseModel):
    """Input schema for run_coding_agent tool."""

    task: str = Field(
        description=(
            "Describe the coding task in natural language in detail. "
            "Example: 'Create a todo CLI in Python with add/list/done commands', "
            "'Add pytest unit tests to the existing functions', "
            "'Write README.md with install instructions and usage examples'"
        )
    )
    workdir: str = Field(
        default="",
        description=(
            "Absolute path to the working directory. "
            "If empty, a per-user temp directory (/tmp/starnion-coding/{user_id}) "
            "is created automatically."
        ),
    )


@tool(args_schema=CodingAgentInput)
@skill_guard("coding_agent")
async def run_coding_agent(task: str, workdir: str = "") -> str:
    """Execute coding tasks using Claude Code SDK.

    Use for complex coding tasks that require reading and writing files:
    implementing new features, refactoring, writing unit tests, generating READMEs.
    Do not use for simple one-line edits or read-only code review.
    """
    try:
        from claude_code_sdk import ClaudeCodeOptions, query
    except ImportError:
        return (
            "❌ claude-code-sdk is not installed.\n"
            "Run: pip install claude-code-sdk"
        )

    user_id = get_current_user() or "anonymous"

    # Validate or create workdir
    if workdir:
        work_path = Path(workdir)
        if not work_path.exists():
            return f"❌ Working directory not found: `{workdir}`"
        if not work_path.is_dir():
            return f"❌ `{workdir}` is not a directory."
        resolved_workdir = str(work_path.resolve())
    else:
        resolved_workdir = _ensure_workdir(user_id)

    logger.info(
        "coding_agent: user=%s workdir=%s task_len=%d",
        user_id, resolved_workdir, len(task),
    )

    output_parts: list[str] = []

    try:
        async with asyncio.timeout(_TIMEOUT):
            async for event in query(
                prompt=task,
                options=ClaudeCodeOptions(
                    cwd=resolved_workdir,
                    permission_mode="acceptEdits",
                ),
            ):
                logger.debug("coding_agent event: %s", type(event).__name__)

                # Duck-typed extraction — works regardless of SDK version
                if hasattr(event, "content"):
                    # AssistantMessage-like: content is list[TextBlock | ...]
                    for block in event.content:
                        if hasattr(block, "text"):
                            output_parts.append(block.text)
                elif hasattr(event, "result"):
                    # ResultMessage-like
                    if getattr(event, "is_error", False) and not output_parts:
                        return f"❌ Task failed: {event.result or 'Unknown error'}"

    except asyncio.TimeoutError:
        return (
            f"⏱️ Task exceeded {_TIMEOUT}s and was cancelled.\n"
            "Try breaking it into smaller steps."
        )
    except Exception as e:
        err_type = type(e).__name__
        # Check well-known SDK error types by name (avoids version-specific imports)
        if err_type == "CLINotFoundError":
            return (
                "❌ Claude Code CLI is not installed.\n"
                "Run: npm install -g @anthropic-ai/claude-code"
            )
        if err_type == "ProcessError":
            exit_code = getattr(e, "exit_code", "?")
            stderr = getattr(e, "stderr", "") or ""
            return f"❌ Process error (exit {exit_code}):\n{stderr or str(e)}"
        logger.exception("run_coding_agent failed: %s: %s", err_type, e)
        return f"❌ Coding agent error ({err_type}): {e}"

    result = "".join(output_parts).strip()
    if not result:
        return "✅ Task completed. (no output)"

    if len(result) > _MAX_OUTPUT:
        result = result[:_MAX_OUTPUT] + f"\n\n… (output truncated at {_MAX_OUTPUT} chars)"

    return result
