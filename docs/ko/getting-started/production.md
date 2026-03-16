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
| 실행 계정 | `root` (개인 서버 권장) |
| Starnion 설치 경로 | `/root/.starnion/` (`starnion setup` 으로 설치 완료 상태) |
| nginx | `sudo dnf install nginx` 로 설치 |
| Node.js / pnpm | `~/.starnion/ui/` 에서 `pnpm build` 완료 상태 |

> **참고**: 멀티 유저 서버에서는 전용 `starnion` 계정을 사용할 수 있습니다.
> 이 경우 아래 경로의 `/root`를 `/home/starnion`으로 바꾸고 서비스 파일의 `User=root`를 `User=starnion`으로 수정하세요.

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
sudo cp ~/.starnion/scripts/starnion-gateway.service \
        ~/.starnion/scripts/starnion-agent.service \
        ~/.starnion/scripts/starnion-ui.service \
        ~/.starnion/scripts/starnion.target \
        /etc/systemd/system/

sudo systemctl daemon-reload
```

> **💡 파일 위치**: 서비스 파일은 GitHub 저장소의 `scripts/` 폴더에서도 확인할 수 있습니다.

---

## 2단계: gateway 환경 변수 파일 생성

`starnion-gateway.service`는 `/etc/starnion/gateway.env`에서 환경 변수를 읽습니다.
`starnion setup` 시 생성된 `.env`를 복사해서 만듭니다.

```bash
sudo mkdir -p /etc/starnion
sudo cp ~/.starnion/docker/.env /etc/starnion/gateway.env
sudo chmod 640 /etc/starnion/gateway.env
```

---

## 3단계: Node.js 실행 경로 확인

`starnion-ui.service`는 `pnpm start`를 사용합니다.
nvm으로 Node.js를 설치한 경우 systemd는 nvm PATH를 인식하지 못하므로 서비스 파일에 직접 지정해야 합니다.

```bash
# 실제 경로 확인
which node
which pnpm
```

**nvm으로 설치한 경우** (예: `/root/.nvm/versions/node/v24.x.x/bin/node`):

```bash
NODE_PATH=$(dirname $(which node))

# ExecStart의 pnpm 경로 수정
sudo sed -i "s|ExecStart=/usr/local/bin/pnpm|ExecStart=$(which pnpm)|" \
    /etc/systemd/system/starnion-ui.service

# PATH 환경변수에 node 경로 추가
sudo sed -i "/^Environment=HOME=/a Environment=PATH=${NODE_PATH}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin" \
    /etc/systemd/system/starnion-ui.service

sudo systemctl daemon-reload
```

---

## 4단계: SELinux 설정 (Rocky Linux)

홈 디렉터리(`/root`, `/home/...`)의 실행 파일은 SELinux의 `admin_home_t` 컨텍스트로 분류되어
systemd에서 실행이 차단됩니다. 아래 명령으로 `bin_t` 컨텍스트를 부여합니다 (초기 1회).

### Gateway 바이너리

```bash
sudo chcon -t bin_t /root/.starnion/bin/starnion-gateway
```

### Agent Python 바이너리

venv의 `python3`는 심링크 체인 끝의 실제 바이너리에 컨텍스트를 적용해야 합니다.
uv로 설치한 경우:

```bash
# 실제 python 바이너리 경로 확인
readlink -f /root/.starnion/agent/.venv/bin/python3

# bin_t 적용 (경로는 위 결과로 대체)
sudo chcon -t bin_t /root/.local/share/uv/python/cpython-3.13-linux-x86_64-gnu/bin/python3.13
```

시스템 Python을 사용하는 경우:

```bash
sudo chcon -R -t bin_t /root/.starnion/agent/.venv/bin/
```

### UI Node.js 바이너리

nvm으로 설치한 경우 node 바이너리에도 적용이 필요합니다:

```bash
sudo chcon -t bin_t $(which node)
```

### 재부팅 후에도 유지 (영구 적용)

`chcon`은 재부팅 시 초기화될 수 있습니다. 영구 적용하려면:

```bash
sudo semanage fcontext -a -t bin_t "/root/.starnion/bin(/.*)?"
sudo semanage fcontext -a -t bin_t "/root/.local/share/uv/python(/.*)?"
sudo restorecon -Rv /root/.starnion/bin/
sudo restorecon -Rv /root/.local/share/uv/python/
```

또는 SELinux boolean으로 일괄 허용:

```bash
sudo setsebool -P allow_user_exec_content 1
```

---

## 5단계: UI 빌드

서비스를 시작하기 전에 Next.js 프로덕션 빌드가 필요합니다.

```bash
cd ~/.starnion/ui && pnpm install && pnpm build
```

빌드가 성공하면 `~/.starnion/ui/.next/` 디렉터리가 생성됩니다.

---

## 6단계: 서비스 시작 및 자동 시작 등록

```bash
# 부팅 시 자동 시작 등록
sudo systemctl enable starnion.target

# 즉시 시작 (세 서비스가 함께 시작됩니다)
sudo systemctl start starnion.target

# 상태 확인
systemctl status starnion-gateway starnion-agent starnion-ui --no-pager
```

### 서비스 상태 예시

```
● starnion-gateway.service - Starnion Gateway
     Active: active (running) since ...
   Main PID: 12345 (starnion-gatewa)

● starnion-agent.service - Starnion Agent (LangGraph gRPC server)
     Active: active (running) ...

● starnion-ui.service - Starnion UI (Next.js)
     Active: active (running) ...
```

---

## 7단계: nginx 리버스 프록시 설정

### nginx 설치

```bash
sudo dnf install -y nginx
sudo systemctl enable --now nginx
sudo firewall-cmd --permanent --add-service=http --add-service=https
sudo firewall-cmd --reload
```

### nginx 설정 파일 배포

```bash
sudo cp ~/.starnion/scripts/nginx-lets-ai-kr.conf \
        /etc/nginx/conf.d/your-domain.conf

sudo sed -i 's/lets\.ai\.kr/your-domain.com/g' \
        /etc/nginx/conf.d/your-domain.conf

sudo nginx -t
sudo systemctl reload nginx
```

> **💡 설정 파일 위치**: `scripts/nginx-lets-ai-kr.conf` 파일을 참고하거나 직접 편집하여 사용합니다.

### nginx 설정 핵심 구조

```nginx
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
        add_header Strict-Transport-Security "max-age=63072000" always;
    }

    # WebSocket
    location = /api/ws {
        proxy_pass         http://starnion_ui;
        proxy_read_timeout 3600s;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection $connection_upgrade;
    }

    location / {
        proxy_pass http://starnion_ui;
    }
}
```

---

## 8단계: SSL 인증서 발급 (Let's Encrypt)

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

---

## 운영 명령어 모음

### 서비스 관리

```bash
sudo systemctl start   starnion.target
sudo systemctl stop    starnion.target
sudo systemctl restart starnion.target

sudo systemctl restart starnion-gateway
sudo systemctl restart starnion-agent
sudo systemctl restart starnion-ui
```

### 로그 확인

```bash
# 전체 스택 실시간 로그
journalctl -u starnion-gateway -u starnion-agent -u starnion-ui -f --no-pager

# 최근 100줄
journalctl -u starnion-gateway -n 100 --no-pager

# 오늘 날짜 로그만
journalctl -u starnion-agent --since today --no-pager

# nginx 접근 로그
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### nginx 관리

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl restart nginx
```

---

## 트러블슈팅

### 서비스가 시작되지 않는 경우

```bash
journalctl -u starnion-gateway -n 50 --no-pager
journalctl -u starnion-agent -n 50 --no-pager
journalctl -u starnion-ui -n 50 --no-pager
```

**자주 발생하는 원인:**

| 증상 | 원인 | 해결 방법 |
|------|------|-----------|
| `status=203/EXEC` | SELinux 차단 (`admin_home_t`) | `chcon -t bin_t <바이너리 경로>` 실행 |
| `Failed to load environment files` | `/etc/starnion/gateway.env` 없음 | 2단계 참고하여 파일 생성 |
| `status=127` / `pnpm: not found` | nvm PATH 미설정 | 서비스 파일에 `Environment=PATH=...` 추가 |
| `Cannot find module .../server.js` | standalone 빌드 없음 | `ExecStart`를 `pnpm start`로 변경 |
| `exec format error` | 바이너리 아키텍처 불일치 | 올바른 플랫폼 바이너리 재다운로드 |
| `Address already in use` | 포트 충돌 | `lsof -i :포트번호` 로 확인 |

### SELinux 차단 로그 확인

```bash
sudo ausearch -m avc -ts recent --no-pager
# 또는
sudo ausearch -m avc -ts recent 2>/dev/null | grep starnion
```

### uv Python 바이너리 경로 찾기

```bash
# venv python이 가리키는 실제 바이너리 경로 추적
readlink -f ~/.starnion/agent/.venv/bin/python3
```

### UI가 502 Bad Gateway를 반환하는 경우

```bash
systemctl status starnion-ui --no-pager
ls ~/.starnion/ui/.next/
ss -tlnp | grep 3893
```

### 채팅 응답이 중간에 끊기는 경우

```bash
sudo grep -A5 "location = /api/chat" /etc/nginx/conf.d/your-domain.conf
# proxy_buffering off; 와 proxy_read_timeout 300s; 가 있어야 합니다
```

---

## 다음 단계

- [환경 설정](configuration) — AI API 키 및 환경 변수 상세 설정
- [텔레그램 봇 연결](../channels/telegram) — 텔레그램 채널 추가
