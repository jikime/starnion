# Smart Rebuild Execution - Phase 1: Capture

Phase 1 캡처 상세 실행 절차. 메인 문서: `execution.md`

---

## Phase 1: Capture (링크 수집)

**목표:** Playwright로 라이브 사이트의 모든 링크를 수집하여 sitemap.json 생성

> **🔴 Lazy Capture 방식**: capture 단계에서는 **링크만 수집**합니다.
> 실제 HTML + 스크린샷 캡처는 `generate --page N` 단계에서 해당 페이지 처리 시 수행됩니다.

### 캡처 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--merge` | 기존 sitemap.json에 새 route만 추가 | ✅ (기본) |
| `--force` | sitemap 새로 생성 (기존 덮어쓰기) | - |
| `--prefetch` | 모든 페이지 HTML + 스크린샷 미리 캡처 | - |
| `--clean` | 더 이상 존재하지 않는 route 제거 | - |

### 실행 절차 (기본: 링크만 수집)

**1단계: sitemap.json 확인**
```
IF sitemap.json 존재 AND --force 아님:
  → 기존 sitemap 로드
  → 증분 모드 (새 링크만 추가)
ELSE:
  → 새로운 sitemap 생성
```

**2단계: 링크 크롤링 (HTML/스크린샷 캡처 안 함!)**
1. Playwright 브라우저 초기화
2. 시작 URL 방문
3. 페이지 내 `<a href>` 태그에서 내부 링크 수집
4. 수집된 링크 재귀적으로 방문 & 링크 수집
5. 각 URL 정규화 (trailing slash, query params 제거)
6. 중복 제거

**3단계: sitemap.json 생성/업데이트**
```
- 발견된 모든 URL을 pages 배열에 추가
- captured: false (아직 캡처 안 됨)
- status: pending
```

### URL 정규화 규칙

```javascript
function normalizeUrl(url) {
  const parsed = new URL(url);
  parsed.search = '';  // query params 제거
  parsed.hash = '';    // hash 제거
  let path = parsed.pathname;
  if (path !== '/' && path.endsWith('/')) {
    path = path.slice(0, -1);  // trailing slash 제거
  }
  parsed.pathname = path;
  return parsed.toString();
}
```

### 링크 수집 코드

```javascript
const { chromium } = require('playwright');

async function collectLinks(startUrl, baseUrl, maxPages = 100) {
  const browser = await chromium.launch();
  const visited = new Set();
  const toVisit = [normalizeUrl(startUrl)];
  const pages = [];

  while (toVisit.length > 0 && pages.length < maxPages) {
    const url = toVisit.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

      // 페이지 제목 추출
      const title = await page.title();

      // 내부 링크 수집 (HTML/스크린샷 캡처 안 함!)
      const links = await page.$$eval('a[href]', (anchors, base) =>
        anchors.map(a => a.href).filter(h => h.startsWith(base) && !h.includes('#')),
        baseUrl
      );

      // 새 링크들 큐에 추가
      for (const link of links) {
        const normalized = normalizeUrl(link);
        if (!visited.has(normalized) && !toVisit.includes(normalized)) {
          toVisit.push(normalized);
        }
      }

      pages.push({
        id: pages.length + 1,
        url: url,
        title: title,
        captured: false,      // 🔴 아직 캡처 안 됨
        screenshot: null,
        html: null,
        status: 'pending',
        links: [...new Set(links.map(normalizeUrl))]
      });

    } catch (e) {
      console.error(`Failed to visit: ${url}`, e.message);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  return pages;
}
```

### --prefetch 옵션 (전체 미리 캡처)

일괄 생성이나 오프라인 작업이 필요한 경우:

```bash
/jikime:smart-rebuild capture https://example.com --prefetch
```

이 옵션 사용 시:
- 모든 페이지 HTML + 스크린샷 미리 캡처
- `captured: true`로 설정
- 기존 방식과 동일하게 동작

### 상태별 처리 (증분 모드)

| 기존 상태 | 새 크롤링에서 발견 | 처리 |
|----------|------------------|------|
| 있음 | O | 유지 (건너뛰기) |
| (없음) | O | **추가** (새 route) |
| 있음 | X | 유지 (삭제 안 함) |

### Playwright 크롤링 코드 (레거시 - --prefetch용)

```javascript
const { chromium } = require('playwright');

async function capturePage(browser, url, baseUrl, outputDir) {
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

  // Lazy loading 해결: 자동 스크롤
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let total = 0;
      const timer = setInterval(() => {
        window.scrollBy(0, 500);
        total += 500;
        if (total >= document.body.scrollHeight || total >= 30000) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 100);
    });
  });

  // 스크린샷 + HTML 저장
  const filename = url.replace(/https?:\/\//, '').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 80);
  await page.screenshot({ path: `${outputDir}/${filename}.png`, fullPage: true });
  const html = await page.content();
  require('fs').writeFileSync(`${outputDir}/${filename}.html`, html);

  // 내부 링크 수집
  const links = await page.$$eval('a[href]', (anchors, base) =>
    anchors.map(a => a.href).filter(h => h.startsWith(base) && !h.includes('#')),
    baseUrl
  );

  return { url, filename, links: [...new Set(links)] };
}
```

### sitemap.json 구조 (Lazy Capture)

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
      "status": "pending",
      "type": "static",
      "capturedAt": "2026-02-06T10:00:00Z",
      "completedAt": null,
      "links": ["https://example.com/about", "..."]
    },
    {
      "id": 2,
      "url": "https://example.com/about",
      "title": "About Us",
      "captured": false,
      "screenshot": null,
      "html": null,
      "status": "pending",
      "type": null,
      "capturedAt": null,
      "completedAt": null,
      "links": []
    }
  ]
}
```

**필드 설명:**

| 필드 | 설명 |
|------|------|
| `createdAt` | sitemap 최초 생성 시간 (링크 수집 시점) |
| `updatedAt` | 마지막 업데이트 시간 |
| `summary.captured` | HTML + 스크린샷 캡처 완료된 페이지 수 |
| `page.captured` | 🔴 **해당 페이지 캡처 여부** (false면 generate 시 캡처) |
| `page.screenshot` | 캡처된 경우 파일명, 미캡처 시 null |
| `page.html` | 캡처된 경우 파일명, 미캡처 시 null |
| `page.capturedAt` | 해당 페이지 실제 캡처 시간 |

---

## CLI 명령어

```bash
cd "{SCRIPTS_DIR}" && npx ts-node --transpile-only bin/smart-rebuild.ts capture {url} \
  --output={output} \
  [--login] \
  [--max-pages=100]
```

---

Version: 2.0.0
