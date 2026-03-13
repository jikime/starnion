# Phase 2: Analyze (분석 & 매핑)

## 목표

레거시 소스 코드를 분석하여 캡처된 페이지와 매핑하고, 정적/동적 콘텐츠를 자동 분류합니다.

## 실행

```bash
/jikime:smart-rebuild analyze --source=./legacy-php --capture=./capture
```

## 분석 항목

| 항목 | 설명 | 결과 |
|------|------|------|
| URL 매칭 | 캡처 URL ↔ 소스 파일 | capture.url → source.file |
| 페이지 분류 | 정적/동적 판단 | static \| dynamic |
| SQL 추출 | DB 쿼리 식별 | queries[] |
| 스키마 분석 | 테이블 구조 파악 | tables[] |
| **UI 분석** | 스크린샷 비전 분석 | ui_analysis |

## 자동 분류 알고리즘

### 분류 기준

**동적 페이지 판단:**
- SQL 쿼리 존재 (SELECT, INSERT, UPDATE, DELETE)
- DB 연결 함수 (mysqli_*, PDO, $wpdb)
- 세션 체크 ($_SESSION, session_start)
- POST 처리 ($_POST, $_REQUEST)
- 동적 파라미터 ($_GET['id'])

**정적 페이지 판단:**
- 위 항목 모두 없음
- 순수 HTML + include/require만

### 분류 코드

```typescript
interface PageAnalysis {
  path: string;
  type: 'static' | 'dynamic';
  reason: string[];
  dbQueries: string[];
}

function classifyPage(phpFile: string): PageAnalysis {
  const content = readFile(phpFile);
  const reasons: string[] = [];
  const dbQueries: string[] = [];

  // 1. SQL 쿼리 체크
  const sqlPatterns = [
    /SELECT\s+.+\s+FROM/gi,
    /INSERT\s+INTO/gi,
    /UPDATE\s+.+\s+SET/gi,
    /DELETE\s+FROM/gi,
  ];

  for (const pattern of sqlPatterns) {
    const matches = content.match(pattern);
    if (matches) {
      dbQueries.push(...matches);
      reasons.push('SQL 쿼리 발견');
    }
  }

  // 2. DB 연결 함수 체크
  if (/mysqli_query|\$pdo->query|\$wpdb->/g.test(content)) {
    reasons.push('DB 연결 함수');
  }

  // 3. 세션 체크
  if (/\$_SESSION|session_start/g.test(content)) {
    reasons.push('세션 사용');
  }

  // 4. POST 처리 체크
  if (/\$_POST|\$_REQUEST/g.test(content)) {
    reasons.push('POST 데이터 처리');
  }

  return {
    path: phpFile,
    type: reasons.length > 0 ? 'dynamic' : 'static',
    reason: reasons,
    dbQueries,
  };
}
```

## URL ↔ 소스 매칭

### 매칭 전략

1. **직접 매칭**: URL path와 파일 경로 일치
   - `/about` → `about.php`
   - `/members/list` → `members/list.php`

2. **라우터 분석**: .htaccess, web.php 등
   - `RewriteRule ^user/(.*)$ user.php?id=$1`

3. **동적 파라미터**: GET 파라미터 분석
   - `/index.php?page=about` → `about.php`

### 매칭 코드

```typescript
function matchUrlToSource(url: string, sourcePath: string): string | null {
  const urlPath = new URL(url).pathname;

  // 1. 직접 매칭 시도
  const directMatch = path.join(sourcePath, `${urlPath}.php`);
  if (fs.existsSync(directMatch)) return directMatch;

  // 2. index.php 체크
  const indexMatch = path.join(sourcePath, urlPath, 'index.php');
  if (fs.existsSync(indexMatch)) return indexMatch;

  // 3. 라우터 분석
  const routerMatch = analyzeRouter(urlPath, sourcePath);
  if (routerMatch) return routerMatch;

  return null;
}
```

## SQL 쿼리 추출

```typescript
interface ExtractedQuery {
  raw: string;
  table: string;
  type: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  columns?: string[];
  conditions?: string;
}

function extractQueries(content: string): ExtractedQuery[] {
  const queries: ExtractedQuery[] = [];

  // SELECT 쿼리
  const selectPattern = /SELECT\s+([\w\s,*]+)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:;|$)/gi;
  let match;

  while ((match = selectPattern.exec(content)) !== null) {
    queries.push({
      raw: match[0],
      type: 'SELECT',
      columns: match[1].split(',').map(c => c.trim()),
      table: match[2],
      conditions: match[3]
    });
  }

  // INSERT, UPDATE, DELETE도 유사하게 처리
  return queries;
}
```

## 스크린샷 UI 분석 (Claude Code 수행)

**중요**: 스크린샷 분석은 CLI가 아닌 **Claude Code가 직접 수행**합니다.

### 분석 프로세스

1. Claude Code가 캡처된 스크린샷을 **Read 도구**로 읽음
2. 비전 기능으로 UI 구조, 색상, 컴포넌트 분석
3. 분석 결과를 mapping.json의 `ui_analysis` 필드에 저장

### UI 분석 항목

| 항목 | 설명 | 예시 |
|------|------|------|
| layout.type | 레이아웃 유형 | hero-content, sidebar-content, grid |
| colors | 색상 팔레트 | primary, secondary, background |
| components | 컴포넌트 목록 | navbar, hero, cards, footer |
| style | 스타일 특성 | modern, classic, minimal |

### 분석 지시 예시

```
Claude Code에게:
"이 스크린샷({screenshot_path})을 읽고 다음 JSON 형식으로 UI 분석해줘:
{
  "layout": { "type": "...", "sections": [...] },
  "colors": { "primary": "#...", "secondary": "#...", "background": "#...", "text": "#..." },
  "components": [{ "type": "...", "description": "...", "position": "..." }],
  "style": { "theme": "...", "hasHero": true/false, ... },
  "suggestions": ["현대화 제안 1", "현대화 제안 2"]
}"
```

### UIAnalysis 인터페이스

```typescript
interface UIAnalysis {
  layout: {
    type: 'hero-content' | 'sidebar-content' | 'grid' | 'single-column' | 'dashboard' | 'landing';
    sections: string[];
  };
  colors: {
    primary: string;    // #HEX
    secondary: string;
    background: string;
    text: string;
    accent?: string;
  };
  components: {
    type: string;       // navbar, hero, card, table, form, footer 등
    description: string;
    position: 'header' | 'main' | 'sidebar' | 'footer';
  }[];
  style: {
    theme: 'modern' | 'classic' | 'minimal' | 'corporate';
    hasHero: boolean;
    hasCards: boolean;
    hasTable: boolean;
    hasForm: boolean;
    hasSidebar: boolean;
  };
  suggestions: string[];  // UI 현대화 제안
}
```

### Claude Code 실행 지시사항 (EXECUTION DIRECTIVE)

**CRITICAL:** 이 단계는 CLI가 아닌 **Claude Code가 직접 실행**해야 합니다.

**Step 1: mapping.json 로드**
```
Read 도구로 mapping.json 파일을 읽습니다.
```

**Step 2: 각 페이지의 스크린샷 분석**
```
mapping.json의 pages 배열을 순회하며:
1. page.capture.screenshot 경로 확인
2. Read 도구로 스크린샷 이미지 파일 읽기
3. 비전 기능으로 다음 분석 수행:
   - 레이아웃 유형 식별 (landing, single-column, grid 등)
   - 주요 색상 추출 (primary, secondary, background, text)
   - 컴포넌트 식별 (navbar, hero, cards, form, footer 등)
   - 스타일 테마 판단 (modern, classic, corporate 등)
   - UI 현대화 제안사항 생성
```

**Step 3: ui_analysis 필드 추가**
```
분석 결과를 UIAnalysis 형식으로 구성하여
해당 page 객체에 ui_analysis 필드로 추가합니다.
```

**Step 4: mapping.json 업데이트**
```
Write 도구로 ui_analysis가 추가된 mapping.json을 저장합니다.
```

**분석 우선순위:**
- 메인 페이지(index)를 먼저 분석하여 전역 색상/스타일 추출
- 추출된 전역 스타일을 다른 페이지 분석 시 참조
- 동적 페이지보다 정적 페이지를 먼저 분석 (UI 재구성 우선)

## 출력: mapping.json

```json
{
  "project": {
    "name": "example-migration",
    "sourceUrl": "https://example.com",
    "sourcePath": "./legacy-php"
  },

  "summary": {
    "totalPages": 47,
    "static": 12,
    "dynamic": 35
  },

  "pages": [
    {
      "id": "page_001",
      "capture": {
        "url": "https://example.com/about",
        "screenshot": "captures/about.png",
        "html": "captures/about.html"
      },
      "source": {
        "file": "about.php",
        "type": "static",
        "reason": []
      },
      "ui_analysis": {
        "layout": { "type": "hero-content", "sections": ["hero", "content", "footer"] },
        "colors": { "primary": "#3B82F6", "secondary": "#6B7280", "background": "#FFFFFF", "text": "#1F2937" },
        "components": [
          { "type": "navbar", "description": "상단 네비게이션", "position": "header" },
          { "type": "hero", "description": "메인 배너", "position": "main" }
        ],
        "style": { "theme": "modern", "hasHero": true, "hasCards": false, "hasTable": false, "hasForm": false, "hasSidebar": false },
        "suggestions": ["반응형 디자인 추가", "다크 모드 지원"]
      },
      "output": {
        "frontend": {
          "path": "/app/about/page.tsx",
          "type": "static-page"
        }
      }
    },
    {
      "id": "page_002",
      "capture": {
        "url": "https://example.com/members",
        "screenshot": "captures/members.png",
        "html": "captures/members.html"
      },
      "source": {
        "file": "members/list.php",
        "type": "dynamic",
        "reason": ["SQL 쿼리 발견", "세션 사용"]
      },
      "database": {
        "queries": [
          {
            "raw": "SELECT * FROM members WHERE status = 'active'",
            "table": "members",
            "type": "SELECT"
          }
        ]
      },
      "output": {
        "backend": {
          "entity": "Member.java",
          "repository": "MemberRepository.java",
          "controller": "MemberController.java",
          "endpoint": "GET /api/members"
        },
        "frontend": {
          "path": "/app/members/page.tsx",
          "type": "dynamic-page",
          "apiCalls": ["GET /api/members"]
        }
      }
    }
  ],

  "database": {
    "tables": [
      {
        "name": "members",
        "columns": [
          {"name": "id", "type": "INT", "primary": true},
          {"name": "email", "type": "VARCHAR(255)"},
          {"name": "name", "type": "VARCHAR(100)"},
          {"name": "status", "type": "ENUM('active','inactive')"}
        ]
      }
    ]
  }
}
```

## CLI 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--source` | 레거시 소스 경로 | (필수) |
| `--capture` | 캡처 디렉토리 | `./capture` |
| `--output` | 매핑 파일 출력 | `./mapping.json` |
| `--db-schema` | DB 스키마 파일 | - |

## 다음 단계

→ [Phase 3: Generate](./phase-3-generate.md)
