---
layout: default
title: 빠른 시작 (3단계)
nav_order: 2
parent: 시작하기
grand_parent: 🇰🇷 한국어
---

# 빠른 시작 (3단계)
{: .no_toc }

CLI만으로 StarNion을 3단계로 실행할 수 있습니다.
{: .fs-6 .fw-300 }

<details open markdown="block">
  <summary>목차</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

---

## 사전 요구사항

| 요구사항 | 최소 버전 | 확인 방법 |
|---------|----------|----------|
| Node.js | 20+ | `node --version` |
| pnpm | latest | `pnpm --version` |
| uv | latest | `uv --version` |
| Docker Engine | 24+ | `docker --version` |
| Docker Compose | v2 | `docker compose version` |

```bash
# 사전 요구사항 설치 (없는 경우)
npm install -g pnpm
curl -LsSf https://astral.sh/uv/install.sh | sh
```

> **Docker Desktop**을 사용 중이면 Docker Engine과 Docker Compose가 이미 포함되어 있습니다.

---

## 3단계 빠른 시작

### 1단계: CLI 설치

```bash
curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

설치 스크립트가 자동으로 설치합니다:
- `starnion` CLI → `/usr/local/bin/starnion`
- `starnion-gateway` → `~/.starnion/bin/`
- TypeScript agent → `~/.starnion/agent/`
- Next.js 웹 UI → `~/.starnion/web/`
- Docker 파일 → `~/.starnion/docker/`

### 2단계: 초기 설정 마법사

```bash
starnion setup
```

설정 마법사가 7단계로 안내합니다:

| 단계 | 설정 항목 |
|------|----------|
| 1 | 언어 선택 |
| 2 | 시스템 의존성 확인 (Node.js, pnpm) |
| 3 | 데이터베이스 연결 및 마이그레이션 |
| 4 | 관리자 계정 생성 (이메일 + 비밀번호) |
| 5 | 파일 스토리지 설정 (MinIO) |
| 6 | 서비스 설정 (포트, 공개 URL) |
| 7 | AI 프로바이더 감지 (Claude Code 자동 감지) |

### 3단계: 서비스 시작

아래 중 하나를 선택하세요:

**방법 A — 바이너리 모드 (권장):**
```bash
starnion start
```

**방법 B — Docker 모드:**
```bash
starnion docker up -d
```

**방법 C — systemd (Linux 프로덕션):**
```bash
sudo cp ~/.starnion/scripts/starnion.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now starnion
```

---

## AI 프로바이더 설정

### Claude Code 구독 (권장)

```bash
claude        # Claude Code CLI 실행
/login        # 브라우저를 통한 인증
```

인증 정보는 `~/.claude/.credentials.json`에 저장되며, 서비스 시작 시 자동 감지됩니다.

### 기타 프로바이더

Gemini, OpenAI, Ollama 등은 웹 UI 로그인 후 **Settings → Models**에서 API 키를 등록하세요.

> **무료로 시작:** Google AI Studio에서 Gemini API 키를 무료로 발급받을 수 있습니다.
> [https://aistudio.google.com](https://aistudio.google.com)

---

## 첫 번째 대화

브라우저에서 웹 UI를 열어주세요:

```
http://localhost:3893
```

설정 중 생성한 관리자 계정으로 로그인한 후 입력해 보세요:

```
안녕! 자기소개 해줘.
```

---

## 주요 명령어 참조

```bash
# 서비스 시작
starnion start              # 바이너리 모드 (포그라운드)
starnion docker up -d       # Docker 모드 (백그라운드)

# 서비스 중지
starnion docker down        # Docker 모드
# Ctrl+C                    # 바이너리 모드

# 로그 보기
journalctl -u starnion -f   # systemd
starnion docker logs -f      # Docker

# 상태 확인
starnion doctor              # 시스템 상태 점검

# 최신 버전 업데이트
starnion update
```

---

## 다음 단계

- [설치 가이드](installation) — 상세 설치 옵션 및 문제 해결
- [환경 설정](configuration) — 환경 변수 및 고급 설정
