# 구현 계획: SPEC-DOCS-002

## 개요

Starnion 문서 사이트를 실제 UI 메뉴 구조와 완전히 일치시키기 위한 전면 재구성 작업이다.
누락된 12개 메뉴에 대한 문서를 4개 언어로 신규 생성하고, 통합(Integrations) 섹션과 설정(Settings) 섹션을 현행화한다.
총 48개의 신규 파일 생성과 기존 문서 구조 업데이트를 포함한다.

## 마일스톤

### Primary Goals (우선순위: High)

- [ ] Phase 1: 누락된 12개 메뉴 문서 신규 생성 (48개 파일)
- [ ] Phase 2: 통합(Integrations) 섹션 재구성
- [ ] Phase 3: 설정(Settings) 섹션 재구성

### Secondary Goals (우선순위: Medium)

- [ ] Phase 4: 기존 문서 내비게이션 구조 업데이트
- [ ] Phase 5: 전체 문서 크로스 링크 및 일관성 검증

### Optional Goals (우선순위: Low)

- [ ] 복잡한 페이지(garden, wellness)에 UI 다이어그램 또는 스크린샷 추가
- [ ] 각 메뉴 페이지에 사용 예시 및 워크플로우 예제 추가

## 기술 접근법

### 아키텍처

- 문서 사이트 프레임워크: Nextra (Next.js 기반)
- 언어별 디렉토리 구조: `docs/ko/`, `docs/en/`, `docs/ja/`, `docs/zh/`
- 각 언어 버전은 동일한 파일명과 구조를 유지
- 내비게이션은 `_meta.json` 또는 Nextra 설정 파일로 관리

### 기술 스택

- Markdown/MDX: 문서 콘텐츠 작성
- Nextra: 문서 사이트 렌더링 및 내비게이션
- i18n: 4개 언어(ko, en, ja, zh) 지원

## 구현 단계

### Phase 1: 누락된 메뉴 문서 신규 생성

**작업 목표:** 12개 메뉴에 대해 4개 언어 문서 생성 (총 48개 파일)

**신규 생성 파일 목록 (언어별 4개):**

| 파일명 | 한국어명 | 그룹 | 비고 |
|--------|---------|------|------|
| `channels.md` | 채널 | Main | 채널 관리 및 구독 |
| `budget.md` | 예산 관리 | FINANCE | 월별/카테고리별 예산 |
| `statistics.md` | 소비 분석 | FINANCE | 지출 패턴 분석 |
| `garden.md` | 데이터 가든 | LIFE | 복잡한 애니메이션 시각화 |
| `wellness.md` | 마음 정원 | LIFE | 힐링 트리, Nion, 기분 추적 |
| `dday.md` | 디데이 | LIFE | 날짜 카운트다운 |
| `analytics.md` | 통계/분석 | REPORTS | 종합 통계 대시보드 |
| `documents.md` | 문서 | MEDIA | 문서 파일 관리 |
| `search.md` | 웹검색 | TOOLS | 웹 검색 기능 |
| `logs.md` | 로그 | MONITORING | 시스템 로그 조회 |
| `models.md` | 모델 | SETTINGS | LLM 프로바이더/모델 설정 |
| `personas.md` | 페르소나 | SETTINGS | Nion AI 페르소나 설정 |

**각 파일 포함 내용:**
- 페이지 제목 및 한국어/영어 명칭
- 기능 개요 (2-3문장)
- 주요 기능 목록
- 사용 방법 (단계별)
- 주의사항 (해당 시)

**영향 파일:**
- `docs/ko/[filename].md` (12개)
- `docs/en/[filename].md` (12개)
- `docs/ja/[filename].md` (12개)
- `docs/zh/[filename].md` (12개)

**선행 조건:** 없음 (독립적으로 시작 가능)

---

### Phase 2: 통합(Integrations) 섹션 재구성

**작업 목표:** Integrations 섹션에서 LLM 프로바이더를 제거하고, 외부 서비스 6개 연동 문서로 재구성

**세부 작업:**

1. **`llm-providers.md` 처리:**
   - 기존 내용을 `models.md`(Phase 3에서 생성)로 이전
   - `llm-providers.md` 삭제 또는 `models.md`로 리다이렉트 처리

2. **신규 연동 문서 생성 (4개 언어 × 4개 = 16개 파일):**
   - `github.md` - GitHub 연동 설정 및 사용법
   - `tavily.md` - Tavily 검색 API 연동
   - `naver-search.md` - 네이버 검색 API 연동
   - `gemini.md` - Google Gemini 연동

3. **기존 연동 문서 확인 및 업데이트:**
   - `google-workspace.md` - 기존 존재 여부 확인 후 업데이트
   - `notion.md` - 기존 존재 여부 확인 후 업데이트

4. **Integrations 내비게이션 업데이트:**
   - `_meta.json` 또는 Nextra 설정에서 integrations 섹션 내비게이션 업데이트
   - 최종 연동 목록: Google Workspace, Notion, Github, Tavily, 네이버 검색, Gemini

**영향 파일:**
- `docs/[lang]/integrations/llm-providers.md` (삭제, 4개 언어)
- `docs/[lang]/integrations/github.md` (신규, 4개 언어)
- `docs/[lang]/integrations/tavily.md` (신규, 4개 언어)
- `docs/[lang]/integrations/naver-search.md` (신규, 4개 언어)
- `docs/[lang]/integrations/gemini.md` (신규, 4개 언어)
- `docs/[lang]/integrations/_meta.json` (업데이트, 4개 언어)

**선행 조건:** Phase 3 (`models.md` 생성) 완료 후 `llm-providers.md` 삭제 권장

---

### Phase 3: 설정(Settings) 섹션 재구성

**작업 목표:** Settings 섹션에 Models와 Personas 하위 페이지 추가 및 기존 LLM 프로바이더 내용 이전

**세부 작업:**

1. **`models.md` 신규 생성 (Settings 하위, 4개 언어):**
   - LLM 프로바이더 선택 방법
   - 모델별 설정 (temperature, max tokens 등)
   - 기존 `llm-providers.md` 내용 포함
   - Settings 그룹 내 위치 명시

2. **`personas.md` 신규 생성 (Settings 하위, 4개 언어):**
   - Nion AI 페르소나 개념 설명
   - 페르소나 생성/편집/삭제 방법
   - 페르소나 적용 및 전환 방법
   - Settings 그룹 내 위치 명시

3. **Settings 섹션 내비게이션 업데이트:**
   - 최종 구성: Settings, Notifications/Cron, Models, Personas, Integrations

**영향 파일:**
- `docs/[lang]/settings/models.md` (신규, 4개 언어)
- `docs/[lang]/settings/personas.md` (신규, 4개 언어)
- `docs/[lang]/settings/_meta.json` (업데이트, 4개 언어)

**선행 조건:** 없음 (Phase 1, 2와 병렬 진행 가능)

---

### Phase 4: 기존 문서 내비게이션 구조 업데이트

**작업 목표:** 전체 문서 사이트의 내비게이션이 실제 UI 메뉴 구조와 일치하도록 업데이트

**세부 작업:**

1. **상위 내비게이션 `_meta.json` 업데이트 (4개 언어):**
   - Main, FINANCE, LIFE, REPORTS, MEDIA, TOOLS, MONITORING, SETTINGS 그룹 반영
   - 각 그룹 내 정확한 메뉴 순서 반영

2. **그룹별 `_meta.json` 업데이트:**
   - FINANCE: finance, budget, statistics
   - LIFE: garden, wellness, diary, goals, dday, memo
   - REPORTS: reports, analytics
   - MEDIA: documents, images, audio
   - TOOLS: search, skills
   - MONITORING: logs, usage
   - SETTINGS: settings, notifications, models, personas, integrations

3. **크로스 링크 검증:**
   - 모든 내부 링크가 올바른 페이지를 가리키는지 확인
   - 깨진 링크 수정

**영향 파일:**
- `docs/[lang]/_meta.json` (업데이트, 4개 언어)
- `docs/[lang]/[group]/_meta.json` (업데이트, 각 그룹 × 4개 언어)

**선행 조건:** Phase 1, 2, 3 완료

---

## 리스크 및 완화 방안

| 리스크 | 영향도 | 완화 방안 |
|--------|--------|-----------|
| 기존 문서 구조가 예상과 다를 수 있음 | High | Phase 시작 전 실제 docs/ 디렉토리 구조 탐색 |
| `llm-providers.md` 삭제 시 기존 링크 깨짐 | Medium | 리다이렉트 설정 또는 모든 참조 링크 업데이트 |
| 4개 언어 동기화 누락 | Medium | 파일 생성 시 4개 언어 동시 생성 체크리스트 활용 |
| `garden.md` 복잡한 기능 설명 불충분 | Low | UI 스크린샷 또는 다이어그램 보완 |

## 관련 SPEC

- 선행: SPEC-I18N-001 (다국어 지원 기반 구조)
- 영향: 없음 (독립적 문서 작업)
