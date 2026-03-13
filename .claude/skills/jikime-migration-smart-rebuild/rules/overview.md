# Smart Rebuild Overview

## 워크플로우 전체 흐름

```
┌─────────────────────────────────────────────────────────────────┐
│  Phase 1: Capture (캡처)                                        │
├─────────────────────────────────────────────────────────────────┤
│  Playwright로 사이트 크롤링                                      │
│  ├── 모든 페이지 URL 수집 (재귀적)                               │
│  ├── 각 페이지 스크린샷 (fullPage)                               │
│  ├── HTML 저장                                                   │
│  └── sitemap.json 생성                                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Phase 2: Analyze (분석 & 매핑)                                  │
├─────────────────────────────────────────────────────────────────┤
│  레거시 소스 분석                                                │
│  ├── URL ↔ 소스 파일 매칭                                       │
│  ├── 정적/동적 자동 분류                                         │
│  ├── SQL 쿼리 추출 (동적인 경우)                                 │
│  ├── DB 스키마 분석                                              │
│  └── mapping.json 생성                                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Phase 3: Generate (코드 생성)                                   │
├─────────────────────────────────────────────────────────────────┤
│  정적 페이지:                                                    │
│  └── 스크린샷 + HTML → Next.js 정적 페이지                       │
│                                                                  │
│  동적 페이지:                                                    │
│  ├── SQL → Java Entity/Repository/Controller                    │
│  └── 스크린샷 + HTML → Next.js 페이지 (API 연동)                 │
└─────────────────────────────────────────────────────────────────┘
```

## 핵심 개념

### 1. Rebuild vs Migrate

| 항목 | 기존 마이그레이션 | Smart Rebuild |
|------|------------------|---------------|
| 접근법 | 코드 변환 | 새로 구축 |
| UI | 코드 분석 → 변환 | 스크린샷 → 새로 생성 |
| 로직 | 패턴 유지 | 클린 아키텍처 |
| 결과물 | 변환된 레거시 | 현대적 코드 |
| **UI 컴포넌트** | 레거시 CSS 복사 | **shadcn/ui 컴포넌트** |

### 1.5. UI 현대화 (CRITICAL)

**Smart Rebuild는 레거시 CSS를 복사하지 않고, 현대적 UI 라이브러리로 새로 구축합니다.**

| 레거시 패턴 | Smart Rebuild |
|------------|---------------|
| `<button class="btn btn-primary">` | `<Button variant="default">` (shadcn) |
| `<input class="form-control">` | `<Input />` (shadcn) |
| `<div class="modal">` | `<Dialog>` (shadcn) |
| `globals.css에 레거시 스타일 복사` | `npx shadcn@latest init` 자동 생성 |

> **CRITICAL**: Claude Code는 **스스로 다음을 인지**해야 합니다:
> - Next.js 프로젝트면 **반드시** `npx shadcn@latest init` 실행 (스크립트 결과와 무관하게!)
> - `jikime-library-shadcn` 스킬 로드하여 컴포넌트 변환 패턴 학습
> - **레거시 CSS 복사 금지** - shadcn 컴포넌트로 UI 현대화

### 2. 2-Track 전략

**Track 1 - 정적 콘텐츠:**
- Playwright로 라이브 사이트 스크래핑
- HTML에서 텍스트/이미지 추출
- Next.js 정적 페이지로 생성

**Track 2 - 동적 콘텐츠:**
- 소스 코드 분석
- SQL 쿼리 추출
- Backend API 생성
- Next.js 동적 페이지 생성

### 3. 자동 분류 기준

동적 페이지 판단:
- SQL 쿼리 존재
- DB 연결 함수 사용
- 세션 체크
- POST 데이터 처리
- 동적 파라미터 사용

정적 페이지 판단:
- 위 항목 모두 없음
- 순수 HTML + include/require만

### 4. 페이지별 단계 처리 (Page-by-Page Processing)

> **CRITICAL**: Smart Rebuild는 모든 페이지를 한 번에 처리하지 않습니다!

```
┌─────────────────────────────────────────────────────────────┐
│  일괄 처리 방식 ❌ (비권장)                                   │
├─────────────────────────────────────────────────────────────┤
│  Phase 1: 모든 페이지 캡처                                   │
│  Phase 2: 모든 페이지 분석                                   │
│  Phase 3: 모든 페이지 생성  ← 컨텍스트 과부하, 품질 저하      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  페이지별 처리 방식 ✅ (권장)                                 │
├─────────────────────────────────────────────────────────────┤
│  Phase 1: 모든 페이지 캡처 (1회)                             │
│  Phase 2: 모든 페이지 분석 (1회)                             │
│  Phase 3: 페이지별 순차 생성                                 │
│    Page 1 → 분석 → 생성 → 검증 → 완료 ✅                     │
│    Page 2 → 분석 → 생성 → 검증 → 완료 ✅                     │
│    Page 3 → 분석 → 생성 → 검증 → 완료 ✅                     │
│    ...                                                       │
└─────────────────────────────────────────────────────────────┘
```

**장점:**

| 항목 | 설명 |
|------|------|
| 품질 향상 | 한 페이지씩 집중해서 완성도 높임 |
| 피드백 루프 | 페이지별로 리뷰 → 수정 → 확정 |
| 학습 효과 | Page 1에서 배운 패턴을 Page 2에 적용 |
| 컨텍스트 관리 | Claude Code 컨텍스트 효율적 사용 |
| 중단/재개 | 언제든 멈추고 다음에 이어서 가능 |

**페이지 상태 추적:**

sitemap.json에서 각 페이지의 `status` 필드로 진행 상황을 추적:
- `pending`: 아직 처리되지 않음
- `in_progress`: 현재 처리 중
- `completed`: 처리 완료
- `skipped`: 건너뜀

## 출력 산출물

### sitemap.json (Phase 1)
```json
{
  "baseUrl": "https://example.com",
  "capturedAt": "2026-02-05T10:00:00Z",
  "totalPages": 47,
  "summary": {
    "pending": 47,
    "in_progress": 0,
    "completed": 0
  },
  "pages": [
    {
      "id": 1,
      "url": "https://example.com/",
      "title": "홈페이지",
      "screenshot": "page_1_home.png",
      "html": "page_1_home.html",
      "status": "pending",
      "type": "static",
      "completedAt": null,
      "links": ["..."]
    }
  ]
}
```

### mapping.json (Phase 2)
```json
{
  "project": { "name", "sourceUrl", "sourcePath" },
  "summary": { "totalPages", "static", "dynamic" },
  "pages": [{ "capture", "source", "database", "output" }],
  "database": { "tables": [...] }
}
```

## 다음 단계

1. [Phase 1: Capture](./phase-1-capture.md)
2. [Phase 2: Analyze](./phase-2-analyze.md)
3. [Phase 3: Generate](./phase-3-generate.md)
