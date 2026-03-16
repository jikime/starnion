---
layout: default
title: 프로덕션 배포 (nginx + systemd)
nav_order: 5
parent: 시작하기
grand_parent: 🇰🇷 한국어
---

# 프로덕션 배포 (nginx + systemd)
{: .no_toc }

Rocky Linux / RHEL 계열 서버에서 Starnion을 **systemd 서비스**로 등록하고,
**nginx 리버스 프록시**를 통해 도메인을 연결하는 방법을 안내합니다.

<details open markdown="block">
  <summary>목차</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

---

## 사전 요구사항

| 항목 | 내용 |
|------|------|
| OS | Rocky Linux 8/9 (또는 RHEL 8/9, AlmaLinux 8/9) |
| 실행 계정 | `starnion` (전용 시스템 계정 권장) |
| Starnion 설치 경로 | `~/.starnion/` (`starnion setup` 으로 설치 완료 상태) |
| nginx | `sudo dnf install nginx` 로 설치 |
| Node.js / pnpm | `~/.starnion/ui/` 에서 `pnpm build` 완료 상태 |

### starnion 시스템 계정 생성

```bash
# 홈 디렉터리 없는 시스템 계정으로 생성해도 되지만,
# starnion setup은 홈 디렉터리를 사용하므로 일반 계정으로 생성합니다.
sudo useradd -m -s /bin/bash starnion
sudo passwd starnion   # 비밀번호 설정 (또는 sudo -u starnion 으로 사용)
```

---

## 1단계: systemd 서비스 파일 설치

Starnion은 세 개의 독립적인 서비스와 이를 묶는 target으로 구성됩니다.

| 파일 | 역할 |
|------|------|
| `starnion-gateway.service` | Go API 서버 (:8080) |
| `starnion-agent.service` | Python AI 엔진 (:50051 gRPC) |
| `starnion-ui.service` | Next.js 웹 UI (:3893) |
| `starnion.target` | 세 서비스를 묶는 그룹 (= `starnion dev`) |

### 서비스 파일 복사

```bash
# Starnion 소스 디렉터리에 scripts/ 폴더에서 복사
sudo cp ~/.starnion/scripts/starnion-gateway.service \
        ~/.starnion/scripts/starnion-agent.service \
        ~/.starnion/scripts/starnion-ui.service \
        ~/.starnion/scripts/starnion.target \
        /etc/systemd/system/

# systemd 데몬 재로드
sudo systemctl daemon-reload
```

> **💡 파일 위치**: 서비스 파일은 GitHub 저장소의 `scripts/` 폴더에서도 확인할 수 있습니다.

---

## 2단계: Node.js 실행 경로 확인

`starnion-ui.service`는 기본적으로 `/usr/bin/pnpm`을 사용합니다.
nvm/fnm 등으로 설치한 경우 경로가 다를 수 있으므로 확인이 필요합니다.

```bash
# starnion 계정으로 실제 경로 확인
sudo -u starnion which node
sudo -u starnion which pnpm
```

경로가 `/usr/bin/pnpm`이 아닌 경우 서비스 파일을 수정합니다:

```bash
sudo nano /etc/systemd/system/starnion-ui.service
```

```ini
# 예) fnm으로 설치한 경우
ExecStart=/home/starnion/.local/share/fnm/node-versions/v22.x.x/installation/bin/pnpm start
```

수정 후 반드시 재로드:

```bash
sudo systemctl daemon-reload
```

---

## 3단계: UI 빌드

서비스를 시작하기 전에 Next.js 프로덕션 빌드가 필요합니다.

```bash
sudo -u starnion bash -c "cd ~/.starnion/ui && pnpm install && pnpm build"
```

빌드가 성공하면 `~/.starnion/ui/.next/` 디렉터리가 생성됩니다.

---

## 4단계: SELinux 설정 (Rocky Linux)

홈 디렉터리의 실행 파일이 SELinux에 의해 차단될 수 있습니다.
아래 명령으로 실행 권한을 부여합니다 (초기 1회).

```bash
# 게이트웨이 바이너리
sudo chcon -R -t bin_t /home/starnion/.starnion/bin/

# Python 가상환경 bin
sudo chcon -R -t bin_t /home/starnion/.starnion/agent/.venv/bin/
```

또는 SELinux boolean로 허용:

```bash
sudo setsebool -P allow_user_exec_content 1
```

---

## 5단계: 서비스 시작 및 자동 시작 등록

```bash
# 부팅 시 자동 시작 등록
sudo systemctl enable starnion.target

# 즉시 시작 (세 서비스가 함께 시작됩니다)
sudo systemctl start starnion.target

# 상태 확인
systemctl status starnion.target
systemctl status starnion-gateway starnion-agent starnion-ui
```

### 서비스 상태 예시

```
● starnion-gateway.service - Starnion Gateway (Go API server)
     Loaded: loaded (/etc/systemd/system/starnion-gateway.service; enabled)
     Active: active (running) since ...
 Main PID: 12345 (starnion-gatewa)

● starnion-agent.service - Starnion Agent (LangGraph gRPC server)
     Active: active (running) ...

● starnion-ui.service - Starnion UI (Next.js)
     Active: active (running) ...
```

---

## 6단계: nginx 리버스 프록시 설정

### nginx 설치

```bash
sudo dnf install -y nginx
sudo systemctl enable --now nginx
sudo firewall-cmd --permanent --add-service=http --add-service=https
sudo firewall-cmd --reload
```

### nginx 설정 파일 배포

```bash
# 도메인 설정 파일 복사
sudo cp ~/.starnion/scripts/nginx-lets-ai-kr.conf \
        /etc/nginx/conf.d/your-domain.conf

# 도메인명 교체 (your-domain.com → 실제 도메인으로)
sudo sed -i 's/lets\.ai\.kr/your-domain.com/g' \
        /etc/nginx/conf.d/your-domain.conf

# 설정 검증
sudo nginx -t

# nginx 재로드
sudo systemctl reload nginx
```

> **💡 설정 파일 위치**: `scripts/nginx-lets-ai-kr.conf` 파일을 참고하거나 직접 편집하여 사용합니다.

### nginx 설정 핵심 구조

```nginx
# WebSocket Connection 헤더 처리
map $http_upgrade $connection_upgrade {
    default  upgrade;
    ''       "";
}

upstream starnion_ui {
    server 127.0.0.1:3893;
    keepalive 64;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSE (실시간 채팅 스트리밍) — 버퍼링/gzip 반드시 끄기
    location = /api/chat {
        proxy_pass         http://starnion_ui;
        proxy_buffering    off;
        proxy_read_timeout 300s;
        gzip               off;
        # 보안 헤더 (location 블록 안에서 반드시 재선언)
        add_header Strict-Transport-Security "max-age=63072000" always;
    }

    # WebSocket
    location = /api/ws {
        proxy_pass         http://starnion_ui;
        proxy_read_timeout 3600s;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection $connection_upgrade;
    }

    # 일반 요청
    location / {
        proxy_pass http://starnion_ui;
    }
}
```

---

## 7단계: SSL 인증서 발급 (Let's Encrypt)

```bash
# certbot 설치
sudo dnf install -y certbot python3-certbot-nginx

# 인증서 발급 (nginx 플러그인 사용)
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# 자동 갱신 확인
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

인증서 발급 후 nginx 설정에 SSL 블록이 자동으로 추가됩니다.

---

## 운영 명령어 모음

### 서비스 관리

```bash
# 전체 스택 시작 / 중지 / 재시작
sudo systemctl start   starnion.target
sudo systemctl stop    starnion.target
sudo systemctl restart starnion.target

# 개별 서비스 재시작
sudo systemctl restart starnion-gateway
sudo systemctl restart starnion-agent
sudo systemctl restart starnion-ui
```

### 로그 확인

```bash
# 전체 스택 실시간 로그
journalctl -u starnion-gateway -u starnion-agent -u starnion-ui -f

# 최근 100줄
journalctl -u starnion-gateway -n 100

# 오늘 날짜 로그만
journalctl -u starnion-agent --since today

# nginx 접근 로그
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### nginx 관리

```bash
sudo nginx -t              # 설정 문법 검사
sudo systemctl reload nginx  # 무중단 설정 적용
sudo systemctl restart nginx  # 완전 재시작
```

---

## 트러블슈팅

### 서비스가 시작되지 않는 경우

```bash
# 상세 오류 확인
journalctl -u starnion-gateway -n 50
journalctl -u starnion-agent -n 50
journalctl -u starnion-ui -n 50
```

**자주 발생하는 원인:**

| 증상 | 원인 | 해결 방법 |
|------|------|-----------|
| `exec format error` | 바이너리 아키텍처 불일치 | 올바른 플랫폼 바이너리 재다운로드 |
| `Permission denied` | SELinux 차단 | `chcon -t bin_t` 실행 |
| `No such file or directory` | 설치 경로 오류 | `~/.starnion/` 내 파일 확인 |
| `pnpm: not found` | pnpm 경로 문제 | 서비스 파일 ExecStart 경로 수정 |
| `Address already in use` | 포트 충돌 | `lsof -i :포트번호` 로 확인 |

### UI가 502 Bad Gateway를 반환하는 경우

```bash
# UI 서비스 상태 확인
systemctl status starnion-ui

# UI 빌드가 완료되었는지 확인
ls ~/.starnion/ui/.next/

# 포트 리스닝 확인
ss -tlnp | grep 3893
```

### 채팅 응답이 중간에 끊기는 경우

nginx 설정에서 SSE 경로의 버퍼링이 꺼져 있는지 확인합니다:

```bash
sudo grep -A5 "location = /api/chat" /etc/nginx/conf.d/your-domain.conf
# proxy_buffering off; 와 proxy_read_timeout 300s; 가 있어야 합니다
```

### SELinux 차단 로그 확인

```bash
# SELinux 거부 로그 확인
sudo ausearch -m avc -ts recent | grep starnion

# 임시로 SELinux 허용 모드로 전환 후 테스트
sudo setenforce 0
# 테스트 후 다시 enforcing 모드로
sudo setenforce 1
```

---

## 다음 단계

- [환경 설정](configuration) — AI API 키 및 환경 변수 상세 설정
- [텔레그램 봇 연결](../channels/telegram) — 텔레그램 채널 추가
