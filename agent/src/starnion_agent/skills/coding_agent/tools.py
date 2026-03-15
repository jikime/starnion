"""Coding agent tool — delegates tasks to Claude Code CLI subprocess."""

from __future__ import annotations

import asyncio
import logging
import shutil
from pathlib import Path

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starnion_agent.context import get_current_user
from starnion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

_DEFAULT_TIMEOUT = 120  # seconds
_MAX_OUTPUT = 4000       # chars — trim longer outputs before returning to LLM


def _ensure_workdir(user_id: str) -> str:
    """Return a per-user scratch directory (git-inited) under /tmp."""
    work = Path("/tmp/starnion-coding") / user_id
    work.mkdir(parents=True, exist_ok=True)
    if not (work / ".git").exists():
        import subprocess
        subprocess.run(["git", "init", "-q", str(work)], check=False)
    return str(work)


# ---------------------------------------------------------------------------
# Input schemas
# ---------------------------------------------------------------------------
class CodingAgentInput(BaseModel):
    """Input schema for run_coding_agent tool."""

    task: str = Field(
        description=(
            "수행할 코딩 작업을 자연어로 상세히 설명하세요. "
            "예: 'Python으로 할일 관리 CLI를 만들어줘', "
            "'이 함수에 단위 테스트를 추가해줘', "
            "'README.md를 작성해줘'"
        )
    )
    workdir: str = Field(
        default="",
        description=(
            "작업할 디렉토리의 절대 경로. "
            "비워두면 사용자 전용 임시 디렉토리(/tmp/starnion-coding/{user_id})를 자동 생성합니다."
        ),
    )


# ---------------------------------------------------------------------------
# Tool
# ---------------------------------------------------------------------------
@tool(args_schema=CodingAgentInput)
@skill_guard("coding_agent")
async def run_coding_agent(task: str, workdir: str = "") -> str:
    """Claude Code CLI로 코딩 작업을 실행합니다.

    새 기능 구현, 코드 리팩토링, 단위 테스트 작성, README 생성 등
    파일 시스템을 탐색하고 수정해야 하는 복잡한 코딩 작업에 사용합니다.
    간단한 한 줄 수정이나 코드 읽기만 할 때는 사용하지 마세요.
    """
    user_id = get_current_user() or "anonymous"

    # Validate or create workdir
    if workdir:
        work_path = Path(workdir)
        if not work_path.exists():
            return f"❌ 작업 디렉토리를 찾을 수 없어요: `{workdir}`"
        if not work_path.is_dir():
            return f"❌ `{workdir}`는 디렉토리가 아니에요."
        resolved_workdir = str(work_path.resolve())
    else:
        resolved_workdir = _ensure_workdir(user_id)

    # Verify claude CLI is available
    if not shutil.which("claude"):
        return (
            "❌ Claude Code CLI가 설치되어 있지 않아요.\n"
            "`npm install -g @anthropic-ai/claude-code` 로 설치한 후 사용해주세요."
        )

    cmd = [
        "claude",
        "--permission-mode", "bypassPermissions",
        "--print",
        task,
    ]

    logger.info(
        "coding_agent: user=%s workdir=%s task_len=%d",
        user_id, resolved_workdir, len(task),
    )

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=resolved_workdir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=_DEFAULT_TIMEOUT
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            return (
                f"⏱️ 작업이 {_DEFAULT_TIMEOUT}초를 초과해서 중단됐어요.\n"
                "더 작은 단위로 나눠서 시도해보세요."
            )

        output = stdout.decode("utf-8", errors="replace").strip()
        err_output = stderr.decode("utf-8", errors="replace").strip()

        if proc.returncode != 0 and not output:
            msg = err_output or "알 수 없는 오류가 발생했어요."
            return f"❌ 실행 오류 (exit {proc.returncode}):\n{msg}"

        result = output or err_output or "✅ 작업이 완료됐어요. (출력 없음)"

        if len(result) > _MAX_OUTPUT:
            result = result[:_MAX_OUTPUT] + f"\n\n… (출력이 길어 {_MAX_OUTPUT}자에서 잘렸어요)"

        return result

    except Exception:
        logger.debug("run_coding_agent failed", exc_info=True)
        return "❌ 코딩 에이전트 실행 중 오류가 발생했어요. 잠시 후 다시 시도해주세요."
