"""Skill registry: catalog of all skills and their metadata.

Each skill is defined as a SkillDef with tools, reports, cron_rules,
and display info.  At startup, register_skills() upserts all entries
into the skills DB table.
"""

from dataclasses import dataclass, field

from jiki_agent.db.repositories import skill as skill_repo


@dataclass
class SkillDef:
    """Definition of a single skill."""

    id: str
    name: str
    description: str
    category: str
    emoji: str = ""
    tools: list[str] = field(default_factory=list)
    reports: list[str] = field(default_factory=list)
    cron_rules: list[str] = field(default_factory=list)
    enabled_by_default: bool = True
    permission_level: int = 1  # 0=system, 1=default, 2=opt-in, 3=admin
    sort_order: int = 0


SKILLS: dict[str, SkillDef] = {
    "finance": SkillDef(
        id="finance",
        name="가계부",
        emoji="💰",
        description="수입/지출 기록, 월간 리포트, 소비 분석",
        category="finance",
        tools=["save_finance", "get_monthly_total"],
        reports=["daily_summary", "weekly", "monthly_closing", "spending_anomaly"],
        sort_order=1,
    ),
    "budget": SkillDef(
        id="budget",
        name="예산 관리",
        emoji="📊",
        description="카테고리별 예산 설정 및 경고",
        category="finance",
        tools=["set_budget", "get_budget_status"],
        cron_rules=["budget_warning"],
        sort_order=2,
    ),
    "diary": SkillDef(
        id="diary",
        name="일기",
        emoji="📔",
        description="일상 기록, 감정 분석, 대화 분석",
        category="lifestyle",
        tools=["save_daily_log"],
        reports=["conversation_analysis"],
        sort_order=3,
    ),
    "goals": SkillDef(
        id="goals",
        name="목표 관리",
        emoji="🎯",
        description="목표 설정, 추적, 달성도 평가",
        category="productivity",
        tools=["set_goal", "get_goals", "update_goal_status"],
        reports=["goal_evaluate", "goal_status"],
        sort_order=4,
    ),
    "schedule": SkillDef(
        id="schedule",
        name="일정",
        emoji="📅",
        description="알림 일정 생성 및 관리",
        category="productivity",
        tools=["create_schedule", "list_schedules", "cancel_schedule"],
        cron_rules=["user_schedules"],
        sort_order=5,
    ),
    "memory": SkillDef(
        id="memory",
        name="기억",
        emoji="🧠",
        description="과거 대화 및 문서 시맨틱 검색",
        category="core",
        tools=["retrieve_memory"],
        sort_order=6,
    ),
    "pattern": SkillDef(
        id="pattern",
        name="패턴 분석",
        emoji="📈",
        description="지출/행동 패턴 자동 감지",
        category="analysis",
        reports=["pattern_analysis", "pattern_insight"],
        sort_order=7,
    ),
    "proactive": SkillDef(
        id="proactive",
        name="능동 알림",
        emoji="🔔",
        description="비활성 사용자 리마인더, 패턴 인사이트",
        category="notification",
        cron_rules=["inactive_reminder"],
        sort_order=8,
    ),
    "compaction": SkillDef(
        id="compaction",
        name="메모리 압축",
        emoji="🗜️",
        description="오래된 기록을 주간 요약으로 압축",
        category="system",
        reports=["memory_compaction"],
        enabled_by_default=True,
        permission_level=0,  # system — user cannot toggle
        sort_order=99,
    ),
    "image": SkillDef(
        id="image",
        name="이미지",
        emoji="🖼️",
        description="이미지 분석 (영수증, 사진, 스크린샷) 및 AI 이미지 생성",
        category="media",
        tools=["analyze_image", "generate_image"],
        sort_order=10,
    ),
    "documents": SkillDef(
        id="documents",
        name="문서",
        emoji="📄",
        description="문서 파싱(PDF/DOCX/XLSX/PPTX/HWP/MD/TXT) 및 생성",
        category="media",
        tools=["parse_document", "generate_document"],
        sort_order=11,
    ),
    "audio": SkillDef(
        id="audio",
        name="오디오",
        emoji="🎵",
        description="음성 인식 (STT) 및 음성 생성 (TTS)",
        category="media",
        tools=["transcribe_audio", "generate_audio"],
        sort_order=12,
    ),
    # --- Phase 2 stubs (opt-in, no tools yet) ---
    "video": SkillDef(
        id="video",
        name="비디오",
        emoji="🎬",
        description="비디오 분석 및 AI 슬라이드쇼 영상 생성",
        category="media",
        tools=["analyze_video", "generate_video"],
        enabled_by_default=False,
        permission_level=2,  # opt-in
        sort_order=13,
    ),
    "google": SkillDef(
        id="google",
        name="구글 연동",
        emoji="🔗",
        description="구글 캘린더, 문서, 태스크, 드라이브, 메일 연동",
        category="integration",
        tools=[
            "google_auth", "google_disconnect",
            "google_calendar_create", "google_calendar_list",
            "google_docs_create", "google_docs_read",
            "google_tasks_create", "google_tasks_list",
            "google_drive_upload", "google_drive_list",
            "google_mail_send", "google_mail_list",
        ],
        enabled_by_default=False,
        permission_level=2,  # opt-in (OAuth2 required)
        sort_order=14,
    ),
}

# tool_name -> skill_id reverse mapping (fast guard lookup)
_TOOL_TO_SKILL: dict[str, str] = {}
for _skill in SKILLS.values():
    for _tool_name in _skill.tools:
        _TOOL_TO_SKILL[_tool_name] = _skill.id


def get_skill_for_tool(tool_name: str) -> str | None:
    """Return the skill_id that owns the given tool, or None."""
    return _TOOL_TO_SKILL.get(tool_name)


async def register_skills(pool) -> None:
    """Upsert all skill definitions into the database."""
    await skill_repo.register_all(pool, SKILLS)
