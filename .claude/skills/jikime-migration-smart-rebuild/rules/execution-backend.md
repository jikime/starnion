# Smart Rebuild Execution - Phase G: Backend

Phase G 백엔드 연동 상세 실행 절차. 메인 문서: `execution.md`

---

## Phase G: 백엔드 연동 (페이지별 점진적 연동)

**조건:** Phase D에서 "백엔드 연동" 선택 시 실행 (동적 페이지만 표시됨)

**목표:** 해당 페이지에 필요한 API만 생성하고 즉시 연동하여 실제 동작 확인

---

## G-0: 백엔드 프로젝트 초기화 (첫 동적 페이지에서 1회 실행)

**명령어:** `/jikime:smart-rebuild backend-init --framework <framework>`

### G-0.1: 백엔드 프로젝트 존재 확인

```
IF {output}/backend/ 폴더 존재:
  → G-1로 스킵 (이미 초기화됨)
ELSE:
  → G-0.2로 진행 (프레임워크 선택)
```

### G-0.2: AskUserQuestion (프레임워크 선택)

```
AskUserQuestion:
  question: "백엔드 프레임워크를 선택하세요"
  header: "Backend Init"
  options:
    - label: "Spring Boot (Java)"
      description: "Java 21, JPA, Gradle"
    - label: "FastAPI (Python)"
      description: "Python 3.12+, SQLAlchemy"
    - label: "Go Fiber"
      description: "Go 1.22+, GORM"
    - label: "NestJS (Node.js)"
      description: "Node.js 20+, TypeORM"
```

### G-0.3: 프로젝트 Scaffolding

**Spring Boot:**
```bash
cd {output} && mkdir -p backend
cd {output}/backend && spring init \
  --dependencies=web,data-jpa,mysql,lombok,validation \
  --java-version=21 \
  --type=gradle-project \
  --name=api-server \
  .
```

**FastAPI:**
```bash
cd {output} && mkdir -p backend
cd {output}/backend && uv init
cd {output}/backend && uv add fastapi uvicorn sqlalchemy pymysql python-dotenv pydantic
```

**Go Fiber:**
```bash
cd {output} && mkdir -p backend
cd {output}/backend && go mod init api-server
cd {output}/backend && go get github.com/gofiber/fiber/v2
cd {output}/backend && go get gorm.io/gorm gorm.io/driver/mysql
```

**NestJS:**
```bash
cd {output} && npx @nestjs/cli new backend --package-manager npm --skip-git
cd {output}/backend && npm install @nestjs/typeorm typeorm mysql2 @nestjs/config
```

### G-0.4: 디렉토리 구조 생성

**Spring Boot:**
```
backend/
├── build.gradle
├── settings.gradle
└── src/main/
    ├── java/com/example/api/
    │   ├── ApiApplication.java
    │   ├── config/
    │   │   ├── CorsConfig.java
    │   │   └── SecurityConfig.java
    │   ├── controller/
    │   ├── service/
    │   ├── repository/
    │   ├── entity/
    │   └── dto/
    └── resources/
        └── application.yml
```

**FastAPI:**
```
backend/
├── pyproject.toml
├── .env
├── main.py
├── config.py
├── routers/
│   └── __init__.py
├── services/
├── models/
└── schemas/
```

**Go Fiber:**
```
backend/
├── go.mod
├── go.sum
├── main.go
├── config/
│   └── config.go
├── handlers/
├── services/
├── models/
└── middleware/
```

**NestJS:**
```
backend/
├── package.json
├── .env
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   └── common/
└── nest-cli.json
```

### G-0.5: DB 연결 설정

```
AskUserQuestion:
  question: "데이터베이스 연결 정보를 입력하세요"
  header: "DB 설정"
  options:
    - label: ".env 파일에서 읽기"
      description: "기존 .env의 DATABASE_URL 사용"
    - label: "직접 입력"
      description: "호스트, 포트, 사용자, 비밀번호 입력"
```

**Spring Boot (application.yml):**
```yaml
spring:
  datasource:
    url: jdbc:mysql://{host}:{port}/{database}
    username: {username}
    password: {password}
    driver-class-name: com.mysql.cj.jdbc.Driver
  jpa:
    hibernate:
      ddl-auto: validate
    show-sql: true
```

**FastAPI (.env):**
```
DATABASE_URL=mysql+pymysql://{username}:{password}@{host}:{port}/{database}
```

**Go Fiber (config.yaml):**
```yaml
database:
  dsn: "{username}:{password}@tcp({host}:{port})/{database}?parseTime=true"
```

**NestJS (.env):**
```
DB_HOST={host}
DB_PORT={port}
DB_USERNAME={username}
DB_PASSWORD={password}
DB_DATABASE={database}
```

### G-0.6: CORS + 공통 설정

**Spring Boot (CorsConfig.java):**
```java
@Configuration
public class CorsConfig implements WebMvcConfigurer {
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
            .allowedOrigins("http://localhost:3893")
            .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
            .allowedHeaders("*")
            .allowCredentials(true);
    }
}
```

**FastAPI (main.py):**
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3893"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Go Fiber (main.go):**
```go
app.Use(cors.New(cors.Config{
    AllowOrigins:     "http://localhost:3893",
    AllowMethods:     "GET,POST,PUT,DELETE,OPTIONS",
    AllowCredentials: true,
}))
```

**NestJS (main.ts):**
```typescript
app.enableCors({
    origin: 'http://localhost:3893',
    credentials: true,
});
```

---

## G-1: 공통 API 체크

**api-mapping.json에서 commonApis 확인:**

```
Read: {output}/api-mapping.json

IF commonApis 중 미생성 API 있음 (generated: false):
  → 공통 API 먼저 생성
  → G-1-1로 진행
ELSE:
  → G-2로 진행 (페이지 전용 API)
```

### G-1-1: 공통 API 생성 (최초 1회)

**인증 관련 API 생성 (프레임워크별):**

```
api-mapping.json의 commonApis 순회:
  - /api/auth/login
  - /api/auth/logout
  - /api/users/me
```

**프레임워크별 파일 생성:**

| API | Spring Boot | FastAPI | Go Fiber | NestJS |
|-----|-------------|---------|----------|--------|
| /api/auth/login | AuthController.java | routers/auth.py | handlers/auth.go | auth/auth.controller.ts |
| /api/users/me | UserController.java | routers/user.py | handlers/user.go | user/user.controller.ts |

> **Note**: 백엔드 프로젝트 초기화는 **Phase G-0**에서 완료됩니다. G-1 단계에서는 이미 생성된 프로젝트에 Controller/Service/Repository만 추가합니다.

**Controller 생성 예시 (Spring Boot):**

```java
// src/main/java/com/example/api/controller/AuthController.java
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout() {
        authService.logout();
        return ResponseEntity.ok().build();
    }
}
```

---

## G-2: 페이지 전용 API 생성

**api-mapping.json에서 해당 페이지 API 추출:**

```
Read: {output}/api-mapping.json
      ↓
pageApis[{pageId}] 추출
      ↓
각 API에 대해 Controller + Service + Repository 생성
```

**예시: pageApis["3"] = [{ path: "/api/products", method: "GET" }]**

**1. Entity 생성:**
```java
// src/main/java/com/example/api/entity/Product.java
@Entity
@Table(name = "products")
@Getter @Setter
@NoArgsConstructor
public class Product {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;

    @Column(precision = 10, scale = 2)
    private BigDecimal price;

    private Boolean active;
}
```

**2. Repository 생성:**
```java
// src/main/java/com/example/api/repository/ProductRepository.java
public interface ProductRepository extends JpaRepository<Product, Long> {
    List<Product> findByActiveTrue();
    Page<Product> findByCategory(String category, Pageable pageable);
}
```

**3. Service 생성:**
```java
// src/main/java/com/example/api/service/ProductService.java
@Service
@RequiredArgsConstructor
public class ProductService {

    private final ProductRepository productRepository;

    public List<Product> getActiveProducts() {
        return productRepository.findByActiveTrue();
    }

    public Page<Product> getProductsByCategory(String category, Pageable pageable) {
        return productRepository.findByCategory(category, pageable);
    }
}
```

**4. Controller 생성:**
```java
// src/main/java/com/example/api/controller/ProductController.java
@RestController
@RequestMapping("/api/products")
@RequiredArgsConstructor
public class ProductController {

    private final ProductService productService;

    @GetMapping
    public ResponseEntity<List<Product>> getProducts(
            @RequestParam(required = false) String category,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int limit) {

        if (category != null) {
            Page<Product> result = productService.getProductsByCategory(
                category, PageRequest.of(page, limit));
            return ResponseEntity.ok(result.getContent());
        }
        return ResponseEntity.ok(productService.getActiveProducts());
    }
}
```

---

## G-3: Frontend Connect (Mock → Real API)

**1. 환경변수 설정:**

```bash
# {output}/frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8080
```

**2. API 클라이언트 생성 (없는 경우):**

```typescript
// src/lib/api-client.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`API Error: ${res.status}`);
  }

  return res.json();
}
```

**3. Mock → Real API 교체:**

```tsx
// Before: Mock 데이터
const products = [
  { id: 1, name: "Product 1", price: 100 },
  { id: 2, name: "Product 2", price: 200 },
];

export default function ProductListPage() {
  return (
    <div>
      {products.map(p => <ProductCard key={p.id} product={p} />)}
    </div>
  );
}
```

```tsx
// After: Real API 호출
import { fetchApi } from '@/lib/api-client';

interface Product {
  id: number;
  name: string;
  price: number;
}

async function getProducts(): Promise<Product[]> {
  return fetchApi<Product[]>('/api/products');
}

export default async function ProductListPage() {
  const products = await getProducts();

  return (
    <div>
      {products.map(p => <ProductCard key={p.id} product={p} />)}
    </div>
  );
}
```

---

## G-4: 통합 테스트

**1. Backend 서버 실행:**

```bash
cd {output}/backend && ./gradlew bootRun
# 또는
cd {output}/backend && mvn spring-boot:run
```

**2. Frontend 서버 실행 (이미 실행 중이면 스킵):**

```bash
cd {output}/frontend && npm run dev
```

**3. 동작 확인:**

```
AskUserQuestion:
  question: "BE 서버(localhost:8080)와 FE 서버(localhost:3000)가 실행 중입니다.
             브라우저에서 http://localhost:3893/{route} 를 확인해주세요.
             API 연동이 정상적으로 동작하나요?"
  header: "통합 테스트"
  options:
    - label: "정상 동작"
      description: "API 호출 및 데이터 표시 정상"
    - label: "오류 발생"
      description: "연결 실패 또는 데이터 오류"
    - label: "스킵"
      description: "나중에 확인"
```

**오류 발생 시:**
- 브라우저 콘솔 에러 확인
- BE 서버 로그 확인
- CORS 설정 확인
- DB 연결 설정 확인

---

## G-5: 연동 완료 질문

```
AskUserQuestion:
  question: "페이지 {N} 백엔드 연동 완료! 다음 작업은?"
  header: "연동 완료"
  options:
    - label: "HITL 재조정"
      description: "UI 세부 조정이 필요한 경우"
    - label: "다음 페이지"
      description: "다음 pending 페이지로 진행"
    - label: "직접 입력"
      description: "다른 작업 지시"
```

---

## api-mapping.json 상태 업데이트

**연동 완료 후:**

```json
{
  "pageApis": {
    "3": [
      {
        "path": "/api/products",
        "method": "GET",
        "generated": true,           // 🔴 생성 완료
        "generatedAt": "2026-02-06T12:00:00Z",
        "connected": true,           // 🔴 연동 완료
        "connectedAt": "2026-02-06T12:30:00Z"
      }
    ]
  }
}
```

---

## Phase 3b: Generate Backend (일괄 생성)

**목적:** Java Spring Boot API 전체 생성 (페이지별이 아닌 일괄 생성 시)

```bash
/jikime:smart-rebuild generate backend --mapping=./mapping.json
```

---

## Phase 3c: Generate Connect (일괄 연동)

**목적:** Mock 데이터를 실제 API 호출로 교체 (페이지별이 아닌 일괄 연동 시)

```tsx
// Before: Mock
async function getMembers() {
  return Promise.resolve(mockMembers);
}

// After: Real API
async function getMembers() {
  const res = await fetch(`${process.env.API_URL}/api/members`);
  return res.json();
}
```

---

Version: 2.0.0
