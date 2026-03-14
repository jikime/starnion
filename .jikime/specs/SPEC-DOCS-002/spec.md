# SPEC-DOCS-002: Starnion 문서 전면 재구성 - 전체 메뉴 반영 및 통합/설정 섹션 개편

## 메타데이터

| 필드 | 값 |
|------|-----|
| SPEC ID | SPEC-DOCS-002 |
| 제목 | Starnion 문서 전면 재구성 - 전체 메뉴 반영 및 통합/설정 섹션 개편 |
| 상태 | Planning |
| 우선순위 | High |
| 생성일 | 2026-03-14 |

## 환경

- 문서 시스템: Nextra (Next.js 기반 문서 사이트)
- 지원 언어: ko, en, ja, zh (4개 언어)
- 문서 경로: `docs/` (언어별 서브디렉토리)

## 가정 사항

- 기존 문서 구조(`docs/ko/`, `docs/en/`, `docs/ja/`, `docs/zh/`)가 존재한다
- 각 메뉴 페이지는 동일한 구조로 4개 언어 버전이 모두 필요하다
- 현재 `llm-providers.md`는 `models.md`로 대체되거나 내용이 이전된다
- 통합(Integrations) 섹션은 외부 서비스 연동만 다루며, LLM 설정은 Settings > Models로 이동한다
- `garden.md`(데이터 가든)은 복잡한 애니메이션 데이터 시각화를 설명해야 한다
- `wellness.md`(마음 정원)은 힐링 트리, Nion 컴패니언, 기분 추적을 포함한다

## 요구사항

### Ubiquitous (항상 적용)

- The system SHALL maintain identical navigation structure across all four language versions (ko, en, ja, zh).
- The system SHALL use consistent Korean/English menu name pairs in all documentation.
- The system SHALL include a metadata table (SPEC ID, title, status, priority, created date) in all documentation files.
- The system SHALL document every menu item visible in the actual UI sidebar.

### Event-Driven (이벤트 기반)

- WHEN a new menu page documentation is created, THEN all four language versions (ko, en, ja, zh) SHALL be created simultaneously.
- WHEN the integrations section is updated, THEN the LLM providers reference SHALL be removed and replaced with six external service entries: Google Workspace, Notion, Github, Tavily, 네이버 검색, Gemini.
- WHEN the Settings section documentation is updated, THEN Models and Personas SHALL be documented as sub-pages of Settings.
- WHEN `llm-providers.md` content is migrated, THEN the LLM provider/model configuration content SHALL be moved to `models.md` under the Settings section.

### State-Driven (상태 기반)

- IF a menu group exists in the UI sidebar (FINANCE, LIFE, REPORTS, MEDIA, TOOLS, MONITORING, SETTINGS), THEN that group SHALL have a corresponding documentation section.
- IF a documentation file is missing for any of the 12 new menu items, THEN the Phase 1 milestone SHALL be considered incomplete.
- IF the integrations section still references "LLM 프로바이더" as an integration, THEN the documentation SHALL be considered non-compliant with this SPEC.
- IF the Settings section does not document Models and Personas as sub-pages, THEN the Phase 3 milestone SHALL be considered incomplete.

### Unwanted (금지 사항)

- The system SHALL NOT document "LLM 프로바이더" as an integration service (it belongs in Settings > Models).
- The system SHALL NOT leave any menu item visible in the UI sidebar without corresponding documentation.
- The system SHALL NOT create documentation for a menu that does not exist in the actual UI.
- The system SHALL NOT have structural inconsistency between language versions (e.g., ko has a page that en lacks).

### Optional (선택 사항)

- WHERE possible, provide screenshots or UI diagrams for visually complex pages (garden, wellness).
- WHERE possible, include usage examples and common workflows for each menu page.

## 세부 명세

### 전체 메뉴 구조 (실제 UI 기준)

```
Main
  - Dashboard
  - Chat
  - Channels         ← 신규 문서 필요

FINANCE group
  - Finance (가계부)
  - Budget (예산 관리)      ← 신규 문서 필요
  - Statistics (소비 분석)  ← 신규 문서 필요

LIFE group
  - Garden (데이터 가든)    ← 신규 문서 필요
  - Wellness (마음 정원)    ← 신규 문서 필요
  - Diary (일기)
  - Goals (목표 관리)
  - DDay (디데이)           ← 신규 문서 필요
  - Memo (메모)

REPORTS group
  - Reports (리포트 센터)
  - Analytics (통계/분석)   ← 신규 문서 필요

MEDIA group
  - Documents (문서)        ← 신규 문서 필요
  - Images (이미지)
  - Audio (오디오)

TOOLS group
  - Search (웹검색)         ← 신규 문서 필요
  - Skills (스킬)

MONITORING group
  - Logs (로그)             ← 신규 문서 필요
  - Usage (사용량)

SETTINGS group
  - Settings (설정)
  - Notifications/Cron (알림 센터)
  - Models (모델)           ← 신규 문서 필요 (기존 LLM 프로바이더 대체)
  - Personas (페르소나)     ← 신규 문서 필요
  - Integrations (연동)
```

### 신규 문서 목록 (12개 메뉴 × 4개 언어 = 48개 파일)

| 파일명 | 메뉴 한국어명 | 그룹 | 설명 |
|--------|--------------|------|------|
| `channels.md` | 채널 | Main | 채널 관리 및 구독 |
| `budget.md` | 예산 관리 | FINANCE | 월별/카테고리별 예산 설정 |
| `statistics.md` | 소비 분석 | FINANCE | 지출 패턴 통계 분석 |
| `garden.md` | 데이터 가든 | LIFE | 복잡한 애니메이션 데이터 시각화 |
| `wellness.md` | 마음 정원 | LIFE | 힐링 트리, Nion 컴패니언, 기분 추적 |
| `dday.md` | 디데이 | LIFE | 중요 날짜 카운트다운 |
| `analytics.md` | 통계/분석 | REPORTS | 종합 통계 및 분석 대시보드 |
| `documents.md` | 문서 | MEDIA | 문서 파일 관리 |
| `search.md` | 웹검색 | TOOLS | 웹 검색 기능 |
| `logs.md` | 로그 | MONITORING | 시스템 로그 조회 |
| `models.md` | 모델 | SETTINGS | LLM 프로바이더/모델 설정 (Settings 하위) |
| `personas.md` | 페르소나 | SETTINGS | Nion AI 페르소나 설정 (Settings 하위) |

### 통합(Integrations) 섹션 변경 사항

**제거:** `llm-providers.md` (또는 내용을 `models.md`로 이전 후 삭제/리다이렉트)

**신규 추가 또는 확인:**
- `google-workspace.md` - Google 워크스페이스 연동
- `notion.md` - Notion 연동
- `github.md` - GitHub 연동 (신규)
- `tavily.md` - Tavily 검색 API 연동 (신규)
- `naver-search.md` - 네이버 검색 API 연동 (신규)
- `gemini.md` - Google Gemini 연동 (신규)

### 설정(Settings) 섹션 변경 사항

**기존 유지:** `settings.md` (계정, 언어, 알림 설정)

**신규 추가:**
- `models.md` - LLM 프로바이더 선택 및 모델 설정 (기존 LLM 프로바이더 페이지 내용 이전)
- `personas.md` - Nion AI 페르소나 생성 및 관리

**업데이트:** `notifications.md` / `cron.md` - 시스템 알림 + 사용자 정의 스케줄 알림 통합 반영

## 추적성

| 요구사항 ID | 테스트 ID | 상태 |
|-------------|-----------|------|
| REQ-001 (신규 문서 생성) | TEST-001 | Pending |
| REQ-002 (통합 섹션 재구성) | TEST-002 | Pending |
| REQ-003 (설정 섹션 재구성) | TEST-003 | Pending |
| REQ-004 (4개 언어 동기화) | TEST-004 | Pending |
| REQ-005 (내비게이션 구조 업데이트) | TEST-005 | Pending |
