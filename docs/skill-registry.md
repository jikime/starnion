# 스킬 레지스트리, 기능 토글, 권한 관리

## 개요

Telegram 봇의 기능을 "스킬" 단위로 관리하는 시스템. 사용자가 `/skills` 명령으로 기능을 켜고 끌 수 있고, 권한 레벨에 따라 접근을 제어한다.

**문제**: 모든 기능이 하드코딩되어 있어 사용자별 커스터마이징 불가, 도구 추가 시 코드 전반 수정 필요

**해결**: 스킬 패키지(SKILL.md + tools.py) + 런타임 가드 + DB 기반 사용자 설정 + Gateway UI

**참고**: [Claude Code Skills](https://code.claude.com/docs/en/skills), [OpenClaw Skill System](https://github.com/nicepkg/openclaw)

---

## 아키텍처

```
Agent Startup
  ├─ registry.py: SKILLS dict → DB skills 테이블 UPSERT (단일 소스)
  └─ 각 skills/{name}/SKILL.md → LLM 지시문 로딩 준비

사용자: "/skills"
  └─ Gateway: DB에서 skills + user_skills 조회 → InlineKeyboard 표시
  └─ [끄기] 클릭 → user_skills UPDATE → 키보드 갱신

사용자: "오늘 점심 만원"
  └─ Gateway → gRPC Chat → Agent
      └─ dynamic_prompt():
          ├─ 활성 스킬 SKILL.md 로딩 → system prompt 주입
          └─ 비활성 스킬 도구는 prompt에서 제외
      └─ LLM → save_finance 호출
          └─ @skill_guard("finance") → user_skills 체크 (이중 안전장치)
              ├─ enabled → 실행
              └─ disabled → "이 기능은 비활성화되어 있어요"

Scheduler: budget_warning (매시간)
  └─ Gateway: isSkillEnabled(user, "budget")
      ├─ enabled → gRPC GenerateReport
      └─ disabled → skip
```

---

## 핵심 설계 결정

| 결정 | 선택 | 이유 |
|------|------|------|
| 스킬 패키지 구조 | `skills/{name}/` (SKILL.md + tools.py) | 자기완결적 패키지. Claude Code/OpenClaw 패턴. 역할 분리 |
| SKILL.md | 스킬별 LLM 지시문 + 메타데이터 | 도구 사용 가이드를 prompt에 주입. 비활성 시 제거 → 토큰 절약 |
| tools.py | @tool 함수 + 구현 로직을 하나의 파일에 | 단순한 구조. 공통 로직은 document/, skills/google/api.py 등 공유 모듈로 분리 |
| 도구 바인딩 | 싱글턴 Agent에 전체 바인딩 + 런타임 가드 | LangGraph agent는 startup 시 도구 고정. 런타임 필터링이 유일한 방법 |
| 비활성 스킬 처리 | prompt에서 도구 제거 (1차) + @skill_guard (2차) | OpenClaw 패턴. LLM이 비활성 도구 존재 자체를 모르게 |
| 스킬 정의 위치 | Python (registry.py) | 도구 구현과 가까움. DB에 UPSERT하여 Gateway와 공유 |
| 사용자 설정 | DB (user_skills 테이블) | Go/Python 양쪽에서 접근 가능. row 없으면 enabled_by_default 사용 |
| 파일 생성 반환 | Proto FILE 타입 추가 | 텍스트 마커보다 안정적. Gateway가 파일 타입별 Telegram 전송 |
| 기존 multimodal 처리 | 3개 전문 스킬로 분해 | documents/image/audio 각각 분석+생성 지원 |
| 구글 연동 | OAuth2 콜백 in Gateway | 브라우저 리다이렉트 필요. Agent에서 URL 생성, Gateway에서 콜백 처리 |

---

## 스킬 패키지 구조

### 원칙

- **스킬 = 하나의 디렉토리**: SKILL.md + tools.py가 기본 단위
- **SKILL.md**: 스킬 메타데이터 + LLM이 도구를 사용하는 방법 안내
- **tools.py**: `@tool` 함수 + 구현 로직 (LLM이 호출하는 인터페이스)
- **공유 모듈**: 여러 스킬이 사용하는 공통 로직 (`document/parser.py`, `document/generator.py`, `skills/google/api.py`)
- **비활성 스킬**: SKILL.md가 prompt에 로딩되지 않음 → LLM이 존재를 모름

### 전체 디렉토리 구조 (Python Agent)

```
agent/src/jiki_agent/
├── __init__.py
├── __main__.py
├── config.py
├── context.py
├── persona.py
│
├── skills/                        ← 스킬 시스템 (인프라 + 개별 스킬)
│   ├── __init__.py
│   ├── registry.py               ← SkillDef dataclass + SKILLS dict + register_skills()
│   ├── guard.py                  ← @skill_guard 데코레이터
│   ├── loader.py                 ← SKILL.md 파서 + SkillDoc + progressive disclosure
│   ├── file_context.py           ← ContextVar pending file queue
│   │
│   ├── finance/                  ← 💰 가계부 스킬
│   │   ├── SKILL.md              ← LLM 지시문 (카테고리 분류, 응답 스타일 등)
│   │   └── tools.py              ← save_finance, get_monthly_total
│   │
│   ├── budget/                   ← 📊 예산 관리 스킬
│   │   ├── SKILL.md
│   │   └── tools.py              ← set_budget, get_budget_status
│   │
│   ├── diary/                    ← 📔 일기 스킬
│   │   ├── SKILL.md
│   │   └── tools.py              ← save_daily_log
│   │
│   ├── goals/                    ← 🎯 목표 관리 스킬
│   │   ├── SKILL.md
│   │   └── tools.py              ← set_goal, get_goals, update_goal_status
│   │
│   ├── schedule/                 ← 📅 일정 스킬
│   │   ├── SKILL.md
│   │   └── tools.py              ← create_schedule, list_schedules, cancel_schedule
│   │
│   ├── memory/                   ← 🧠 기억 스킬
│   │   ├── SKILL.md
│   │   └── tools.py              ← retrieve_memory
│   │
│   ├── pattern/                  ← 📈 패턴 분석 스킬 (백그라운드)
│   │   ├── SKILL.md
│   │   └── tools.py              ← analyze_patterns, generate_pattern_insight
│   │
│   ├── proactive/                ← 🔔 능동 알림 스킬 (백그라운드)
│   │   └── SKILL.md              ← tools.py 없음 (스케줄러만 사용)
│   │
│   ├── compaction/               ← 🗜️ 메모리 압축 스킬 (시스템)
│   │   └── tools.py              ← compact_memory (SKILL.md 없음 — 시스템 전용)
│   │
│   ├── conversation/             ← 대화 분석 (시스템, 백그라운드)
│   │   └── tools.py              ← analyze_conversation
│   │
│   ├── report/                   ← 리포트 생성 (시스템, 백그라운드)
│   │   └── tools.py              ← generate_daily_summary, weekly_report, monthly_closing
│   │
│   ├── documents/                ← 📄 문서 스킬
│   │   ├── SKILL.md
│   │   └── tools.py              ← parse_document, generate_document
│   │
│   ├── image/                    ← 🖼️ 이미지 스킬
│   │   ├── SKILL.md
│   │   └── tools.py              ← analyze_image, generate_image
│   │
│   ├── audio/                    ← 🎵 오디오 스킬
│   │   ├── SKILL.md
│   │   └── tools.py              ← transcribe_audio, generate_audio
│   │
│   ├── video/                    ← 🎬 비디오 스킬
│   │   ├── SKILL.md
│   │   └── tools.py              ← analyze_video, generate_video
│   │
│   ├── google/                   ← 🔗 구글 연동 스킬
│   │   ├── SKILL.md
│   │   ├── tools.py              ← @tool 함수 12개
│   │   └── api.py                ← Google API 인증 헬퍼 (get_google_service)
│   │
│   ├── websearch/                ← 🔍 웹 검색 스킬
│   │   ├── SKILL.md
│   │   └── tools.py              ← web_search (Tavily), web_fetch (httpx + readability)
│   │
│   ├── translate/                ← 🌐 번역 스킬
│   │   ├── SKILL.md
│   │   └── tools.py              ← translate_text (Gemini LLM)
│   │
│   ├── qrcode/                   ← 🔲 QR코드 스킬
│   │   ├── SKILL.md
│   │   └── tools.py              ← generate_qrcode (qrcode lib)
│   │
│   ├── calculator/               ← 🧮 계산기 스킬
│   │   ├── SKILL.md
│   │   └── tools.py              ← calculate (ast safe eval)
│   │
│   └── reminder/                 ← ⏰ 알림 스킬
│       ├── SKILL.md
│       └── tools.py              ← set_reminder, list_reminders, delete_reminder
│
├── db/
│   ├── pool.py
│   └── repositories/
│       ├── daily_log.py          (existing)
│       ├── document.py           (existing)
│       ├── finance.py            (existing)
│       ├── knowledge.py          (existing)
│       ├── profile.py            (existing)
│       └── skill.py              ← NEW: is_enabled, toggle, register_all, get_enabled_skills
│
├── grpc/
│   └── server.py                 ← MODIFY: pop_pending_files → FILE 응답
│
├── graph/
│   └── agent.py                  ← MODIFY: 스킬 컨텍스트 프롬프트 + 도구 임포트
│
├── models/schemas.py             (변경 없음)
├── memory/                       (변경 없음)
├── embedding/                    (변경 없음)
├── document/                     ← EXISTING: RAG용 유틸리티 (skills/documents와 다른 레이어)
│   ├── chunker.py
│   └── parser.py
└── generated/                    (변경 없음)
```

### Go Gateway 디렉토리 구조

```
gateway/internal/
├── skill/                        ← NEW
│   └── service.go               ← Service{db, cache, mu} + IsEnabled/Toggle/GetUserSkills
├── handler/
│   ├── chat.go                  (existing)
│   └── google.go                ← NEW: /auth/google/callback OAuth2 핸들러
├── scheduler/
│   ├── cron.go                  ← MODIFY: skillService 주입
│   └── rules.go                 ← MODIFY: isSkillEnabled 체크 추가
├── telegram/
│   └── bot.go                   ← MODIFY: /skills + skill:toggle + FILE 처리
├── activity/, auth/, middleware/  (변경 없음)
```

### Proto

```
proto/jiki/v1/
└── agent.proto                   ← MODIFY: FILE(5) + file_data/name/mime
```

### SKILL.md 형식

각 스킬의 SKILL.md는 LLM에게 주입되는 지시문:

```markdown
# 가계부 (finance)

## 도구 사용 지침
- 금액이 언급되면 save_finance를 호출
- 카테고리가 불명확하면 사용자에게 확인 후 기록
- "얼마 썼어?" 류의 질문에는 get_monthly_total 사용
- 수입은 amount를 양수, 지출은 음수로 기록

## 카테고리 분류 기준
- 식비: 식당, 카페, 배달, 간식, 장보기
- 교통: 택시, 버스, 지하철, 주유, 주차
- 쇼핑: 의류, 전자기기, 생활용품
- 문화: 영화, 공연, 도서, 구독
- 의료: 병원, 약국, 건강검진

## 응답 스타일
- 기록 완료 시 카테고리와 금액을 자연스럽게 확인
- 큰 지출(10만원+)에는 가볍게 코멘트
- 반복 지출 감지 시 참고 정보 제공
```

### SKILL.md 로딩 방식

```python
# graph/agent.py — dynamic_prompt() 수정
async def dynamic_prompt(state: dict) -> list:
    user_id = get_current_user()
    pool = get_pool()

    # 1. 활성 스킬 조회
    enabled = await skill_repo.get_enabled_skills(pool, user_id)

    # 2. 활성 스킬의 도구 이름만 수집
    enabled_tools = []
    for skill_id in enabled:
        if skill_id in SKILLS:
            enabled_tools.extend(SKILLS[skill_id].tools)

    # 3. 활성 스킬의 SKILL.md 로딩
    skill_instructions = []
    for skill_id in enabled:
        doc_path = Path(__file__).parent.parent / "skills" / skill_id / "SKILL.md"
        if doc_path.exists():
            skill_instructions.append(doc_path.read_text())

    # 4. system prompt 조합
    prompt = build_system_prompt(persona_id)
    if enabled_tools:
        prompt += f"\n\n## 사용 가능한 도구\n{', '.join(enabled_tools)}"
        prompt += "\n위 목록에 없는 도구는 절대 호출하지 마세요."
    if skill_instructions:
        prompt += "\n\n## 스킬 지침\n" + "\n---\n".join(skill_instructions)

    return [SystemMessage(content=prompt)] + state["messages"]
```

---

## 스킬 맵 (21개)

### 기존 기능 (9개)

| # | ID | 이름 | 도구 | 리포트/스케줄러 | 기본값 | Level |
|---|-----|------|------|----------------|--------|-------|
| 1 | `finance` | 💰 가계부 | save_finance, get_monthly_total | daily_summary, weekly, monthly_closing, spending_anomaly | ON | 1 |
| 2 | `budget` | 📊 예산 관리 | set_budget, get_budget_status | budget_warning | ON | 1 |
| 3 | `diary` | 📔 일기 | save_daily_log | conversation_analysis | ON | 1 |
| 4 | `goals` | 🎯 목표 관리 | set_goal, get_goals, update_goal_status | goal_evaluate, goal_status | ON | 1 |
| 5 | `schedule` | 📅 일정 | create_schedule, list_schedules, cancel_schedule | user_schedules | ON | 1 |
| 6 | `memory` | 🧠 기억 | retrieve_memory | — | ON | 1 |
| 7 | `pattern` | 📈 패턴 분석 | — | pattern_analysis, pattern_insight | ON | 1 |
| 8 | `proactive` | 🔔 능동 알림 | — | inactive_reminder | ON | 1 |
| 9 | `compaction` | 🗜️ 메모리 압축 | — | memory_compaction | ON | 0 (시스템) |

### 신규 기능 (12개) — 기존 multimodal 분해 + 신규

| # | ID | 이름 | 도구 | 기본값 | Level |
|---|-----|------|------|--------|-------|
| 10 | `documents` | 📄 문서 | parse_document, generate_document | ON | 1 |
| 11 | `image` | 🖼️ 이미지 | analyze_image, generate_image | ON | 1 |
| 12 | `video` | 🎬 비디오 | analyze_video, generate_video | OFF | 2 (opt-in) |
| 13 | `audio` | 🎵 오디오 | transcribe_audio, generate_audio | ON | 1 |
| 14 | `google` | 🔗 구글 | google_auth + 10개 서비스 도구 | OFF | 2 (opt-in) |
| 15 | `websearch` | 🔍 웹 검색 | web_search, web_fetch | ON | 1 |
| 16 | `weather` | 🌤️ 날씨 | get_weather, get_forecast | ON | 1 |
| 17 | `summarize` | 📝 요약 | summarize_url, summarize_text | ON | 1 |
| 18 | `translate` | 🌐 번역 | translate_text | ON | 1 |
| 19 | `qrcode` | 🔲 QR코드 | generate_qrcode | ON | 1 |
| 20 | `calculator` | 🧮 계산기 | calculate | ON | 1 |
| 21 | `reminder` | ⏰ 알림 | set_reminder, list_reminders, delete_reminder | ON | 1 |

### Permission Level

| Level | 설명 | 사용자 토글 | 예시 |
|-------|------|-----------|------|
| 0 | 시스템 | 불가 (항상 ON) | memory_compaction, conversation_analysis |
| 1 | 기본 | ON → 비활성화 가능 | finance, goals, diary, image, audio |
| 2 | 옵트인 | OFF → 활성화 필요 | video, google (리소스 집약적/인증 필요) |
| 3 | 관리자 | 관리자만 접근 | 향후 시스템 진단 기능 |

---

## 실행 모델: 3가지 경로

### 경로 1: LLM Tool Call (대화형)

대부분의 스킬이 사용하는 경로. LLM이 사용자 의도를 파악하여 도구를 선택한다.

```
사용자 메시지 → Gateway → gRPC ChatStream → LangGraph ReAct
  → dynamic_prompt(): 활성 SKILL.md 로딩 + 비활성 도구 제거
  → LLM이 도구 선택 → @skill_guard 체크 (이중 안전장치) → @tool 실행
  → 결과 (텍스트 or 파일) → LLM이 응답 생성 → Gateway → Telegram
```

**비활성 스킬 처리 (OpenClaw 패턴):**
```
사용자 A: 가계부 ON, 비디오 OFF

dynamic_prompt():
  ├─ 활성 도구: save_finance, get_monthly_total, ... (가계부 포함)
  ├─ SKILL.md 로딩: finance/SKILL.md, budget/SKILL.md, ...
  ├─ 비활성 도구: analyze_video, generate_video → prompt에서 제외
  └─ "위 목록에 없는 도구는 절대 호출하지 마세요"

→ LLM이 video 도구의 존재 자체를 모름 → 호출 시도 없음
→ @skill_guard는 만일의 이중 안전장치
```

**텍스트 대화 (기존 패턴):**
```
사용자: "오늘 점심 만원"
  → LLM: finance/SKILL.md 지침에 따라 카테고리 "식비" 판단
  → LLM → save_finance(amount=10000, category="식비")
    → @skill_guard("finance") → DB 조회 → enabled
    → 실행 → "기록했어요!"
  → LLM: "점심 만원 기록했어요! 🍽️"
```

**파일 입력 (기존 패턴):**
```
사용자: [사진 첨부] "이거 뭐야?"
  → Gateway: photo → getFileURL(fileID) → file_url
  → gRPC: ChatStream(message="이거 뭐야?", file={type:"image", url:...})
  → LLM → analyze_image(file_url, "이거 뭐야?")
    → @skill_guard("image") → Gemini multimodal → 분석 결과
```

**파일 생성 (신규 패턴):**
```
사용자: "이번 달 지출 보고서 PDF로 만들어줘"
  → LLM → generate_document(content=지출데이터, format="pdf")
    → @skill_guard("documents")
    → document/generator.py → ReportLab로 PDF 생성 → add_pending_file(bytes, name, mime)
    → return "보고서 생성 완료"
  → gRPC 스트림:
    1. TEXT: "3월 지출 보고서를 만들었어요!"
    2. FILE: {file_data, file_name, file_mime}  ← Proto 확장
    3. STREAM_END
  → Gateway:
    TEXT → Telegram 텍스트 메시지
    FILE → tgbotapi.NewDocument() → Telegram 파일 전송
```

**이미지 생성 (신규 패턴):**
```
사용자: "귀여운 고양이 그림 그려줘"
  → LLM → generate_image(prompt="귀여운 고양이", style="illustration")
    → @skill_guard("image")
    → Gemini Imagen 3 API → image bytes
    → add_pending_file(png_bytes, "cat.png", "image/png")
  → gRPC 스트림:
    1. TEXT: "귀여운 고양이 그림을 그렸어요!"
    2. FILE: {png_bytes, "cat.png", "image/png"}
    3. STREAM_END
  → Gateway: FILE → tgbotapi.NewPhoto() → Telegram 사진 전송
```

**오디오 생성 (TTS — 신규 패턴):**
```
사용자: "이 텍스트 읽어줘: 안녕하세요 여러분"
  → LLM → generate_audio(text="안녕하세요 여러분", voice="ko-KR-Standard-A")
    → @skill_guard("audio")
    → Google Cloud TTS → ogg bytes
    → add_pending_file(ogg_bytes, "tts.ogg", "audio/ogg")
  → Gateway: FILE → tgbotapi.NewVoice() → Telegram 음성 전송
```

### 경로 2: Scheduler (백그라운드)

Cron job이 트리거. Gateway에서 스킬 활성 여부를 체크한 후 Agent 호출.

```
Cron 트리거 → Gateway: isSkillEnabled(user, skillID)
  ├─ disabled → skip
  └─ enabled → gRPC GenerateReport(type=...) → Python 핸들러
      → 결과 로깅 또는 Telegram 알림
```

**예시: budget_warning**
```
매시간 → runBudgetWarningRule()
  → for user in activeUsers:
    → skillService.IsEnabled(user, "budget")  ← 스킬 체크 추가
      → disabled? → skip
      → enabled? → gRPC GenerateReport(type="budget_warning")
```

### 경로 3: Gateway Command (직접)

Agent를 경유하지 않고 Gateway가 직접 처리하는 명령어.

```
/skills → Gateway: DB 조회 → InlineKeyboard → 토글 콜백
/google → Gateway: OAuth2 URL 생성 → 브라우저 인증 → 콜백 처리
```

**스킬 관리 UI:**
```
사용자: /skills
  → Gateway: handleSkillsCommand()
    → DB: SELECT * FROM skills ORDER BY sort_order
    → DB: SELECT * FROM user_skills WHERE user_id = ?
    → InlineKeyboard 생성
  → Telegram:
    ┌──────────────────────────────────┐
    │ 🔧 스킬 관리                     │
    ├──────────────────────────────────┤
    │ 📌 기본 기능                     │
    │ [💰가계부 ✅] [📊예산 ✅]        │
    │ [📔일기 ✅]   [🎯목표 ✅]        │
    │ [📅일정 ✅]   [🧠기억 ✅]        │
    │                                   │
    │ 📌 분석 & 알림                   │
    │ [📈패턴 ✅]   [🔔알림 ✅]        │
    │                                   │
    │ 📌 미디어 & 문서                 │
    │ [📄문서 ✅]   [🖼️이미지 ✅]      │
    │ [🎵오디오 ✅] [🎬비디오 ❌]      │
    │                                   │
    │ 📌 정보                           │
    │ [🔍웹검색 ✅] [🌤️날씨 ✅]       │
    │ [📝요약 ✅]   [🌐번역 ✅]        │
    │                                   │
    │ 📌 유틸리티                       │
    │ [🔲QR코드 ✅] [🧮계산기 ✅]      │
    │                                   │
    │ 📌 생산성                         │
    │ [📅일정 ✅]   [⏰알림 ✅]        │
    │                                   │
    │ 📌 외부 연동                     │
    │ [🔗구글 ❌]                      │
    │                                   │
    │ [닫기]                            │
    └──────────────────────────────────┘

사용자: [📊예산 ✅] 클릭
  → Gateway: handleCallback("skill:toggle:budget")
    → DB: UPSERT user_skills SET enabled = !current
    → 키보드 갱신 (📊예산 ❌)
    → "예산 관리 기능을 껐어요."
```

**구글 OAuth2 플로우:**
```
사용자: "구글 연동해줘"
  │
  ├─ Agent: LLM → google_auth() 호출
  │   → google/api.py → OAuth2 URL 생성 (Calendar+Docs+Drive+Gmail+Tasks 스코프)
  │   → return "아래 링크에서 구글 계정을 연동해주세요"
  │
  ├─ Gateway: 텍스트 + URL → Telegram (인라인 버튼)
  │   → [🔗 구글 계정 연동하기]
  │
  ├─ 사용자: 브라우저에서 구글 로그인 + 권한 승인
  │
  ├─ Google → Gateway: GET /auth/google/callback?code=xxx&state=user_id
  │   → code → access_token + refresh_token 교환
  │   → DB google_tokens 저장
  │   → Telegram 메시지: "✅ 구글 연동 완료!"
  │
  └─ 이후: "내일 일정 뭐 있어?"
      → LLM → google_calendar_list(start="2026-03-03")
        → @skill_guard("google") → google/api.py → Google API 호출
        → 일정 목록 반환
```

---

## DB 스키마

```sql
-- 스킬 카탈로그 (agent가 startup 시 UPSERT)
CREATE TABLE skills (
    id TEXT PRIMARY KEY,              -- 'finance', 'goals', ...
    name TEXT NOT NULL,               -- '가계부', '목표 관리', ...
    description TEXT NOT NULL,
    category TEXT NOT NULL,           -- 'finance', 'productivity', ...
    emoji TEXT DEFAULT '',
    tools TEXT[] DEFAULT '{}',        -- @tool 함수 이름들
    reports TEXT[] DEFAULT '{}',      -- report_type 이름들
    cron_rules TEXT[] DEFAULT '{}',   -- 스케줄러 규칙 이름들
    enabled_by_default BOOLEAN DEFAULT TRUE,
    permission_level INT DEFAULT 1,   -- 0=system, 1=default, 2=opt-in, 3=admin
    sort_order INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 사용자별 스킬 설정 (row 없으면 enabled_by_default 사용)
CREATE TABLE user_skills (
    user_id TEXT NOT NULL,
    skill_id TEXT NOT NULL REFERENCES skills(id),
    enabled BOOLEAN NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, skill_id)
);

-- 구글 OAuth2 토큰 (google 스킬 전용)
CREATE TABLE google_tokens (
    user_id TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_uri TEXT DEFAULT 'https://oauth2.googleapis.com/token',
    scopes TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Proto 변경

```protobuf
// agent.proto — ResponseType에 FILE 추가
enum ResponseType {
  TEXT = 0;
  ERROR = 1;
  TOOL_CALL = 2;
  TOOL_RESULT = 3;
  STREAM_END = 4;
  FILE = 5;           // NEW
}

message ChatResponse {
  string content = 1;
  ResponseType type = 2;
  string tool_name = 3;
  string tool_result = 4;
  // NEW: 파일 응답
  bytes file_data = 5;
  string file_name = 6;
  string file_mime = 7;
}
```

---

## Python 핵심 컴포넌트

### 1. 스킬 레지스트리 (`skills/registry.py`)

```python
from dataclasses import dataclass, field

@dataclass
class SkillDef:
    id: str
    name: str
    description: str
    category: str
    emoji: str = ""
    tools: list[str] = field(default_factory=list)
    reports: list[str] = field(default_factory=list)
    cron_rules: list[str] = field(default_factory=list)
    enabled_by_default: bool = True
    permission_level: int = 1
    sort_order: int = 0

SKILLS: dict[str, SkillDef] = {
    "finance": SkillDef(
        id="finance", name="가계부", emoji="💰",
        description="수입/지출 기록, 월간 리포트, 소비 분석",
        category="finance",
        tools=["save_finance", "get_monthly_total"],
        reports=["daily_summary", "weekly", "monthly_closing", "spending_anomaly"],
        sort_order=1,
    ),
    "budget": SkillDef(
        id="budget", name="예산 관리", emoji="📊",
        description="카테고리별 예산 설정 및 경고",
        category="finance",
        tools=["set_budget", "get_budget_status"],
        cron_rules=["budget_warning"],
        sort_order=2,
    ),
    "diary": SkillDef(
        id="diary", name="일기", emoji="📔",
        description="일상 기록, 감정 분석, 대화 분석",
        category="lifestyle",
        tools=["save_daily_log"],
        reports=["conversation_analysis"],
        sort_order=3,
    ),
    "goals": SkillDef(
        id="goals", name="목표 관리", emoji="🎯",
        description="목표 설정, 추적, 달성도 평가",
        category="productivity",
        tools=["set_goal", "get_goals", "update_goal_status"],
        reports=["goal_evaluate", "goal_status"],
        sort_order=4,
    ),
    "schedule": SkillDef(
        id="schedule", name="일정", emoji="📅",
        description="알림 일정 생성 및 관리",
        category="productivity",
        tools=["create_schedule", "list_schedules", "cancel_schedule"],
        cron_rules=["user_schedules"],
        sort_order=5,
    ),
    "memory": SkillDef(
        id="memory", name="기억", emoji="🧠",
        description="과거 대화 및 문서 시맨틱 검색",
        category="core",
        tools=["retrieve_memory"],
        sort_order=6,
    ),
    "pattern": SkillDef(
        id="pattern", name="패턴 분석", emoji="📈",
        description="지출/행동 패턴 자동 감지",
        category="analysis",
        reports=["pattern_analysis", "pattern_insight"],
        sort_order=7,
    ),
    "proactive": SkillDef(
        id="proactive", name="능동 알림", emoji="🔔",
        description="비활성 사용자 리마인더, 패턴 인사이트",
        category="notification",
        cron_rules=["inactive_reminder"],
        sort_order=8,
    ),
    "compaction": SkillDef(
        id="compaction", name="메모리 압축", emoji="🗜️",
        description="오래된 기록을 주간 요약으로 압축",
        category="system",
        reports=["memory_compaction"],
        enabled_by_default=True,
        permission_level=0,  # system — 사용자 토글 불가
        sort_order=99,
    ),
    # --- 신규 스킬 ---
    "translate": SkillDef(
        id="translate", name="번역", emoji="🌐",
        description="텍스트를 다국어로 번역 (한/영/일/중 등)",
        category="information",
        tools=["translate_text"],
        sort_order=18,
    ),
    "qrcode": SkillDef(
        id="qrcode", name="QR코드", emoji="🔲",
        description="QR 코드 이미지 생성",
        category="utility",
        tools=["generate_qrcode"],
        sort_order=19,
    ),
    "calculator": SkillDef(
        id="calculator", name="계산기", emoji="🧮",
        description="수학 수식 계산 (사칙연산, 함수, 상수)",
        category="utility",
        tools=["calculate"],
        sort_order=20,
    ),
    "reminder": SkillDef(
        id="reminder", name="알림", emoji="⏰",
        description="간편 알림 예약 및 관리",
        category="productivity",
        tools=["set_reminder", "list_reminders", "delete_reminder"],
        sort_order=21,
    ),
    "websearch": SkillDef(
        id="websearch", name="웹 검색", emoji="🔍",
        description="인터넷 검색 및 웹페이지 정보 수집",
        category="information",
        tools=["web_search", "web_fetch"],
        sort_order=15,
    ),
    "weather": SkillDef(
        id="weather", name="날씨", emoji="🌤️",
        description="현재 날씨 및 일기예보 조회",
        category="information",
        tools=["get_weather", "get_forecast"],
        sort_order=16,
    ),
    "documents": SkillDef(
        id="documents", name="문서", emoji="📄",
        description="문서 파싱(PDF/DOCX/HWP/XLSX/PPTX/MD/TXT) 및 생성",
        category="media",
        tools=["parse_document", "generate_document"],
        sort_order=10,
    ),
    "image": SkillDef(
        id="image", name="이미지", emoji="🖼️",
        description="이미지 분석 및 AI 이미지 생성",
        category="media",
        tools=["analyze_image", "generate_image"],
        sort_order=11,
    ),
    "audio": SkillDef(
        id="audio", name="오디오", emoji="🎵",
        description="음성 인식(STT) 및 음성 합성(TTS)",
        category="media",
        tools=["transcribe_audio", "generate_audio"],
        sort_order=12,
    ),
    "video": SkillDef(
        id="video", name="비디오", emoji="🎬",
        description="비디오 분석 및 생성",
        category="media",
        tools=["analyze_video", "generate_video"],
        enabled_by_default=False,
        permission_level=2,  # opt-in
        sort_order=13,
    ),
    "google": SkillDef(
        id="google", name="구글 연동", emoji="🔗",
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
        permission_level=2,  # opt-in (OAuth2 인증 필요)
        sort_order=14,
    ),
}

# tool_name → skill_id 역매핑 (빠른 가드 조회용)
_TOOL_TO_SKILL: dict[str, str] = {}
for _skill in SKILLS.values():
    for _tool_name in _skill.tools:
        _TOOL_TO_SKILL[_tool_name] = _skill.id

def get_skill_for_tool(tool_name: str) -> str | None:
    return _TOOL_TO_SKILL.get(tool_name)
```

### 2. 런타임 가드 (`skills/guard.py`)

```python
from functools import wraps
from jiki_agent.context import get_current_user
from jiki_agent.db.pool import get_pool
from jiki_agent.db.repositories import skill as skill_repo
from jiki_agent.skills.registry import SKILLS

def skill_guard(skill_id: str):
    """Decorator that checks if skill is enabled for current user.

    Wraps an async tool function. If the skill is disabled for the
    current user, returns a friendly message instead of executing.
    This is a secondary safety net — primary defense is prompt-level
    tool exclusion via dynamic_prompt().
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            user_id = get_current_user()
            pool = get_pool()
            if not await skill_repo.is_enabled(pool, user_id, skill_id):
                skill = SKILLS.get(skill_id)
                name = skill.name if skill else skill_id
                return (
                    f"'{name}' 기능이 비활성화되어 있어요. "
                    "/skills 명령으로 활성화할 수 있어요."
                )
            return await func(*args, **kwargs)
        return wrapper
    return decorator
```

### 3. 파일 응답 컨텍스트 (`skills/file_context.py`)

```python
from contextvars import ContextVar

_pending_files: ContextVar[list] = ContextVar("pending_files", default=[])

def add_pending_file(data: bytes, name: str, mime: str):
    """도구에서 호출 — 생성된 파일을 대기열에 추가."""
    files = _pending_files.get()
    files.append({"data": data, "name": name, "mime": mime})

def pop_pending_files() -> list:
    """gRPC 스트림에서 호출 — 대기 파일 꺼내고 초기화."""
    files = _pending_files.get()
    _pending_files.set([])
    return files
```

### 4. 도구 구현 예시

```python
# skills/finance/tools.py — 기존 로직에 데코레이터 추가
from jiki_agent.skills.guard import skill_guard

@skill_guard("finance")
@tool(args_schema=SaveFinanceInput)
async def save_finance(amount: int, ...) -> str:
    ...  # 기존 로직 그대로

# skills/image/tools.py — 도구 + 구현 로직
from jiki_agent.skills.guard import skill_guard
from jiki_agent.skills.file_context import add_pending_file

@skill_guard("image")
@tool(args_schema=AnalyzeImageInput)
async def analyze_image(file_url: str, user_query: str = "...") -> str:
    # Gemini Vision API 직접 호출
    ...

@skill_guard("image")
@tool(args_schema=GenerateImageInput)
async def generate_image(prompt: str, style: str = "natural") -> str:
    # Gemini Imagen 3 API 호출
    image_bytes = ...
    add_pending_file(image_bytes, "generated.png", "image/png")
    return f"'{prompt}' 이미지를 생성했어요."

# skills/google/tools.py — Google API 통합, api.py 헬퍼 사용
from jiki_agent.skills.google.api import get_google_service

@skill_guard("google")
@tool(args_schema=GoogleCalendarCreateInput)
async def google_calendar_create(title: str, start: str, ...) -> str:
    service = await get_google_service(user_id, "calendar", "v3")
    # Google Calendar API 호출
    ...
```

### 5. LLM 프롬프트 스킬 컨텍스트 (`graph/agent.py`)

```python
from pathlib import Path
from jiki_agent.skills.registry import SKILLS

# 도구 임포트 — 각 스킬 패키지에서
from jiki_agent.skills.finance.tools import save_finance, get_monthly_total
from jiki_agent.skills.budget.tools import set_budget, get_budget_status
from jiki_agent.skills.diary.tools import save_daily_log
from jiki_agent.skills.goals.tools import set_goal, get_goals, update_goal_status
from jiki_agent.skills.schedule.tools import create_schedule, list_schedules, cancel_schedule
from jiki_agent.skills.memory.tools import retrieve_memory
from jiki_agent.skills.documents.tools import parse_document, generate_document
from jiki_agent.skills.image.tools import analyze_image, generate_image
from jiki_agent.skills.audio.tools import transcribe_audio, generate_audio
from jiki_agent.skills.video.tools import analyze_video, generate_video
from jiki_agent.skills.summarize.tools import summarize_url, summarize_text
from jiki_agent.skills.translate.tools import translate_text
from jiki_agent.skills.qrcode.tools import generate_qrcode
from jiki_agent.skills.calculator.tools import calculate
from jiki_agent.skills.reminder.tools import (
    delete_reminder, list_reminders, set_reminder,
)
from jiki_agent.skills.google.tools import (
    google_auth, google_disconnect,
    google_calendar_create, google_calendar_list,
    google_docs_create, google_docs_read,
    google_tasks_create, google_tasks_list,
    google_drive_upload, google_drive_list,
    google_mail_send, google_mail_list,
)

# 전체 도구 목록 (Agent startup 시 바인딩)
tools = [
    save_finance, get_monthly_total, set_budget, get_budget_status,
    save_daily_log, set_goal, get_goals, update_goal_status,
    create_schedule, list_schedules, cancel_schedule, retrieve_memory,
    parse_document, generate_document, analyze_image, generate_image,
    transcribe_audio, generate_audio, analyze_video, generate_video,
    google_auth, google_disconnect,
    google_calendar_create, google_calendar_list,
    google_docs_create, google_docs_read,
    google_tasks_create, google_tasks_list,
    google_drive_upload, google_drive_list,
    google_mail_send, google_mail_list,
    web_search, web_fetch,
    get_weather, get_forecast,
    summarize_url, summarize_text,
    translate_text,
    generate_qrcode,
    calculate,
    set_reminder, list_reminders, delete_reminder,
]

# dynamic_prompt — 활성 스킬만 prompt에 주입
async def dynamic_prompt(state: dict) -> list:
    user_id = get_current_user()
    pool = get_pool()

    # 활성 스킬 조회
    enabled = await skill_repo.get_enabled_skills(pool, user_id)

    # 활성 스킬의 도구 이름만 수집
    enabled_tools = []
    for skill_id in enabled:
        if skill_id in SKILLS:
            enabled_tools.extend(SKILLS[skill_id].tools)

    # 활성 스킬의 SKILL.md 로딩
    skill_instructions = []
    skills_dir = Path(__file__).parent.parent / "skills"
    for skill_id in enabled:
        doc_path = skills_dir / skill_id / "SKILL.md"
        if doc_path.exists():
            skill_instructions.append(doc_path.read_text())

    # system prompt 조합
    profile = await profile_repo.get_by_telegram_id(pool, telegram_id=user_id)
    persona_id = (profile.get("preferences") or {}).get("persona", DEFAULT_PERSONA)
    prompt = build_system_prompt(persona_id)

    if enabled_tools:
        prompt += f"\n\n## 사용 가능한 도구\n{', '.join(enabled_tools)}"
        prompt += "\n위 목록에 없는 도구는 절대 호출하지 마세요."

    if skill_instructions:
        prompt += "\n\n## 스킬 지침\n" + "\n---\n".join(skill_instructions)

    return [SystemMessage(content=prompt)] + state["messages"]
```

---

## Go Gateway 핵심 컴포넌트

### 1. 스킬 서비스 (`internal/skill/service.go`)

```go
type Service struct {
    db    *sql.DB
    cache map[string]map[string]bool // userID -> skillID -> enabled
    mu    sync.RWMutex
    ttl   time.Duration
}

func (s *Service) IsEnabled(userID, skillID string) bool {
    // 1. 캐시 조회 (5분 TTL)
    // 2. 미스 시 DB 조회: user_skills + skills.enabled_by_default
    // 3. 캐시 업데이트
}

func (s *Service) Toggle(userID, skillID string) (enabled bool, err error) {
    // 1. skills.permission_level 체크 (0이면 토글 불가)
    // 2. UPSERT user_skills SET enabled = NOT current
    // 3. 캐시 무효화
}

func (s *Service) GetUserSkills(userID string) ([]SkillView, error) {
    // skills LEFT JOIN user_skills → 전체 스킬 + 사용자 설정
}
```

### 2. `/skills` 명령 (`internal/telegram/bot.go`)

```go
case "skills":
    b.handleSkills(chatID, userID)

func (b *Bot) handleSkills(chatID int64, userID string) {
    skills, _ := b.skillService.GetUserSkills(userID)
    keyboard := buildSkillsKeyboard(skills)
    msg := tgbotapi.NewMessage(chatID, "🔧 스킬 관리\n기능을 켜고 끌 수 있어요.")
    msg.ReplyMarkup = keyboard
    b.api.Send(msg)
}
```

### 3. 콜백 핸들러 (`internal/telegram/bot.go`)

```go
// handleCallback 확장
if strings.HasPrefix(data, "skill:toggle:") {
    skillID := strings.TrimPrefix(data, "skill:toggle:")
    enabled, _ := b.skillService.Toggle(userID, skillID)
    // 키보드 갱신
}
```

### 4. 스케줄러 연동 (`internal/scheduler/rules.go`)

```go
// 각 규칙에 스킬 체크 추가
func (s *Scheduler) runBudgetWarningRule() {
    for _, user := range s.getActiveUsers() {
        if !s.skillService.IsEnabled(user.ID, "budget") {
            continue
        }
        // 기존 gRPC 호출
    }
}
```

### 5. 파일 응답 처리 (`internal/telegram/bot.go`)

```go
// handleMessageStream의 switch 확장
case jikiv1.ResponseType_FILE:
    fileBytes := resp.FileData
    fileName := resp.FileName
    fileMime := resp.FileMime

    switch {
    case strings.HasPrefix(fileMime, "image/"):
        photo := tgbotapi.NewPhoto(chatID, tgbotapi.FileBytes{
            Name: fileName, Bytes: fileBytes,
        })
        b.api.Send(photo)
    case strings.HasPrefix(fileMime, "audio/"):
        voice := tgbotapi.NewVoice(chatID, tgbotapi.FileBytes{
            Name: fileName, Bytes: fileBytes,
        })
        b.api.Send(voice)
    case strings.HasPrefix(fileMime, "video/"):
        video := tgbotapi.NewVideo(chatID, tgbotapi.FileBytes{
            Name: fileName, Bytes: fileBytes,
        })
        b.api.Send(video)
    default:
        doc := tgbotapi.NewDocument(chatID, tgbotapi.FileBytes{
            Name: fileName, Bytes: fileBytes,
        })
        b.api.Send(doc)
    }
```

---

## 신규 스킬 상세

### `documents` — 문서 처리

파서: `document/parser.py`, 생성기: `document/generator.py` (공유 모듈)

| 기능 | 포맷 | 라이브러리 | 상태 |
|------|------|-----------|------|
| **파싱** | PDF | pypdf | ✅ 구현 |
| | DOCX | python-docx | ✅ 구현 |
| | XLSX | openpyxl | ✅ 구현 |
| | PPTX | python-pptx | ✅ 구현 |
| | HWP | olefile (best-effort) | ✅ 구현 |
| | MD/TXT/CSV | built-in | ✅ 구현 |
| **생성** | PDF | ReportLab | ✅ 구현 |
| | DOCX | python-docx | ✅ 구현 |
| | XLSX | openpyxl | ✅ 구현 |
| | MD/TXT | built-in | ✅ 구현 |

### `image` — 이미지

| 기능 | 구현 | 위치 | 상태 |
|------|------|------|------|
| 분석 | Gemini 2.0 Flash multimodal | tools.py | ✅ 구현 (process_image → analyze_image) |
| 생성 | Gemini Imagen 3 | tools.py | ✅ 구현 |

### `video` — 비디오

| 기능 | 구현 | 위치 | 상태 |
|------|------|------|------|
| 분석 | Gemini 2.0 Flash 비디오 입력 | tools.py | ✅ 구현 |
| 생성 | Veo 2 API / ffmpeg 슬라이드쇼 | tools.py | ✅ 구현 |

### `audio` — 오디오

| 기능 | 구현 | 위치 | 상태 |
|------|------|------|------|
| STT (transcribe) | Gemini 음성→텍스트 | tools.py | ✅ 구현 (process_voice → transcribe_audio) |
| TTS (generate) | Gemini TTS (tts-1) | tools.py | ✅ 구현 |

### `google` — 구글 워크스페이스

인증 헬퍼: `skills/google/api.py` (get_google_service)

| 서비스 | 도구 | 위치 |
|--------|------|------|
| Auth | google_auth, google_disconnect | tools.py |
| Calendar | google_calendar_create, google_calendar_list | tools.py |
| Docs | google_docs_create, google_docs_read | tools.py |
| Tasks | google_tasks_create, google_tasks_list | tools.py |
| Drive | google_drive_upload, google_drive_list | tools.py |
| Gmail | google_mail_send, google_mail_list | tools.py |

### `websearch` — 웹 검색

검색: Tavily API, 본문 추출: httpx + readability-lxml

| 기능 | 도구 | 구현 | 상태 |
|------|------|------|------|
| 웹 검색 | web_search | Tavily AsyncTavilyClient (search_depth=basic) | ✅ 구현 |
| URL 본문 추출 | web_fetch | httpx + readability-lxml (HTML), 텍스트/JSON 직반환 | ✅ 구현 |

**web_fetch Content-Type 분기:**
- `text/html` → readability-lxml 본문 추출 (실패 시 HTML 태그 strip fallback)
- `text/plain`, `application/json`, `text/xml` → 원본 텍스트 반환
- 바이너리 (pdf, image, audio, video) → `parse_document` 도구 안내
- 안전장치: 30초 타임아웃, 5MB 크기 제한, max_length 절단

### `summarize` — 요약

LLM: Gemini (기존 API 키 사용), URL Fetch: httpx + readability-lxml

| 기능 | 도구 | 구현 | 상태 |
|------|------|------|------|
| URL 요약 | summarize_url | httpx로 URL 내용 추출 → Gemini LLM 요약 | ✅ 구현 |
| 텍스트 요약 | summarize_text | 텍스트 → Gemini LLM 요약 | ✅ 구현 |

**특징:**
- 요약 스타일 3종: concise(짧게 ~200자), detailed(상세 ~500자), bullets(항목별)
- 항상 한국어로 요약 출력
- websearch 스킬과 독립 동작 (별도 토글 가능)
- 바이너리 URL 자동 감지 및 차단
- LLM 입력 길이 제한 (15,000자) + 다운로드 크기 제한 (5MB)
- 추가 의존성 없음 (httpx, readability-lxml, langchain_google_genai 기존 사용)

### `weather` — 날씨

API: Open-Meteo (무료, API 키 불필요), Geocoding: Open-Meteo Geocoding API

| 기능 | 도구 | 구현 | 상태 |
|------|------|------|------|
| 현재 날씨 | get_weather | Open-Meteo Current Weather (기온/체감/습도/풍속/WMO코드) | ✅ 구현 |
| 일간 예보 | get_forecast | Open-Meteo Daily Forecast (최고/최저/강수확률, 1~7일) | ✅ 구현 |

**특징:**
- 도시명 → 위도/경도 자동 변환 (한국어/영어 도시명 지원)
- WMO Weather Code → 한국어 날씨 상태 + 이모지 변환 (27개 코드 매핑)
- 위치 미지정 시 "서울" 기본값
- 추가 의존성 없음 (httpx 기존 사용)

### `translate` — 번역

LLM: Gemini (기존 API 키 사용)

| 기능 | 도구 | 구현 | 상태 |
|------|------|------|------|
| 텍스트 번역 | translate_text | Gemini LLM 프롬프트 기반 번역 | ✅ 구현 |

**특징:**
- 지원 언어 7종: 한국어(ko), 영어(en), 일본어(ja), 중국어(zh), 스페인어(es), 프랑스어(fr), 독일어(de)
- source_lang="auto" 자동 감지 (기본값)
- 텍스트 길이 제한 10,000자
- 추가 의존성 없음 (langchain_google_genai 기존 사용)

### `qrcode` — QR코드 생성

라이브러리: qrcode[pil] (Python)

| 기능 | 도구 | 구현 | 상태 |
|------|------|------|------|
| QR 코드 생성 | generate_qrcode | qrcode 라이브러리 → PNG → add_pending_file | ✅ 구현 |

**특징:**
- URL, 텍스트, 연락처 정보 등 다양한 콘텐츠 지원
- QR 박스 크기 조절 가능 (1-40, 기본값 10)
- 콘텐츠 길이 제한 4,000자
- 의존성: `qrcode[pil]>=8.0`

### `calculator` — 계산기

순수 Python (API/LLM 불필요)

| 기능 | 도구 | 구현 | 상태 |
|------|------|------|------|
| 수식 계산 | calculate | ast.parse + 안전한 재귀 평가 | ✅ 구현 |

**특징:**
- 사칙연산, 거듭제곱, 나머지, 정수 나눗셈
- math 함수: sqrt, abs, round, sin, cos, tan, log, log10, log2, ceil, floor
- math 상수: pi, e
- ast 기반 안전 평가 (eval 미사용, 임의 코드 실행 차단)
- 큰 지수 제한 (>1000 차단)
- 추가 의존성 없음

### `reminder` — 알림

DB: knowledge_repo (기존 인프라 활용)

| 기능 | 도구 | 구현 | 상태 |
|------|------|------|------|
| 알림 예약 | set_reminder | knowledge_repo.upsert (reminder: 접두사) | ✅ 구현 |
| 알림 조회 | list_reminders | knowledge_repo.get_by_key_prefix | ✅ 구현 |
| 알림 삭제 | delete_reminder | knowledge_repo.delete_by_key + 상태 변경 | ✅ 구현 |

**특징:**
- 사용자당 최대 20개 활성 알림
- YYYY-MM-DD HH:MM 형식 (KST)
- 과거 시간 자동 거부
- 알림 제목 선택 사항 (미지정 시 메시지 사용)
- schedule 스킬과 독립 동작 (단순 메시지 알림 특화)
- 추가 의존성 없음

---

## 의존성 추가

```toml
# pyproject.toml — 신규 의존성

# Documents
python-docx = ">=1.1"
openpyxl = ">=3.1"
python-pptx = ">=1.0"
olefile = ">=0.47"
reportlab = ">=4.0"

# Google Workspace
google-api-python-client = ">=2.150"
google-auth-oauthlib = ">=1.2"
google-auth-httplib2 = ">=0.2"

# Web Search
tavily-python = ">=0.5"
readability-lxml = ">=0.8"

# QR Code
qrcode = { version = ">=8.0", extras = ["pil"] }
```

---

## 변경 파일 목록

### New Files — 스킬 인프라

| File | Description |
|------|-------------|
| `skills/__init__.py` | 스킬 패키지 초기화 |
| `skills/registry.py` | SkillDef + SKILLS dict + startup 등록 |
| `skills/guard.py` | @skill_guard 데코레이터 |
| `skills/loader.py` | SKILL.md 파서 + SkillDoc + progressive disclosure |
| `skills/file_context.py` | 파일 응답 컨텍스트 (add/pop_pending_file) |
| `db/repositories/skill.py` | skills/user_skills DB 접근 |
| `db/repositories/google.py` | google_tokens CRUD + 토큰 자동 갱신 |

### New Files — 기존 스킬 패키지화 (tools/ → skills/{name}/)

| File | Description |
|------|-------------|
| `skills/finance/SKILL.md` + `tools.py` | 기존 tools/finance.py 이전 |
| `skills/budget/SKILL.md` + `tools.py` | 기존 tools/budget.py 이전 |
| `skills/diary/SKILL.md` + `tools.py` | 기존 tools/daily_log.py 이전 |
| `skills/goals/SKILL.md` + `tools.py` | 기존 tools/goal.py 이전 |
| `skills/schedule/SKILL.md` + `tools.py` | 기존 tools/schedule.py 이전 |
| `skills/memory/SKILL.md` + `tools.py` | 기존 tools/memory.py 이전 |
| `skills/pattern/SKILL.md` + `tools.py` | 기존 tools/pattern.py 이전 |
| `skills/proactive/SKILL.md` | 스케줄러 전용 (tools.py 없음) |
| `skills/compaction/tools.py` | 기존 tools/compaction.py 이전 (SKILL.md 없음 — 시스템) |
| `skills/conversation/tools.py` | 기존 tools/conversation.py 이전 |
| `skills/report/tools.py` | 기존 tools/report.py 이전 |

### New Files — 신규 스킬

| File | Description |
|------|-------------|
| `skills/documents/SKILL.md` + `tools.py` | parse_document + generate_document |
| `document/generator.py` | PDF/DOCX/XLSX/MD/TXT 생성기 (공유 모듈) |
| `document/parser.py` | PDF/DOCX/XLSX 파서 확장 + extract_text 라우터 (공유 모듈) |
| `skills/image/SKILL.md` + `tools.py` | analyze_image + generate_image |
| `skills/audio/SKILL.md` + `tools.py` | transcribe_audio + generate_audio |
| `skills/video/SKILL.md` + `tools.py` | analyze_video + generate_video |
| `skills/google/SKILL.md` + `tools.py` | 12개 @tool 함수 |
| `skills/google/api.py` | Google API 인증 헬퍼 (get_google_service) |
| `skills/websearch/SKILL.md` + `tools.py` | web_search (Tavily) + web_fetch (httpx + readability) |
| `skills/weather/SKILL.md` + `tools.py` | get_weather + get_forecast (Open-Meteo API) |
| `skills/summarize/SKILL.md` + `tools.py` | summarize_url + summarize_text (Gemini LLM) |
| `skills/translate/SKILL.md` + `tools.py` | translate_text (Gemini LLM 번역) |
| `skills/qrcode/SKILL.md` + `tools.py` | generate_qrcode (qrcode lib → PNG) |
| `skills/calculator/SKILL.md` + `tools.py` | calculate (ast 안전 수식 평가) |
| `skills/reminder/SKILL.md` + `tools.py` | set/list/delete_reminder (knowledge_repo) |

### New Files — Go Gateway

| File | Description |
|------|-------------|
| `gateway/internal/skill/service.go` | 스킬 서비스 (DB + 캐시) |
| `gateway/internal/handler/google.go` | OAuth2 콜백 핸들러 |
| DB migration | skills, user_skills, google_tokens 테이블 |

### Modified Files

| File | Changes |
|------|---------|
| `proto/jiki/v1/agent.proto` | FILE ResponseType + file_data/name/mime 필드 |
| `agent/src/jiki_agent/graph/agent.py` | 스킬 패키지에서 도구 임포트 + dynamic_prompt 스킬 컨텍스트 |
| `agent/src/jiki_agent/grpc/server.py` | 스트림에서 pop_pending_files → FILE 응답 + import 경로 변경 |
| `agent/src/jiki_agent/__main__.py` | startup 시 skills 테이블 등록 |
| `gateway/internal/telegram/bot.go` | /skills 명령 + skill:toggle 콜백 + FILE 처리 |
| `gateway/internal/scheduler/rules.go` | 각 규칙에 isSkillEnabled 체크 |
| `gateway/internal/scheduler/cron.go` | skillService 주입 |

### Deleted Files

| File | Reason |
|------|--------|
| `agent/src/jiki_agent/tools/` (전체 디렉토리) | skills/{name}/tools.py로 이전 |

---

## 구현 로드맵

```
Phase 1: Foundation (스킬 레지스트리 인프라)       ✅ 완료
  ├─ DB migration: skills, user_skills
  ├─ skills/ 패키지 구조 생성
  ├─ registry.py + guard.py + loader.py + file_context.py
  ├─ db/repositories/skill.py
  ├─ 기존 tools/*.py → skills/{name}/tools.py 이전
  ├─ 각 스킬에 SKILL.md 작성 (LLM 지시문)
  ├─ graph/agent.py: dynamic_prompt에 SKILL.md 로딩 + 도구 제외
  ├─ Gateway: /skills 명령 + InlineKeyboard + 콜백
  └─ Scheduler: 각 규칙에 isSkillEnabled 체크

Phase 2: Documents (문서 확장)                    ✅ 완료
  ├─ document/parser.py 확장 (docx, xlsx, pptx, hwp, md, txt, csv)
  ├─ document/generator.py (pdf, docx, xlsx, md, txt)
  ├─ Proto: FILE 타입 + file_data/name/mime
  ├─ Gateway: FILE 타입 처리 (사진/문서/음성/비디오 분기)
  └─ skills/file_context.py 연동

Phase 3: Media Generation (미디어 생성)            ✅ 완료
  ├─ image/tools.py (analyze_image + generate_image via Imagen 3)
  ├─ audio/tools.py (transcribe_audio + generate_audio via Cloud TTS)
  └─ video/tools.py (analyze_video + generate_video)

Phase 4: Google Workspace                          ✅ 완료
  ├─ DB migration: google_tokens
  ├─ google/api.py (OAuth2 인증 헬퍼)
  ├─ Gateway: handler/google.go (OAuth 콜백)
  └─ google/tools.py (12개 @tool 함수)

Phase 5: Advanced Media                            ✅ 완료
  ├─ video/tools.py (Veo 2 생성)
  └─ 멀티모달 교차 검색 (RAG)

Phase 6: Web Search + Quality                      ✅ 완료
  ├─ websearch/tools.py (web_search via Tavily + web_fetch via httpx)
  ├─ websearch/SKILL.md (LLM 지시문)
  ├─ PDF 생성 fpdf2 → ReportLab 마이그레이션 (한글 지원 개선)
  ├─ TTS Google Cloud → Gemini TTS 마이그레이션
  └─ 단위 테스트 138 → 164개 확장

Phase 7: Weather                                     ✅ 완료
  ├─ weather/tools.py (get_weather + get_forecast via Open-Meteo)
  ├─ weather/SKILL.md (LLM 지시문)
  └─ 단위 테스트 164 → 188개 확장

Phase 8: Summarize                                    ✅ 완료
  ├─ summarize/tools.py (summarize_url + summarize_text via Gemini LLM)
  ├─ summarize/SKILL.md (LLM 지시문)
  └─ 단위 테스트 188 → 223개 확장

Phase 9: Tier 1 Skills (번역/QR/계산기/알림)            ✅ 완료
  ├─ translate/tools.py (translate_text via Gemini LLM, 7개 언어)
  ├─ qrcode/tools.py (generate_qrcode via qrcode lib → PNG)
  ├─ calculator/tools.py (calculate via ast 안전 평가, math 함수/상수)
  ├─ reminder/tools.py (set/list/delete_reminder via knowledge_repo)
  ├─ pyproject.toml: qrcode[pil]>=8.0 의존성 추가
  └─ 단위 테스트 223 → 317개 확장
```

---

## 검증 방법

### 1. 빌드 확인

```bash
# Go
cd gateway && go build ./cmd/gateway && go vet ./...

# Python
cd agent && uv run python -c "
from jiki_agent.skills.registry import SKILLS, get_skill_for_tool
from jiki_agent.skills.guard import skill_guard
from jiki_agent.skills.finance.tools import save_finance
print(f'Skills: {len(SKILLS)}')
print(f'save_finance → {get_skill_for_tool(\"save_finance\")}')
print('OK')
"
```

### 2. 통합 테스트

- **스킬 토글**: `/skills` → 가계부 끄기 → "오늘 점심 만원" → 비활성 메시지 확인 → 다시 켜기 → 정상 기록
- **프롬프트 제외**: 가계부 끄기 → LLM이 save_finance를 호출하지 않는지 확인 (prompt에서 제거)
- **SKILL.md 로딩**: 가계부 켜기 → dynamic_prompt에 finance/SKILL.md 내용이 포함되는지 확인
- **스케줄러 체크**: 예산 스킬 비활성 → budget_warning cron 실행 → 해당 사용자 스킵 확인
- **파일 생성**: "보고서 PDF로 만들어줘" → Telegram에서 파일 수신 확인
- **구글 연동**: "구글 연동" → OAuth URL → 브라우저 인증 → "내일 일정" → 일정 반환
- **날씨**: "서울 날씨 어때?" → 현재 날씨 반환 / "이번 주 날씨" → 7일 예보 반환
- **요약 (URL)**: "이 기사 요약해줘: https://..." → AI 요약 반환
- **요약 (텍스트)**: "이 내용 요약해줘: (긴 텍스트)" → AI 요약 반환
- **요약 스타일**: "포인트별로 정리해줘" → bullets 스타일 / "자세히 요약해줘" → detailed 스타일
- **요약 스킬 토글**: `/skills` → 요약 끄기 → "요약해줘" → 비활성 메시지 확인
- **번역**: "이 문장 영어로 번역해줘: 안녕하세요" → 영어 번역 반환
- **번역 (자동감지)**: "Translate to Japanese: Hello" → 일본어 번역 반환
- **QR코드**: "https://example.com QR코드 만들어줘" → QR 이미지 수신
- **계산기**: "sqrt(144) + 3^2" → 계산 결과 반환
- **계산기 (안전)**: "import os" → 허용되지 않는 수식 오류
- **알림 설정**: "내일 오전 9시에 회의 알려줘" → 알림 예약 확인
- **알림 조회**: "알림 목록 보여줘" → 활성 알림 목록
- **알림 삭제**: "알림 취소해줘" → 알림 삭제 확인

### 3. DB 확인

```sql
-- 등록된 스킬 확인
SELECT id, name, emoji, permission_level, enabled_by_default
FROM skills ORDER BY sort_order;

-- 사용자 스킬 설정 확인
SELECT s.id, s.name, COALESCE(us.enabled, s.enabled_by_default) AS enabled
FROM skills s
LEFT JOIN user_skills us ON s.id = us.skill_id AND us.user_id = 'test_user'
ORDER BY s.sort_order;
```

---

## 테스트

### 단위 테스트 (317개, 모두 통과)

| 테스트 파일 | 범위 | 테스트 수 |
|-------------|------|----------|
| `test_finance_tools.py` | save_finance, get_monthly_total | 20 |
| `test_finance_repo.py` | finance CRUD | 7 |
| `test_profile_repo.py` | profile CRUD | 7 |
| `test_file_context.py` | add/pop_pending_files | 5 |
| `test_skill_guard.py` | @skill_guard 동작 | 5 |
| `test_registry.py` | SKILLS dict, 역매핑 | 13 |
| `test_loader.py` | SKILL.md 파싱, progressive disclosure | 13 |
| `test_parser.py` | extract_text 라우터, 포맷별 파서 | 12 |
| `test_generator.py` | PDF/DOCX/XLSX/MD/TXT 생성기 | 15 |
| `test_websearch_tools.py` | web_search, web_fetch, 헬퍼 함수 | 26 |
| `test_weather_tools.py` | get_weather, get_forecast, WMO코드, geocode | 24 |
| `test_summarize_tools.py` | summarize_url, summarize_text, 프롬프트, HTML처리 | 35 |
| `test_translate_tools.py` | translate_text, 프롬프트 빌드, 지원 언어 | 17 |
| `test_qrcode_tools.py` | generate_qrcode, 입력 검증, 바이너리 출력 | 11 |
| `test_calculator_tools.py` | calculate, safe_eval, 수식 포맷, 보안 차단 | 27 |
| `test_reminder_tools.py` | set/list/delete_reminder, 입력 스키마 | 19 |
| 기타 (image, audio, video, google 등) | 각 스킬 도구 | 41 |

```bash
cd agent && uv run pytest tests/ -q
# 317 passed
```

### 통합 검증

```bash
# 레지스트리: 21개 스킬, 44개 도구
# ALL_TOOLS 일치 확인
# 역매핑 (tool→skill) 전수 확인
# SKILL.md 로딩: 18개 문서
# 파일 컨텍스트 파이프라인: OK
# 문서 파서/생성기: OK (ReportLab PDF + 한글 지원)
# Go 빌드 + vet: OK
```

---

## 실시간 진행 상태 표시 (Tool Status Message)

Agent가 처리하는 동안 Telegram 채팅에 현재 상태를 실시간으로 표시하는 기능.
Proto에 이미 존재하는 `TOOL_CALL` ResponseType과 `tool_name` 필드를 활용하여 Gateway만 수정.

### 동작 방식

```
스트림 시작 → "💭 생각중..." 상태 메시지 전송 (statusMsgID 저장)
  ↓
TOOL_CALL → statusMsgID edit ("🔍 웹 검색중...")
  ↓
TOOL_CALL (2번째) → statusMsgID edit ("📄 웹페이지 읽는중...")
  ↓
첫 TEXT 도착 → statusMsgID를 sentMsgID로 전환 (상태 메시지를 응답 메시지로 재활용)
  ↓
TEXT 축적 + throttled edit (기존 로직 동일)
  ↓
STREAM_END → 최종 Markdown 포맷 (기존 로직 동일)
```

- 상태 메시지와 응답 메시지가 하나의 Telegram 메시지로 연결 (edit 패턴)
- 사용자는 메시지 1개만 보이며, "생각중..." → "도구 사용중..." → 최종 응답으로 자연스럽게 전환
- 에러/스트림 종료 시 고아 상태 메시지 자동 정리

### 도구별 상태 메시지 (44개)

| 도구 | 상태 메시지 |
|------|-------------|
| save_finance | 💰 가계부 기록중... |
| get_monthly_total | 📊 지출 조회중... |
| set_budget / get_budget_status | 📊 예산 설정/확인중... |
| save_daily_log | 📔 일기 저장중... |
| set_goal / get_goals / update_goal_status | 🎯 목표 설정/조회/업데이트중... |
| create_schedule / list_schedules / cancel_schedule | 📅 일정 생성/조회/취소중... |
| retrieve_memory | 🧠 기억 검색중... |
| analyze_image / generate_image | 🖼️ 이미지 분석중... / 🎨 이미지 생성중... |
| parse_document / generate_document | 📄 문서 분석/생성중... |
| transcribe_audio / generate_audio | 🎵 음성 인식/생성중... |
| analyze_video / generate_video | 🎬 비디오 분석/생성중... |
| web_search / web_fetch | 🔍 웹 검색중... / 📄 웹페이지 읽는중... |
| get_weather / get_forecast | 🌤️ 날씨 조회중... / 🌤️ 일기예보 조회중... |
| summarize_url / summarize_text | 📝 URL 요약중... / 📝 텍스트 요약중... |
| translate_text | 🌐 번역중... |
| generate_qrcode | 🔲 QR 코드 생성중... |
| calculate | 🧮 계산중... |
| set_reminder / list_reminders / delete_reminder | ⏰ 알림 설정/조회/삭제중... |
| google_calendar_* | 📅 구글 캘린더 조회/생성중... |
| google_mail_* | 📧 메일 조회/전송중... |
| google_docs_* / google_tasks_* / google_drive_* | 각 서비스별 상태 |
| (미등록 도구) | ⏳ {도구명} 처리중... (fallback) |

### UX 시나리오

```
# 직접 응답
User: "안녕!"
Bot:  "💭 생각중..."  →  "안녕하세요! 오늘 뭘 도와드릴까요?"

# 단일 도구 호출
User: "오늘 점심 만원 식비"
Bot:  "💭 생각중..."  →  "💰 가계부 기록중..."  →  "점심 식비 10,000원 기록했어요!"

# 다중 도구 호출
User: "비트코인 현재 가격 검색해서 알려줘"
Bot:  "💭 생각중..."  →  "🔍 웹 검색중..."  →  "📄 웹페이지 읽는중..."  →  "비트코인 현재 가격은..."
```

### 변경 파일

| File | Changes |
|------|---------|
| `gateway/internal/telegram/bot.go` | `toolStatusText` 맵 + `getToolStatus()` + `statusMsgID` lifecycle |

---

**상태**: ✅ 구현 완료 (Phase 1-9 + Tool Status)
**날짜**: 2026-03-02
