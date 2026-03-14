# 인수 기준: SPEC-DOCS-002

## 성공 기준

- [ ] 12개 신규 메뉴 문서가 4개 언어(ko, en, ja, zh) 모두 생성됨 (총 48개 파일)
- [ ] Integrations 섹션이 6개 외부 서비스만 포함함 (Google Workspace, Notion, Github, Tavily, 네이버 검색, Gemini)
- [ ] Settings 섹션에 Models와 Personas 하위 페이지가 존재함
- [ ] "LLM 프로바이더"가 Integrations 섹션에서 제거됨
- [ ] 4개 언어 버전 모두 동일한 파일 구조를 가짐
- [ ] 모든 메뉴 그룹(FINANCE, LIFE, REPORTS, MEDIA, TOOLS, MONITORING, SETTINGS)이 문서화됨

## 테스트 시나리오

### Scenario 1: 신규 메뉴 문서 존재 확인 (Happy Path)

**Given** SPEC-DOCS-002 구현이 완료된 상태에서
**When** `docs/ko/budget.md`, `docs/en/budget.md`, `docs/ja/budget.md`, `docs/zh/budget.md` 파일 존재 여부를 확인하면
**Then** 4개 파일 모두 존재해야 하며, 각 파일은 해당 언어로 작성된 예산 관리 기능 설명을 포함해야 한다

### Scenario 2: 12개 신규 메뉴 완전성 검증

**Given** Phase 1 구현이 완료된 상태에서
**When** 12개 신규 메뉴(channels, budget, statistics, garden, wellness, dday, analytics, documents, search, logs, models, personas)의 4개 언어 파일을 확인하면
**Then** 총 48개 파일이 모두 존재해야 하며, 어떤 언어 버전도 누락되어서는 안 된다

### Scenario 3: Integrations 섹션 정확성 검증

**Given** Phase 2 구현이 완료된 상태에서
**When** `docs/ko/integrations/` 디렉토리 내 파일 목록을 확인하면
**Then** 다음 조건을 모두 만족해야 한다:
- `llm-providers.md` 파일이 존재하지 않는다 (또는 `models.md`로 리다이렉트됨)
- `github.md`, `tavily.md`, `naver-search.md`, `gemini.md` 파일이 존재한다
- `google-workspace.md`, `notion.md` 파일이 존재한다 (기존 유지 또는 업데이트)
- Integrations 내비게이션에 정확히 6개 서비스가 표시된다

### Scenario 4: Settings 하위 페이지 구조 검증

**Given** Phase 3 구현이 완료된 상태에서
**When** `docs/ko/settings/` 디렉토리 내 파일 목록을 확인하면
**Then** 다음 파일들이 존재해야 한다:
- `settings.md` (기존: 계정, 언어, 알림 설정)
- `notifications.md` 또는 `cron.md` (알림 센터)
- `models.md` (신규: LLM 프로바이더/모델 설정)
- `personas.md` (신규: Nion AI 페르소나 설정)

### Scenario 5: 언어 버전 구조 일관성 검증 (Edge Case)

**Given** 모든 Phase 구현이 완료된 상태에서
**When** 4개 언어 디렉토리(`docs/ko/`, `docs/en/`, `docs/ja/`, `docs/zh/`)의 파일 목록을 각각 추출하면
**Then** 4개 디렉토리의 파일 구조가 완전히 동일해야 하며, 특정 언어에만 존재하거나 누락된 파일이 없어야 한다

### Scenario 6: LLM 프로바이더 페이지 이전 검증 (Error Case)

**Given** Phase 2, 3 구현이 완료된 상태에서
**When** 사용자가 기존 `llm-providers` 경로로 접근하면
**Then** 다음 중 하나를 만족해야 한다:
- `models.md` (Settings > Models)로 리다이렉트된다
- 또는 파일이 존재하지 않아 404 처리되며, Settings > Models 페이지에 동일 내용이 존재한다

### Scenario 7: 내비게이션 구조 정확성 검증

**Given** Phase 4 구현이 완료된 상태에서
**When** 문서 사이트 사이드바 내비게이션을 확인하면
**Then** 다음 그룹 구조가 정확히 표시되어야 한다:
- Main: Dashboard, Chat, Channels
- FINANCE: Finance, Budget, Statistics
- LIFE: Garden, Wellness, Diary, Goals, DDay, Memo
- REPORTS: Reports, Analytics
- MEDIA: Documents, Images, Audio
- TOOLS: Search, Skills
- MONITORING: Logs, Usage
- SETTINGS: Settings, Notifications/Cron, Models, Personas, Integrations

### Scenario 8: garden.md 복잡한 기능 설명 적정성 검증 (Edge Case)

**Given** `garden.md` 문서가 생성된 상태에서
**When** `docs/ko/garden.md` 파일 내용을 검토하면
**Then** 다음 내용이 포함되어 있어야 한다:
- 데이터 가든의 개념과 목적
- 복잡한 애니메이션 데이터 시각화에 대한 설명
- 주요 기능 목록 (최소 3개 이상)
- 사용 방법 (단계별)

### Scenario 9: wellness.md 핵심 기능 문서화 검증

**Given** `wellness.md` 문서가 생성된 상태에서
**When** `docs/ko/wellness.md` 파일 내용을 검토하면
**Then** 다음 내용이 모두 포함되어 있어야 한다:
- 힐링 트리(Healing Tree) 기능 설명
- Nion 컴패니언 기능 설명
- 기분 추적(Mood Tracking) 기능 설명
- 마음 정원의 종합적인 사용 목적

## 품질 게이트

| 게이트 | 기준 | 상태 |
|--------|------|------|
| 파일 완전성 | 48개 신규 파일 모두 존재 | Pending |
| 언어 동기화 | 4개 언어 동일 구조 유지 | Pending |
| 통합 섹션 정확성 | 6개 외부 서비스만 포함, LLM 프로바이더 제거 | Pending |
| Settings 구조 | Models, Personas 하위 페이지 존재 | Pending |
| 내비게이션 정확성 | 실제 UI와 문서 구조 일치 | Pending |
| 내용 적정성 | garden.md, wellness.md 핵심 기능 설명 포함 | Pending |

## 완료 정의 (Definition of Done)

- [ ] 모든 인수 기준이 충족됨
- [ ] 4개 언어 버전의 파일 구조가 동일함을 자동 검증 또는 수동 확인함
- [ ] Integrations 섹션이 6개 외부 서비스만 포함함을 확인함
- [ ] Settings 섹션에 Models, Personas 하위 페이지가 문서화됨을 확인함
- [ ] 내비게이션이 실제 UI 사이드바 구조와 일치함을 확인함
- [ ] 기술 검토 완료 (문서 내용 정확성 확인)
- [ ] 문서 사이트 빌드 성공 (빌드 에러 없음)
