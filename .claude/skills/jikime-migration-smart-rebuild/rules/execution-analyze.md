# Smart Rebuild Execution - Phase 2: Analyze

Phase 2 분석 상세 실행 절차. 메인 문서: `execution.md`

---

## Phase 2: Analyze (분석 & 매핑)

**목표:** 소스 코드 분석하여 캡처와 매핑, 정적/동적 분류, **API 의존성 추출**

### Step 1: 정적/동적 페이지 분류

**분류 패턴:**
```javascript
const dynamicPatterns = [
  /SELECT\s+.+\s+FROM/gi,
  /INSERT\s+INTO/gi,
  /UPDATE\s+.+\s+SET/gi,
  /DELETE\s+FROM/gi,
  /mysqli_query|\$pdo->query|\$wpdb->/g,
  /\$_SESSION|session_start/g,
  /\$_POST|\$_REQUEST/g,
];
```

**분류 결과 → sitemap.json 업데이트:**
```json
{
  "pages": [
    { "id": 1, "type": "static", "apis": [] },
    { "id": 2, "type": "dynamic", "apis": ["GET /api/products"] }
  ]
}
```

### Step 2: API 엔드포인트 추출

**목표:** 레거시 소스에서 필요한 API 엔드포인트 식별

**추출 패턴:**
```javascript
// PHP 파일에서 SQL 쿼리 추출
const sqlPatterns = [
  { pattern: /SELECT\s+.+\s+FROM\s+(\w+)/gi, method: 'GET' },
  { pattern: /INSERT\s+INTO\s+(\w+)/gi, method: 'POST' },
  { pattern: /UPDATE\s+(\w+)\s+SET/gi, method: 'PUT' },
  { pattern: /DELETE\s+FROM\s+(\w+)/gi, method: 'DELETE' },
];

// 테이블명 → API 엔드포인트 변환
// members → /api/members
// product_list → /api/products
```

**추출 로직:**
```
1. 레거시 소스 파일 스캔 (*.php, *.inc 등)
2. SQL 쿼리 패턴 매칭
3. 테이블명 추출 및 정규화
4. HTTP 메서드 매핑 (SELECT→GET, INSERT→POST 등)
5. 페이지별 API 의존성 그룹화
```

### Step 3: api-mapping.json 생성

**목표:** 페이지별 API 의존성을 구조화하여 점진적 백엔드 생성 지원

**api-mapping.json 구조:**
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
      "description": "사용자 로그인"
    },
    {
      "path": "/api/auth/logout",
      "method": "POST",
      "required": true,
      "sourceFile": "logout.php",
      "description": "로그아웃"
    },
    {
      "path": "/api/users/me",
      "method": "GET",
      "required": true,
      "sourceFile": "session.php",
      "description": "현재 사용자 정보"
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
        "sql": "SELECT * FROM products WHERE active = 1",
        "params": ["category", "page", "limit"]
      }
    ],
    "5": [
      {
        "path": "/api/products/:id",
        "method": "GET",
        "sourceFile": "product_detail.php",
        "table": "products",
        "params": ["id"]
      },
      {
        "path": "/api/reviews",
        "method": "GET",
        "sourceFile": "product_detail.php",
        "table": "reviews",
        "params": ["product_id"]
      }
    ],
    "7": [
      {
        "path": "/api/members",
        "method": "GET",
        "sourceFile": "member_list.php",
        "table": "members",
        "requiresAuth": true
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
        { "name": "price", "type": "DECIMAL(10,2)", "javaType": "BigDecimal" },
        { "name": "active", "type": "BOOLEAN", "javaType": "Boolean" }
      ]
    },
    {
      "name": "Member",
      "table": "members",
      "fields": [
        { "name": "id", "type": "BIGINT", "javaType": "Long" },
        { "name": "email", "type": "VARCHAR(255)", "javaType": "String" },
        { "name": "name", "type": "VARCHAR(100)", "javaType": "String" }
      ]
    }
  ]
}
```

**필드 설명:**

| 필드 | 설명 |
|------|------|
| `commonApis` | 🔴 모든 페이지에서 공통으로 필요한 API (인증 등) |
| `commonApis[].required` | true면 첫 번째 동적 페이지 연동 시 반드시 생성 |
| `pageApis` | 페이지 ID별 필요한 API 목록 |
| `pageApis[pageId][]` | 해당 페이지에서 호출하는 API들 |
| `entities` | DB 테이블 → Java Entity 매핑 정보 |

### Step 4: sitemap.json 업데이트

**api-mapping.json 생성 후 sitemap.json에 참조 추가:**
```json
{
  "pages": [
    {
      "id": 1,
      "type": "static",
      "hasApi": false,
      "apiCount": 0
    },
    {
      "id": 3,
      "type": "dynamic",
      "hasApi": true,
      "apiCount": 1,
      "apis": ["/api/products"]
    }
  ]
}
```

### 공통 API 식별 규칙

| 패턴 | 분류 | 설명 |
|------|------|------|
| `session_start`, `$_SESSION` | `commonApis` | 세션/인증 관련 |
| `login`, `logout`, `auth` | `commonApis` | 인증 API |
| 여러 페이지에서 동일 테이블 접근 | `commonApis` | 공통 데이터 |
| 단일 페이지에서만 사용 | `pageApis` | 페이지 전용 API |

---

## CLI 명령어

```bash
cd "{SCRIPTS_DIR}" && npx ts-node --transpile-only bin/smart-rebuild.ts analyze \
  --source={source} \
  --capture={capture} \
  --output={output}
```

**출력 파일:**
- `{output}/mapping.json` - 소스 ↔ 캡처 매핑
- `{output}/api-mapping.json` - 🔴 API 의존성 매핑

---

## SQL → Java 타입 매핑

| SQL | Java |
|-----|------|
| BIGINT | Long |
| INT | Integer |
| VARCHAR | String |
| TEXT | String |
| DATETIME | LocalDateTime |
| DECIMAL | BigDecimal |
| BOOLEAN | Boolean |

---

Version: 2.0.0
