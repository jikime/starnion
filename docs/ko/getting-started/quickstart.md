---
layout: default
title: 빠른 시작 (3단계)
nav_order: 2
parent: 시작하기
grand_parent: 🇰🇷 한국어
---

# 빠른 시작 (3단계)
{: .no_toc }

CLI 하나로 3단계 만에 Starnion을 실행할 수 있습니다.
{: .fs-6 .fw-300 }

<details open markdown="block">
  <summary>목차</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

---

## 사전 요구사항

시작하기 전에 다음 두 가지만 설치되어 있으면 됩니다:

| 요구사항 | 최소 버전 | 확인 방법 |
|----------|-----------|-----------|
| Docker Engine | 24+ | `docker --version` |
| Docker Compose | v2 | `docker compose version` |

> **Docker Desktop 사용 중이라면** Docker Engine과 Docker Compose가 이미 포함되어 있습니다.

### 설치 확인

```bash
docker --version
# Docker version 24.0.0, build ...

docker compose version
# Docker Compose version v2.x.x
```

---

## 3단계 빠른 시작

### 1단계: CLI 설치

```bash
curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

설치 스크립트가 자동으로 다음을 수행합니다:
- `starnion` CLI → `/usr/local/bin/starnion`
- `starnion-gateway` → `~/.starnion/bin/`
- Python agent → `~/.starnion/agent/`
- Next.js UI → `~/.starnion/ui/`
- Docker 설정 파일 → `~/.starnion/docker/`

### 2단계: 초기 설정 마법사

```bash
starnion setup
```

설정 마법사가 순서대로 안내합니다:

| 단계 | 설정 항목 |
|------|-----------|
| 1 | 시스템 연결 확인 (PostgreSQL, MinIO) |
| 2 | 데이터베이스 연결 및 마이그레이션 실행 |
| 3 | 관리자 계정 생성 (이메일 + 비밀번호) |
| 4 | 파일 스토리지 설정 (MinIO 버킷) |
| 5 | 서비스 URL 설정 |

### 3단계: 서비스 시작

```bash
starnion docker up --build
```

처음 실행 시 Docker 이미지를 빌드하므로 수 분이 소요됩니다. 이후 실행은 즉시 시작됩니다.

진행 상황 확인:

```bash
starnion docker logs -f
```

모든 서비스가 `healthy` 상태가 되면 준비 완료입니다:

```bash
starnion docker ps
```

예상 출력:

```
NAME                 STATUS
starnion-postgres    Up (healthy)
starnion-minio       Up (healthy)
starnion-agent       Up (healthy)
starnion-gateway     Up
starnion-ui          Up
```

---

## 첫 번째 대화

로그인 후 다음을 시도해보세요:

### 기본 대화

채팅 입력창에 메시지를 입력합니다:

```
안녕하세요! 자기소개를 해주세요.
```

### AI 제공자 설정

더 나은 응답을 위해 AI API 키를 설정합니다:

1. 우측 상단 사용자 메뉴 → **설정**
2. **AI 제공자** 탭 선택
3. Google Gemini, OpenAI, 또는 Anthropic API 키 입력

> **무료로 시작하기:** Google AI Studio에서 Gemini API 키를 무료로 발급받을 수 있습니다.
> 👉 [https://aistudio.google.com](https://aistudio.google.com)

### 스킬 사용해보기

내장 스킬을 테스트합니다:

```
오늘 서울 날씨 알려줘
```

```
"Hello, World!"를 한국어로 번역해줘
```

```
1 + 1은 몇이야?
```

---

## 빠른 참조 명령어

```bash
# 서비스 시작
starnion docker up -d

# 서비스 중지
starnion docker down

# 로그 확인 (실시간)
starnion docker logs -f

# 특정 서비스 로그
starnion docker logs -f gateway
starnion docker logs -f agent

# 서비스 상태 확인
starnion docker ps

# 전체 재시작
starnion docker restart

# 이미지 재빌드 후 시작
starnion docker up --build

# 최신 버전 업데이트
starnion update

# 백업 / 복원
starnion docker backup
starnion docker restore --from ~/.starnion/backups/<timestamp>
```

---

## 문제가 발생했나요?

### 포트가 이미 사용 중인 경우

```bash
# 어떤 프로세스가 포트를 사용하는지 확인
lsof -i :3000
lsof -i :8080
lsof -i :5432
```

`.env` 파일에서 포트를 변경할 수 있습니다:

```dotenv
GATEWAY_PORT=8081
UI_PORT=3001
POSTGRES_PORT=5433
```

### 서비스가 시작되지 않는 경우

```bash
# 에러 로그 확인
docker compose logs gateway
docker compose logs agent

# 모두 중지 후 재시작
docker compose down && docker compose up -d
```

### 더 많은 도움이 필요하다면

- [설치 가이드](installation) — 더 상세한 설치 방법
- [환경 설정](configuration) — 환경 변수 전체 설명
- [GitHub Issues](https://github.com/jikime/starnion/issues) — 버그 리포트 및 질문

---

## 다음 단계

빠른 시작을 완료했다면 다음을 확인해보세요:

- [환경 설정](configuration) — AI API 키 설정, Telegram 봇 연동
- [설치 가이드](installation) — CLI 설치 및 네이티브 실행 방법
- [Starnion이란?](introduction) — 아키텍처 및 기능 상세 설명
