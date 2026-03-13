---
name: jikime-migration-smart-rebuild
description: AI-powered legacy site rebuilding workflow. Captures screenshots, analyzes source code, and generates modern frontend/backend code. Claude Code reads screenshots and writes actual code. Use when rebuilding legacy PHP, WordPress, or similar sites to Next.js, React, or other modern frameworks.
version: 2.0.0
tags: ["migration", "rebuild", "legacy", "screenshot", "nextjs", "react", "spring-boot", "page-by-page"]
triggers:
  keywords: ["smart-rebuild", "site-rebuild", "legacy-rebuild", "screenshot migration", "rebuild site", "PHP migration"]
  phases: ["plan", "run"]
  agents: ["frontend", "backend", "manager-strategy"]
  languages: ["php", "typescript", "java"]
progressive_disclosure:
  enabled: true
  level1_tokens: ~100
  level2_tokens: ~3000
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
  - WebFetch
---

# Smart Rebuild

> AI-powered legacy site rebuilding workflow

## Overview

Smart Rebuild는 레거시 사이트를 **새로 구축**하는 AI 기반 워크플로우입니다.

**철학**: "Rebuild, not Migrate" — 코드를 변환하지 않고, 새로 만든다.

| 계층 | 전략 |
|------|------|
| UI | 스크린샷 기반 새로 생성 |
| API | 소스 참고하여 클린 코드로 |
| DB | 유지 + 점진적 개선 |

## Quick Reference

| Phase | 설명 | 수행 주체 |
|-------|------|----------|
| **Capture** | 사이트 크롤링 & 스크린샷 | CLI (Playwright) |
| **Analyze (Source)** | 소스 분석 & 매핑 | CLI (AST Parser) |
| **Analyze (UI)** | 스크린샷/HTML 분석 | **Claude Code (비전)** |
| **Generate** | 코드 작성 | **Claude Code (직접 작성)** |

> **핵심**: CLI는 캡처와 소스 분석만 담당하고, **Claude Code가 스크린샷을 보고 직접 프론트엔드 코드를 작성**합니다.

## Page-by-Page Processing (CRITICAL)

Smart Rebuild는 **페이지별 단계 처리** 방식을 사용합니다:

```
모든 페이지를 한 번에 처리 ❌
한 페이지씩 완전히 완료 후 다음 페이지 ✅
```

### 장점

| 항목 | 설명 |
|------|------|
| **품질 향상** | 한 페이지씩 집중해서 완성도 높임 |
| **피드백 루프** | 페이지별로 리뷰 → 수정 → 확정 |
| **학습 효과** | Page 1에서 배운 패턴을 Page 2에 적용 |
| **컨텍스트 관리** | Claude Code 컨텍스트 효율적 사용 |
| **중단/재개** | 언제든 멈추고 다음에 이어서 가능 |

### 페이지 상태 추적

sitemap.json에서 각 페이지의 상태를 추적합니다:

| Status | Description |
|--------|-------------|
| `pending` | 아직 처리되지 않음 |
| `in_progress` | 현재 처리 중 |
| `completed` | 처리 완료 |
| `skipped` | 건너뜀 (중복, 제외 등) |

### 사용 예시

```bash
/jikime:smart-rebuild generate frontend --page 1     # 특정 페이지
/jikime:smart-rebuild generate frontend --next       # 다음 pending 페이지
/jikime:smart-rebuild generate frontend --page 1-5   # 범위 처리
/jikime:smart-rebuild generate frontend --status     # 상태 조회
```

## Target Framework Skills

코드 생성 시 타겟 프레임워크에 맞는 Skill을 **반드시 로드**합니다:

### Frontend Skills
| Target | Skill | 프로젝트 초기화 (Claude Code 직접 수행) |
|--------|-------|--------------------------------------|
| `nextjs16` | `jikime-framework-nextjs@16` | `npx create-next-app@latest --typescript --tailwind --app` |
| `nextjs15` | `jikime-framework-nextjs@15` | `npx create-next-app@latest --typescript --tailwind --app` |
| `react` | `jikime-domain-frontend` | Vite |

> **CRITICAL**: 프로젝트 초기화는 **스크립트가 아닌 Claude Code가 직접** 수행합니다.
> `create-next-app`이 올바른 의존성과 설정을 자동으로 생성합니다.

### UI Library Skills (CRITICAL for modernization)

**`--ui-library` 옵션에 따라 UI 스킬을 로드합니다:**

| --ui-library | Skill | 컴포넌트 변환 | 초기화 명령 |
|--------------|-------|-------------|------------|
| `shadcn` (기본값) | `jikime-library-shadcn` | 레거시 HTML → shadcn 컴포넌트 | `npx shadcn@latest init` → `add button card...` |
| `legacy-css` | _(없음)_ | 레거시 CSS 복사 (비권장) | _(없음)_ |

> **CRITICAL**: Claude Code는 **스스로 다음을 인지**해야 합니다:
> 1. Next.js 프로젝트면 **반드시** shadcn 초기화 (스크립트 결과와 무관하게!)
> 2. `jikime-library-shadcn` 스킬 로드하여 컴포넌트 변환 패턴 학습
> 3. `npx shadcn@latest init --defaults` 실행 (기존 파일 덮어쓰기 허용)
> 4. 레거시 `<button class="btn">` → `<Button variant="default">` 변환
> 5. **레거시 CSS 복사 금지** - shadcn 테마 시스템 사용

**레거시 → shadcn 컴포넌트 매핑 (스킬에서 제공):**
| Legacy HTML | shadcn Component |
|-------------|------------------|
| `<button class="btn btn-primary">` | `<Button variant="default">` |
| `<input class="form-control">` | `<Input />` |
| `<div class="card">` | `<Card>` + `<CardHeader>` + `<CardContent>` |
| `<div class="modal">` | `<Dialog>` + `<DialogContent>` |
| `<table class="table">` | `<Table>` + `<TableHeader>` + `<TableBody>` |

### Backend Skills
| Target | Skill | 설명 |
|--------|-------|------|
| `java` | `jikime-lang-java` | Spring Boot 3.3 |
| `go` | `jikime-lang-go` | Fiber/Echo |
| `python` | `jikime-lang-python` | FastAPI |

## File Naming Convention (CRITICAL)

생성되는 모든 파일은 **kebab-case**를 사용합니다:

| 파일 유형 | 규칙 | 예시 |
|----------|------|------|
| 페이지/라우트 | kebab-case | `about-us/page.tsx` |
| 컴포넌트 | kebab-case | `header-nav.tsx` |
| 유틸리티 | kebab-case | `format-date.ts` |

## Usage

```bash
# 전체 프로세스 (권장)
/jikime:smart-rebuild https://example.com --source=./legacy-php --output=./rebuild-output --target=nextjs16

# 단계별 실행
/jikime:smart-rebuild capture https://example.com --output=./rebuild-output/capture
/jikime:smart-rebuild analyze --source=./legacy-php --capture=./rebuild-output/capture --output=./rebuild-output/mapping.json
/jikime:smart-rebuild generate frontend --mapping=./rebuild-output/mapping.json --output=./rebuild-output/frontend --target=nextjs16
```

### 주요 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--source` | 레거시 소스 코드 경로 | (필수) |
| `--output` | 출력 디렉토리 | `./smart-rebuild-output` |
| `--target` | 타겟 프론트엔드 프레임워크 | `nextjs16` |
| `--target-backend` | 타겟 백엔드 프레임워크 | `java` |
| `--capture` | 캡처 디렉토리 (analyze 시) | `{output}/capture` |
| `--mapping` | 매핑 파일 경로 (generate 시) | `{output}/mapping.json` |

## Workflow Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Claude Code (핵심 Intelligence)                 │
│                                                                      │
│  Step 0: Target Framework Skill 로드                                 │
│    → Skill("jikime-framework-nextjs@16") 또는 해당 Skill             │
│                                                                      │
│  Phase 2b: 스크린샷/HTML 분석 (비전 기능)                             │
│    → 스크린샷 Read → 레이아웃, 색상, 컴포넌트 분석                     │
│    → mapping.json에 ui_analysis 저장                                 │
│                                                                      │
│  Phase 3: 프론트엔드 코드 직접 작성                                   │
│    → 스크린샷을 보고 실제 UI 재현하는 코드 작성                        │
│    → 로드된 Skill 패턴에 따라 프레임워크 컨벤션 준수                   │
└─────────────────────────────────────────────────────────────────────┘
        │                              │
        ▼                              ▼
┌───────────────────┐          ┌───────────────────┐
│ Phase 1: Capture  │          │ Phase 2a: Analyze │
│ (CLI - Playwright)│          │ (CLI - Parser)    │
│                   │          │                   │
│ • 스크린샷 캡처   │          │ • 소스 코드 분석  │
│ • HTML 저장       │          │ • 정적/동적 분류  │
│ • 세션 관리       │          │ • SQL 추출        │
└───────────────────┘          └───────────────────┘
```

**핵심 원칙:**
- CLI는 **도구** 역할 (캡처, 파싱)
- Claude Code는 **두뇌** 역할 (분석, 코드 작성)
- Skill은 **지식** 역할 (프레임워크 패턴, 컨벤션)

## 2-Track Strategy

### Track 1: Static Content
```
라이브 사이트 → Playwright 스크래핑 → 타겟 프레임워크 정적 페이지
```
- 소개, About, FAQ, 이용약관 등

### Track 2: Dynamic Content
```
소스 분석 → SQL 추출 → Backend API → 타겟 프레임워크 동적 페이지
```
- 회원 목록, 결제 내역, 게시판 등

## Files

| File | Purpose |
|------|---------|
| `rules/overview.md` | 전체 워크플로우 가이드 |
| `rules/phase-1-capture.md` | 캡처 단계 상세 |
| `rules/phase-2-analyze.md` | 분석 & 매핑 단계 |
| `rules/phase-3-generate.md` | 코드 생성 단계 |
| `rules/troubleshooting.md` | 문제 해결 가이드 |
| `rules/execution.md` | Smart Rebuild 실행 가이드 (메인) |
| `rules/execution-capture.md` | Phase 1: Capture 상세 실행 절차 |
| `rules/execution-analyze.md` | Phase 2: Analyze 상세 실행 절차 |
| `rules/execution-backend.md` | Phase G: Backend 상세 실행 절차 |
| `rules/reference.md` | 사용법, 옵션, 지원 프레임워크 참조 |
| `scripts/` | CLI 도구 |

## Related

- `/jikime:smart-rebuild` - Smart Rebuild 명령어
- `jikime-framework-nextjs@16` - Next.js 16 패턴
- `jikime-lang-java` - Spring Boot 패턴
- F.R.I.D.A.Y. 마이그레이션 오케스트레이터
