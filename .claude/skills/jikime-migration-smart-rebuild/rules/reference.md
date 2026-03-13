# Smart Rebuild Reference

Usage, Options, Supported Frameworks 참조 문서.

---

## Purpose

레거시 사이트(웹빌더, PHP 등)를 스크린샷 + 소스 분석 기반으로 현대적 기술 스택(Next.js, Java Spring Boot)으로 **새로 구축**합니다.

## Usage

```bash
# 전체 워크플로우 (권장)
/jikime:smart-rebuild https://example.com --source=./legacy-php --output=./rebuild-output

# Phase 1: 캡처
/jikime:smart-rebuild capture https://example.com --output=./rebuild-output/capture
/jikime:smart-rebuild capture https://example.com --login --output=./rebuild-output/capture

# Phase 2: 분석
/jikime:smart-rebuild analyze --source=./legacy-php --capture=./rebuild-output/capture

# Phase 3: 코드 생성 (페이지별)
/jikime:smart-rebuild generate frontend --page 1
/jikime:smart-rebuild generate frontend --next
/jikime:smart-rebuild generate frontend --status

# Phase 3: 백엔드 생성
/jikime:smart-rebuild generate backend --mapping=./rebuild-output/mapping.json

# Phase 3: 연동
/jikime:smart-rebuild generate connect --frontend-dir=./rebuild-output/frontend
```

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
| `generate hitl` | HITL 수동 실행 (generate frontend에 통합됨) |

---

## Options

### 전역 옵션

| Option | Description | Default |
|--------|-------------|---------|
| `--output` | 출력 디렉토리 | `./smart-rebuild-output` |
| `--source` | 레거시 소스 경로 | (required) |
| `--target` | 타겟 프론트엔드 프레임워크 | `nextjs16` |
| `--target-backend` | 타겟 백엔드 프레임워크 | `java` |
| `--ui-library` | UI 컴포넌트 라이브러리 | `shadcn` |

### 개발 서버 포트

| 서버 | 포트 | 설명 |
|------|------|------|
| **Frontend (Next.js)** | `3893` | 🔴 기본 포트 (package.json에 설정됨) |
| **Backend (Spring Boot)** | `8080` | 기본 포트 |
| **Backend (FastAPI)** | `8000` | 기본 포트 |
| **Backend (Go Fiber/NestJS)** | `3001` | 기본 포트 |

### 페이지별 처리 옵션

| Option | Description | Example |
|--------|-------------|---------|
| `--page [n]` | 특정 페이지 ID | `--page 1` |
| `--page [n-m]` | 페이지 범위 | `--page 1-5` |
| `--next` | 다음 pending 페이지 | `--next` |
| `--status` | 상태 조회 | `--status` |

### capture 옵션

> **🔴 Lazy Capture 방식**: 기본적으로 **링크만 수집**하고, HTML + 스크린샷은 `generate --page N` 단계에서 캡처합니다.

| Option | Description | Default |
|--------|-------------|---------|
| `<url>` | 캡처할 사이트 URL | (required) |
| `--merge` | 기존 sitemap.json에 새 route만 추가 | ✅ (기본) |
| `--force` | sitemap 새로 생성 (기존 덮어쓰기) | - |
| `--prefetch` | 🔴 모든 페이지 HTML + 스크린샷 미리 캡처 | - |
| `--clean` | 더 이상 존재하지 않는 route 제거 | - |
| `--max-pages` | 최대 캡처 페이지 수 | `100` |
| `--concurrency` | 동시 처리 수 | `5` |
| `--login` | 로그인 필요 시 | - |
| `--auth` | 기존 세션 파일 재사용 | - |
| `--exclude` | 제외 URL 패턴 | `/admin/*,/api/*` |
| `--no-dedupe` | 템플릿 중복 제거 비활성화 | `false` |

**Lazy Capture 동작:**
- 기본: 링크만 수집 → `captured: false`
- `--prefetch` 사용 시: 모든 페이지 HTML + 스크린샷 캡처 → `captured: true`

### analyze 옵션

| Option | Description | Default |
|--------|-------------|---------|
| `--source` | 레거시 소스 경로 | (required) |
| `--capture` | 캡처 디렉토리 | `./capture` |
| `--output` | 매핑 파일 출력 | `./mapping.json` |
| `--framework` | 소스 프레임워크 오버라이드 | 자동 감지 |
| `--db-schema` | DB 스키마 파일 | - |
| `--db-from-env` | .env에서 스키마 추출 | - |

### generate frontend 옵션

| Option | Description | Default |
|--------|-------------|---------|
| `--mapping` | 매핑 파일 | `./mapping.json` |
| `--output` | 출력 디렉토리 | `./output/frontend` |
| `--capture` | 캡처 디렉토리 | `./capture` |
| `--target` | 타겟 프레임워크 | `nextjs16` |
| `--ui-library` | UI 라이브러리 | `shadcn` |

### generate hitl 옵션

| Option | Description | Default |
|--------|-------------|---------|
| `--capture` | 캡처 디렉토리 | `./capture` |
| `--page` | 처리할 페이지 ID | (다음 pending) |
| `--section` | 처리할 섹션 ID | (다음 pending) |
| `--responsive` | 반응형 테스트 | `false` |
| `--status` | 진행 상황 확인 | `false` |
| `--approve=ID` | 섹션 승인 | - |
| `--skip=ID` | 섹션 스킵 | - |
| `--reset` | 상태 초기화 | `false` |

### 🔴 backend-init 옵션 (NEW!)

백엔드 프로젝트를 초기화합니다. Phase G-0에서 사용됩니다.

| Option | Description | Default |
|--------|-------------|---------|
| `--framework` | 백엔드 프레임워크 | `spring-boot` |
| `--output` | 백엔드 출력 디렉토리 | `./output/backend` |
| `--db-type` | 데이터베이스 타입 | `mysql` |
| `--db-url` | DB 연결 URL | (AskUserQuestion) |
| `--port` | 서버 포트 | 프레임워크별 기본값 |

**지원 프레임워크:**

| 값 | 프레임워크 | 언어 | 기본 포트 |
|----|-----------|------|----------|
| `spring-boot` | Spring Boot 3.x | Java 21 | 8080 |
| `fastapi` | FastAPI | Python 3.12+ | 8000 |
| `go-fiber` | Go Fiber | Go 1.22+ | 3001 |
| `nestjs` | NestJS | Node.js 20+ | 3001 |

**프레임워크별 초기화 매트릭스:**

| 항목 | Spring Boot | FastAPI | Go Fiber | NestJS |
|------|-------------|---------|----------|--------|
| **프로젝트 초기화** | Spring Initializr | `uv init` | `go mod init` | `nest new` |
| **의존성 파일** | build.gradle | pyproject.toml | go.mod | package.json |
| **설정 파일** | application.yml | .env | config.yaml | .env |
| **DB ORM** | JPA/Hibernate | SQLAlchemy | GORM | TypeORM |
| **서버 실행** | `./gradlew bootRun` | `uvicorn main:app` | `go run main.go` | `npm run start:dev` |

**사용 예시:**
```bash
# Spring Boot (Java) 프로젝트 초기화
/jikime:smart-rebuild backend-init --framework spring-boot

# FastAPI (Python) 프로젝트 초기화
/jikime:smart-rebuild backend-init --framework fastapi

# Go Fiber 프로젝트 초기화
/jikime:smart-rebuild backend-init --framework go-fiber

# NestJS (Node.js) 프로젝트 초기화
/jikime:smart-rebuild backend-init --framework nestjs
```

### generate backend 옵션

| Option | Description | Default |
|--------|-------------|---------|
| `--api-mapping` | API 매핑 파일 | `./api-mapping.json` |
| `--output` | 백엔드 출력 디렉토리 | `./output/backend` |
| `--page <id>` | 🔴 특정 페이지 API만 생성 | (전체) |
| `--common-only` | 🔴 공통 API만 생성 (인증 등) | - |
| `--skip-common` | 🔴 공통 API 스킵 (이미 생성된 경우) | - |
| `--framework` | 타겟 백엔드 프레임워크 | backend-init에서 설정 |
| `--db-url` | DB 연결 URL | `.env`에서 읽기 |

**페이지별 백엔드 생성:**
```bash
# 공통 API 먼저 생성
/jikime:smart-rebuild generate backend --common-only

# 특정 페이지 API만 생성
/jikime:smart-rebuild generate backend --page 3 --skip-common

# 전체 API 생성 (기존 방식)
/jikime:smart-rebuild generate backend
```

### generate connect 옵션 (🔴 Updated!)

| Option | Description | Default |
|--------|-------------|---------|
| `--frontend-dir` | 프론트엔드 디렉토리 | `./output/frontend` |
| `--page <id>` | 🔴 특정 페이지만 연동 | (전체) |
| `--api-url` | 백엔드 API URL | `http://localhost:8080` |
| `--dry-run` | 변경 사항 미리보기 (실제 수정 안 함) | - |

**페이지별 연동:**
```bash
# 특정 페이지만 연동
/jikime:smart-rebuild generate connect --page 3

# 전체 연동 (기존 방식)
/jikime:smart-rebuild generate connect
```

---

## Supported Frameworks

### Source (레거시)

| 프레임워크 | 자동 감지 | 매칭 전략 |
|-----------|----------|----------|
| `php-pure` | ✅ index.php 기반 | 파일 기반 라우팅 |
| `wordpress` | ✅ wp-config.php | 테마/플러그인 기반 |
| `laravel` | ✅ artisan CLI | routes/web.php |
| `codeigniter` | ✅ application/controllers | Controllers/Views |
| `symfony` | ✅ symfony.lock | src/Controller |

### Target (생성)

| 구분 | 프레임워크 | 기본값 | 연동 Skill |
|------|-----------|--------|------------|
| Frontend | `nextjs16` | ✅ | `jikime-framework-nextjs@16` |
| Frontend | `nextjs15` | - | `jikime-framework-nextjs@15` |
| Frontend | `react` | - | `jikime-domain-frontend` |
| Backend | `java` | ✅ | `jikime-lang-java` |
| Backend | `go` | - | `jikime-lang-go` |
| Backend | `python` | - | `jikime-lang-python` |

### UI Library

| Value | 설명 | 연동 Skill |
|-------|------|------------|
| `shadcn` | shadcn/ui (Recommended) | `jikime-library-shadcn` |
| `mui` | Material UI | (향후 지원) |
| `legacy-css` | 레거시 CSS 복사 (비권장) | - |

---

## 파일 네이밍 규칙

| 파일 유형 | 규칙 | 예시 |
|----------|------|------|
| 페이지/라우트 | kebab-case | `about-us/page.tsx` |
| 컴포넌트 | kebab-case | `header-nav.tsx` |
| Java 클래스 | PascalCase | `MemberEntity.java` |
| Go 파일 | snake_case | `member_handler.go` |
| Python 파일 | snake_case | `member_router.py` |

---

## sitemap.json 구조 (Lazy Capture)

```json
{
  "baseUrl": "https://example.com",
  "createdAt": "2026-02-05T10:00:00Z",
  "updatedAt": "2026-02-06T14:30:00Z",
  "totalPages": 15,
  "summary": {
    "pending": 13,
    "in_progress": 1,
    "completed": 1,
    "captured": 2
  },
  "pages": [
    {
      "id": 1,
      "url": "https://example.com/",
      "title": "홈페이지",
      "captured": true,
      "screenshot": "page_1_home.png",
      "html": "page_1_home.html",
      "status": "completed",
      "capturedAt": "2026-02-06T10:00:00Z"
    },
    {
      "id": 2,
      "url": "https://example.com/about",
      "title": "About Us",
      "captured": false,
      "screenshot": null,
      "html": null,
      "status": "pending",
      "capturedAt": null
    }
  ]
}
```

**주요 필드:**
| 필드 | 설명 |
|------|------|
| `summary.captured` | HTML + 스크린샷 캡처 완료된 페이지 수 |
| `page.captured` | 🔴 해당 페이지 캡처 여부 (false면 generate 시 캡처) |
| `page.capturedAt` | 해당 페이지 실제 캡처 시간 |

---

## api-mapping.json 구조 (🔴 NEW!)

페이지별 점진적 백엔드 연동을 위한 API 의존성 매핑 파일.

```json
{
  "version": "1.0",
  "createdAt": "2026-02-06T10:00:00Z",
  "sourceFramework": "php-pure",
  "targetBackend": "java",

  "commonApis": [
    {
      "path": "/api/auth/login",
      "method": "POST",
      "required": true,
      "sourceFile": "login.php",
      "generated": false,
      "connected": false
    },
    {
      "path": "/api/users/me",
      "method": "GET",
      "required": true,
      "sourceFile": "session.php",
      "generated": false,
      "connected": false
    }
  ],

  "pageApis": {
    "1": [],
    "3": [
      {
        "path": "/api/products",
        "method": "GET",
        "sourceFile": "product_list.php",
        "table": "products",
        "params": ["category", "page", "limit"],
        "generated": false,
        "connected": false
      }
    ],
    "5": [
      {
        "path": "/api/products/:id",
        "method": "GET",
        "sourceFile": "product_detail.php",
        "table": "products",
        "generated": false,
        "connected": false
      }
    ]
  },

  "entities": [
    {
      "name": "Product",
      "table": "products",
      "fields": [
        { "name": "id", "type": "BIGINT", "javaType": "Long" },
        { "name": "name", "type": "VARCHAR(255)", "javaType": "String" },
        { "name": "price", "type": "DECIMAL(10,2)", "javaType": "BigDecimal" }
      ]
    }
  ]
}
```

**주요 필드:**

| 필드 | 설명 |
|------|------|
| `commonApis` | 모든 페이지에서 공통으로 필요한 API (인증 등) |
| `commonApis[].required` | true면 첫 동적 페이지 연동 시 반드시 생성 |
| `pageApis` | 페이지 ID별 필요한 API 목록 |
| `pageApis[pageId][]` | 해당 페이지에서 호출하는 API들 |
| `*.generated` | API 생성 완료 여부 |
| `*.connected` | 프론트엔드 연동 완료 여부 |
| `entities` | DB 테이블 → Java Entity 매핑 정보 |

---

## Output Structure

```
{output}/
├── capture/
│   ├── sitemap.json          # 캡처 인덱스 + captured 상태
│   ├── *.png                 # 스크린샷 (캡처된 페이지만)
│   ├── *.html                # HTML (캡처된 페이지만)
│   └── hitl/                 # HITL 비교 결과
│       └── page_{N}/
│
├── mapping.json              # 소스 ↔ 캡처 매핑
├── api-mapping.json          # 🔴 API 의존성 매핑 (NEW!)
│
├── backend/                  # 🔴 Spring Boot 프로젝트 (상세화)
│   ├── build.gradle
│   ├── settings.gradle
│   └── src/main/
│       ├── java/com/example/api/
│       │   ├── ApiApplication.java
│       │   ├── config/
│       │   │   └── CorsConfig.java
│       │   ├── controller/
│       │   │   ├── AuthController.java      # 공통 API
│       │   │   ├── ProductController.java   # 페이지별 API
│       │   │   └── MemberController.java
│       │   ├── service/
│       │   │   ├── AuthService.java
│       │   │   ├── ProductService.java
│       │   │   └── MemberService.java
│       │   ├── repository/
│       │   │   ├── ProductRepository.java
│       │   │   └── MemberRepository.java
│       │   └── entity/
│       │       ├── Product.java
│       │       └── Member.java
│       └── resources/
│           └── application.yml
│
└── frontend/                 # Next.js 프로젝트
    ├── .env.local            # 🔴 API_URL 설정
    └── src/
        ├── app/                    # Next.js App Router
        │   ├── page.tsx            # 홈 (섹션 컴포넌트 조합)
        │   └── about-us/page.tsx   # 섹션 컴포넌트 import
        ├── lib/
        │   └── api-client.ts       # 🔴 API 클라이언트
        ├── styles/                 # 원본 CSS 저장
        │   ├── legacy/             # fetch한 CSS 파일들
        │   └── legacy-imports.css
        └── components/             # 섹션 컴포넌트
            ├── common/             # 공통 (헤더, 푸터)
            ├── home/               # 홈 페이지 섹션들
            └── about-us/           # about-us 섹션들
                ├── hero-section.tsx
                └── team-section.tsx
```

---

## Troubleshooting

### 캡처 실패
- Playwright 브라우저 설치 확인: `npx playwright install chromium`
- 타임아웃 조정: `--timeout=60000`

### 로그인 필요 사이트
- `--login` 옵션 사용
- 브라우저에서 로그인 완료 후 Enter

### HITL 스크립트 실행 안 됨
- SCRIPTS_DIR 경로 확인
- npm install 실행 여부 확인

### 🔴 백엔드 연동 문제 (NEW!)

#### CORS 오류
```
Access to fetch at 'http://localhost:8080/api/...' has been blocked by CORS policy
```
**해결:**
- Spring Boot의 `CorsConfig.java` 확인
- `allowedOrigins`에 `http://localhost:3893` 추가

#### API 연결 실패
```
Error: fetch failed / ECONNREFUSED
```
**해결:**
- 백엔드 서버 실행 여부 확인: `./gradlew bootRun`
- `.env.local`의 `NEXT_PUBLIC_API_URL` 확인
- 포트 충돌 확인: `lsof -i :8080`

#### DB 연결 오류
```
Cannot acquire connection from data source
```
**해결:**
- `application.yml`의 DB 설정 확인
- DB 서버 실행 여부 확인
- 사용자 권한 확인

#### 공통 API 누락
```
401 Unauthorized (인증 API 없이 호출)
```
**해결:**
- `generate backend --common-only` 먼저 실행
- 또는 인증이 필요 없는 API는 `@PermitAll` 추가

#### Entity 타입 불일치
```
Could not determine recommended JdbcType for ...
```
**해결:**
- `api-mapping.json`의 `entities[].fields` 타입 확인
- SQL 타입 → Java 타입 매핑 확인

---

Version: 2.0.0
