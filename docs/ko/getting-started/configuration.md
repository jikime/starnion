---
layout: default
title: 환경 설정
nav_order: 4
parent: 시작하기
---

# 환경 설정
{: .no_toc }

<details open markdown="block">
  <summary>목차</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

---

## 개요

Starnion의 설정은 두 가지 방법으로 관리됩니다:

1. **설정 마법사** (`starnion setup`) — 대화형 초기 설정
2. **환경 파일** (`docker/.env`) — 직접 편집

---

## 설정 마법사

`starnion setup` 명령은 대화형 마법사로 핵심 설정을 안내합니다:

```bash
starnion setup
```

마법사 진행 단계:

| 단계 | 설정 내용 | 저장 위치 |
|------|-----------|-----------|
| 1. 시스템 확인 | PostgreSQL, MinIO 연결 테스트 | - |
| 2. 데이터베이스 | DB URL, 마이그레이션 실행 | `~/.config/starnion/config.yaml` |
| 3. 관리자 계정 | 이메일, 비밀번호 생성 | PostgreSQL |
| 4. 파일 스토리지 | MinIO 엔드포인트, 자격증명, 버킷 | `~/.config/starnion/config.yaml` |
| 5. 서비스 URL | Gateway 공개 URL | `~/.config/starnion/config.yaml` |

마법사 완료 후 설정은 `~/.config/starnion/config.yaml`에 저장됩니다.

---

## 환경 변수 전체 참조

`docker/.env` 파일의 모든 환경 변수를 설명합니다.

### 필수 시크릿 (반드시 변경)

프로덕션 환경에서는 절대로 기본값을 사용하지 마세요.

| 변수명 | 기본값 | 설명 |
|--------|--------|------|
| `POSTGRES_PASSWORD` | `change-me-in-production` | PostgreSQL 데이터베이스 비밀번호 |
| `MINIO_SECRET_KEY` | `change-me-in-production` | MinIO 오브젝트 스토리지 시크릿 키 |
| `JWT_SECRET` | `change-me-min-32-chars-in-production` | JWT 토큰 서명 키 (최소 32자) |
| `AUTH_SECRET` | `change-me-min-32-chars-in-production` | NextAuth 세션 암호화 키 (최소 32자) |

안전한 랜덤 값 생성:

```bash
# JWT_SECRET 또는 AUTH_SECRET 생성
openssl rand -base64 32

# 예시 출력:
# K8mN3pQ7rS1tU5wX9yZ2aB4cD6eF0gH=
```

`.env` 파일에서 설정:

```dotenv
POSTGRES_PASSWORD=MySecurePassword123!
MINIO_SECRET_KEY=AnotherSecureKey456!
JWT_SECRET=K8mN3pQ7rS1tU5wX9yZ2aB4cD6eF0gHj2k4l6m8n0
AUTH_SECRET=P1q3r5s7t9u1v3w5x7y9z1a3b5c7d9e1f3g5h7i9
```

### PostgreSQL 설정

| 변수명 | 기본값 | 설명 |
|--------|--------|------|
| `POSTGRES_DB` | `starnion` | 데이터베이스 이름 |
| `POSTGRES_USER` | `starnion` | 데이터베이스 사용자명 |
| `POSTGRES_PASSWORD` | _(필수 변경)_ | 데이터베이스 비밀번호 |
| `POSTGRES_PORT` | `5432` | PostgreSQL 포트 |

완성된 데이터베이스 URL 형식:

```
postgres://[USER]:[PASSWORD]@[HOST]:[PORT]/[DB]?sslmode=disable
```

예시:

```dotenv
# Docker 컨테이너 간 통신 (호스트명: postgres)
DATABASE_URL=postgres://starnion:MyPassword@postgres:5432/starnion?sslmode=disable

# 외부 PostgreSQL 서버
DATABASE_URL=postgres://starnion:MyPassword@db.example.com:5432/starnion?sslmode=require
```

### MinIO (파일 스토리지) 설정

| 변수명 | 기본값 | 설명 |
|--------|--------|------|
| `MINIO_ACCESS_KEY` | `starnion` | MinIO 액세스 키 (사용자명) |
| `MINIO_SECRET_KEY` | _(필수 변경)_ | MinIO 시크릿 키 (비밀번호) |
| `MINIO_BUCKET` | `starnion-files` | 파일 저장 버킷 이름 |
| `MINIO_PORT` | `9000` | MinIO API 포트 |
| `MINIO_CONSOLE_PORT` | `9001` | MinIO 웹 콘솔 포트 |
| `MINIO_PUBLIC_URL` | `http://localhost:9000` | 파일 접근 공개 URL |

> **MinIO 콘솔:** `http://localhost:9001`에서 MinIO 웹 관리 콘솔에 접근할 수 있습니다.
> `MINIO_ACCESS_KEY`와 `MINIO_SECRET_KEY`로 로그인합니다.

### Gateway (API 서버) 설정

| 변수명 | 기본값 | 설명 |
|--------|--------|------|
| `GATEWAY_PORT` | `8080` | Gateway REST API 포트 |
| `GATEWAY_PUBLIC_URL` | `http://localhost:8080` | Gateway 공개 URL (Google OAuth 콜백에 사용) |
| `GRPC_PORT` | `50051` | Agent gRPC 통신 포트 |

### UI (웹 인터페이스) 설정

| 변수명 | 기본값 | 설명 |
|--------|--------|------|
| `UI_PORT` | `3000` | Next.js 웹 서버 포트 |
| `NEXTAUTH_URL` | `http://localhost:3000` | NextAuth 콜백 기본 URL |
| `AUTH_SECRET` | _(필수 변경)_ | NextAuth 세션 암호화 키 |
| `JWT_SECRET` | _(필수 변경)_ | JWT 토큰 검증 키 (Gateway와 동일해야 함) |

### AI 제공자 API 키

AI 기능을 사용하려면 최소 하나의 AI 제공자 API 키가 필요합니다. API 키는 웹 UI의 설정 페이지에서 사용자별로 입력할 수도 있습니다.

| 변수명 | 설명 | API 키 발급 URL |
|--------|------|-----------------|
| `GEMINI_API_KEY` | Google Gemini API 키 | [aistudio.google.com](https://aistudio.google.com) |
| `OPENAI_API_KEY` | OpenAI GPT API 키 | [platform.openai.com](https://platform.openai.com/api-keys) |
| `ANTHROPIC_API_KEY` | Anthropic Claude API 키 | [console.anthropic.com](https://console.anthropic.com) |

### Google OAuth 설정 (선택사항)

Google 계정으로 로그인 기능을 활성화하려면:

| 변수명 | 설명 |
|--------|------|
| `GOOGLE_CLIENT_ID` | Google OAuth 클라이언트 ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 클라이언트 시크릿 |
| `GOOGLE_REDIRECT_URI` | OAuth 콜백 URL (자동 설정됨) |

### Telegram 봇 설정 (선택사항)

Telegram을 통해 AI에 접근하려면:

| 변수명 | 설명 |
|--------|------|
| `TELEGRAM_BOT_TOKEN` | Telegram 봇 토큰 |

---

## API 키 발급 방법

### Google Gemini API 키

1. [Google AI Studio](https://aistudio.google.com)에 접속합니다
2. Google 계정으로 로그인합니다
3. 우측 상단 **"Get API key"** 클릭
4. **"Create API key"** 클릭
5. 프로젝트 선택 또는 새 프로젝트 생성
6. 생성된 API 키를 복사합니다

```dotenv
GEMINI_API_KEY=AIzaSy...your-key-here
```

> **무료 한도:** Gemini API는 일정 한도 내에서 무료로 사용할 수 있습니다. 개인 사용에는 충분합니다.

### OpenAI API 키

1. [OpenAI Platform](https://platform.openai.com)에 접속합니다
2. 계정 생성 또는 로그인
3. **API Keys** 메뉴로 이동
4. **"+ Create new secret key"** 클릭
5. 키 이름 입력 후 생성
6. 생성된 키를 **반드시 즉시 복사** (다시 볼 수 없음)

```dotenv
OPENAI_API_KEY=sk-proj-...your-key-here
```

> **주의:** OpenAI API는 유료입니다. 사용량에 따라 비용이 청구됩니다.

### Anthropic Claude API 키

1. [Anthropic Console](https://console.anthropic.com)에 접속합니다
2. 계정 생성 또는 로그인
3. **API Keys** 섹션으로 이동
4. **"Create Key"** 클릭
5. 키 이름 입력 후 생성
6. 생성된 키를 복사합니다

```dotenv
ANTHROPIC_API_KEY=sk-ant-...your-key-here
```

### Telegram 봇 토큰

1. Telegram에서 **@BotFather**를 검색합니다
2. `/newbot` 명령을 보냅니다
3. 봇 이름 입력 (예: "My Starnion Bot")
4. 봇 사용자명 입력 — `_bot`으로 끝나야 함 (예: "my_starnion_bot")
5. BotFather가 **토큰**을 발급합니다

```dotenv
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ
```

Telegram 봇 설정 후 Gateway에서 봇을 활성화합니다:

```bash
# 봇 웹훅 설정 (선택사항 — 폴링 방식도 지원)
starnion telegram setup
```

### Google OAuth 클라이언트 (선택사항)

Google 계정으로 로그인 기능을 위해:

1. [Google Cloud Console](https://console.cloud.google.com)에 접속합니다
2. 프로젝트 생성 또는 선택
3. **APIs & Services → Credentials** 이동
4. **"+ CREATE CREDENTIALS" → "OAuth 2.0 Client IDs"** 클릭
5. 애플리케이션 유형: **Web application** 선택
6. **Authorized redirect URIs** 추가:
   ```
   http://localhost:8080/auth/google/callback
   ```
7. 생성 후 **Client ID**와 **Client Secret** 복사

```dotenv
GOOGLE_CLIENT_ID=123456789-abc...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...your-secret
```

---

## 완성된 .env 파일 예시

```dotenv
# ============================================================
# Starnion Docker 환경 설정
# ============================================================

# ---- 필수 시크릿 (반드시 변경!) ----
POSTGRES_PASSWORD=MySecureDBPassword123!
MINIO_SECRET_KEY=MySecureMinIOKey456!
JWT_SECRET=K8mN3pQ7rS1tU5wX9yZ2aB4cD6eF0gHj2k4l6m8n0p2
AUTH_SECRET=P1q3r5s7t9u1v3w5x7y9z1a3b5c7d9e1f3g5h7i9j1

# ---- PostgreSQL ----
POSTGRES_DB=starnion
POSTGRES_USER=starnion
POSTGRES_PORT=5432

# ---- MinIO ----
MINIO_ACCESS_KEY=starnion
MINIO_BUCKET=starnion-files
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001
MINIO_PUBLIC_URL=http://localhost:9000

# ---- Gateway ----
GATEWAY_PORT=8080
GATEWAY_PUBLIC_URL=http://localhost:8080
GRPC_PORT=50051

# ---- UI ----
UI_PORT=3000
NEXTAUTH_URL=http://localhost:3000

# ---- AI 제공자 (최소 하나 필요) ----
GEMINI_API_KEY=AIzaSy...
# OPENAI_API_KEY=sk-proj-...
# ANTHROPIC_API_KEY=sk-ant-...

# ---- 선택사항 ----
# TELEGRAM_BOT_TOKEN=1234567890:ABC...
# GOOGLE_CLIENT_ID=123...apps.googleusercontent.com
# GOOGLE_CLIENT_SECRET=GOCSPX-...
```

---

## 프로덕션 배포를 위한 설정

### 도메인 및 HTTPS 설정

외부에서 접근 가능한 서버에 배포할 경우:

```dotenv
# 실제 도메인으로 변경
GATEWAY_PUBLIC_URL=https://api.yourdomain.com
NEXTAUTH_URL=https://yourdomain.com
MINIO_PUBLIC_URL=https://storage.yourdomain.com
GOOGLE_REDIRECT_URI=https://api.yourdomain.com/auth/google/callback
```

### 강화된 보안 설정

```dotenv
# 더 강력한 시크릿 사용 (64자 이상 권장)
JWT_SECRET=$(openssl rand -base64 64)
AUTH_SECRET=$(openssl rand -base64 64)

# 강력한 비밀번호
POSTGRES_PASSWORD=$(openssl rand -base64 32)
MINIO_SECRET_KEY=$(openssl rand -base64 32)
```

### 외부 PostgreSQL 서버 사용

```dotenv
# 외부 DB 서버 (예: AWS RDS, Supabase, Neon)
DATABASE_URL=postgres://user:password@db.example.com:5432/starnion?sslmode=require
```

---

## 보안 권장사항

### 시크릿 관리

- `.env` 파일을 절대 Git에 커밋하지 마세요
  ```bash
  # .gitignore에 반드시 포함
  echo ".env" >> .gitignore
  ```
- `.env.example`만 Git에 포함하고, 실제 값은 제외합니다
- 프로덕션 환경에서는 시크릿 관리 서비스(AWS Secrets Manager, Vault 등)를 고려하세요

### 네트워크 보안

- 프로덕션 환경에서는 `POSTGRES_PORT`와 `MINIO_PORT`를 외부에 노출하지 마세요
- Nginx 또는 Caddy를 리버스 프록시로 사용하여 HTTPS를 적용하세요
- 방화벽에서 필요한 포트만 허용하세요:
  - 80 (HTTP → HTTPS 리다이렉트)
  - 443 (HTTPS)
  - 그 외 포트는 내부망에서만 접근

### 정기적인 비밀번호 교체

```bash
# 새로운 JWT 시크릿 생성
NEW_SECRET=$(openssl rand -base64 64)
echo "JWT_SECRET=$NEW_SECRET"

# .env 파일 업데이트 후 서비스 재시작
docker compose restart gateway ui
```

---

## 설정 변경 후 서비스 재시작

`.env` 파일을 변경한 후에는 서비스를 재시작해야 합니다:

```bash
# 전체 재시작 (설정 변경 반영)
docker compose down && docker compose up -d

# 특정 서비스만 재시작
docker compose restart gateway
docker compose restart ui
docker compose restart agent
```

---

## 다음 단계

- [빠른 시작](quickstart) — 설정 완료 후 첫 번째 대화
- [설치 가이드](installation) — 설치 관련 트러블슈팅
- [Starnion이란?](introduction) — 기능 및 아키텍처 이해
