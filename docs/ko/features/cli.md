---
title: CLI 대화 및 인증
nav_order: 12
parent: 기능
grand_parent: 🇰🇷 한국어
---

# CLI 대화 및 인증

## 개요

Starnion은 웹 UI와 Telegram 외에도 **터미널(CLI)** 에서 직접 AI와 대화할 수 있는 기능을 제공합니다. 서버에 SSH로 접속한 상태이거나, 브라우저 없이 빠르게 AI에게 물어보고 싶을 때 유용합니다.

CLI 대화는 별도 저장소가 아닌 **동일한 데이터베이스**에 기록됩니다. 즉, 터미널에서 나눈 대화를 나중에 웹 UI에서도 확인할 수 있습니다.

---

## 설치 확인

CLI 기능은 `starnion` 바이너리에 내장되어 있습니다. 설치 여부는 다음 명령어로 확인하세요.

```bash
starnion --version
```

설치가 되어 있지 않다면 [설치 가이드](/docs/ko/getting-started/introduction)를 참고하세요.

---

## 인증

### 로그인

`starnion login` 명령어로 이메일과 비밀번호를 입력하여 로그인합니다. 로그인에 성공하면 인증 토큰이 `~/.starnion/user.yaml` 파일에 저장됩니다.

```bash
starnion login
```

```
이메일: user@example.com
비밀번호: ••••••••
✅ 로그인 성공! 안녕하세요, 홍길동님.
토큰 유효기간: 2025년 4월 9일 (30일)
```

**토큰 저장 위치:** `~/.starnion/user.yaml`

```yaml
# ~/.starnion/user.yaml
token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
expires_at: "2025-04-09T00:00:00Z"
email: user@example.com
name: 홍길동
```

> **토큰 유효기간은 30일**입니다. 만료 7일 전부터 로그인 시 갱신 안내 메시지가 표시됩니다.

---

### 로그아웃

`starnion logout` 명령어는 로컬에 저장된 토큰을 삭제합니다. 서버 세션에는 영향을 주지 않으며, 이후 CLI 사용 시 다시 로그인이 필요합니다.

```bash
starnion logout
```

```
🔒 로그아웃 완료. 로컬 인증 정보가 삭제되었습니다.
```

---

### 현재 로그인 정보 확인

`starnion whoami` 명령어로 현재 로그인된 계정 정보를 확인합니다.

```bash
starnion whoami
```

```
이름:   홍길동
이메일: user@example.com
토큰 만료: 2025년 4월 9일 (D-23)
```

로그인되어 있지 않은 경우:

```
로그인되어 있지 않습니다. 'starnion login'으로 로그인하세요.
```

---

## CLI 채팅

### 대화형 REPL 모드 시작

`starnion chat` 명령어를 실행하면 대화형 REPL(Read-Eval-Print Loop) 모드로 진입합니다. 프롬프트에 메시지를 입력하면 AI가 실시간으로 응답합니다.

```bash
starnion chat
```

```
Starnion CLI 대화 모드
새 대화를 시작합니다. 종료하려면 Ctrl+C 또는 'exit'를 입력하세요.

> 안녕하세요! 오늘 날씨 어때요?
AI: 안녕하세요! 현재 서울 날씨를 확인해 드릴게요.
    🔧 weather 실행 중...
    서울의 현재 날씨는 맑음, 기온 18°C입니다.
    미세먼지 농도는 보통 수준이에요.

> 이번 달 지출 요약해줘
AI: 🔧 finance_summary 실행 중...
    3월 지출 현황 (1~10일):
    - 식비: 42,500원
    - 카페: 18,000원
    - 교통: 15,400원
    - 합계: 75,900원

> exit
대화를 종료합니다. 대화 내용이 저장되었습니다.
```

### 대화 종료

REPL 모드를 종료하려면 다음 중 하나를 사용합니다.

- `exit` 또는 `quit` 입력
- `Ctrl+C` 단축키

종료 시 현재 대화는 자동으로 저장됩니다.

---

## 웹 UI와의 연동

CLI에서 나눈 대화는 **웹 UI 사이드바에서 확인**할 수 있습니다. CLI 대화는 `platform='cli'`로 저장되며, 사이드바의 **💻 CLI** 섹션에 별도로 표시됩니다.

```
사이드바 대화 목록:
  📱 Telegram
    └─ 오늘 날씨 물어봤던 것
  💻 CLI
    └─ 3월 10일 지출 요약  ← CLI에서 나눈 대화
  🌐 Web
    └─ 계약서 분석 요청
```

> CLI 대화도 웹 UI에서 이어서 대화할 수 있습니다. 웹에서 CLI 대화를 선택하면 해당 스레드의 이전 문맥이 유지됩니다.

---

## 토큰 만료 안내

인증 토큰은 **30일**간 유효합니다. 만료 **7일 전**부터는 CLI 명령 실행 시마다 갱신 안내 메시지가 표시됩니다.

```bash
starnion chat
```

```
⚠️  토큰이 5일 후 만료됩니다. 'starnion login'으로 갱신하세요.

Starnion CLI 대화 모드
> ...
```

토큰이 만료된 후에는 모든 CLI 명령이 로그인을 요구합니다.

```bash
starnion whoami
```

```
❌ 토큰이 만료되었습니다. 'starnion login'으로 다시 로그인하세요.
```

---

## 다중 사용자 지원

CLI는 **OS 사용자별 독립 인증**을 지원합니다. 각 OS 사용자의 홈 디렉터리에 별도의 `~/.starnion/user.yaml` 파일이 생성되므로, 같은 서버에서 여러 명이 각자의 Starnion 계정으로 사용할 수 있습니다.

| OS 사용자 | 토큰 저장 경로 |
|-----------|---------------|
| alice | `/home/alice/.starnion/user.yaml` |
| bob | `/home/bob/.starnion/user.yaml` |
| root | `/root/.starnion/user.yaml` |

각 사용자는 자신의 토큰으로만 자신의 대화 기록에 접근할 수 있습니다.

---

## 명령어 요약

| 명령어 | 설명 |
|--------|------|
| `starnion login` | 이메일/비밀번호로 로그인, 토큰을 `~/.starnion/user.yaml`에 저장 |
| `starnion logout` | 로컬 토큰 삭제 |
| `starnion whoami` | 현재 로그인 계정 및 토큰 만료일 확인 |
| `starnion chat` | 대화형 REPL 모드 시작 |

---

## 팁 & FAQ

**Q. 토큰 파일(`~/.starnion/user.yaml`)을 직접 수정해도 되나요?**

A. 권장하지 않습니다. 토큰은 서버에서 서명된 JWT이므로 임의로 수정하면 인증이 실패합니다. 만료 시 `starnion login`으로 새 토큰을 발급받으세요.

**Q. CLI 대화가 웹 UI 사이드바에 보이지 않아요.**

A. 사이드바에서 **💻 CLI** 섹션을 확인하세요. 웹 UI를 이미 열어 둔 상태라면 페이지를 새로고침하면 목록이 갱신됩니다.

**Q. 여러 Starnion 계정을 CLI에서 번갈아 사용할 수 있나요?**

A. `starnion logout` 후 `starnion login`으로 다른 계정에 로그인하면 됩니다. 토큰 파일이 새 계정 정보로 덮어써집니다.

**Q. CI/CD 파이프라인에서 CLI를 사용하고 싶어요.**

A. 현재 CLI는 대화형 로그인 방식만 지원합니다. 자동화 환경에서의 API 키 인증 방식은 향후 지원 예정입니다.

**Q. 네트워크가 불안정한 환경에서도 사용 가능한가요?**

A. CLI는 각 메시지 전송 시 API를 호출합니다. 네트워크가 끊기면 요청이 실패하며, 재시도 없이 오류 메시지를 표시합니다. 안정적인 네트워크 환경에서 사용하는 것을 권장합니다.

---

## starnion ask — 일회성 질문

`starnion chat`이 대화형 세션인 반면, `starnion ask`는 **한 번만 질문하고 바로 답변을 받는** 명령어입니다. 스크립트나 파이프라인에서 AI 출력을 활용할 때 유용합니다.

### 기본 사용법

```bash
# 직접 질문
starnion ask "파이썬에서 리스트 컴프리헨션 예제 알려줘"

# 파이프로 내용 전달
cat error.log | starnion ask "이 에러 원인이 뭐야?"
cat report.md | starnion ask "이 내용을 3줄로 요약해줘"
```

### 특징

| 항목 | 내용 |
|------|------|
| 로그인 필요 | 예 (`starnion login` 선행 필요) |
| 대화 기록 | 웹 UI에 저장됨 |
| 스트리밍 | 실시간 출력 지원 |
| 파이프 지원 | `cat file | starnion ask "..."` 형태 |

### 파이프 활용 예시

```bash
# 로그 파일 분석
tail -100 /var/log/app.log | starnion ask "최근 에러 패턴 분석해줘"

# 코드 리뷰
git diff HEAD~1 | starnion ask "이 변경사항 코드 리뷰해줘"

# 문서 요약
curl -s https://example.com/readme.md | starnion ask "핵심 내용만 요약해줘"
```
