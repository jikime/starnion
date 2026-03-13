---
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, Task, WebFetch, AskUserQuestion]
description: "AI-powered legacy site rebuilding - capture screenshots, analyze source, generate modern code"
argument-hint: "[capture|analyze|generate] <url> [options]"
---

# /jikime:smart-rebuild - Legacy Site Rebuilding

> **"Rebuild, not Migrate"** — 코드를 변환하지 않고, 새로 만든다.

**참조 문서:**
- @.claude/rules/jikime/smart-rebuild-reference.md (Usage, Options, Frameworks)
- @.claude/rules/jikime/smart-rebuild-execution.md (상세 실행 절차, 코드 예시)

---

## 🔴 STEP 0: SCRIPTS_DIR 경로 찾기 (가장 먼저 실행!)

**Claude는 명령 실행 전에 반드시 스크립트 경로를 찾아야 합니다:**

```bash
# 1. Glob으로 스크립트 디렉토리 찾기
Glob: "**/jikime-migration-smart-rebuild/scripts/package.json"

# 2. 찾은 경로의 디렉토리가 SCRIPTS_DIR
# 예: /path/to/.claude/skills/jikime-migration-smart-rebuild/scripts
```

---

## 🚨🚨🚨 CRITICAL: UI 생성 핵심 원칙 🚨🚨🚨

**Claude는 반드시 HTML + 스크린샷을 보고 원본과 동일한 UI를 재현해야 합니다!**

### 🔴 HARD RULES (절대 위반 금지!)

1. **🔴 스크린샷 필수 분석**: 코드 작성 전에 반드시 스크린샷을 Read하고 **시각적으로 분석**
2. **🔴 HTML 구조 복사**: HTML의 `<header>`, `<nav>`, `<main>`, `<footer>` 구조 그대로 유지
3. **🔴 원본 텍스트 유지**: HTML에서 추출한 텍스트를 **번역 없이 원본 그대로** 사용
4. **🔴 원본 이미지 URL 사용**: HTML의 `<img src="...">` URL을 **그대로** 사용
5. **🔴 원본 CSS Fetch**: 원본 사이트의 CSS를 WebFetch로 가져와 `src/styles/legacy/`에 저장
6. **🔴 섹션 컴포넌트 분리**: 섹션별로 `components/{route}/*-section.tsx` 파일 생성
7. **🔴 섹션 식별자 필수**: 모든 주요 섹션에 `data-section-id` 추가 (HITL 비교용!)
8. **🔴 스크린샷 기반 스타일**: 색상, 폰트 크기, 간격은 **스크린샷에서 추출**
9. **🔴 kebab-case 네이밍**: 폴더/파일명은 반드시 **kebab-case** (`about-us/`, `hero-section.tsx`)
10. **🔴 섹션 정보 저장**: sitemap.json에 sections 배열 저장 (HITL에서 참조!)

### 🔴 섹션 ID 매핑 규칙 (HITL 필수!)

**Step 1: 원본 HTML 분석 → 섹션 감지**
| 원본 HTML 셀렉터 | 섹션 ID | 섹션 이름 |
|-----------------|---------|----------|
| `header`, `#header`, `.header` | `01` | `header` |
| `nav`, `#nav`, `.gnb` | `02` | `nav` |
| `.hero`, `.visual`, `.banner` | `03` | `hero` |
| `main`, `#main`, `.content` | `04` | `main` |
| `footer`, `#footer` | `05` | `footer` |

**Step 2: sitemap.json에 저장**
```json
{
  "pages": [{
    "id": 1,
    "sections": [
      { "id": "01", "name": "header", "selector": "header" },
      { "id": "02", "name": "nav", "selector": "#gnb" },
      { "id": "03", "name": "hero", "selector": ".hero" }
    ]
  }]
}
```

**Step 3: React 컴포넌트에 data-section-id 추가**
```tsx
// components/home/header-section.tsx
export function HeaderSection() {
  return (
    <header data-section-id="01-header">  // 🔴 필수!
      ...
    </header>
  );
}
```

**Step 4: HITL 비교 시 매칭**
| 원본 (시맨틱 셀렉터) | 로컬 (data-section-id) |
|---------------------|------------------------|
| `header` | `[data-section-id="01-header"]` |
| `.hero` | `[data-section-id="03-hero"]` |

### ❌ 절대 하지 말 것

- ❌ 스크린샷 안 보고 기본 템플릿으로 대충 만들기
- ❌ HTML 내용 번역하기 (영어→한글, 한글→영어)
- ❌ 텍스트나 이미지 내용 상상해서 창작하기
- ❌ 원본과 다른 레이아웃이나 색상 사용하기
- ❌ PascalCase 폴더명 사용 (`AboutUs/` ❌ → `about-us/` ✅)
- ❌ 섹션에 `data-section-id` 속성 빼먹기 (HITL 비교 불가!)
- ❌ 모든 코드를 page.tsx 한 파일에 다 넣기 (섹션 컴포넌트로 분리!)

---

## 🚨 generate frontend --page N 전체 워크플로우

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Phase A: 프로젝트 초기화 (첫 페이지인 경우만)                                 │
│  ──────────────────────────────────────────────────────────────────────────  │
│  - Next.js + shadcn/ui 프로젝트 생성                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Phase B: 페이지 기본 코드 생성 (🔴 HTML + 스크린샷 + CSS 필수!)               │
│  ──────────────────────────────────────────────────────────────────────────  │
│  0. 🔴 Lazy Capture 체크: page.captured === false면 캡처 실행!              │
│  1. Read: {capture}/sitemap.json (페이지 정보)                                │
│  2. Read: {capture}/{html_file} (🔴 HTML 구조 + 텍스트 + 이미지 URL 추출)      │
│  2.5. 🔴 섹션 감지 & sitemap.json 업데이트 (HITL 비교용!)                     │
│       - HTML에서 시맨틱 섹션 감지 (header, nav, main, footer 등)              │
│       - 각 섹션에 ID 부여 (01-header, 02-nav, 03-hero 등)                    │
│       - sitemap.json의 해당 페이지에 sections 배열 저장                       │
│  3. Read: {capture}/{screenshot_file} (🔴 레이아웃, 색상, 간격 시각 분석)      │
│  3.5. (첫 페이지만) WebFetch: 원본 CSS → src/styles/legacy/ 저장             │
│  4. Write: 섹션별 컴포넌트 (🔴 data-section-id 필수!)                         │
│       - components/{route}/*-section.tsx                                     │
│       - 각 섹션 루트에 data-section-id="{id}-{name}" 속성 추가                │
│  5. Write: page.tsx → 섹션 컴포넌트 import & 조합                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Phase C: 개발 서버 실행                                                      │
│  ──────────────────────────────────────────────────────────────────────────  │
│  Bash: cd {output}/frontend && npm run dev &                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Phase D: AskUserQuestion - 다음 단계 선택                                    │
│  ──────────────────────────────────────────────────────────────────────────  │
│  question: "페이지 {N} 기본 코드 생성 완료. 다음 작업은?"                      │
│  options:                                                                     │
│    - "HITL 세부 조정" → Phase E (HITL 루프) 진입                              │
│    - "🔴 백엔드 연동" → Phase G (동적 페이지만, API 생성 + Connect)           │
│    - "다음 페이지" → 페이지 N+1로 진행                                        │
│    - "직접 입력" → 사용자 지시 따르기                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌────────┬────────┼────────┬────────┐
                    ▼        ▼        ▼        ▼        ▼
            [HITL 조정] [BE 연동] [다음 페이지] [직접 입력]
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Phase E: HITL 루프 (섹션별 비교 및 수정) - 🔴 LOOP UNTIL ALL SECTIONS DONE   │
│  ──────────────────────────────────────────────────────────────────────────  │
│                                                                               │
│   ┌──────────────────────────────────────────────────────────────────────┐   │
│   │  E-1. hitl-refine.ts 실행 (Bash)                                     │   │
│   │       → 원본 사이트 캡처 + 로컬 사이트 캡처 + DOM 비교               │   │
│   └──────────────────────────────────────────────────────────────────────┘   │
│                                      │                                        │
│                                      ▼                                        │
│   ┌──────────────────────────────────────────────────────────────────────┐   │
│   │  E-2. JSON 결과 파싱                                                 │   │
│   │       → overallMatch%, issues[], suggestions[] 추출                  │   │
│   └──────────────────────────────────────────────────────────────────────┘   │
│                                      │                                        │
│                                      ▼                                        │
│   ┌──────────────────────────────────────────────────────────────────────┐   │
│   │  E-3. AskUserQuestion                                                │   │
│   │       "{섹션} 일치율 {N}%. 어떻게 처리할까요?"                        │   │
│   │       options: ["승인", "수정 필요", "스킵"]                          │   │
│   └──────────────────────────────────────────────────────────────────────┘   │
│                                      │                                        │
│              ┌───────────────────────┼───────────────────────┐               │
│              ▼                       ▼                       ▼               │
│         [승인]                 [수정 필요]                [스킵]             │
│              │                       │                       │               │
│              │               ┌───────┴───────┐               │               │
│              │               ▼               │               │               │
│              │    ┌─────────────────────┐    │               │               │
│              │    │ E-4. 코드 수정      │    │               │               │
│              │    │ (suggestions 기반)  │    │               │               │
│              │    └─────────────────────┘    │               │               │
│              │               │               │               │               │
│              │               ▼               │               │               │
│              │    ┌─────────────────────┐    │               │               │
│              │    │ 🔄 E-1로 돌아가기   │────┘               │               │
│              │    │ (재캡처 & 재비교)   │                    │               │
│              │    └─────────────────────┘                    │               │
│              │                                               │               │
│              └───────────────────┬───────────────────────────┘               │
│                                  ▼                                            │
│   ┌──────────────────────────────────────────────────────────────────────┐   │
│   │  E-5. 다음 섹션으로 이동                                             │   │
│   │       → 남은 섹션 있으면 E-1로 돌아가기                              │   │
│   │       → 모든 섹션 완료되면 Phase F로                                 │   │
│   └──────────────────────────────────────────────────────────────────────┘   │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Phase F: 페이지 완료 & 다음 페이지 질문                                       │
│  ──────────────────────────────────────────────────────────────────────────  │
│  1. sitemap.json에서 현재 페이지 status = "completed"                         │
│  2. AskUserQuestion: "페이지 {N} 완료! 다음 페이지로 진행할까요?"              │
│     - "예" → 다음 pending 페이지로                                            │
│     - "아니오" → 종료                                                         │
└─────────────────────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 Phase G: 백엔드 연동 (동적 페이지 선택 시)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─────────────────────────────────────────────────────────────────────────────┐
│  🔴 Phase G-0: 백엔드 프로젝트 초기화 (첫 동적 페이지에서 1회 실행)            │
│  /jikime:smart-rebuild backend-init --framework spring-boot                  │
│  ──────────────────────────────────────────────────────────────────────────  │
│                                                                               │
│   G-0.1. 백엔드 프로젝트 존재 확인                                            │
│          IF {output}/backend/ 없음 → G-0.2로 진행                            │
│          ELSE → G-1로 스킵                                                   │
│                                                                               │
│   G-0.2. AskUserQuestion (프레임워크 선택)                                    │
│          "백엔드 프레임워크를 선택하세요"                                     │
│          options:                                                             │
│            - "Spring Boot (Java)" → spring-boot                              │
│            - "FastAPI (Python)"   → fastapi                                  │
│            - "Go Fiber"           → go-fiber                                 │
│            - "NestJS (Node.js)"   → nestjs                                   │
│                                                                               │
│   G-0.3. 프로젝트 Scaffolding                                                 │
│   G-0.4. 의존성 설치                                                          │
│   G-0.5. DB 연결 설정                                                         │
│   G-0.6. CORS + 공통 설정                                                     │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Phase G-1 ~ G-5: 백엔드 API 생성 & 연동                                      │
│  ──────────────────────────────────────────────────────────────────────────  │
│                                                                               │
│   G-1. 공통 API 체크                                                          │
│        IF api-mapping.json의 commonApis 중 미생성 API 있음:                   │
│          → 공통 API 먼저 생성 (인증, 사용자 정보 등)                           │
│                                                                               │
│   G-2. 페이지 전용 API 생성                                                   │
│        - api-mapping.json에서 pageApis[{pageId}] 추출                        │
│        - 선택한 프레임워크에 맞는 코드 생성                                   │
│        - Entity 클래스 생성 (entities[] 참조)                                 │
│                                                                               │
│   G-3. Frontend Connect                                                       │
│        - Mock 데이터 → fetch API 호출로 교체                                  │
│        - .env.local에 NEXT_PUBLIC_API_URL 설정                               │
│                                                                               │
│   G-4. 통합 테스트                                                            │
│        - BE 서버 실행 (프레임워크별 명령어)                                   │
│        - FE 서버 실행: npm run dev                                            │
│        - 실제 동작 확인                                                       │
│                                                                               │
│   G-5. AskUserQuestion                                                        │
│        "연동 완료! 다음 작업은?"                                              │
│        options: [HITL 재조정, 다음 페이지, 직접 입력]                          │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔴 HITL 세부 조정 모드 - 필수 실행 절차

### 🚨🚨🚨 HITL HARD RULES (절대 위반 금지!) 🚨🚨🚨

| # | 규칙 | 설명 |
|---|------|------|
| 1 | **🔴 혼자 결정 금지** | Claude는 절대 혼자서 승인/스킵 결정하면 안 됨! |
| 2 | **🔴 AskUserQuestion 필수** | 모든 섹션 비교 후 반드시 사용자에게 물어봐야 함! |
| 3 | **🔴 사용자 응답 대기** | 사용자가 선택할 때까지 다음 단계 진행 금지! |
| 4 | **🔴 자동 skip 금지** | 일치율이 높아도 사용자 확인 없이 skip 금지! |
| 5 | **🔴 자동 approve 금지** | 일치율 100%여도 사용자 확인 필수! |

### ❌ 절대 하지 말 것 (HITL)

- ❌ "일치율이 높으니 승인하겠습니다" → 혼자 결정하면 안 됨!
- ❌ "문제없어 보이니 다음 섹션으로" → 사용자 확인 없이 진행 금지!
- ❌ "이 섹션은 스킵하겠습니다" → 사용자만 스킵 결정 가능!
- ❌ hitl-refine.ts 실행 후 AskUserQuestion 없이 진행

### E-1: Bash로 hitl-refine.ts 실행 (🔴 MUST!)

**Claude는 반드시 이 Bash 명령을 실행해야 합니다!**

```bash
cd "{SCRIPTS_DIR}" && npx ts-node --transpile-only \
  generate/hitl-refine.ts --capture={capture} --page={pageId}
```

### E-2: JSON 결과 파싱

스크립트 출력에서 `<!-- HITL_RESULT_JSON_START -->` ~ `<!-- HITL_RESULT_JSON_END -->` 사이 JSON 파싱:

```json
{
  "comparison": {
    "overallMatch": 85,
    "issues": ["배경색 차이: 원본(#fff) vs 로컬(#f5f5f5)"],
    "suggestions": ["배경색을 #fff로 변경"]
  },
  "claudeInstructions": {
    "recommendation": "needs_review",
    "questionOptions": ["승인", "수정 필요", "스킵"]
  }
}
```

### E-3: AskUserQuestion (🔴🔴🔴 MUST! 절대 생략 금지! 🔴🔴🔴)

**일치율이 100%여도 반드시 사용자에게 물어봐야 합니다!**

```
AskUserQuestion:
  question: "{섹션명} 비교 결과: 일치율 {overallMatch}%. {issues[0]}"
  header: "HITL"
  options:
    - "승인" (recommendation이 "approve"면 Recommended)
    - "수정 필요"
    - "스킵"
```

**🔴 이 단계를 건너뛰면 HITL 워크플로우 위반입니다!**

### E-4: 응답별 처리 (🔴 사용자 응답 후에만 실행!)

| 응답 | 처리 |
|------|------|
| **승인** | `--approve` 실행 → 다음 섹션으로 (E-5) |
| **수정 필요** | suggestions 기반으로 코드 Edit → **E-1로 돌아가기** (재캡처!) |
| **스킵** | `--skip` 실행 → 다음 섹션으로 (E-5) |

### E-5: 섹션 완료 체크

```
IF 남은 섹션 있음:
  → E-1로 돌아가기 (다음 섹션)
ELSE:
  → Phase F (페이지 완료)
```

---

## 🔴 HARD RULES 요약

1. **코드 작성 전 반드시 스크린샷 Read** - 시각적 분석 필수
2. **HTML 텍스트 원본 그대로** - 번역/창작 금지
3. **원본 CSS Fetch** - `src/styles/legacy/`에 저장 후 재사용
4. **섹션 컴포넌트 분리** - `components/{route}/*-section.tsx` 파일로 분리
5. **섹션마다 data-section-id 필수** - HITL 비교를 위해 `data-section-id="01-header"` 추가
6. **kebab-case 폴더/파일명** - `about-us/page.tsx` (PascalCase 금지!)
7. **HITL 선택 시 Bash 실행 필수** - AskUserQuestion만 하면 안 됨
8. **수정 필요 시 재캡처 루프** - 수정 → 재캡처 → 재비교 반복
9. **모든 섹션 완료 후 다음 페이지** - 섹션별 순차 처리

---

## Purpose

레거시 사이트(웹빌더, PHP 등)를 스크린샷 + 소스 분석 기반으로 현대적 기술 스택(Next.js, Java Spring Boot)으로 **새로 구축**합니다.

---

## Quick Usage

```bash
# 전체 워크플로우 (권장)
/jikime:smart-rebuild https://example.com --source=./legacy-php --output=./rebuild-output

# Phase 1: 캡처
/jikime:smart-rebuild capture https://example.com --output=./rebuild-output/capture

# Phase 2: 분석
/jikime:smart-rebuild analyze --source=./legacy-php --capture=./rebuild-output/capture

# Phase 3: 코드 생성 (페이지별)
/jikime:smart-rebuild generate frontend --page 1
/jikime:smart-rebuild generate frontend --next
/jikime:smart-rebuild generate frontend --status

# Phase 3: 백엔드/연동
/jikime:smart-rebuild generate backend --mapping=./rebuild-output/mapping.json
/jikime:smart-rebuild generate connect --frontend-dir=./rebuild-output/frontend
```

> **상세 옵션은** @.claude/rules/jikime/smart-rebuild-reference.md **참조**

---

## Subcommands

| Subcommand | Description |
|------------|-------------|
| (none) | 전체 워크플로우 실행 |
| `capture` | 사이트 크롤링 및 스크린샷 캡처 |
| `analyze` | 소스 분석 및 매핑 생성 |
| `generate frontend` | 프론트엔드 생성 (Mock 데이터 포함) |
| `backend-init` | 🔴 백엔드 프로젝트 초기화 (NEW!) |
| `generate backend` | 백엔드 API 생성 |
| `generate connect` | 프론트엔드와 백엔드 연동 |
| `generate hitl` | HITL 수동 실행 |

---

## Key Options Summary

| Option | Description | Default |
|--------|-------------|---------|
| `--output` | 출력 디렉토리 | `./smart-rebuild-output` |
| `--source` | 레거시 소스 경로 | (required) |
| `--target` | 타겟 프론트엔드 | `nextjs16` |
| `--target-backend` | 타겟 백엔드 | `java` |
| `--ui-library` | UI 라이브러리 | `shadcn` |
| `--page [n]` | 특정 페이지 ID | - |
| `--next` | 다음 pending 페이지 | - |
| `--status` | 상태 조회 | - |
| `--login` | 로그인 필요 시 | - |
| `--framework` | 🔴 백엔드 프레임워크 (backend-init용) | `spring-boot` |

> **전체 옵션 목록은** @.claude/rules/jikime/smart-rebuild-reference.md **참조**

---

## EXECUTION DIRECTIVE

### Step 0: Load Core Skill (MUST DO FIRST)

```
Skill("jikime-migration-smart-rebuild")
```

### Step 1: Find Scripts Directory

```
Glob: **/.claude/skills/jikime-migration-smart-rebuild/scripts/package.json
```

### Step 2: Setup Scripts

```bash
cd "{SCRIPTS_DIR}" && npm install
cd "{SCRIPTS_DIR}" && npx playwright install chromium
```

### Step 2.5: 🔴 상태 파일 확인 (경로 자동 완성용)

**capture 이후 단계에서는 상태 파일을 읽어서 경로 자동 완성:**

```
# 1. capture 디렉토리에서 상태 파일 찾기
Glob: "**/capture/.smart-rebuild-state.json" 또는 "**/.smart-rebuild-state.json"

# 2. 상태 파일이 있으면 읽기
Read: {found_state_file}

# 3. 상태 파일에서 경로 추출:
#    - captureDir: capture 디렉토리 경로
#    - sourceDir: 소스 디렉토리 경로 (analyze 이후)
#    - mappingFile: mapping.json 경로 (analyze 이후)
```

**🔴 IMPORTANT:** 사용자가 경로를 입력하지 않으면 상태 파일의 경로를 기본값으로 사용!

### Step 3: Execute Based on Subcommand

**Case: capture**
```bash
cd "{SCRIPTS_DIR}" && npx ts-node --transpile-only bin/smart-rebuild.ts capture {url} \
  --output={output} [--login]
```

**Case: analyze**
```bash
cd "{SCRIPTS_DIR}" && npx ts-node --transpile-only bin/smart-rebuild.ts analyze \
  --source={source} --capture={capture} --output={output}
```

**Case: generate frontend**

🔴 Claude Code가 직접 수행 - **반드시 스크린샷을 보고 동일한 UI 재현!**

1. sitemap.json 읽기
2. **🔴 스크린샷 읽기 (시각 분석)**
3. **🔴 HTML 읽기 (텍스트/이미지 URL 추출)**
4. React 코드 작성 (**원본과 동일하게!**)
5. 개발 서버 실행
6. AskUserQuestion (HITL / 다음 페이지 / 직접 입력)
7. HITL 선택 시 → 섹션별 루프 실행

> **상세 실행 절차는** @.claude/rules/jikime/smart-rebuild-execution.md **참조**

---

## Related Skills

### Core Skill
- `jikime-migration-smart-rebuild` - 상세 문서 및 스크립트

### Frontend/Backend/UI Skills
| Type | Target | Skill |
|------|--------|-------|
| Frontend | `nextjs16` | `jikime-framework-nextjs@16` |
| Frontend | `nextjs15` | `jikime-framework-nextjs@15` |
| Backend | `java` | `jikime-lang-java` |
| Backend | `go` | `jikime-lang-go` |
| Backend | `python` | `jikime-lang-python` |
| UI | `shadcn` | `jikime-library-shadcn` |

---

## Troubleshooting

| 문제 | 해결 |
|------|------|
| 캡처 실패 | `npx playwright install chromium` |
| 로그인 필요 | `--login` 옵션 사용 |
| HITL 스크립트 안 됨 | SCRIPTS_DIR 경로 확인, npm install 실행 |
| UI가 원본과 다름 | 🔴 스크린샷 + HTML 다시 Read하고 비교 |
| 이전 세션 이어서 작업 | `--next` 옵션 사용 |

---

## Version History

**v2.2.0** (2026-02-05)
- UI 생성 핵심 원칙 강조 (스크린샷 + HTML 필수)
- HITL 루프 워크플로우 명확화 (수정 → 재캡처 루프)
- 섹션별 처리 → 페이지 완료 흐름 개선

**v2.1.0** (2026-02-05)
- HITL 비주얼 검증을 `generate frontend`에 통합
- 파일 분리: reference.md, execution.md

**v2.0.0** (2026-02-05)
- 페이지별 단계 처리 도입
