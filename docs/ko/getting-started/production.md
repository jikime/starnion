---
layout: default
title: 프로덕션 배포 (nginx + systemd)
nav_order: 5
parent: 시작하기
grand_parent: 🇰🇷 한국어
---

# 프로덕션 배포 (nginx + systemd)
{: .no_toc }

Rocky Linux / RHEL에서 StarNion을 **systemd 서비스**로 실행하고
**nginx 리버스 프록시**로 커스텀 도메인 + SSL을 설정하는 가이드입니다.

<details open markdown="block">
  <summary>목차</summary>
  {: .text-delta }
- TOC
{:toc}
</details>

---

## 사전 요구사항

| 항목 | 상세 |
|------|------|
| OS | Rocky Linux 8/9 (또는 RHEL 8/9, AlmaLinux 8/9) |
| 설치 경로 | `~/.starnion/` (`starnion setup`으로 설정 완료) |
| nginx | `sudo dnf install nginx` |
| Node.js | 20+ (nvm 권장) |
| uv | Python 패키지 관리자 ([설치](https://docs.astral.sh/uv/getting-started/installation/)) |

---

## 1단계: systemd 서비스 설치

StarNion은 **단일 서비스**로 모든 컴포넌트(gateway, agent, web)를 `starnion start`로 관리합니다.

```bash
sudo cp ~/.starnion/scripts/starnion.service /etc/systemd/system/
sudo systemctl daemon-reload
```

서비스 파일은 `bash -lc`로 셸 프로필(nvm, PATH 등)을 로드합니다:

```ini
[Service]
Type=simple
Environment=HOME=/root
ExecStart=/bin/bash -lc "export HOME=/root && starnion start"
```

> **root가 아닌 사용자**: `/root`를 홈 디렉토리로 변경하세요 (예: `/home/starnion`).
> `starnion update` 시 HOME 경로가 자동으로 교체됩니다.

---

## 2단계: SELinux 설정 (Rocky Linux)

홈 디렉토리의 실행 파일은 `admin_home_t` SELinux 컨텍스트를 가지고 있어 systemd에서 실행이 차단됩니다.

### bin_t 컨텍스트 적용

```bash
# Gateway 바이너리
sudo chcon -t bin_t ~/.starnion/bin/starnion-gateway

# Node.js 바이너리 (nvm)
sudo chcon -t bin_t $(which node)

# Python venv 바이너리 (uv)
sudo chcon -t bin_t $(readlink -f ~/.starnion/venv/bin/python3)
```

### 재부팅 후에도 유지

```bash
sudo semanage fcontext -a -t bin_t "$HOME/.starnion/bin(/.*)?"
sudo restorecon -Rv ~/.starnion/bin/
```

또는 홈 디렉토리 실행 파일 전체 허용:

```bash
sudo setsebool -P allow_user_exec_content 1
```

---

## 3단계: 활성화 및 시작

```bash
# 부팅 시 자동 시작 + 즉시 시작
sudo systemctl enable --now starnion

# 확인
sudo systemctl status starnion
```

### 예상 출력

```
● starnion.service - StarNion - Personal AI Assistant
     Active: active (running) since ...
   Main PID: 12345 (bash)
```

하나의 서비스로 gateway(:8080), agent(:50051), web(:3893) 모두 관리됩니다.

---

## 4단계: nginx 리버스 프록시 설정

### nginx 설치

```bash
sudo dnf install -y nginx
sudo systemctl enable --now nginx
sudo firewall-cmd --permanent --add-service=http --add-service=https
sudo firewall-cmd --reload
```

### nginx 설정 배포

```bash
sudo cp ~/.starnion/scripts/nginx-starnion.conf \
        /etc/nginx/conf.d/your-domain.com.conf

sudo sed -i 's/lets\.ai\.kr/your-domain.com/g' \
        /etc/nginx/conf.d/your-domain.com.conf

sudo nginx -t
sudo systemctl reload nginx
```

### 주요 nginx 설정

```nginx
upstream starnion_web {
    server 127.0.0.1:3893;
    keepalive 64;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSE (스트리밍 채팅) — 버퍼링, gzip 비활성화
    location = /api/chat {
        proxy_pass         http://starnion_web;
        proxy_buffering    off;
        proxy_read_timeout 300s;
        gzip               off;
    }

    # WebSocket
    location = /api/ws {
        proxy_pass         http://starnion_web;
        proxy_buffering    off;
        proxy_read_timeout 3600s;
    }

    # 정적 파일 (장기 캐시)
    location /_next/static/ {
        proxy_pass http://starnion_web;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }

    location / {
        proxy_pass http://starnion_web;
    }
}
```

---

## 5단계: Let's Encrypt SSL 인증서

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
sudo certbot renew --dry-run
```

---

## 운영 참조

### 서비스 관리

```bash
sudo systemctl start   starnion
sudo systemctl stop    starnion
sudo systemctl restart starnion
sudo systemctl status  starnion
```

### 로그 확인

```bash
# 실시간 로그
journalctl -u starnion -f

# 최근 100줄
journalctl -u starnion -n 100 --no-pager

# 오늘 로그만
journalctl -u starnion --since today --no-pager

# nginx 로그
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### 업데이트

```bash
starnion update
sudo systemctl restart starnion
```

---

## 문제 해결

### 서비스 시작 실패

```bash
journalctl -u starnion -n 50 --no-pager
```

| 증상 | 원인 | 해결 |
|------|------|------|
| `status=203/EXEC` | SELinux 차단 | `chcon -t bin_t <바이너리>` — 2단계 참조 |
| `node: not found` | PATH에 nvm 없음 | `.bashrc`에 nvm 설정 확인 |
| `.starnion/bin/... 없음` | HOME 미설정 | 서비스 파일의 `Environment=HOME=...` 확인 |
| `Address already in use` | 포트 충돌 | `lsof -i :<포트>`로 프로세스 확인 |

### SELinux 거부 확인

```bash
sudo ausearch -m avc -ts recent --no-pager
```

### nginx 502 Bad Gateway

```bash
sudo systemctl status starnion
ss -tlnp | grep 3893
```

### 채팅 응답 중간에 끊김

nginx 설정에 아래가 있는지 확인:
```nginx
proxy_buffering off;
proxy_read_timeout 300s;
```

---

## 다음 단계

- [환경 설정](configuration) — 환경 변수 및 설정
- [텔레그램 채널](../channels/telegram) — Telegram 봇 연결
