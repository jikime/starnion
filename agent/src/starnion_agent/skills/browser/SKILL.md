---
name: 브라우저 제어
description: 웹 브라우저를 자동으로 제어합니다. URL 탐색, 클릭, 텍스트 입력, 스크린샷, 페이지 내용 읽기 등을 지원합니다.
---

## 브라우저 제어 스킬

사용자가 웹사이트를 탐색하거나 자동화 작업을 요청할 때 사용합니다.

---

### ⚡ 빠른 사용 — browser_open_screenshot (가장 권장)

URL 하나를 열고 스크린샷만 필요할 때는 **이 툴 하나만** 호출하세요.
내부에서 navigate → networkidle 대기 → 렌더링 대기 → 전체 페이지 캡처 → 브라우저 종료를 자동으로 처리합니다.

```
browser_open_screenshot(url="https://search.naver.com/search.naver?query=오늘+날씨")
```

개별 툴(browser_navigate + browser_wait_ms + browser_screenshot + browser_close) 조합은
**상호작용(클릭, 입력, 로그인)이 필요한 경우에만** 사용하세요.

---

### 상호작용이 필요할 때의 순서

1. `browser_navigate` — URL로 이동
2. `browser_snapshot` — 페이지 구조 파악 (클릭 가능한 요소 확인)
3. `browser_click` / `browser_type` — 상호작용
4. `browser_screenshot` — 결과 확인 (이미지로 전송됨)
5. `browser_close` — 작업 완료 후 브라우저 종료

⚠️ **반드시 순서대로 한 번에 하나씩 호출**하세요. 여러 툴을 동시에 호출하지 마세요.

---

### 검색 URL 패턴

**홈페이지에서 검색창을 클릭/입력하지 마세요.** 직접 검색 URL을 사용하세요.

| 검색 엔진 | 직접 검색 URL 패턴 |
|----------|------------------|
| 네이버 | `https://search.naver.com/search.naver?query=검색어` |
| 구글 | `https://www.google.com/search?q=검색어` |
| 다음 | `https://search.daum.net/search?q=검색어` |
| 빙 | `https://www.bing.com/search?q=검색어` |

---

### 동적 콘텐츠 로딩

JavaScript로 렌더링되는 콘텐츠(날씨 위젯, 주식 시세, 지도 등)는 DOM 로드 후에도 추가 시간이 필요합니다.

- **`wait_until` 권장값**:
  - `"networkidle"` — 검색 결과, 대시보드, 동적 위젯 페이지 (권장)
  - `"load"` — 일반 정적 페이지
  - `"domcontentloaded"` — 단순 HTML 페이지 (기본값, 빠르지만 JS 렌더링 전)

- **`browser_wait_ms`** — navigation 후 추가 대기가 필요할 때 사용:
  - 검색 결과: 1000~2000ms
  - 지도/차트: 2000~3000ms

---

### 스크린샷 가이드

- **`full_page=True`** — 스크롤 아래 콘텐츠까지 전체 캡처 (날씨, 검색결과 등 권장)
- **`full_page=False`** (기본) — 현재 뷰포트만 캡처

날씨·검색 결과처럼 위젯이 아래에 있을 수 있는 페이지는 **반드시 `full_page=True`**를 사용하세요.

---

### 선택자 작성법

- CSS: `#login-btn`, `.search-input`, `input[name=q]`
- 텍스트: `text=로그인`, `text=검색`
- ARIA: `role=button[name=확인]`, `role=textbox[name=검색]`

---

### 주의사항

- 페이지가 없을 경우 먼저 `browser_navigate`를 호출하세요.
- 로그인이 필요한 사이트는 사용자에게 자격증명을 요청하세요.
- 작업 완료 후 반드시 `browser_close`를 호출해 리소스를 해제하세요.
- 스크린샷은 자동으로 채팅에 이미지로 첨부됩니다.
- 안티봇 차단 시 `browser_get_text()`로 텍스트 추출 후 요약 제공하세요.
