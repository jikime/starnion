# SPEC-I18N-001: 사용자 언어 설정 및 다국어 응답 국제화

## 메타데이터

| 필드 | 값 |
|------|-----|
| SPEC ID | SPEC-I18N-001 |
| 제목 | User Language Preference & Internationalization |
| 상태 | Planning |
| 우선순위 | High |
| 생성일 | 2026-03-13 |

## 환경

- **Framework**: Go (Gateway) + Python LangGraph (Agent) + Next.js 16 App Router (UI)
- **Database**: PostgreSQL 16 — `users` 테이블 `preferences JSONB` 컬럼 활용
- **i18n**: next-intl (UI) — 기존 ko/en/ja/zh 4개 locale 지원
- **AI**: LangChain (Python) — SystemMessage/HumanMessage 기반 프롬프트 주입
- **Telegram**: go-telegram-bot-api v5

## 현황 분석 (하드코딩 한글 범위)

### Agent (Python)

| 파일 | 하드코딩 내용 | 위험도 |
|------|--------------|--------|
| `persona.py` | `BASE_PROMPT` 전체, 페르소나 tone 지침 (5개) | 최고 |
| `skills/conversation/tools.py` | LLM 프롬프트 (`당신은 사용자 대화 분석 전문가...`), 반환 메시지 | 높음 |
| `skills/goals/tools.py` | 도구 설명 (Field description), 반환 문자열, LLM 프롬프트 | 높음 |
| `skills/report/tools.py` | LLM 프롬프트 (`당신은 개인 재정 AI 비서...`), 에러 메시지 | 높음 |
| `skills/pattern/tools.py` | `WEEKDAY_NAMES` dict, 데이터 부족 메시지 | 중간 |
| `skills/audio/tools.py` | 음성→텍스트 지시 프롬프트 | 중간 |

### Gateway (Go)

| 파일 | 하드코딩 내용 | 위험도 |
|------|--------------|--------|
| `telegram/bot.go` | 30+ 개의 한글 응답 메시지 (`죄송해요`, `안녕하세요!` 등) | 최고 |
| `handler/models.go` | `builtinPersonas` 이름/설명, API 에러 메시지 (`API 키가 유효하지 않아요`) | 높음 |
| `handler/profile.go` | 에러 메시지는 영문이나 일부 컨텍스트 누락 | 낮음 |

### UI (Next.js)

| 파일 | 하드코딩 내용 | 위험도 |
|------|--------------|--------|
| `settings/page.tsx` | `저장에 실패했어요`, `비밀번호 변경`, `이메일은 변경할 수 없어요` 등 | 중간 |
| `settings/page.tsx` | `불러오는 중...`, `저장됐어요`, `변경됐어요` 등 | 낮음 |

## 가정

1. `users.preferences JSONB` 컬럼에 `"language"` 키를 추가하는 방식으로 설계 (스키마 마이그레이션 최소화)
2. 지원 언어는 기존 next-intl locale과 일치: `ko`, `en`, `ja`, `zh` (4개)
3. 기본 언어는 `ko` (한국어) — 기존 동작 보존
4. Agent의 LLM 프롬프트는 언어 지시어 주입 방식 채택 (기존 `BASE_PROMPT` 구조 유지)
5. Telegram 봇 메시지는 사용자 언어 설정을 조회하여 번역
6. 페르소나 이름/설명은 다국어 매핑 테이블로 관리

## 요구사항

### Ubiquitous (항상 적용)

- REQ-001: 시스템은 모든 LLM 응답 생성 시 해당 사용자의 `preferred_language` 설정을 참조해야 한다.
- REQ-002: 시스템은 언어 설정이 없는 사용자에게 기본 언어(`ko`)를 적용해야 한다.
- REQ-003: 시스템은 `users.preferences` JSONB 내 `"language"` 필드로 언어 설정을 저장해야 한다.

### Event-Driven (이벤트 기반)

- REQ-004: WHEN 사용자가 설정 > 계정 탭에서 언어를 변경하면 THEN 해당 설정이 즉시 DB에 저장되어야 한다.
- REQ-005: WHEN Agent가 LLM 프롬프트를 생성하면 THEN `build_system_prompt()`는 `language_instruction` 블록을 프롬프트에 주입해야 한다.
- REQ-006: WHEN Telegram 봇이 사용자 메시지를 수신하면 THEN 해당 사용자의 언어 설정을 조회하여 응답 언어를 결정해야 한다.
- REQ-007: WHEN 주간/일간/월간 리포트가 생성되면 THEN 사용자 언어 설정에 따라 LLM 프롬프트 언어를 변경해야 한다.
- REQ-008: WHEN 목표/패턴 분석 노티피케이션이 생성되면 THEN 사용자 언어 설정을 반영하여 응답을 생성해야 한다.

### State-Driven (상태 기반)

- REQ-009: IF 사용자의 `preferred_language`가 `en`이면 THEN Agent의 `BASE_PROMPT`는 영어 지시어를 포함해야 한다.
- REQ-010: IF 사용자의 `preferred_language`가 `ja`이면 THEN 텔레그램 봇 시스템 메시지는 일본어로 표시되어야 한다.
- REQ-011: IF 사용자의 `preferred_language`가 `zh`이면 THEN 리포트 프롬프트는 중국어 응답을 요청해야 한다.

### Unwanted (금지)

- REQ-012: 시스템은 LLM 프롬프트 내에 언어를 한국어로 강제하는 지시어(`항상 한국어로 응답`)를 하드코딩해서는 안 된다.
- REQ-013: 시스템은 UI 컴포넌트에 한글 문자열을 직접 하드코딩해서는 안 된다 (next-intl 번역 키 사용 필수).
- REQ-014: 시스템은 지원하지 않는 언어 코드를 `preferred_language`로 저장해서는 안 된다.

### Optional (선택)

- REQ-015: 가능하면 사용자의 브라우저 `Accept-Language` 헤더를 신규 가입 시 기본 언어로 제안한다.
- REQ-016: 가능하면 언어 설정 변경 시 현재 세션을 새로 고침하지 않고 즉시 UI 언어를 전환한다.

## 상세 스펙

### 1. DB 스키마 변경

```sql
-- users.preferences JSONB에 language 필드 추가
-- 별도 컬럼 불필요, preferences 내 "language" 키 사용
-- 예: {"language": "en", "persona": "assistant", "budget": {...}}
-- 마이그레이션: v1.4.0.sql
UPDATE users
SET preferences = jsonb_set(preferences, '{language}', '"ko"', true)
WHERE preferences->>'language' IS NULL;
```

**지원 언어 코드**: `ko` (한국어), `en` (English), `ja` (日本語), `zh` (中文)

### 2. Gateway API 변경

**GET/PATCH `/api/v1/settings/account`** (신규 `language` 필드 추가)

```json
// GET 응답
{
  "name": "홍길동",
  "email": "user@example.com",
  "language": "ko"
}

// PATCH 요청
{
  "language": "en"
}
```

**`/api/v1/profile`** 핸들러에 `language` 필드 읽기/쓰기 추가.

### 3. Agent `persona.py` 변경

```python
LANGUAGE_INSTRUCTIONS = {
    "ko": "항상 한국어로 응답하세요.",
    "en": "Always respond in English.",
    "ja": "常に日本語で回答してください。",
    "zh": "请始终用中文回答。",
}

def build_system_prompt(persona_id: str, custom_prompt: str | None = None,
                         language: str = "ko") -> str:
    """Build full system prompt with language instruction."""
    # ... 기존 로직 ...
    lang_instruction = LANGUAGE_INSTRUCTIONS.get(language, LANGUAGE_INSTRUCTIONS["ko"])
    language_block = f"\n\n## 응답 언어\n{lang_instruction}"
    return BASE_PROMPT_NEUTRAL + language_block + tone_block
```

`BASE_PROMPT`에서 `항상 한국어로 응답하며` 문구 제거.

### 4. Agent Context/State 변경

`context.py`에서 사용자 언어 설정을 로드하여 LangGraph state에 주입:

```python
# graph/agent.py — run_agent() 또는 동등한 엔트리포인트
user_language = await get_user_language(user_id)  # DB 조회
system_prompt = build_system_prompt(persona_id, custom_prompt, language=user_language)
```

### 5. Skills LLM 프롬프트 변경

각 skill의 LLM 프롬프트에서 한국어 고정 지시어를 제거하고 `language` 파라미터를 받아 동적으로 구성:

- `skills/report/tools.py`: `generate_weekly_report()`, `generate_daily_summary()`, `generate_monthly_closing()`
- `skills/goals/tools.py`: `generate_goal_status()`, `_build_evaluation_prompt()`
- `skills/conversation/tools.py`: `_build_conversation_analysis_prompt()`
- `skills/pattern/tools.py`: 패턴 분석 프롬프트
- `skills/audio/tools.py`: 음성 전사 프롬프트

### 6. Telegram Bot 변경

`bot.go`에 다국어 메시지 맵 추가:

```go
var telegramMessages = map[string]map[string]string{
    "ko": {
        "welcome": "안녕하세요! 저는 니온(Starnion)이에요...",
        "dm_disabled": "죄송해요, 현재 DM을 통한 메시지는 받지 않고 있어요.",
        // ...
    },
    "en": {
        "welcome": "Hello! I'm Nion (Starnion)...",
        "dm_disabled": "Sorry, I'm not currently accepting DMs.",
        // ...
    },
    // ja, zh 추가
}

func (b *Bot) getMessage(userID, key string) string {
    lang := b.getUserLanguage(userID)  // DB 조회 또는 캐시
    if msgs, ok := telegramMessages[lang]; ok {
        if msg, ok := msgs[key]; ok {
            return msg
        }
    }
    return telegramMessages["ko"][key]  // fallback
}
```

### 7. UI 설정 페이지 변경

**`ui/app/(dashboard)/settings/page.tsx`** — 계정 탭에 언어 선택기 추가:

- `Select` 컴포넌트로 언어 선택 (ko/en/ja/zh)
- `PATCH /api/settings/account` 로 저장
- 기존 한글 하드코딩 → next-intl 번역 키로 교체

**`ui/messages/*.json`** — `settings.language*` 번역 키 추가

### 8. UI API Route 변경

**`ui/app/api/settings/account/route.ts`** — `language` 필드 읽기/쓰기:

```typescript
// GET: language 필드 포함하여 반환
// PATCH: language 필드 업데이트 시 유효성 검사 (ko|en|ja|zh)
```

## 트레이서빌리티

| 요구사항 ID | 테스트 ID | 상태 |
|------------|---------|------|
| REQ-001 | TEST-001 | Pending |
| REQ-002 | TEST-002 | Pending |
| REQ-003 | TEST-003 | Pending |
| REQ-004 | TEST-004 | Pending |
| REQ-005 | TEST-005 | Pending |
| REQ-006 | TEST-006 | Pending |
| REQ-007 | TEST-007 | Pending |
| REQ-008 | TEST-008 | Pending |
| REQ-012 | TEST-009 | Pending |
| REQ-013 | TEST-010 | Pending |
