"""Goal management tools and report functions.

Provides chat tools for users to create, view, and manage goals, plus
report functions for periodic goal evaluation and status notifications.
"""

import json
import logging
import re
import uuid
from calendar import monthrange
from datetime import datetime

from langchain_core.messages import HumanMessage
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

from jiki_agent.config import settings
from jiki_agent.context import get_current_user
from jiki_agent.db.pool import get_pool
from jiki_agent.db.repositories import finance as finance_repo
from jiki_agent.db.repositories import knowledge as knowledge_repo
from jiki_agent.db.repositories import profile as profile_repo
from jiki_agent.persona import DEFAULT_PERSONA, get_tone_instruction
from jiki_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

GOAL_KEY_PREFIX = "goal:"
MAX_ACTIVE_GOALS = 5


# --- Chat Tools (registered in LangGraph agent) ---


class SetGoalInput(BaseModel):
    """Input schema for set_goal tool."""

    title: str = Field(
        description="목표 설명 (예: '이번 달 식비 30만원 이내로 관리해줘')",
    )
    goal_type: str = Field(
        description="목표 유형: budget_limit(지출 제한), savings(저축), habit(습관)",
    )
    category: str = Field(
        default="",
        description="관련 카테고리 (예: 식비, 교통). 없으면 빈 문자열",
    )
    target_amount: int = Field(
        default=0,
        description="목표 금액 (원 단위). 없으면 0",
    )
    deadline: str = Field(
        default="",
        description="마감일 (YYYY-MM-DD). 빈 문자열이면 이번 달 말일",
    )


class GetGoalsInput(BaseModel):
    """Input schema for get_goals tool."""

    include_completed: bool = Field(
        default=False,
        description="완료/취소된 목표도 포함할지 여부",
    )


class UpdateGoalStatusInput(BaseModel):
    """Input schema for update_goal_status tool."""

    goal_id: str = Field(
        description="목표 ID (예: a1b2c3d4)",
    )
    new_status: str = Field(
        description="새 상태: completed(달성) 또는 cancelled(취소)",
    )


@tool(args_schema=SetGoalInput)
@skill_guard("goals")
async def set_goal(
    title: str,
    goal_type: str,
    category: str = "",
    target_amount: int = 0,
    deadline: str = "",
) -> str:
    """재정 목표를 설정합니다. 목표를 설정하면 매일 진행 상황을 평가하고, 매주 수요일에 진행률 리포트를 보내드립니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    pool = get_pool()

    # Check active goal limit.
    existing = await knowledge_repo.get_by_key_prefix(pool, user_id, GOAL_KEY_PREFIX)
    active_count = sum(
        1
        for e in existing
        if _parse_goal_json(e["value"]).get("status") == "active"
    )
    if active_count >= MAX_ACTIVE_GOALS:
        return f"활성 목표는 최대 {MAX_ACTIVE_GOALS}개까지 설정할 수 있어요. 기존 목표를 완료하거나 취소한 후 다시 시도해 주세요."

    # Generate goal ID.
    goal_id = uuid.uuid4().hex[:8]

    # Default deadline to end of current month.
    now = datetime.now()
    if not deadline:
        last_day = monthrange(now.year, now.month)[1]
        deadline = now.replace(day=last_day).strftime("%Y-%m-%d")

    goal_data = {
        "title": title,
        "type": goal_type,
        "target": {
            "category": category,
            "amount": target_amount,
            "period": "monthly",
        },
        "status": "active",
        "created_at": now.isoformat(timespec="seconds"),
        "deadline": f"{deadline}T23:59:59",
        "last_evaluation": None,
    }

    await knowledge_repo.upsert(
        pool,
        user_id=user_id,
        key=f"{GOAL_KEY_PREFIX}{goal_id}",
        value=json.dumps(goal_data, ensure_ascii=False),
        source="user_chat",
    )

    lines = [
        f"목표를 설정했어요! '{title}'",
        f"목표 ID: {goal_id}",
        f"마감일: {deadline}",
        "",
        "매일 진행 상황을 체크하고, 매주 수요일에 진행률 리포트를 보내드릴게요.",
    ]
    return "\n".join(lines)


@tool(args_schema=GetGoalsInput)
@skill_guard("goals")
async def get_goals(include_completed: bool = False) -> str:
    """설정한 목표 목록을 조회합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    pool = get_pool()
    entries = await knowledge_repo.get_by_key_prefix(pool, user_id, GOAL_KEY_PREFIX)

    if not entries:
        return "설정된 목표가 없어요. 목표를 설정해 보세요!"

    lines = []
    for entry in entries:
        goal = _parse_goal_json(entry["value"])
        if not goal:
            continue
        status = goal.get("status", "unknown")
        if not include_completed and status != "active":
            continue

        goal_id = entry["key"].replace(GOAL_KEY_PREFIX, "")
        title = goal.get("title", "")
        deadline = goal.get("deadline", "")[:10]

        status_label = {"active": "진행중", "completed": "달성", "cancelled": "취소", "expired": "만료"}.get(status, status)
        line = f"[{status_label}] {title} (ID: {goal_id})"

        target = goal.get("target", {})
        if target.get("amount"):
            line += f"\n  목표: {target['amount']:,}원"
        if target.get("category"):
            line += f" ({target['category']})"
        line += f"\n  마감일: {deadline}"

        last_eval = goal.get("last_evaluation")
        if last_eval:
            verdict_label = {
                "on_track": "순조로움",
                "warning": "주의",
                "critical": "위험",
                "achieved": "달성",
            }.get(last_eval.get("verdict", ""), "")
            progress = last_eval.get("progress_pct", 0)
            line += f"\n  진행률: {progress}% ({verdict_label})"
            if last_eval.get("summary"):
                line += f"\n  {last_eval['summary']}"

        lines.append(line)

    if not lines:
        return "활성 목표가 없어요."

    return "\n\n".join(lines)


@tool(args_schema=UpdateGoalStatusInput)
@skill_guard("goals")
async def update_goal_status(goal_id: str, new_status: str) -> str:
    """목표를 완료(completed) 또는 취소(cancelled) 처리합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    if new_status not in ("completed", "cancelled"):
        return "상태는 completed(달성) 또는 cancelled(취소)만 가능해요."

    pool = get_pool()
    key = f"{GOAL_KEY_PREFIX}{goal_id}"
    entry = await knowledge_repo.get_by_key(pool, user_id, key)

    if not entry:
        return f"목표 ID '{goal_id}'를 찾을 수 없어요."

    goal = _parse_goal_json(entry["value"])
    if not goal:
        return "목표 데이터를 읽을 수 없어요."

    if goal.get("status") != "active":
        return f"이 목표는 이미 '{goal.get('status')}' 상태예요."

    goal["status"] = new_status

    await knowledge_repo.delete_by_key(pool, user_id, key)
    await knowledge_repo.upsert(
        pool,
        user_id=user_id,
        key=key,
        value=json.dumps(goal, ensure_ascii=False),
        source="user_chat",
    )

    status_label = "달성" if new_status == "completed" else "취소"
    return f"'{goal.get('title', '')}' 목표를 {status_label} 처리했어요."


# --- Report Functions (called via gRPC, NOT @tool) ---


async def evaluate_goals(user_id: str) -> str:
    """Evaluate progress on all active goals and update last_evaluation."""
    pool = get_pool()
    entries = await knowledge_repo.get_by_key_prefix(pool, user_id, GOAL_KEY_PREFIX)

    active_goals = []
    for entry in entries:
        goal = _parse_goal_json(entry["value"])
        if goal and goal.get("status") == "active":
            active_goals.append((entry["key"], goal))

    if not active_goals:
        return "활성 목표 없음"

    # Check for expired goals.
    now = datetime.now()
    for key, goal in active_goals:
        deadline_str = goal.get("deadline", "")
        if deadline_str:
            try:
                deadline_dt = datetime.fromisoformat(deadline_str)
                if now > deadline_dt:
                    goal["status"] = "expired"
                    await knowledge_repo.delete_by_key(pool, user_id, key)
                    await knowledge_repo.upsert(
                        pool,
                        user_id=user_id,
                        key=key,
                        value=json.dumps(goal, ensure_ascii=False),
                        source="goal_evaluator",
                    )
            except ValueError:
                pass

    # Filter to still-active goals after expiry check.
    active_goals = [(k, g) for k, g in active_goals if g.get("status") == "active"]
    if not active_goals:
        return "모든 목표 만료 처리됨"

    # Gather spending data for evaluation.
    month = now.strftime("%Y-%m")
    monthly = await finance_repo.get_monthly_summary(pool, user_id=user_id, month=month)
    daily_totals = await finance_repo.get_daily_totals(pool, user_id, days=30)

    profile = await profile_repo.get_by_uuid_id(pool, uuid_id=user_id)
    budget = {}
    if profile:
        preferences = profile.get("preferences", {}) or {}
        budget = preferences.get("budget", {})

    # Build data summary for LLM.
    data_summary = _build_evaluation_data(active_goals, monthly, daily_totals, budget, now)

    # Call LLM for structured evaluation.
    llm = ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=settings.gemini_api_key,
    )

    prompt = _build_evaluation_prompt(data_summary)
    response = await llm.ainvoke([HumanMessage(content=prompt)])

    # Parse and apply evaluations.
    evaluations = _extract_json(response.content)
    if not evaluations or "evaluations" not in evaluations:
        logger.warning("Failed to parse goal evaluation for user %s", user_id)
        return "목표 평가 결과를 파싱할 수 없었습니다."

    verdict_counts: dict[str, int] = {}
    for eval_item in evaluations["evaluations"]:
        eval_goal_id = eval_item.get("goal_id", "")
        target_key = f"{GOAL_KEY_PREFIX}{eval_goal_id}"

        for key, goal in active_goals:
            if key != target_key:
                continue

            goal["last_evaluation"] = {
                "date": now.strftime("%Y-%m-%d"),
                "progress_pct": eval_item.get("progress_pct", 0),
                "summary": eval_item.get("summary", ""),
                "verdict": eval_item.get("verdict", "on_track"),
            }

            await knowledge_repo.delete_by_key(pool, user_id, key)
            await knowledge_repo.upsert(
                pool,
                user_id=user_id,
                key=key,
                value=json.dumps(goal, ensure_ascii=False),
                source="goal_evaluator",
            )

            verdict = eval_item.get("verdict", "on_track")
            verdict_counts[verdict] = verdict_counts.get(verdict, 0) + 1
            break

    summary_parts = [f"{v}: {c}" for v, c in sorted(verdict_counts.items())]
    return f"{len(active_goals)}개 목표 평가 완료: {', '.join(summary_parts)}"


async def generate_goal_status(user_id: str) -> str:
    """Generate a weekly goal progress notification."""
    pool = get_pool()
    entries = await knowledge_repo.get_by_key_prefix(pool, user_id, GOAL_KEY_PREFIX)

    active_goals = []
    for entry in entries:
        goal = _parse_goal_json(entry["value"])
        if goal and goal.get("status") == "active":
            active_goals.append((entry["key"], goal))

    if not active_goals:
        return ""

    # Current spending context.
    now = datetime.now()
    month = now.strftime("%Y-%m")
    monthly = await finance_repo.get_monthly_summary(pool, user_id=user_id, month=month)

    profile = await profile_repo.get_by_uuid_id(pool, uuid_id=user_id)
    budget = {}
    persona_id = DEFAULT_PERSONA
    if profile:
        preferences = profile.get("preferences", {}) or {}
        budget = preferences.get("budget", {})
        persona_id = preferences.get("persona", DEFAULT_PERSONA)

    # Build prompt and generate status notification.
    llm = ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=settings.gemini_api_key,
    )

    prompt = _build_status_prompt(active_goals, monthly, budget, now, persona_id)
    response = await llm.ainvoke([HumanMessage(content=prompt)])
    return response.content


# --- Private helpers ---


def _parse_goal_json(value: str) -> dict:
    """Safely parse a goal JSON string."""
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return {}


def _build_evaluation_data(
    goals: list[tuple[str, dict]],
    monthly: list[dict],
    daily_totals: list[dict],
    budget: dict,
    now: datetime,
) -> str:
    """Build a text summary for the LLM goal evaluation prompt."""
    lines: list[str] = []

    lines.append("[활성 목표]")
    for key, goal in goals:
        goal_id = key.replace(GOAL_KEY_PREFIX, "")
        target = goal.get("target", {})
        lines.append(f"  ID: {goal_id}")
        lines.append(f"  제목: {goal.get('title', '')}")
        lines.append(f"  유형: {goal.get('type', '')}")
        if target.get("category"):
            lines.append(f"  카테고리: {target['category']}")
        if target.get("amount"):
            lines.append(f"  목표 금액: {target['amount']:,}원")
        lines.append(f"  마감일: {goal.get('deadline', '')[:10]}")
        lines.append("")

    lines.append("[이번 달 카테고리별 지출]")
    if monthly:
        for m in monthly:
            lines.append(f"  {m['category']}: {m['total']:,}원")
    else:
        lines.append("  기록 없음")

    lines.append("\n[최근 일별 지출]")
    for d in daily_totals[:10]:
        lines.append(f"  {d['date']}: {d['total']:,}원")

    if budget:
        lines.append("\n[예산 현황]")
        monthly_by_cat = {r["category"]: r["total"] for r in monthly} if monthly else {}
        for cat, amt in budget.items():
            spent = monthly_by_cat.get(cat, 0)
            pct = (spent / amt * 100) if amt > 0 else 0
            lines.append(f"  {cat}: {spent:,}원 / {amt:,}원 ({pct:.0f}%)")

    lines.append(f"\n[현재 날짜] {now.strftime('%Y-%m-%d %A')}")
    _, last_day = monthrange(now.year, now.month)
    days_left = last_day - now.day
    lines.append(f"[이번 달 남은 일수] {days_left}일")

    return "\n".join(lines)


def _build_evaluation_prompt(data_summary: str) -> str:
    """Build the LLM prompt for structured goal evaluation."""
    return (
        "당신은 재정 목표 평가 전문가입니다. "
        "사용자의 활성 목표와 현재 지출 데이터를 분석하여 각 목표의 진행 상황을 평가하세요.\n\n"
        "반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):\n"
        "```json\n"
        "{\n"
        '  "evaluations": [\n'
        "    {\n"
        '      "goal_id": "목표 ID",\n'
        '      "progress_pct": 45,\n'
        '      "verdict": "on_track | warning | critical | achieved",\n'
        '      "summary": "한국어 요약 (1-2문장)"\n'
        "    }\n"
        "  ]\n"
        "}\n"
        "```\n\n"
        "verdict 기준:\n"
        "- on_track: 현재 페이스로 목표 달성 가능\n"
        "- warning: 주의 필요 (목표 대비 70-90% 사용 또는 페이스 빠름)\n"
        "- critical: 위험 (목표 초과 임박 또는 이미 초과)\n"
        "- achieved: 목표 달성 완료\n\n"
        "progress_pct 계산:\n"
        "- budget_limit: (현재 지출 / 목표 금액) * 100 (낮을수록 좋음)\n"
        "- savings: (절약된 금액 / 목표 금액) * 100 (높을수록 좋음)\n"
        "- habit: 관련 행동 변화 정도 (0-100)\n\n"
        f"데이터:\n{data_summary}"
    )


def _build_status_prompt(
    goals: list[tuple[str, dict]],
    monthly: list[dict],
    budget: dict,
    now: datetime,
    persona_id: str = DEFAULT_PERSONA,
) -> str:
    """Build the LLM prompt for generating a goal status notification."""
    lines: list[str] = []

    lines.append("[목표 진행 상황]")
    for key, goal in goals:
        goal_id = key.replace(GOAL_KEY_PREFIX, "")
        title = goal.get("title", "")
        target = goal.get("target", {})
        last_eval = goal.get("last_evaluation")

        lines.append(f"  {title} (ID: {goal_id})")
        if target.get("amount"):
            lines.append(f"    목표: {target['amount']:,}원 ({target.get('category', '')})")
        lines.append(f"    마감일: {goal.get('deadline', '')[:10]}")
        if last_eval:
            lines.append(f"    진행률: {last_eval.get('progress_pct', 0)}%")
            lines.append(f"    판정: {last_eval.get('verdict', '')}")
            lines.append(f"    요약: {last_eval.get('summary', '')}")
        else:
            lines.append("    아직 평가 전")
        lines.append("")

    if monthly:
        lines.append("[이번 달 지출]")
        for m in monthly:
            lines.append(f"  {m['category']}: {m['total']:,}원")

    if budget and monthly:
        lines.append("\n[예산 현황]")
        monthly_by_cat = {r["category"]: r["total"] for r in monthly}
        for cat, amt in budget.items():
            spent = monthly_by_cat.get(cat, 0)
            pct = (spent / amt * 100) if amt > 0 else 0
            lines.append(f"  {cat}: {spent:,}원 / {amt:,}원 ({pct:.0f}%)")

    _, last_day = monthrange(now.year, now.month)
    days_left = last_day - now.day
    lines.append(f"\n[현재] {now.strftime('%Y-%m-%d %A')}, 이번 달 남은 일수: {days_left}일")

    data_summary = "\n".join(lines)

    tone = get_tone_instruction(persona_id)

    return (
        f"당신은 개인 재정 AI 비서 '지기'입니다.\n{tone}\n\n"
        "사용자의 목표 진행 상황을 바탕으로 주간 진행률 리포트를 작성해주세요.\n\n"
        "포함할 내용:\n"
        "1. 각 활성 목표의 진행률과 현재 상태\n"
        "2. 잘 진행되고 있는 목표에 대한 격려\n"
        "3. 주의가 필요한 목표에 대한 구체적 제안\n"
        "4. 다음 주를 위한 실행 가능한 팁\n\n"
        "길이: 3-5문장으로 간결하게. 이모지 적절히 1-2개 사용.\n\n"
        f"데이터:\n{data_summary}"
    )


def _extract_json(text: str) -> dict | None:
    """Extract JSON from LLM response, handling markdown code blocks."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    return None
