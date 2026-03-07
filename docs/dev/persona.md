# Jiki 페르소나 관리 — 설계 및 구현 문서

## 개요

사용자별로 AI의 응답 스타일·시스템 프롬프트·LLM 모델을 묶어서 관리하는 기능.
페르소나를 "기본"으로 설정하면 채팅 요청마다 자동으로 해당 프롬프트와 모델이 적용된다.
서버 재시작 없이 동적으로 변경된다.

---

## 기본 제공 페르소나 (Built-in)

사용자가 처음 `/settings/personas` 페이지를 방문하면 5개가 자동 시드(seed)된다.

| 페르소나 | ID (구 Telegram) | 기본 여부 | 특징 |
|---|---|---|---|
| 기본 비서 | `assistant` | ✅ 기본 | 존댓말, 간결한 정보 제공 |
| 금융 전문가 | `finance` | ❌ | 격식체, 수치·지표 중심 |
| 친한 친구 | `buddy` | ❌ | 반말, 이모지, 친근한 톤 |
| 재정 코치 | `coach` | ❌ | 격려 톤, 실천 방법 제안 |
| 데이터 분석가 | `analyst` | ❌ | 객관적, 팩트·통계 중심 |

---

## DB 스키마

```sql
CREATE TABLE user_personas (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES profiles(uuid_id),
    name          TEXT        NOT NULL,
    description   TEXT        NOT NULL DEFAULT '',
    provider      TEXT        NOT NULL DEFAULT '',  -- anthropic | gemini | openai | zai | custom | ''
    model         TEXT        NOT NULL DEFAULT '',  -- 모델 ID. 비어 있으면 기본 LLM 사용
    system_prompt TEXT        NOT NULL DEFAULT '',  -- 빈 값이면 built-in 톤 사용
    is_default    BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- 한 사용자당 `is_default = TRUE`인 행은 항상 1개.
- `provider` + `model`이 비어 있으면 기본 Gemini LLM 사용.
- `system_prompt`가 비어 있으면 `persona.py`의 built-in 톤 사용.

---

## API 엔드포인트 (Go Gateway)

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/v1/personas?user_id=` | 페르소나 목록 조회 (최초 방문 시 기본 5개 시드) |
| `POST` | `/api/v1/personas?user_id=` | 페르소나 생성 |
| `PUT` | `/api/v1/personas/:id?user_id=` | 페르소나 수정 |
| `DELETE` | `/api/v1/personas/:id?user_id=` | 페르소나 삭제 |

### ListPersonas — 최초 방문 시 자동 시드

```go
// 사용자 페르소나가 0개면 기본 5개를 INSERT
var count int
if err := h.db.QueryRowContext(ctx,
    `SELECT COUNT(*) FROM user_personas WHERE user_id = $1`, userID,
).Scan(&count); err == nil && count == 0 {
    for _, p := range builtinPersonas {
        h.db.ExecContext(ctx, `
            INSERT INTO user_personas (user_id, name, description, provider, model, system_prompt, is_default)
            VALUES ($1, $2, $3, '', '', $4, $5)
        `, userID, p.Name, p.Description, p.SystemPrompt, p.IsDefault)
    }
}
```

### UpdatePersona — 기본 페르소나 변경 (트랜잭션)

```go
tx, _ := h.db.BeginTx(ctx, nil)
defer tx.Rollback()

if body.IsDefault {
    // 1. 기존 기본 페르소나 해제
    tx.ExecContext(ctx, `UPDATE user_personas SET is_default = FALSE WHERE user_id = $1`, userID)
}
// 2. 대상 페르소나 업데이트 (is_default 포함)
tx.ExecContext(ctx, `UPDATE user_personas SET ... WHERE id = $1::uuid AND user_id = $2`, ...)
tx.Commit()
```

---

## Next.js API 라우트 (프록시)

```
/api/settings/personas           → GET, POST
/api/settings/personas/:id       → PUT, DELETE
```

- `auth()`로 세션 확인 후 `session.user.id`를 `user_id`로 전달.

---

## UI 구성 (`/settings/personas`)

```
┌──────────────────────────────────────────────────────┐
│  페르소나                              [+ 새 페르소나] │
├──────────────────────────────────────────────────────┤
│                                                       │
│  ┌─────────────────────┐  ┌─────────────────────┐   │
│  │ ⭐ 기본 비서          │  │ 금융 전문가           │   │
│  │  일상 업무 AI 비서   │  │ 재무 분석 전문가      │   │
│  │  [Gemini] [모델ID]  │  │  [기본] [✏️] [🗑️]   │   │
│  │  [기본 적용]        │  │  [Anthropic]         │   │
│  │  [✏️] [🗑️]         │  └─────────────────────┘   │
│  └─────────────────────┘                             │
│                                                       │
│  ┌─────────────────────┐  ┌─────────────────────┐   │
│  │ 친한 친구             │  │ 데이터 분석가          │   │
│  │  [기본] [✏️] [🗑️]   │  │  [기본] [✏️] [🗑️]   │   │
│  └─────────────────────┘  └─────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

### 페르소나 카드 구성 요소

- **⭐ 아이콘**: 현재 기본 페르소나 표시
- **"기본 적용" 뱃지**: `is_default = TRUE`인 카드에만 표시
- **"기본" 버튼**: 비기본 카드에만 표시. 클릭 시 즉시 기본 페르소나 변경 (다이얼로그 불필요)
- **✏️ 수정 버튼**: 편집 다이얼로그 열기
- **🗑️ 삭제 버튼**: 페르소나 삭제

### 편집 다이얼로그 필드

| 필드 | 설명 |
|---|---|
| 이름 (필수) | 페르소나 표시명 |
| 설명 | 짧은 설명 |
| 프로바이더 | 연결된 프로바이더 목록에서 선택 |
| 모델 | `user_providers.enabled_models` 기반 드롭다운 + "직접 입력..." 옵션 |
| 시스템 프롬프트 | 자유 입력. 비우면 기본 built-in 톤 사용 |
| 기본 페르소나 | 토글 스위치 |

### 모델 선택 로직 (동적)

```typescript
// 1순위: DB의 enabled_models (사용자가 모델 페이지에서 활성화한 목록)
// 2순위: PROVIDER_META 카탈로그 (전체 모델)
// 3순위: "직접 입력..." 선택 → 텍스트 입력
const availableModels = (): { id: string; name: string }[] => {
  const dbProvider = providerData.find(p => p.provider === form.provider)
  const enabledIds = dbProvider?.enabledModels ?? []
  if (enabledIds.length > 0) return enabledIds.map(id => ...)
  return PROVIDER_META[form.provider]?.models ?? []
}
```

---

## Python 에이전트 적용 흐름

채팅 요청마다 `_agent_node()` → `_get_enabled_context()` 실행:

```
1. user_personas WHERE is_default = TRUE 조회
   └─ provider + model + api_key 있으면 → LLM override 생성 (캐시 활용)
   └─ system_prompt 있으면 → custom_system_prompt 로 사용

2. LLM override가 없으면 → 기본 Gemini 사용
   └─ profiles.preferences.persona → persona_id (구 시스템 fallback)

3. enabled skills 조회 (user_skills 테이블)

4. build_system_prompt(persona_id, custom_system_prompt) 호출
   └─ custom_system_prompt 있으면 → BASE_PROMPT + custom_system_prompt
   └─ 없으면             → BASE_PROMPT + built-in 톤 (persona_id 기반)
```

### 시스템 프롬프트 우선순위

```
user_personas.system_prompt (DB, 사용자 정의)
    ↓ 없으면
persona.py PERSONAS[persona_id]["tone"] (코드, built-in)
    ↓ 없으면
DEFAULT_PERSONA = "assistant" 톤
```

### 로그 예시

```
[Persona] user=abc-123 | persona='데이터 분석가' | provider=anthropic | model=claude-sonnet-4-6 | custom_prompt=yes
[LLM] user=abc-123 | using override LLM: ChatAnthropic / claude-sonnet-4-6
```

---

## 텔레그램 `/persona` 명령어 연동

텔레그램 봇의 `/persona` 명령어는 인라인 키보드로 5개 페르소나를 표시.
선택 시 `user_personas.is_default`를 직접 업데이트한다.

### 텔레그램 ID → DB 이름 매핑

| Telegram ID | DB name |
|---|---|
| `assistant` | 기본 비서 |
| `finance` | 금융 전문가 |
| `buddy` | 친한 친구 |
| `coach` | 재정 코치 |
| `analyst` | 데이터 분석가 |

### 콜백 처리 (`handleCallback`)

```go
// 1. user_personas에서 기본 페르소나 변경 (트랜잭션)
tx.ExecContext(ctx, `UPDATE user_personas SET is_default = FALSE WHERE user_id = $1`, userID)
tx.ExecContext(ctx, `UPDATE user_personas SET is_default = TRUE, updated_at = NOW()
                     WHERE user_id = $1 AND name = $2`, userID, personaName)
tx.Commit()

// 2. profiles.preferences도 업데이트 (하위 호환 유지)
db.ExecContext(ctx, `UPDATE profiles SET preferences = ... || '{"persona":"analyst"}'::jsonb ...`, userID)
```

### 흐름도

```
텔레그램 /persona → 사용자가 "데이터 분석가" 선택
    ↓
bot.go: user_personas UPDATE is_default=TRUE WHERE name='데이터 분석가'
    ↓
다음 채팅 메시지 전송
    ↓
agent.py: user_personas WHERE is_default=TRUE → "데이터 분석가" 조회
    ↓
system_prompt = "객관적이고 간결하게 응답합니다..." 적용
```

---

## 구 시스템 vs 신 시스템 비교

| 항목 | 구 시스템 | 신 시스템 |
|---|---|---|
| 저장 위치 | `profiles.preferences.persona` (JSONB) | `user_personas.is_default` (전용 테이블) |
| 페르소나 정의 | `persona.py` 코드 하드코딩 | DB + 코드 병행 (사용자 커스텀 가능) |
| 모델 연결 | 불가 (시스템 프롬프트 톤만) | 가능 (provider + model 지정) |
| 커스텀 추가 | 불가 | 가능 (UI에서 생성) |
| 텔레그램 연동 | `profiles.preferences` 업데이트 | `user_personas` 직접 업데이트 |
| Fallback | — | `profiles.preferences` (하위 호환) |
