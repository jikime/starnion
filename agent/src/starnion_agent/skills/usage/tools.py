"""Usage query tool — lets the LLM answer questions about the user's AI usage."""

from __future__ import annotations

import logging

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starnion_agent.context import get_current_user
from starnion_agent.db.pool import get_pool
from starnion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Input schema
# ---------------------------------------------------------------------------

class UsageSummaryInput(BaseModel):
    days: int = Field(
        default=30,
        ge=1,
        le=90,
        description="조회할 기간 (일 수, 1~90, 기본 30)",
    )
    mode: str = Field(
        default="summary",
        description=(
            "조회 모드: "
            "'summary' — 전체 요약 (요청 수, 토큰, 비용, 성공률) | "
            "'model' — 모델별 사용량 분석 | "
            "'daily' — 일별 사용량 추이"
        ),
    )


# ---------------------------------------------------------------------------
# Tool
# ---------------------------------------------------------------------------

@tool(args_schema=UsageSummaryInput)
@skill_guard("usage")
async def get_usage_summary(days: int = 30, mode: str = "summary") -> str:
    """AI 사용량 통계를 조회합니다.

    summary: 전체 요약 (요청 수, 토큰, 비용, 성공률)
    model: 모델별 사용량 및 비용 분석
    daily: 일별 사용량 추이 (최대 30일)
    """
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    days = max(1, min(days, 90))
    mode = mode.strip().lower()
    if mode not in ("summary", "model", "daily"):
        mode = "summary"

    try:
        from psycopg.rows import dict_row

        pool = get_pool()
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:

                if mode == "summary":
                    await cur.execute(
                        """
                        SELECT
                            COUNT(*)                                        AS total_requests,
                            COALESCE(SUM(input_tokens + output_tokens), 0)  AS total_tokens,
                            COALESCE(SUM(cached_tokens), 0)                 AS cached_tokens,
                            COALESCE(SUM(cost_usd), 0)                      AS total_cost,
                            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_count,
                            SUM(CASE WHEN status = 'error'   THEN 1 ELSE 0 END) AS error_count,
                            COUNT(DISTINCT model)                           AS model_count
                        FROM usage_logs
                        WHERE user_id = %s
                          AND created_at >= NOW() - (%s || ' days')::INTERVAL
                        """,
                        (user_id, str(days)),
                    )
                    row = await cur.fetchone()
                    if not row or row["total_requests"] == 0:
                        return f"최근 {days}일간 사용 기록이 없어요."

                    total = int(row["total_requests"])
                    tokens = int(row["total_tokens"])
                    cached = int(row["cached_tokens"])
                    cost = float(row["total_cost"])
                    success = int(row["success_count"])
                    errors = int(row["error_count"])
                    models = int(row["model_count"])
                    rate = round(success / total * 100, 1) if total else 0

                    lines = [
                        f"📊 **최근 {days}일 AI 사용 요약**",
                        f"",
                        f"요청 횟수: {total:,}회  (성공 {success:,} / 오류 {errors:,})",
                        f"성공률: {rate}%",
                        f"사용 토큰: {_fmt_tokens(tokens)}  (캐시 {_fmt_tokens(cached)})",
                        f"총 비용: ${cost:.4f}",
                        f"사용 모델 수: {models}가지",
                    ]
                    return "\n".join(lines)

                elif mode == "model":
                    await cur.execute(
                        """
                        SELECT
                            model,
                            provider,
                            COUNT(*)                                       AS requests,
                            COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens,
                            COALESCE(SUM(cost_usd), 0)                     AS cost
                        FROM usage_logs
                        WHERE user_id = %s
                          AND created_at >= NOW() - (%s || ' days')::INTERVAL
                        GROUP BY model, provider
                        ORDER BY cost DESC
                        LIMIT 10
                        """,
                        (user_id, str(days)),
                    )
                    rows = await cur.fetchall()
                    if not rows:
                        return f"최근 {days}일간 사용 기록이 없어요."

                    lines = [f"🤖 **최근 {days}일 모델별 사용량**", ""]
                    for i, r in enumerate(rows, 1):
                        model = r["model"]
                        provider = r["provider"] or "unknown"
                        reqs = int(r["requests"])
                        tokens = int(r["tokens"])
                        cost = float(r["cost"])
                        lines.append(
                            f"{i}. **{model}** ({provider})\n"
                            f"   요청 {reqs:,}회 · 토큰 {_fmt_tokens(tokens)} · ${cost:.4f}"
                        )
                    return "\n".join(lines)

                else:  # daily
                    daily_days = min(days, 30)
                    await cur.execute(
                        """
                        SELECT
                            DATE(created_at AT TIME ZONE 'UTC') AS day,
                            COUNT(*)                                       AS requests,
                            COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens,
                            COALESCE(SUM(cost_usd), 0)                     AS cost,
                            SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors
                        FROM usage_logs
                        WHERE user_id = %s
                          AND created_at >= NOW() - (%s || ' days')::INTERVAL
                        GROUP BY day
                        ORDER BY day DESC
                        LIMIT 30
                        """,
                        (user_id, str(daily_days)),
                    )
                    rows = await cur.fetchall()
                    if not rows:
                        return f"최근 {daily_days}일간 사용 기록이 없어요."

                    lines = [f"📅 **최근 {daily_days}일 일별 사용량**", ""]
                    for r in rows:
                        day = str(r["day"])
                        reqs = int(r["requests"])
                        tokens = int(r["tokens"])
                        cost = float(r["cost"])
                        errs = int(r["errors"])
                        err_str = f" ⚠️ 오류 {errs}" if errs else ""
                        lines.append(
                            f"**{day}**  요청 {reqs}회 · {_fmt_tokens(tokens)} · ${cost:.4f}{err_str}"
                        )
                    return "\n".join(lines)

    except Exception:
        logger.debug("get_usage_summary failed", exc_info=True)
        return "사용량 조회 중 오류가 발생했어요. 잠시 후 다시 시도해주세요."


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fmt_tokens(n: int) -> str:
    """Format token count as human-readable string."""
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return str(n)
