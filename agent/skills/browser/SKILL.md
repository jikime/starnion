---
name: browser
display_name: 브라우저 제어
description: Control the user's Chrome browser — navigate pages, read page content, click elements, fill forms, take screenshots. Chrome is automatically launched and managed by the agent — no manual setup required.
version: 1.0.0
emoji: "🌐"
category: browser
enabled_by_default: true
requires_api_key: false
platforms: web
uses_provider: false
allowed-tools:
  - Bash
  - exec
triggers:
  keywords:
    - 브라우저
    - 크롬
    - 웹페이지
    - 열어줘
    - 사이트
    - 스크린샷
    - 캡처
    - 클릭해줘
    - 검색해줘
    - 입력해줘
    - 화면
    - URL
    - browser
    - chrome
    - navigate
    - screenshot
    - webpage
    - click
    - fill form
    - open website
    - capture screen
  when_to_use:
    - User asks to open a URL or website in the browser
    - User wants to take a screenshot of a web page
    - User asks to interact with a web page (click, fill form, navigate)
    - User says "지금 화면 보여줘" or "이 사이트 열어줘"
    - User wants to search something on a specific website (Naver, Google)
  not_for:
    - General web search without browser interaction (use websearch skill)
    - Downloading files without browser automation
---

# 브라우저 제어 (browser)

Chrome 브라우저를 원격으로 제어합니다. 에이전트 서버 내장 브라우저 컨트롤 서버(`http://127.0.0.1:18793`)를 통해 동작합니다. **Chrome은 에이전트가 자동으로 실행하므로 별도 설정 없이 바로 사용 가능합니다.**

## Commands

### 서버 상태 확인

```bash
python3 browser/scripts/starnion-browser.py status
```

### 열린 탭 목록

```bash
python3 browser/scripts/starnion-browser.py tabs
```

### 새 탭 열기

```bash
python3 browser/scripts/starnion-browser.py open "https://www.naver.com"
```

### 페이지 내용 읽기 (스냅샷)

```bash
# AI 친화적 텍스트 스냅샷 (인터랙티브 요소에 [ref=eN] 태그 포함)
python3 browser/scripts/starnion-browser.py snapshot

# 특정 탭 지정
python3 browser/scripts/starnion-browser.py snapshot --target-id {targetId}

# ARIA 노드 배열 형식
python3 browser/scripts/starnion-browser.py snapshot --format aria
```

### 페이지 이동

```bash
python3 browser/scripts/starnion-browser.py act navigate \
  --url "https://www.google.com" \
  --target-id {targetId}
```

### 요소 클릭

스냅샷에서 `[ref=eN]` 태그를 확인한 후 해당 ref를 사용합니다.

```bash
python3 browser/scripts/starnion-browser.py act click \
  --uid e3 \
  --target-id {targetId}
```

### 텍스트 입력

```bash
python3 browser/scripts/starnion-browser.py act fill \
  --uid e5 \
  --value "검색어" \
  --target-id {targetId}
```

### 폼 한 번에 채우기

```bash
python3 browser/scripts/starnion-browser.py act fill_form \
  --elements '[{"uid":"e5","value":"이메일"},{"uid":"e6","value":"비밀번호"}]' \
  --target-id {targetId}
```

### 키 입력

```bash
python3 browser/scripts/starnion-browser.py act press \
  --key Enter \
  --target-id {targetId}
```

### 스크린샷

```bash
python3 browser/scripts/starnion-browser.py act screenshot \
  --target-id {targetId} \
  --fmt png
```

스크린샷 응답에는 `url` 필드가 포함됩니다 (예: `"http://localhost:8080/api/files/browser/screenshots/uuid.png"`).

> ⚠️ **[CRITICAL]** 스크린샷 url은 **반드시** 마크다운 이미지 문법 `![설명](url)` 으로 응답에 포함해야 합니다.
> 백틱 코드(`url`), 텍스트 링크, 또는 URL만 단독 출력하면 **이미지가 전송되지 않습니다.**

**올바른 형식 (항상 이렇게)**:
```
![스크린샷](http://localhost:8080/api/files/browser/screenshots/abc123.png)
```

**잘못된 형식 (절대 사용 금지)**:
```
`http://localhost:8080/api/files/...`        ← 코드 블록 금지
**스크린샷 URL**: http://...                  ← URL 텍스트 금지
- 스크린샷 URL: `http://...`                  ← 항목 + 코드 금지
```

예시 응답:
```
네이버 지도 경로 검색 결과입니다.
![스크린샷](http://localhost:8080/api/files/browser/screenshots/9e357de7-45e8-4f24-ac11-215f174321c9.png)
```

### 텍스트 대기 (페이지 로딩 완료 확인)

```bash
python3 browser/scripts/starnion-browser.py act wait \
  --text "검색결과" \
  --target-id {targetId}
```

### 타임아웃 조정 (느린 페이지 / 스크린샷)

스크린샷이나 복잡한 페이지 작업은 기본 60초보다 더 걸릴 수 있습니다. `--timeout` 옵션으로 연장하세요:

```bash
# 스크린샷 타임아웃 90초로 연장
python3 browser/scripts/starnion-browser.py --timeout 90 act screenshot \
  --target-id {targetId} --fmt png

# 스냅샷 타임아웃 90초로 연장
python3 browser/scripts/starnion-browser.py --timeout 90 snapshot --target-id {targetId}
```

## Typical Workflow

### 1. 현재 탭 파악

```bash
python3 browser/scripts/starnion-browser.py tabs
# → targetId, title, url 목록 반환
```

### 2. 페이지 내용 파악

```bash
python3 browser/scripts/starnion-browser.py snapshot --target-id {targetId}
# → 텍스트와 [ref=e1], [ref=e2] ... 등 클릭 가능한 요소 위치 반환
```

### 3. 액션 수행

스냅샷의 ref를 이용해 click/fill 수행 후 다시 snapshot으로 결과 확인.

## Autocomplete / Dynamic UI Handling

**자동완성이 있는 입력창(검색창, 주소 입력 등)을 처리할 때는 반드시 이 패턴을 따르세요:**

1. `fill` 로 텍스트 입력
2. 즉시 `snapshot` 으로 자동완성 목록이 나타났는지 확인
3. 자동완성 항목의 `[ref=eN]` 을 찾아 `click` 으로 선택
4. 선택 후 다시 `snapshot` 으로 다음 입력 필드 확인

```bash
# 1. 텍스트 입력
python3 browser/scripts/starnion-browser.py act fill \
  --uid e5 --value "양재" --target-id {targetId}

# 2. 자동완성 목록 확인 (스냅샷)
python3 browser/scripts/starnion-browser.py snapshot --target-id {targetId}
# → "양재역", "양재IC" 등 자동완성 항목이 [ref=eN]으로 표시됨

# 3. 원하는 항목 클릭
python3 browser/scripts/starnion-browser.py act click \
  --uid e12 --target-id {targetId}
# (ref는 스냅샷에서 확인한 실제 값 사용)

# 4. 결과 확인
python3 browser/scripts/starnion-browser.py snapshot --target-id {targetId}
```

**주의**: 자동완성 항목이 스냅샷에 보이지 않으면 Enter 키를 누르지 말고 다시 snapshot을 찍어 확인하세요.

## When to use

- User wants to open a website or navigate to a URL
- User asks to search something on Naver, Google, or any website
- User wants to know what's currently on their browser screen
- User wants to click a button, fill a form, or interact with a webpage
- User asks for a screenshot of the current page
- User wants the agent to read content from a specific webpage in their browser

## Examples

**User:** "네이버 열어줘"

```bash
# 1. 탭 목록 확인
python3 browser/scripts/starnion-browser.py tabs

# 2. 네이버로 이동 (첫 번째 탭 사용)
python3 browser/scripts/starnion-browser.py act navigate \
  --url "https://www.naver.com" \
  --target-id {targetId}
```

**User:** "구글에서 날씨 검색해줘"

```bash
# 1. 구글로 이동
python3 browser/scripts/starnion-browser.py act navigate \
  --url "https://www.google.com" \
  --target-id {targetId}

# 2. 스냅샷으로 검색창 ref 확인
python3 browser/scripts/starnion-browser.py snapshot --target-id {targetId}

# 3. 검색창에 입력 (ref는 스냅샷에서 확인)
python3 browser/scripts/starnion-browser.py act fill \
  --uid e1 --value "오늘 날씨" --target-id {targetId}

# 4. 엔터
python3 browser/scripts/starnion-browser.py act press \
  --key Enter --target-id {targetId}

# 5. 결과 확인
python3 browser/scripts/starnion-browser.py snapshot --target-id {targetId}
```

**User:** "지금 화면 보여줘"

```bash
python3 browser/scripts/starnion-browser.py act screenshot \
  --target-id {targetId} --fmt png
# → base64 이미지 반환 (사용자에게 직접 표시)
```

**User:** "현재 페이지 내용 요약해줘"

```bash
python3 browser/scripts/starnion-browser.py snapshot --target-id {targetId}
# → 텍스트 스냅샷을 분석해서 요약
```

**User:** "네이버 지도에서 양재에서 해운대까지 경로 검색해서 화면 캡처해줘"

```bash
# 1. 탭 목록 확인
python3 browser/scripts/starnion-browser.py tabs

# 2. 네이버 지도 이동
python3 browser/scripts/starnion-browser.py act navigate \
  --url "https://map.naver.com" --target-id {targetId}

# 3. 페이지 로드 확인
python3 browser/scripts/starnion-browser.py snapshot --target-id {targetId}
# → 지도 화면 확인. "길찾기" 버튼 ref 찾기

# 4. 길찾기 버튼 클릭
python3 browser/scripts/starnion-browser.py act click \
  --uid {길찾기_ref} --target-id {targetId}

# 5. 출발지 입력창 확인
python3 browser/scripts/starnion-browser.py snapshot --target-id {targetId}
# → 출발지 입력창 ref 찾기

# 6. 출발지 입력
python3 browser/scripts/starnion-browser.py act fill \
  --uid {출발지_ref} --value "양재" --target-id {targetId}

# 7. 자동완성 확인 (반드시!)
python3 browser/scripts/starnion-browser.py snapshot --target-id {targetId}
# → "양재역", "양재IC" 등 자동완성 목록에서 원하는 항목 ref 확인

# 8. 자동완성 항목 클릭
python3 browser/scripts/starnion-browser.py act click \
  --uid {자동완성_ref} --target-id {targetId}

# 9. 도착지 입력창 확인
python3 browser/scripts/starnion-browser.py snapshot --target-id {targetId}

# 10. 도착지 입력
python3 browser/scripts/starnion-browser.py act fill \
  --uid {도착지_ref} --value "해운대" --target-id {targetId}

# 11. 자동완성 확인
python3 browser/scripts/starnion-browser.py snapshot --target-id {targetId}

# 12. 자동완성 항목 클릭 (예: "해운대역" 또는 "해운대해수욕장")
python3 browser/scripts/starnion-browser.py act click \
  --uid {자동완성_ref} --target-id {targetId}

# 13. 경로 검색 결과 로딩 대기
python3 browser/scripts/starnion-browser.py snapshot --target-id {targetId}
# → 경로 결과(소요 시간, 거리 등)가 나타나면 완료

# 14. 스크린샷 (지도/경로 이미지가 크므로 타임아웃 90초)
python3 browser/scripts/starnion-browser.py --timeout 90 act screenshot \
  --target-id {targetId} --fmt png
# → 응답에 url 필드 포함: {"ok": true, "url": "/api/files/browser/...", "format": "png", ...}
# → 반드시 url 필드를 마크다운 이미지로 응답에 포함: ![스크린샷]({url})
```

**핵심 규칙:**
- 각 fill/click 후에는 반드시 snapshot으로 현재 상태를 확인하세요.
- 자동완성 드롭다운은 직접 클릭해야 합니다 (Enter 입력 금지, 원하지 않는 항목이 선택될 수 있음).
- 경로 결과가 나타나기 전에 스크린샷을 찍으면 빈 화면이 캡처됩니다.

## Notes

- `targetId`는 `tabs` 명령으로 확인. 탭이 하나뿐이면 `snapshot`/`act` 시 생략 가능.
- 스냅샷의 `[ref=eN]`은 인터랙티브 요소(버튼, 링크, 입력창 등)에만 붙음.
- 브라우저가 처음 실행될 때 Chrome이 자동으로 시작됩니다 (headless 또는 일반 모드).
- 브라우저 컨트롤 서버는 에이전트 시작 시 자동으로 `127.0.0.1:18793`에서 실행됨 (기본 포트, `BROWSER_CONTROL_PORT` 환경변수로 변경 가능).
- **세션 격리**: 각 사용자 세션은 `TASK_ID` 환경변수 (`{userId}:{sessionId}` 형식)를 통해 고유하게 식별됩니다. 세션별 격리가 필요한 스크립트는 `$TASK_ID`를 참조하세요.
