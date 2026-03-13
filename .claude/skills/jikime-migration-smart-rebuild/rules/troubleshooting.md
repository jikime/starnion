# Troubleshooting

Smart Rebuild 워크플로우에서 발생할 수 있는 문제들과 해결 방법입니다.

## Phase 1: Capture 문제

### 1.1 페이지 로드 실패

**증상:**
```
❌ 에러: https://example.com/page - Navigation timeout of 30000 ms exceeded
```

**원인:**
- 네트워크 속도 느림
- 페이지 내 무한 로딩 요소
- JavaScript 에러로 인한 로드 실패

**해결:**
```typescript
// 타임아웃 증가
await page.goto(url, {
  waitUntil: 'domcontentloaded', // networkidle 대신
  timeout: 60000
});

// 또는 특정 요소 대기
await page.waitForSelector('main', { timeout: 10000 });
```

### 1.2 Lazy Loading 이미지 누락

**증상:**
- 스크린샷에 placeholder만 보임
- 이미지가 로드되지 않음

**해결:**
```typescript
// 스크롤 속도 조절
async function autoScroll(page) {
  await page.evaluate(async () => {
    const distance = 300; // 더 짧은 거리
    const delay = 200;    // 더 긴 대기
    // ...
  });

  // 추가 대기
  await page.waitForTimeout(2000);
}
```

### 1.3 인증 필요 페이지

**증상:**
- 로그인 페이지로 리다이렉트
- 403/401 에러

**해결:**
```bash
# 1. 세션 저장
/jikime:smart-rebuild capture --login --save-auth=auth.json

# 2. 저장된 세션으로 크롤링
/jikime:smart-rebuild capture https://example.com --auth=auth.json
```

### 1.4 무한 스크롤 페이지

**증상:**
- 크롤링이 끝나지 않음
- 메모리 부족

**해결:**
```typescript
// 최대 높이 제한
const maxHeight = 30000; // 30,000px 제한

// 또는 아이템 수 제한
const maxItems = 100;
await page.evaluate(async (max) => {
  let items = document.querySelectorAll('.item');
  while (items.length < max) {
    window.scrollBy(0, 500);
    await new Promise(r => setTimeout(r, 200));
    items = document.querySelectorAll('.item');
  }
}, maxItems);
```

## Phase 2: Analyze 문제

### 2.1 URL ↔ 소스 매칭 실패

**증상:**
```
⚠️ 매칭 실패: https://example.com/products
```

**원인:**
- URL 리라이트 규칙 복잡
- MVC 프레임워크 라우터

**해결:**
1. `.htaccess` 또는 라우터 파일 분석
2. 수동 매핑 파일 작성

```json
// manual-mapping.json
{
  "https://example.com/products": "controllers/ProductController.php",
  "https://example.com/user/*": "controllers/UserController.php"
}
```

```bash
/jikime:smart-rebuild analyze --manual-mapping=manual-mapping.json
```

### 2.2 SQL 쿼리 추출 실패

**증상:**
- 동적 페이지인데 SQL이 추출되지 않음

**원인:**
- ORM 사용 (쿼리가 직접 작성되지 않음)
- Prepared Statement 패턴

**해결:**
```typescript
// ORM 패턴 감지
const ormPatterns = [
  /\$this->db->get\(['"](\w+)['"]\)/g,        // CodeIgniter
  /Model::where\(/g,                           // Laravel
  /\$wpdb->prepare\(/g,                        // WordPress
];

// 모델 파일에서 테이블 추출
function extractTableFromModel(modelFile: string) {
  const content = readFile(modelFile);
  const match = content.match(/protected \$table = ['"](\w+)['"]/);
  return match ? match[1] : null;
}
```

### 2.3 동적/정적 분류 오류

**증상:**
- 정적 페이지가 동적으로 분류됨
- 또는 그 반대

**해결:**
```json
// mapping.json 수동 수정
{
  "pages": [
    {
      "source": {
        "file": "about.php",
        "type": "static",      // 수동 변경
        "reason": [],
        "override": true,      // 수동 지정 표시
        "note": "include만 사용, 실제 정적"
      }
    }
  ]
}
```

## Phase 3: Generate 문제

### 3.1 타입 매핑 오류

**증상:**
- Java Entity 컴파일 에러
- 타입 불일치

**해결:**
| 문제 SQL | 수정 Java |
|----------|-----------|
| `TINYINT(1)` | `Boolean` (not Byte) |
| `DATETIME` | `LocalDateTime` |
| `TEXT` | `@Lob String` |
| `JSON` | `String` + `@Column(columnDefinition = "json")` |

### 3.2 관계 매핑 누락

**증상:**
- Foreign Key 관계가 Entity에 없음

**해결:**
```java
// Member.java
@OneToMany(mappedBy = "member")
private List<Order> orders;

// Order.java
@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "member_id")
private Member member;
```

### 3.3 이미지 경로 오류

**증상:**
- 이미지가 표시되지 않음
- 404 에러

**해결:**
1. 이미지 다운로드 및 경로 수정
```typescript
// 이미지 추출 및 저장
async function extractImages(html: string, outputDir: string) {
  const imgPattern = /<img[^>]+src=["']([^"']+)["']/g;
  const images: string[] = [];
  let match;

  while ((match = imgPattern.exec(html)) !== null) {
    const src = match[1];
    const filename = path.basename(src);

    // 다운로드
    await downloadImage(src, path.join(outputDir, 'images', filename));
    images.push(filename);
  }

  return images;
}
```

2. Next.js 경로 수정
```tsx
// 상대 경로 → public 경로
<img src="/images/logo.png" alt="Logo" />
```

## 일반적인 문제

### 메모리 부족

**증상:**
```
FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed
```

**해결:**
```bash
# Node.js 메모리 증가
NODE_OPTIONS=--max-old-space-size=4096 /jikime:smart-rebuild capture ...

# 또는 배치 크기 줄이기
/jikime:smart-rebuild capture --concurrency=2 --max-pages=20
```

### 인코딩 문제

**증상:**
- 한글 깨짐
- 특수문자 오류

**해결:**
```typescript
// HTML 인코딩 감지 및 변환
const charset = detectCharset(html);
if (charset !== 'utf-8') {
  html = iconv.decode(Buffer.from(html, 'binary'), charset);
}
```

### Rate Limiting

**증상:**
```
429 Too Many Requests
```

**해결:**
```typescript
// 요청 간 딜레이 추가
async function crawlWithDelay(urls: string[], delay = 1000) {
  for (const url of urls) {
    await capturePage(url);
    await sleep(delay);
  }
}
```

## 지원 요청

문제가 해결되지 않으면:

1. 로그 수집
```bash
/jikime:smart-rebuild capture --verbose > capture.log 2>&1
```

2. 에러 재현 정보 정리
- 사이트 URL
- 소스 코드 구조
- 에러 메시지
- 시도한 해결 방법

3. 이슈 리포트 작성
