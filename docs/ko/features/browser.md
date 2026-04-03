---
title: 브라우저 제어
nav_order: 18
parent: 기능
grand_parent: 🇰🇷 한국어
---

# 브라우저 제어

## 개요

Starnion의 브라우저 제어 기능은 AI가 실제 Chrome 브라우저를 자동으로 조작할 수 있게 합니다. URL 탐색, 버튼 클릭, 텍스트 입력, 폼 자동완성, 페이지 스크린샷 캡처 등을 자연어 명령 하나로 수행합니다.

Chrome DevTools MCP를 기반으로 동작하며, **별도 설치 없이 Chrome만 있으면** 즉시 사용 가능합니다. 에이전트가 Chrome을 자동으로 실행하고 관리합니다.

스크린샷은 자동으로 클라우드(MinIO)에 업로드되어 채팅에 이미지로 첨부되고, **이미지 메뉴**에도 자동 저장됩니다. 텔레그램·웹 채팅 모두에서 바로 확인할 수 있습니다.

---

## 활성화 방법

브라우저 기능은 기본적으로 활성화되어 있습니다. Chrome 브라우저가 설치된 환경에서 자동으로 시작됩니다.

**`~/.starnion/starnion.yaml` 설정:**

```yaml
browser:
  enabled: true              # 브라우저 기능 켜기/끄기
  headless: false            # false: 브라우저 창 표시 (기본), true: 백그라운드 실행
  control_port: 18793        # 브라우저 컨트롤 서버 포트 (기본값)
  # url: http://127.0.0.1:9222  # 이미 실행 중인 Chrome에 연결할 때만 설정
```

**환경변수:**

```bash
BROWSER_ENABLED=false          # 브라우저 기능 비활성화
BROWSER_HEADLESS=true          # headless 강제
BROWSER_CONTROL_PORT=18793     # 포트 변경
BROWSER_URL=http://127.0.0.1:9222  # 기존 Chrome 원격 연결
```

---

## Headless / Headed 모드

| 모드 | 설명 | 용도 |
|------|------|------|
| **Headed** (기본) | 브라우저 창이 화면에 표시 | 데스크탑 환경, 로컬 개발 |
| **Headless** | 창 없이 백그라운드 실행 | 서버 환경, Docker, CI |

```bash
# headless 강제 (환경변수 우선)
BROWSER_HEADLESS=true

# starnion.yaml에서 설정
browser:
  headless: true
```

---

## 사용 예시

### 스크린샷 찍기

```
나: 네이버에서 오늘 서울 날씨 검색해줘
봇: [브라우저 제어 중...]
    ![스크린샷](http://localhost:8080/api/files/browser/screenshots/uuid.png)
    서울 현재 날씨 스크린샷입니다.

나: https://map.naver.com 캡처해줘
봇: [브라우저 제어 중...]
    ![스크린샷](http://localhost:8080/api/files/browser/screenshots/uuid.png)
    네이버 지도 스크린샷입니다.
```

> 스크린샷은 **이미지 메뉴**에 자동 저장됩니다.

### 경로 검색 & 캡처

```
나: 네이버 지도에서 양재에서 해운대까지 경로 검색해서 화면 캡처해줘
봇: 네이버 지도로 이동해서 경로를 검색하겠습니다!
    [길찾기 버튼 클릭 → 출발지/도착지 입력 → 자동완성 선택...]
    ![경로 스크린샷](http://localhost:8080/api/files/browser/screenshots/uuid.png)
    양재 → 해운대 경로 검색 결과입니다. 약 4시간 17분, 397km 예상됩니다.
```

### 웹 페이지 탐색 및 클릭

```
나: 구글 검색창에 "날씨" 입력하고 검색해줘
봇: 구글로 이동해서 검색창에 "날씨"를 입력하고 Enter를 눌렀습니다.
    ![검색결과](http://localhost:8080/api/files/browser/screenshots/uuid.png)
```

### 폼 입력

```
나: 로그인 페이지에서 이메일 입력란에 test@example.com 입력해줘
봇: 이메일 입력란을 찾아 test@example.com을 입력했습니다.
```

---

## 작동 원리

```
사용자 요청
    ↓
에이전트(Claude)가 starnion-browser.py 명령 실행
    ↓
브라우저 컨트롤 서버 (127.0.0.1:18793) → Chrome DevTools MCP
    ↓
Chrome 브라우저 실제 조작 (클릭, 입력, 캡처 등)
    ↓
스크린샷: MinIO 업로드 → URL 생성
    ↓
에이전트가 ![alt](url) 마크다운 이미지로 응답
    ↓
게이트웨이: 텔레그램에 이미지 전송 + 이미지 메뉴에 저장
```

---

## 지원 명령

AI가 자동으로 선택하지만, 직접 요청할 때 참고할 수 있습니다.

| 명령 | 설명 | 예시 요청 |
|------|------|-----------|
| `snapshot` | 페이지 AI 스냅샷 (클릭 가능 요소 파악) | "지금 페이지 구조 알려줘" |
| `navigate` | URL 이동 | "구글 열어줘" |
| `screenshot` | 현재 페이지 스크린샷 | "지금 화면 찍어줘" |
| `click` | 요소 클릭 | "확인 버튼 클릭해줘" |
| `fill` | 입력란에 텍스트 입력 | "검색창에 날씨 입력해줘" |
| `fill_form` | 여러 입력란 한 번에 채우기 | "이메일이랑 비밀번호 입력해줘" |
| `press` | 키 입력 | "Enter 눌러줘" |
| `hover` | 요소에 마우스 올리기 | "메뉴 위에 마우스 올려줘" |
| `wait` | 특정 텍스트 나타날 때까지 대기 | (자동 사용) |
| `tabs` | 열린 탭 목록 | "열린 탭 보여줘" |
| `open` | 새 탭 열기 | "새 탭에서 네이버 열어줘" |

---

## 검색 URL 패턴

홈페이지에서 검색창을 클릭하는 것보다 직접 검색 URL을 사용하는 게 빠르고 안정적입니다.

| 검색 엔진 | URL 패턴 |
|----------|----------|
| 네이버 | `https://search.naver.com/search.naver?query=검색어` |
| 구글 | `https://www.google.com/search?q=검색어` |
| 다음 | `https://search.daum.net/search?q=검색어` |
| 유튜브 | `https://www.youtube.com/results?search_query=검색어` |

---

## 자동완성 처리

검색창, 주소 입력 등 자동완성이 있는 입력란은 반드시 다음 순서로 처리합니다.

```
1. fill로 텍스트 입력
   ↓
2. snapshot으로 자동완성 목록 확인
   ↓
3. 자동완성 항목 ref 찾아 click으로 선택
   ↓
4. 다음 단계 진행
```

> **주의**: 자동완성 항목은 Enter 키가 아닌 반드시 클릭으로 선택해야 합니다.

---

## 이미지 저장

스크린샷은 자동으로 처리됩니다.

```
스크린샷 촬영
    ↓
MinIO (browser/screenshots/) 에 PNG 업로드
    ↓
URL 생성: /api/files/browser/screenshots/uuid.png
    ↓
에이전트 응답에 마크다운 이미지 포함: ![스크린샷](url)
    ↓
이미지 메뉴에 자동 저장 (source: browser, type: screenshot)
```

---

## 설정 참고

```yaml
# ~/.starnion/starnion.yaml
browser:
  enabled: true
  control_port: 18793        # 브라우저 컨트롤 서버 포트
  headless: false            # true: 백그라운드, false: 창 표시
  evaluate_enabled: false    # JavaScript 실행 허용 (보안상 기본 false)
  # url: http://127.0.0.1:9222  # 실행 중인 Chrome에 직접 연결
```

---

## FAQ

**Q. Chrome이 자동으로 실행되나요?**
네. 에이전트가 Chrome DevTools MCP를 통해 Chrome을 자동으로 실행하고 관리합니다. 별도 설치나 설정 없이 Chrome만 있으면 됩니다.

**Q. 기존에 열어둔 Chrome 창을 사용할 수 있나요?**
가능합니다. Chrome을 `--remote-debugging-port=9222` 옵션으로 실행한 후, `starnion.yaml`에서 `browser.url: http://127.0.0.1:9222`로 연결하면 됩니다.

**Q. 스크린샷이 이미지 메뉴에 보이지 않으면?**
에이전트가 응답에 `![스크린샷](url)` 형식으로 URL을 포함해야 저장됩니다. 저장이 안 된다면 "스크린샷을 마크다운 이미지로 응답에 포함해줘"라고 요청해보세요.

**Q. 로그인이 필요한 사이트도 제어할 수 있나요?**
가능합니다. "아이디 입력란에 user@example.com 입력해줘", "비밀번호 입력란에 입력해줘" 처럼 요청하면 됩니다. 단, 비밀번호는 채팅 히스토리에 남으니 주의하세요.

**Q. 지도 스크린샷이 빈 화면으로 나오면?**
지도 타일이 로딩되기 전에 찍히는 경우입니다. "5초 기다린 후 스크린샷 찍어줘" 처럼 요청해보세요.

**Q. 안티봇 차단이 발생하면?**
일부 사이트는 자동화 접근을 차단합니다. `snapshot`으로 페이지 텍스트를 추출해 내용을 요약하는 방식으로 우회할 수 있습니다.

**Q. Docker 환경에서 headed 모드를 사용하려면?**
Docker 컨테이너 내에서는 가상 디스플레이(Xvfb)가 필요합니다. 기본적으로 headless 모드를 사용하는 것을 권장합니다.
