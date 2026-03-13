# 구현 계획: SPEC-I18N-001

## 개요

Starnion 플랫폼 전반에 걸쳐 하드코딩된 한국어 문자열을 제거하고, 사용자별 언어 설정(ko/en/ja/zh)에 따라 LLM 프롬프트와 시스템 메시지가 동적으로 언어를 결정하도록 국제화(i18n) 아키텍처를 구축한다. 언어 설정은 `users.preferences` JSONB에 저장되며, UI의 설정 > 계정 탭에서 사용자가 직접 변경할 수 있다.

## 마일스톤

### 주요 목표 (Priority: High)
- [ ] DB: `users.preferences`에 `language` 필드 표준화 (마이그레이션 v1.4.0)
- [ ] Agent: `persona.py` `BASE_PROMPT` 한국어 고정 지시어 제거 및 `LANGUAGE_INSTRUCTIONS` 동적 주입
- [ ] Agent: `build_system_prompt()` 함수에 `language` 파라미터 추가
- [ ] Agent: `get_user_language()` 헬퍼 함수 구현 (DB 조회)
- [ ] Agent Skills: report/goals/conversation/pattern/audio 프롬프트 국제화
- [ ] Gateway: `profile.go` 핸들러에 `language` 필드 읽기/쓰기 추가
- [ ] UI: 설정 > 계정 탭에 언어 선택기 추가 (4개 locale)
- [ ] UI: `settings/page.tsx` 하드코딩 한글 → next-intl 번역 키 교체
- [ ] UI: 4개 `messages/*.json`에 `settings.language*` 번역 키 추가

### 보조 목표 (Priority: Medium)
- [ ] Gateway: `telegram/bot.go` 30+ 한글 메시지 다국어 맵으로 교체
- [ ] Gateway: Telegram 사용자 언어 캐시 구현 (30초 TTL 기존 `policyCache` 패턴 활용)
- [ ] Agent: `skills/audio/tools.py` 음성→텍스트 프롬프트 언어 파라미터화
- [ ] Gateway: `handler/models.go` API 에러 메시지 영문 표준화
- [ ] UI: `settings/page.tsx` 비밀번호 변경 섹션 완전 next-intl 적용

### 선택 목표 (Priority: Low)
- [ ] 신규 가입 시 브라우저 `Accept-Language` 헤더로 기본 언어 제안
- [ ] 언어 변경 즉시 UI 언어 전환 (새로 고침 없이)
- [ ] Gateway: `handler/models.go` `builtinPersonas` 이름/설명 다국어 처리

## 기술 접근

### 아키텍처

**언어 설정 저장**: `users.preferences JSONB → {"language": "en"}`
- 별도 컬럼 추가 없이 기존 JSONB 활용 (스키마 변경 최소화)
- Gateway `profile.go` API를 통해 읽기/쓰기

**Agent 언어 주입 패턴**: 프롬프트 주입 방식 (가장 안전하고 간단)
```
BASE_PROMPT (중립적) + [언어 블록] + [페르소나 톤 블록]
```
- `BASE_PROMPT`에서 `항상 한국어로 응답하며` 제거
- `LANGUAGE_INSTRUCTIONS` dict를 통해 언어별 지시어 동적 추가
- LLM이 시스템 프롬프트의 언어 지시어를 따르도록 구성

**Telegram 다국어**: 메시지 키-값 맵 방식
- `telegramMessages[lang][key]` 구조
- 사용자별 언어 캐시 (policyCache 패턴 활용)
- ko 폴백(fallback) 보장

**Skills 프롬프트**: 함수 파라미터 전달 방식
- 각 report/notification 함수에 `language: str = "ko"` 파라미터 추가
- `get_user_language(user_id)` 공유 헬퍼 사용

### 기술 스택

| 레이어 | 기술 | 변경 이유 |
|--------|------|---------|
| DB | PostgreSQL JSONB | 스키마 변경 최소화, 기존 preferences 구조 활용 |
| Agent | Python + langchain | 프롬프트 주입으로 LLM 언어 제어 |
| Gateway | Go + Echo | 미들웨어 없이 핸들러에서 language 필드 처리 |
| Telegram | go-telegram-bot-api | 다국어 메시지 맵으로 교체 |
| UI | next-intl (기존 4 locale) | 신규 번역 키만 추가 |

## 구현 단계

### Phase 1: DB 및 API 기반 구축
- **작업**: `users.preferences`에 `language` 필드 표준화 마이그레이션 작성
- **파일**: `docker/migrations/incremental/v1.4.0.sql`, `gateway/internal/cli/migrations/incremental/v1.4.0.sql`
- **작업**: `gateway/internal/handler/profile.go` — GET/PATCH에 `language` 필드 추가
- **선행 조건**: 없음

### Phase 2: Agent 핵심 국제화
- **작업**: `persona.py` — `BASE_PROMPT` 중립화, `LANGUAGE_INSTRUCTIONS` 추가, `build_system_prompt()` 시그니처 변경
- **파일**: `agent/src/starnion_agent/persona.py`
- **작업**: `graph/agent.py` — `get_user_language()` 헬퍼, `run_agent()` 에서 language 전달
- **파일**: `agent/src/starnion_agent/graph/agent.py`
- **선행 조건**: Phase 1

### Phase 3: Skills 프롬프트 국제화
- **작업**: 각 skill tools.py의 LLM 프롬프트에서 한국어 고정 지시어 제거, language 파라미터 추가
- **파일**:
  - `agent/src/starnion_agent/skills/report/tools.py`
  - `agent/src/starnion_agent/skills/goals/tools.py`
  - `agent/src/starnion_agent/skills/conversation/tools.py`
  - `agent/src/starnion_agent/skills/pattern/tools.py`
  - `agent/src/starnion_agent/skills/audio/tools.py`
- **선행 조건**: Phase 2

### Phase 4: UI 설정 페이지
- **작업**: `settings/page.tsx` — 언어 선택기 컴포넌트 추가, 기존 한글 하드코딩 next-intl 교체
- **파일**: `ui/app/(dashboard)/settings/page.tsx`
- **작업**: 4개 messages 파일에 `language` 관련 번역 키 추가
- **파일**: `ui/messages/ko.json`, `ui/messages/en.json`, `ui/messages/ja.json`, `ui/messages/zh.json`
- **작업**: UI API route에 language 필드 처리 추가
- **파일**: `ui/app/api/settings/account/route.ts` (또는 동등한 파일)
- **선행 조건**: Phase 1

### Phase 5: Telegram 다국어 (보조 목표)
- **작업**: `bot.go` — `telegramMessages` 맵 구축 (ko/en/ja/zh), `getMessage()` 헬퍼 추가, 기존 한글 메시지 교체
- **파일**: `gateway/internal/telegram/bot.go`
- **선행 조건**: Phase 1 (언어 조회 API)

## 리스크 및 완화 방안

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|---------|
| LLM이 언어 지시어를 무시하는 경우 | 높음 | 시스템 프롬프트 언어 지시어를 최상위에 배치, 검증 테스트 추가 |
| `personas` 테이블의 기존 한국어 `name` 컬럼 의존성 | 중간 | `_NAME_TO_ID` 역매핑 유지, 표시명만 번역 (ID는 영문 유지) |
| Telegram 봇 30+ 메시지 번역 누락 | 중간 | 번역 키 enum 정의, 컴파일 타임 검증 추가 |
| 기존 사용자 language 필드 없음 | 낮음 | 마이그레이션으로 `ko` 기본값 설정, `get_user_language()` null-safe 처리 |
| next-intl locale 전환 시 서버 컴포넌트 재렌더링 | 낮음 | 클라이언트 컴포넌트에서 처리, 필요 시 page reload |

## 관련 SPEC

- **선행 없음**: 독립적인 SPEC
- **후속 가능**: SPEC-I18N-002 (Telegram 다국어 알림 고도화)
