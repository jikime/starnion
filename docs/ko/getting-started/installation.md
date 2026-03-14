---
layout: default
title: 설치 가이드
nav_order: 3
parent: 시작하기
grand_parent: 🇰🇷 한국어
---

# 설치 가이드
{: .no_toc }

<details open markdown="block">
  <summary>목차</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

---

## 시스템 요구사항

### 운영체제

| OS | 버전 | 비고 |
|----|------|------|
| macOS | 13 (Ventura) 이상 | Apple Silicon (M1/M2/M3) 및 Intel 모두 지원 |
| Linux | Ubuntu 22.04 / Debian 11 이상 | amd64, arm64 아키텍처 지원 |
| Windows | WSL2 경유 | Windows 11 권장 |

### 하드웨어 (권장)

| 사양 | 최소 | 권장 |
|------|------|------|
| CPU | 2코어 | 4코어 이상 |
| RAM | 4GB | 8GB 이상 |
| 디스크 | 20GB | 50GB 이상 (데이터 증가 고려) |
| 네트워크 | 인터넷 연결 | AI API 호출을 위해 필요 |

### 소프트웨어 요구사항

#### Docker로 실행 (권장)

| 소프트웨어 | 최소 버전 | 설치 링크 |
|-----------|-----------|-----------|
| Docker Engine | 24+ | [docs.docker.com](https://docs.docker.com/engine/install/) |
| Docker Compose | v2 | Docker Engine에 포함 |

#### 네이티브로 실행 (개발용)

| 소프트웨어 | 최소 버전 | 설치 링크 |
|-----------|-----------|-----------|
| Go | 1.22+ | [go.dev](https://go.dev/dl/) |
| Python | 3.13+ | [python.org](https://www.python.org/downloads/) |
| uv | 최신 | [docs.astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/) |
| Node.js | 18.12+ (권장: 22 LTS) | [nodejs.org](https://nodejs.org/) |
| pnpm | 최신 | [pnpm.io](https://pnpm.io/installation) |
| PostgreSQL | 16+ (pgvector 포함) | [pgvector/pgvector](https://github.com/pgvector/pgvector) |
| MinIO | 최신 | [min.io](https://min.io/download) |

#### Node.js 설치 방법

`starnion dev` 또는 `starnion ui` 명령을 사용할 때 Node.js가 필요합니다. (pnpm은 없을 경우 자동으로 설치됩니다.)

**Ubuntu / Debian**

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs
```

**RHEL / Rocky Linux / CentOS**

```bash
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs
```

**macOS (Homebrew)**

```bash
brew install node@22
```

**macOS / Linux (nvm — 버전 관리 권장)**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
# 터미널 재시작 후:
nvm install 22
nvm use 22
```

설치 확인:

```bash
node --version   # v22.x.x
```

---

## 설치 방법 1: CLI 설치 (권장)

Starnion CLI를 먼저 설치하면 초기 설정, 서비스 관리, 업데이트 등을 편리하게 할 수 있습니다.

### 빠른 설치 (스크립트)

```bash
curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

설치 스크립트가 자동으로 다음을 수행합니다:
1. 운영체제 및 아키텍처 감지
2. 최신 바이너리를 [GitHub Releases](https://github.com/jikime/starnion/releases)에서 다운로드
3. SHA-256 체크섬 검증
4. `/usr/local/bin` 또는 `~/.local/bin`에 설치

### 특정 버전 설치

```bash
STARNION_VERSION=1.2.0 curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

### 사용자 디렉토리에 설치

```bash
STARNION_DIR=~/.local/bin curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

### CI/자동화 환경 (비대화형)

```bash
NO_PROMPT=1 curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

### 설치 확인

```bash
starnion version
# ★ StarNion v1.x.x
```

---

## 설치 방법 2: 수동 바이너리 설치

스크립트 없이 직접 바이너리를 다운로드하려면:

### 플랫폼별 파일 다운로드

[GitHub Releases 페이지](https://github.com/jikime/starnion/releases/latest)에서 플랫폼에 맞는 파일을 다운로드합니다:

| 플랫폼 | 파일명 |
|--------|--------|
| macOS Apple Silicon (M1/M2/M3) | `starnion_darwin_arm64.tar.gz` |
| macOS Intel | `starnion_darwin_amd64.tar.gz` |
| Linux x86-64 | `starnion_linux_amd64.tar.gz` |
| Linux ARM64 | `starnion_linux_arm64.tar.gz` |

### 체크섬 검증

```bash
# 체크섬 파일 다운로드
curl -fsSL https://github.com/jikime/starnion/releases/latest/download/checksums.txt -o checksums.txt

# 검증 (macOS)
shasum -a 256 --check --ignore-missing checksums.txt

# 검증 (Linux)
sha256sum --check --ignore-missing checksums.txt
```

### 압축 해제 및 설치

```bash
# macOS Apple Silicon 예시
tar -xzf starnion_darwin_arm64.tar.gz
chmod +x starnion
sudo mv starnion /usr/local/bin/

# 설치 확인
starnion version
```

---

## 설치 방법 3: 소스에서 빌드

Go 1.22+와 `make`가 필요합니다.

```bash
git clone https://github.com/jikime/starnion.git
cd starnion/gateway
make starnion
# 바이너리가 ../starnion에 생성됩니다
sudo mv ../starnion /usr/local/bin/
```

---

## CLI 설치 후: 서비스 실행

CLI를 설치했다면 다음 단계로 서비스를 실행합니다.

### Docker로 실행 (권장)

v1.0.2부터 `git clone` 없이 CLI만으로 Docker 실행이 가능합니다.

```bash
# 1. 초기 설정 마법사 (DB, MinIO, API 키 등)
starnion setup

# 2. Docker 서비스 시작 (이미지 빌드 포함)
starnion docker up --build

# 3. 이후 재시작 시
starnion docker up -d
```

#### 프로덕션 모드

```bash
# 리소스 제한, 로그 로테이션, 포트 제한이 적용됩니다
starnion docker up --prod -d
```

#### 주요 Docker 명령어

```bash
starnion docker up -d          # 백그라운드 시작
starnion docker down           # 서비스 중지
starnion docker logs -f        # 실시간 로그
starnion docker ps             # 컨테이너 상태 확인
starnion docker restart        # 전체 재시작
starnion docker migrate        # DB 마이그레이션 단독 실행
starnion docker backup         # DB + 파일 백업
starnion docker restore --from <경로>  # 백업에서 복원
```

### 네이티브로 실행 (개발자용)

PostgreSQL과 MinIO가 로컬에서 이미 실행 중인 경우:

```bash
# 1. 인프라 서비스만 Docker로 시작
starnion docker up -d postgres minio

# 2. 설정 마법사
starnion setup

# 3. 전체 서비스 네이티브 실행 (게이트웨이 + 에이전트 + UI)
starnion dev
```

또는 개별 서비스 실행:

```bash
starnion gateway   # Go API 서버      :8080
starnion agent     # Python AI 엔진   :50051
starnion ui        # Next.js 인터페이스 :3000
```

---

## 설치 검증

### 기본 상태 확인

```bash
# CLI 버전 확인
starnion version

# 시스템 상태 진단
starnion doctor
```

`starnion doctor` 예상 출력:

```
✓ PostgreSQL 연결 확인
✓ MinIO 연결 확인
✓ Gateway 응답 확인
✓ Agent gRPC 연결 확인
```

### 웹 UI 접근 확인

브라우저에서 다음 주소로 접속:

```
http://localhost:3000
```

로그인 페이지가 표시되면 설치가 완료된 것입니다.

### 서비스별 헬스체크

```bash
# Gateway API 헬스체크
curl http://localhost:8080/health
# {"status":"ok"}

# MinIO 헬스체크
curl http://localhost:9000/minio/health/live
# 200 OK

# PostgreSQL 연결 확인 (docker 환경)
docker exec starnion-postgres pg_isready -U starnion
# /var/run/postgresql:5432 - accepting connections
```

---

## 업데이트

```bash
# 최신 버전으로 업데이트 (CLI + Docker 이미지 + DB 마이그레이션 자동)
starnion update

# 버전 확인만
starnion update --check

# CLI만 업데이트 (Docker 이미지 갱신 건너뜀)
starnion update --skip-docker

# 특정 버전으로 업데이트
STARNION_VERSION=1.2.0 curl -fsSL https://jikime.github.io/starnion/install.sh | bash
```

---

## 제거 방법

### CLI 제거

```bash
rm $(which starnion)
rm -rf ~/.config/starnion   # 설정 파일 제거 (선택사항)
```

### Docker 서비스 및 데이터 제거

```bash
cd starnion/docker

# 서비스만 중지 (데이터 보존)
docker compose down

# 서비스 + 볼륨(데이터) 모두 제거
docker compose down -v

# 이미지까지 모두 제거
docker compose down -v --rmi all
```

> **주의:** `docker compose down -v` 명령은 PostgreSQL 데이터베이스와 MinIO 파일을 포함한 **모든 데이터를 영구 삭제**합니다. 중요한 데이터는 미리 백업하세요.

---

## 트러블슈팅

### Docker 권한 오류

```
permission denied while trying to connect to the Docker daemon socket
```

해결 방법:

```bash
# 현재 사용자를 docker 그룹에 추가
sudo usermod -aG docker $USER

# 로그아웃 후 다시 로그인, 또는:
newgrp docker
```

### 포트 충돌

```
Error: bind: address already in use
```

해결 방법:

```bash
# 포트 사용 프로세스 확인
lsof -i :5432   # PostgreSQL
lsof -i :9000   # MinIO
lsof -i :8080   # Gateway
lsof -i :3000   # UI

# .env에서 포트 변경
POSTGRES_PORT=5433
MINIO_PORT=9001
GATEWAY_PORT=8081
UI_PORT=3001
```

### 이미지 빌드 실패

```bash
# Docker 캐시 초기화 후 재빌드
docker compose build --no-cache
docker compose up -d
```

### Agent가 시작되지 않는 경우

```bash
# Agent 로그 확인
docker compose logs agent

# Python 의존성 문제인 경우 이미지 재빌드
docker compose build --no-cache agent
docker compose up -d agent
```

### PostgreSQL 연결 실패

```bash
# PostgreSQL 컨테이너 상태 확인
docker compose ps postgres
docker compose logs postgres

# PostgreSQL이 healthy 상태가 될 때까지 대기 후 재시도
docker compose restart gateway agent
```

### "pgvector extension not found" 오류

```bash
# pgvector 이미지를 사용하고 있는지 확인
# docker-compose.yml에서:
# image: pgvector/pgvector:pg16  ← 이것이어야 합니다
# image: postgres:16             ← 이것은 pgvector 없음

# 올바른 이미지로 재시작
docker compose down -v
docker compose up -d
```

### macOS에서 Apple Silicon 관련 문제

```bash
# 플랫폼 명시적 지정
docker compose --platform linux/arm64 up -d
```

### MinIO 접근 불가

MinIO 콘솔(`http://localhost:9001`)에 접근할 수 없는 경우:

```bash
# MinIO 컨테이너 상태 확인
docker compose logs minio

# .env의 MINIO_CONSOLE_PORT 확인
echo $MINIO_CONSOLE_PORT
```

---

## 다음 단계

설치가 완료되었다면:

- [환경 설정](configuration) — AI API 키 및 환경 변수 설정
- [빠른 시작](quickstart) — 첫 번째 대화 시작하기
