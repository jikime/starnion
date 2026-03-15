"""Skill registry: catalog of all skills and their metadata.

Each skill is defined as a SkillDef with tools, reports, cron_rules,
and display info.  At startup, register_skills() upserts all entries
into the skills DB table.
"""

from dataclasses import dataclass, field

from starnion_agent.db.repositories import skill as skill_repo


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
        tools=["save_daily_log", "save_diary_entry"],
        reports=["conversation_analysis"],
        sort_order=3,
    ),
    "goals": SkillDef(
        id="goals",
        name="목표 관리",
        emoji="🎯",
        description="목표 설정, 추적, 달성도 평가",
        category="productivity",
        tools=["set_goal", "get_goals", "update_goal_status", "update_goal_progress"],
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
        description="과거 대화 및 문서 시맨틱 검색, 날짜별 일기·지출 타임라인 조회",
        category="core",
        tools=["retrieve_memory", "get_time_travel_insight", "search_by_tags", "compare_periods"],
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
    "briefing": SkillDef(
        id="briefing",
        name="부재중 브리핑",
        emoji="📋",
        description="이메일, 예산, 최근 관심 주제를 한 번에 요약해 브리핑합니다",
        category="notification",
        sort_order=9,
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
        tools=["analyze_image", "generate_image", "edit_image"],
        sort_order=10,
    ),
    "documents": SkillDef(
        id="documents",
        name="문서",
        emoji="📄",
        description="문서 파싱(PDF/DOCX/XLSX/PPTX/HWP/MD/TXT) 및 생성",
        category="media",
        tools=["parse_document", "generate_document", "check_document_status"],
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
            "google_calendar_create", "google_calendar_list", "google_calendar_delete",
            "google_docs_create", "google_docs_read",
            "google_tasks_create", "google_tasks_list", "google_tasks_complete", "google_tasks_delete",
            "google_drive_upload", "google_drive_list",
            "google_mail_send", "google_mail_list",
        ],
        enabled_by_default=False,
        permission_level=2,  # opt-in (OAuth2 required)
        sort_order=14,
    ),
    "notion": SkillDef(
        id="notion",
        name="노션 연동",
        emoji="📝",
        description="노션 페이지 검색, 생성, 읽기, 블록 추가",
        category="integration",
        tools=["notion_search", "notion_page_create", "notion_page_read", "notion_block_append"],
        enabled_by_default=False,
        permission_level=2,  # opt-in (API key required)
        sort_order=14,
    ),
    "github": SkillDef(
        id="github",
        name="GitHub 연동",
        emoji="🐙",
        description="저장소 조회, 이슈/PR 관리, 코드 검색",
        category="integration",
        tools=[
            "github_list_repos",
            "github_list_issues",
            "github_create_issue",
            "github_list_prs",
            "github_get_pr",
            "github_search_code",
        ],
        enabled_by_default=False,
        permission_level=2,  # opt-in (PAT required)
        sort_order=14,
    ),
    "websearch": SkillDef(
        id="websearch",
        name="웹 검색",
        emoji="🔍",
        description="인터넷 검색 및 웹페이지 정보 수집",
        category="information",
        tools=["web_search", "web_fetch"],
        sort_order=15,
    ),
    "weather": SkillDef(
        id="weather",
        name="날씨",
        emoji="🌤️",
        description="현재 날씨 및 일기예보 조회",
        category="information",
        tools=["get_weather", "get_forecast"],
        sort_order=16,
    ),
    "summarize": SkillDef(
        id="summarize",
        name="요약",
        emoji="📝",
        description="URL 웹페이지 또는 텍스트를 AI로 요약",
        category="information",
        tools=["summarize_url", "summarize_text"],
        sort_order=17,
    ),
    "translate": SkillDef(
        id="translate",
        name="번역",
        emoji="🌐",
        description="텍스트를 다국어로 번역 (한/영/일/중 등)",
        category="information",
        tools=["translate_text"],
        sort_order=18,
    ),
    "qrcode": SkillDef(
        id="qrcode",
        name="QR코드",
        emoji="🔲",
        description="QR 코드 이미지 생성",
        category="utility",
        tools=["generate_qrcode"],
        sort_order=19,
    ),
    "calculator": SkillDef(
        id="calculator",
        name="계산기",
        emoji="🧮",
        description="수학 수식 계산 (사칙연산, 함수, 상수)",
        category="utility",
        tools=["calculate"],
        sort_order=20,
    ),
    "reminder": SkillDef(
        id="reminder",
        name="알림",
        emoji="⏰",
        description="간편 알림 예약 및 관리",
        category="productivity",
        tools=["set_reminder", "list_reminders", "delete_reminder"],
        sort_order=21,
    ),
    "currency": SkillDef(
        id="currency",
        name="환율",
        emoji="💱",
        description="실시간 환율 조회 및 통화 변환",
        category="finance",
        tools=["convert_currency", "get_exchange_rate"],
        sort_order=22,
    ),
    "dday": SkillDef(
        id="dday",
        name="디데이",
        emoji="📆",
        description="중요한 날짜까지 남은 일수 추적",
        category="lifestyle",
        tools=["set_dday", "list_ddays", "delete_dday"],
        sort_order=23,
    ),
    "random": SkillDef(
        id="random",
        name="랜덤",
        emoji="🎲",
        description="랜덤 선택, 숫자 뽑기, 동전/주사위",
        category="utility",
        tools=["random_pick"],
        sort_order=24,
    ),
    "memo": SkillDef(
        id="memo",
        name="메모",
        emoji="🗒️",
        description="간편 메모 저장, 조회, 삭제",
        category="utility",
        tools=["save_memo", "list_memos", "delete_memo"],
        sort_order=25,
    ),
    "unitconv": SkillDef(
        id="unitconv",
        name="단위변환",
        emoji="📐",
        description="길이, 무게, 온도, 부피, 면적, 데이터 단위 변환",
        category="utility",
        tools=["convert_unit"],
        sort_order=26,
    ),
    "timezone": SkillDef(
        id="timezone",
        name="세계시간",
        emoji="🕐",
        description="세계 시간대 조회 및 변환",
        category="utility",
        tools=["get_world_time", "convert_timezone"],
        sort_order=27,
    ),
    "wordcount": SkillDef(
        id="wordcount",
        name="글자수",
        emoji="✏️",
        description="글자수, 단어수, 문장수 분석",
        category="utility",
        tools=["count_text"],
        sort_order=28,
    ),
    "encode": SkillDef(
        id="encode",
        name="인코딩",
        emoji="🔐",
        description="Base64, URL, HTML 인코딩/디코딩",
        category="utility",
        tools=["encode_decode"],
        sort_order=29,
    ),
    "hash": SkillDef(
        id="hash",
        name="해시",
        emoji="🔑",
        description="MD5, SHA256 등 해시값 생성",
        category="utility",
        tools=["generate_hash"],
        sort_order=30,
    ),
    "color": SkillDef(
        id="color",
        name="색상변환",
        emoji="🎨",
        description="HEX, RGB, HSL 색상 코드 변환",
        category="utility",
        tools=["convert_color"],
        sort_order=31,
    ),
    "horoscope": SkillDef(
        id="horoscope",
        name="운세",
        emoji="♈",
        description="오늘의 별자리 운세 조회",
        category="lifestyle",
        tools=["get_horoscope"],
        sort_order=32,
    ),
    "ip": SkillDef(
        id="ip",
        name="IP 조회",
        emoji="📡",
        description="IP 주소 위치, ISP 정보 조회",
        category="utility",
        tools=["lookup_ip"],
        sort_order=33,
    ),
    "browser": SkillDef(
        id="browser",
        name="브라우저 제어",
        emoji="🌐",
        description="웹 브라우저 자동화 — URL 탐색, 클릭, 입력, 스크린샷, 페이지 읽기",
        category="utility",
        tools=[
            "browser_open_screenshot",
            "browser_navigate",
            "browser_snapshot",
            "browser_screenshot",
            "browser_click",
            "browser_type",
            "browser_press",
            "browser_select",
            "browser_hover",
            "browser_scroll",
            "browser_evaluate",
            "browser_wait_for",
            "browser_wait_ms",
            "browser_get_text",
            "browser_current_url",
            "browser_close",
        ],
        enabled_by_default=True,
        permission_level=1,
        sort_order=34,
    ),
    "naver_search": SkillDef(
        id="naver_search",
        name="네이버 검색",
        emoji="🟢",
        description="네이버 검색 API — 쇼핑, 블로그, 뉴스, 책, 백과사전, 카페글, 지식iN, 지역, 웹문서, 전문자료",
        category="information",
        tools=["naver_search"],
        enabled_by_default=True,
        permission_level=2,
        sort_order=35,
    ),
    "coding_agent": SkillDef(
        id="coding_agent",
        name="코딩 에이전트",
        emoji="💻",
        description="Claude Code CLI로 코딩 작업을 위임합니다. 새 기능 구현, 리팩토링, 테스트 작성, README 생성에 사용하세요.",
        category="development",
        tools=["run_coding_agent"],
        enabled_by_default=False,
        permission_level=2,
        sort_order=36,
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
