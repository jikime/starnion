# Phase 1: Capture (캡처)

## 목표

Playwright를 사용하여 레거시 사이트의 모든 페이지를 캡처합니다.

## 실행

```bash
/jikime:smart-rebuild capture https://example.com --output=./capture
```

## 캡처 항목

| 항목 | 설명 | 파일 형식 |
|------|------|----------|
| 스크린샷 | 전체 페이지 캡처 | PNG |
| HTML | 렌더링된 DOM | HTML |
| 링크 | 내부 링크 목록 | JSON |

## Playwright 크롤러

### 기본 구조

```typescript
async function crawlAndCapture(startUrl: string) {
  const browser = await chromium.launch();
  const visited = new Set<string>();
  const toVisit: string[] = [startUrl];
  const results = [];

  while (toVisit.length > 0) {
    const batch = toVisit.splice(0, 5);
    const promises = batch.map(url => capturePage(browser, url));
    const batchResults = await Promise.all(promises);

    // 새 링크 추가
    for (const result of batchResults) {
      if (result) {
        results.push(result);
        result.links.forEach(link => {
          if (!visited.has(link)) toVisit.push(link);
        });
      }
    }
  }

  await browser.close();
  return results;
}
```

### 페이지 캡처

```typescript
async function capturePage(browser, url) {
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: 'networkidle' });

  // Lazy loading 해결
  await autoScroll(page);

  // 스크린샷
  await page.screenshot({
    path: `./output/${filename}.png`,
    fullPage: true
  });

  // HTML 저장
  const html = await page.content();

  // 링크 수집
  const links = await page.$$eval('a[href]', anchors =>
    anchors.map(a => a.href).filter(href => href.startsWith(baseUrl))
  );

  return { url, screenshot, html, links };
}
```

### Lazy Loading 처리

```typescript
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 500;
      const maxHeight = 50000;

      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= document.body.scrollHeight ||
            totalHeight >= maxHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve(undefined);
        }
      }, 100);
    });
  });
}
```

## 인증 페이지 처리

### 세션 저장

```typescript
async function saveLoginSession() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://example.com/login');

  console.log('브라우저에서 로그인하세요 (30초 대기)...');
  await page.waitForTimeout(30000);

  // 세션 저장
  await context.storageState({ path: 'auth.json' });
  await browser.close();
}
```

### 세션 사용

```typescript
async function crawlWithAuth() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    storageState: 'auth.json'
  });
  // 인증된 상태로 크롤링
}
```

## 출력: sitemap.json

```json
{
  "baseUrl": "https://example.com",
  "capturedAt": "2026-02-04T10:00:00Z",
  "totalPages": 47,
  "pages": [
    {
      "url": "https://example.com/about",
      "screenshot": "about.png",
      "html": "about.html",
      "title": "회사 소개",
      "links": ["/", "/contact", "/products"]
    }
  ]
}
```

## CLI 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--output` | 출력 디렉토리 | `./capture` |
| `--max-pages` | 최대 페이지 수 | `100` |
| `--concurrency` | 동시 처리 수 | `5` |
| `--auth` | 인증 세션 파일 | - |
| `--exclude` | 제외 URL 패턴 | `/admin/*,/api/*` |
| `--timeout` | 페이지 로드 타임아웃 | `30000` |

## 다음 단계

→ [Phase 2: Analyze](./phase-2-analyze.md)
