# Jiki 모델 관리 — 설계 및 구현 문서

## 개요

사용자별로 AI 프로바이더(Anthropic, Gemini, OpenAI, Z.AI, Custom)의 API 키와 사용할 모델을 설정하는 기능.
설정된 모델은 페르소나에 연결되어 채팅 요청마다 동적으로 적용된다.

---

## 지원 프로바이더

| 프로바이더 | ID | 기본 엔드포인트 |
|---|---|---|
| Anthropic | `anthropic` | `https://api.anthropic.com` |
| Google Gemini | `gemini` | `https://generativelanguage.googleapis.com` |
| OpenAI | `openai` | `https://api.openai.com` |
| Z.AI | `zai` | `https://api.z.ai/api/paas/v4` |
| Custom (OpenAI 호환) | `custom` | 사용자 지정 |

### 프로바이더별 지원 모델 카탈로그

```
anthropic:
  claude-opus-4-6, claude-opus-4-5, claude-opus-4-0
  claude-sonnet-4-6, claude-sonnet-4-5, claude-sonnet-4-0
  claude-3-7-sonnet-20250219, claude-3-5-sonnet-20241022
  claude-3-5-haiku-20241022, claude-3-haiku-20240307

gemini:
  gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash
  gemini-1.5-pro, gemini-1.5-flash

openai:
  gpt-5, gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini
  o3, o3-mini, o1

zai:
  glm-5, glm-4.7, glm-4.6, glm-4.5, glm-4.5-air, glm-4.5-flash

custom:
  사용자가 직접 모델 ID 입력
```

---

## DB 스키마

```sql
CREATE TABLE user_providers (
    user_id        UUID        NOT NULL REFERENCES profiles(uuid_id),
    provider       TEXT        NOT NULL,           -- anthropic | gemini | openai | zai | custom
    api_key        TEXT        NOT NULL DEFAULT '',
    base_url       TEXT        NOT NULL DEFAULT '',
    enabled_models TEXT[]      NOT NULL DEFAULT '{}',
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, provider)
);
```

- `enabled_models`: 사용자가 활성화한 모델 ID 배열. 비어 있으면 카탈로그 전체 표시.
- `api_key`: 암호화하지 않고 저장 (향후 vault 연동 예정). 마스킹된 값만 UI에 반환.
- `base_url`: Custom 프로바이더 또는 프록시 엔드포인트 설정용.

---

## API 엔드포인트 (Go Gateway)

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/v1/providers?user_id=` | 사용자 프로바이더 목록 조회 |
| `POST` | `/api/v1/providers?user_id=` | 프로바이더 저장/업데이트 (Upsert) |
| `DELETE` | `/api/v1/providers/:provider?user_id=` | 프로바이더 삭제 |
| `POST` | `/api/v1/providers/validate` | API 키 유효성 검증 |

### UpsertProvider 동작

```sql
INSERT INTO user_providers (user_id, provider, api_key, base_url, enabled_models, updated_at)
VALUES ($1, $2, $3, $4, $5, NOW())
ON CONFLICT (user_id, provider) DO UPDATE SET
    api_key        = CASE WHEN $3 = '' THEN user_providers.api_key ELSE $3 END,
    base_url       = $4,
    enabled_models = $5,
    updated_at     = NOW()
```

- `api_key`가 빈 문자열이면 기존 키를 유지 (모델만 변경 시 키 재입력 불필요).

### API 키 유효성 검증 (`ValidateProvider`)

저장 전 실제 API 호출로 키 유효성을 확인:

| 프로바이더 | 검증 방법 |
|---|---|
| `anthropic` | `POST /v1/messages` (max_tokens=1) — 401/403이 아니면 유효 |
| `openai` | `GET /v1/models` — 401/403이 아니면 유효 |
| `gemini` | `GET /v1beta/models?key=` — 400/401/403이 아니면 유효 |
| `zai` | `GET /api/paas/v4/models` — 401/403이 아니면 유효 |
| `custom` | base_url 존재 여부만 확인 (프로브 없음) |

---

## Next.js API 라우트 (프록시)

```
/api/settings/providers          → GET, POST
/api/settings/providers/:provider → DELETE
/api/settings/providers/validate → POST
```

- 서버 컴포넌트에서 `auth()`로 세션 확인 후 `session.user.id`를 `user_id`로 전달.
- API 키는 서버 사이드에서만 처리되어 클라이언트에 노출되지 않음.

---

## UI 구성 (`/settings/models`)

```
┌─────────────────────────────────────────────────────┐
│  모델                                                │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌─ Anthropic ──────────────────────────────────┐   │
│  │  API 키: [sk-ant-••••••••••••••••••••••1234]  │   │
│  │  [검증]  [저장]  [삭제]                        │   │
│  │                                              │   │
│  │  사용할 모델:                                  │   │
│  │  ☑ Claude Opus 4.6   ☑ Claude Sonnet 4.6    │   │
│  │  ☐ Claude Opus 4.5   ☑ Claude Haiku 3.5     │   │
│  │                                              │   │
│  │  직접 입력: [____________]  [추가]             │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌─ Google Gemini ──────────────────────────────┐   │
│  │  ...                                         │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 주요 UI 동작

1. **API 키 입력**: 저장 전 "검증" 버튼으로 유효성 확인 가능
2. **모델 체크박스**: `enabled_models` 배열로 저장. 체크 안 하면 전체 카탈로그 표시
3. **직접 모델 추가**: 카탈로그에 없는 모델 ID를 텍스트로 입력해 추가
4. **키 미입력 저장**: API 키 빈 값으로 저장 시 기존 키 유지 (모델 변경만 가능)

---

## Python 에이전트 연동

`user_providers` 테이블은 Python 에이전트에서 페르소나 조회 시 함께 읽힌다:

```python
# db/repositories/provider.py
SELECT
    p.name, p.description, p.provider, p.model, p.system_prompt,
    COALESCE(pr.api_key,  '') AS api_key,
    COALESCE(pr.base_url, '') AS base_url
FROM user_personas p
LEFT JOIN user_providers pr
    ON pr.user_id = p.user_id AND pr.provider = p.provider
WHERE p.user_id = %s AND p.is_default = TRUE
LIMIT 1
```

- `user_personas.provider` + `user_providers.api_key` 조합으로 LLM 인스턴스 생성.
- `api_key`가 없으면 기본 Gemini 인스턴스 사용.

---

## LLM 인스턴스 캐시

동일한 `(provider, model, api_key)` 조합은 캐시에서 재사용:

```python
# graph/agent.py
_MAX_LLM_CACHE = 50
_llm_cache: dict[tuple[str, str, str], Any] = {}

def _make_llm(provider, model, api_key, base_url="") -> Any:
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()[:16]
    cache_key = (provider, model, key_hash)
    if cache_key in _llm_cache:
        return _llm_cache[cache_key]
    # ... LangChain 인스턴스 생성 후 캐시 저장
```

- 캐시 최대 50개. 초과 시 가장 오래된 항목 제거 (FIFO).
- 서버 재시작 없이 모델 변경 즉시 반영.

---

## 지원 LangChain 클라이언트

| 프로바이더 | LangChain 클래스 |
|---|---|
| `anthropic` | `ChatAnthropic` (lazy import) |
| `gemini` | `ChatGoogleGenerativeAI` |
| `openai` | `ChatOpenAI` |
| `zai` | `ChatOpenAI` (base_url 지정) |
| `custom` | `ChatOpenAI` (사용자 base_url) |
