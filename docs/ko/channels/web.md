---
title: 웹 채팅
nav_order: 2
parent: 채널
---

# 웹 채팅

Starnion 웹 UI는 WebSocket 기반의 실시간 채팅 인터페이스를 제공합니다. 별도 앱 설치 없이 브라우저에서 바로 AI 에이전트와 대화할 수 있으며, 이미지·오디오·문서 파일 전송과 스트리밍 응답을 지원합니다.

---

## 개요

웹 채팅 채널을 사용하면:

- **실시간 스트리밍**: AI의 응답이 완성되는 것을 기다리지 않고 생성 즉시 표시
- **파일 전송**: 이미지, 음성 파일, 문서를 채팅창에 첨부하여 전송
- **도구 호출 가시화**: AI가 외부 도구를 사용할 때 어떤 도구를 실행했는지 실시간 확인
- **대화 관리**: 여러 대화(스레드)를 생성하고 이전 대화 기록 조회
- **멀티 채널**: 텔레그램과 동일한 AI 에이전트에 연결되어 대화 기록 공유

---

## 주요 기능

### 실시간 스트리밍 응답

WebSocket 연결을 통해 AI의 응답이 토큰 단위로 실시간 전송됩니다. 긴 답변도 처음부터 생성 과정을 볼 수 있어 기다리는 시간이 체감상 짧습니다.

### 도구 실행 표시

AI가 날씨 조회, 웹 검색, Google Calendar 등의 도구를 사용할 때, 채팅창에 어떤 도구를 실행했는지 표시됩니다.

```
[도구 실행: weather] 서울 현재 날씨 조회 중...
[도구 결과: weather] 서울 맑음 22°C
```

### 파일 첨부 및 분석

이미지, 오디오, PDF, 문서 파일을 채팅창에 첨부하여 전송할 수 있습니다. AI가 파일 내용을 분석하여 응답합니다.

| 파일 유형 | 지원 형식 | 기능 |
|----------|----------|------|
| 이미지 | JPG, PNG, GIF, WebP | 이미지 분석, 설명, 텍스트 추출 |
| 오디오 | MP3, WAV, OGG | 음성 텍스트 변환, 내용 분석 |
| 문서 | PDF, DOCX, TXT | 내용 요약, 질의응답 |

### 생성 파일 갤러리

AI가 생성한 이미지나 오디오 파일은 갤러리에 자동으로 저장됩니다. Settings → Gallery에서 언제든지 다시 확인할 수 있습니다.

---

## 설정 방법

웹 채팅은 별도의 설정 없이 Starnion 설치 즉시 사용할 수 있습니다. 다음 사항만 확인하세요.

### 서버 접속

1. 브라우저에서 Starnion 서버 주소에 접속합니다.
   ```
   http://localhost:3000
   ```
   (프로덕션 환경이라면 실제 도메인 사용)
2. 계정을 생성하거나 로그인합니다.
3. 웹 UI 좌측의 채팅 영역에서 바로 대화를 시작할 수 있습니다.

### WebSocket 연결 확인

웹 UI는 페이지 로드 시 자동으로 WebSocket 서버에 연결합니다. 연결 상태는 브라우저 개발자 도구(F12) → 네트워크 탭 → WS 필터에서 확인할 수 있습니다.

```
연결 URL: ws://yourdomain.com/ws
인증 방식: Bearer 토큰 (Authorization 헤더 또는 ?token 쿼리 파라미터)
```

### 역방향 프록시 설정 (WebSocket)

Nginx 또는 Caddy 같은 역방향 프록시를 사용하는 경우 WebSocket 업그레이드 헤더를 설정해야 합니다.

**Nginx 예시:**

```nginx
location /ws {
    proxy_pass http://localhost:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 180s;
}
```

**Caddy 예시:**

```
reverse_proxy /ws localhost:8080 {
    transport http {
        versions 1.1
    }
}
```

---

## 사용 방법

### 새 대화 시작

1. 좌측 사이드바에서 **+ 새 대화** 버튼 클릭.
2. 채팅 입력창에 메시지를 입력하고 Enter 또는 전송 버튼 클릭.
3. AI의 응답이 실시간으로 스트리밍됩니다.

### 파일 전송

1. 채팅 입력창 옆 **첨부** 아이콘 클릭 또는 파일을 채팅창으로 드래그.
2. 파일이 업로드되면 메시지와 함께 전송.
3. AI가 파일 내용을 분석하여 응답합니다.

### AI 모델 선택

채팅창 상단에서 대화에 사용할 AI 모델을 선택할 수 있습니다. 이전에 Settings에서 API 키를 등록한 모델만 표시됩니다.

### 이전 대화 조회

좌측 사이드바에서 이전 대화 목록을 확인하고 클릭하면 해당 대화로 이동합니다.

---

## 예시 대화

### 일반 대화

```
나: 파이썬에서 비동기 함수를 어떻게 만들어?
봇: Python에서 비동기 함수는 `async def` 키워드를 사용합니다.

    ```python
    import asyncio

    async def fetch_data(url: str) -> str:
        await asyncio.sleep(1)  # 비동기 작업 시뮬레이션
        return f"Data from {url}"

    async def main():
        result = await fetch_data("https://example.com")
        print(result)

    asyncio.run(main())
    ```

    `await`는 코루틴이 완료될 때까지 기다리며, 그 동안 이벤트 루프는 다른 작업을 처리할 수 있습니다.
```

### 이미지 전송 및 분석

```
(영수증 이미지 첨부)
나: 이 영수증 정리해줘

봇: 영수증 분석 결과입니다.
    - 매장: OO 마트
    - 날짜: 2026-03-08
    - 합계: 35,600원

    항목:
    - 우유 (2,800원)
    - 식빵 (4,200원)
    - 계란 (6,000원)
    - 닭가슴살 (12,800원)
    - 과자 (9,800원)

    가계부에 기록할까요?
```

### 도구 호출이 포함된 대화

```
나: 지금 서울 날씨 알려줘

[도구 실행: weather] 서울 날씨 조회 중...
[도구 결과: weather] 완료

봇: 현재 서울 날씨입니다.
    - 상태: 맑음
    - 기온: 18°C (체감 16°C)
    - 습도: 45%
    - 오후에 구름이 조금 늘어나지만 비 소식은 없어요.
```

### 웹 UI와 텔레그램 연동

```
[웹 UI에서]
나: 다음 주 독서 목표: 클린 코드 1-5장 읽기

[텔레그램에서 나중에]
나: 내 독서 목표 뭐였지?
봇: 다음 주 독서 목표: 클린 코드 1-5장 읽기입니다.
    현재까지 진행 상황이 있으시면 알려주세요!
```

---

## WebSocket 프로토콜 (개발자 참고)

웹 채팅은 Gateway의 WebSocket 엔드포인트(`GET /ws`)를 사용합니다. 클라이언트-서버 간 통신 형식은 다음과 같습니다.

### 연결

```
GET /ws
Authorization: Bearer <jwt-token>
```

또는 쿼리 파라미터로 인증:

```
GET /ws?token=<jwt-token>
```

### 클라이언트 → 서버 (InFrame)

```json
{
  "id": "req-001",
  "method": "chat",
  "params": {
    "message": "안녕하세요",
    "model": "gemini-2.0-flash",
    "thread_id": "uuid-of-conversation"
  }
}
```

| 필드 | 설명 |
|------|------|
| `id` | 요청 식별자 (응답에 그대로 포함됨) |
| `method` | 현재 `chat`만 지원 |
| `params.message` | 사용자 메시지 (필수) |
| `params.model` | 사용할 AI 모델 (선택) |
| `params.thread_id` | 대화 스레드 UUID (선택, 없으면 새 대화) |

### 서버 → 클라이언트 (OutFrame)

AI 응답은 여러 개의 이벤트 프레임으로 스트리밍됩니다.

**텍스트 스트리밍:**
```json
{
  "type": "event",
  "id": "req-001",
  "event": "text",
  "payload": { "text": "안녕하세요! " }
}
```

**도구 실행:**
```json
{
  "type": "event",
  "id": "req-001",
  "event": "tool_call",
  "payload": { "tool": "weather", "text": "서울 날씨 조회 중..." }
}
```

**파일 응답 (이미지/오디오):**
```json
{
  "type": "event",
  "id": "req-001",
  "event": "file",
  "payload": {
    "name": "generated_image.png",
    "mime": "image/png",
    "url": "https://storage.example.com/...",
    "size": 102400
  }
}
```

**완료:**
```json
{
  "type": "event",
  "id": "req-001",
  "event": "done"
}
```

**이벤트 종류 요약:**

| 이벤트 | 설명 |
|--------|------|
| `text` | AI 응답 텍스트 청크 |
| `tool_call` | 도구 호출 시작 |
| `tool_result` | 도구 실행 결과 |
| `file` | 생성된 파일 (이미지, 오디오 등) |
| `error` | 오류 발생 |
| `done` | 응답 완료 |

---

## 주의사항

### 동시 접속

동일 계정으로 여러 브라우저 탭 또는 기기에서 동시 접속하면 마지막 연결이 활성 연결이 됩니다. 이전 연결은 자동으로 닫힙니다.

### 메시지 크기 제한

WebSocket 메시지 최대 크기는 **64KB**입니다. 파일 업로드는 REST API(`/api/v1/upload`)를 통해 처리되므로 이 제한에 해당하지 않습니다.

### 연결 유지 (Ping/Pong)

서버는 50초마다 WebSocket Ping 메시지를 전송합니다. 60초 동안 응답이 없으면 연결이 종료됩니다. 브라우저는 자동으로 Pong을 응답하므로 별도 처리가 필요하지 않습니다.

### HTTPS/WSS 권장

프로덕션 환경에서는 반드시 HTTPS와 WSS(WebSocket Secure)를 사용하세요. HTTP/WS는 JWT 토큰이 네트워크에서 노출될 수 있습니다.

---

## 문제 해결

### 채팅 응답이 없을 때

1. 브라우저 콘솔(F12)에서 WebSocket 연결 오류가 있는지 확인합니다.
2. 서버 주소와 포트가 올바른지 확인합니다.
3. 역방향 프록시를 사용하는 경우 WebSocket 업그레이드 헤더가 설정되어 있는지 확인합니다.

### 연결이 자주 끊어질 때

- 역방향 프록시의 `proxy_read_timeout` 또는 타임아웃 설정을 180초 이상으로 늘려보세요.
- 네트워크 방화벽이 WebSocket 연결을 차단하지 않는지 확인하세요.

### "agent service unavailable" 오류

Agent 서비스(Python)가 실행 중이지 않거나 Gateway와의 gRPC 연결이 끊어진 경우입니다.

```bash
# Docker Compose 환경에서 서비스 상태 확인
docker compose ps

# Agent 서비스 로그 확인
docker compose logs agent
```

### 파일 업로드 후 이미지가 표시되지 않을 때

MinIO 오브젝트 스토리지가 설정되지 않은 경우 파일 저장이 비활성화됩니다. Docker Compose 설정에서 MinIO 서비스가 실행 중인지 확인하세요.

---

## FAQ

**Q: 웹 UI에서 대화한 내용을 텔레그램에서도 볼 수 있나요?**
A: 네, 웹 UI와 텔레그램은 동일한 AI 에이전트에 연결됩니다. 어느 채널에서 기록한 내용이든 다른 채널에서 조회할 수 있습니다.

**Q: 여러 사람이 같은 서버를 사용할 수 있나요?**
A: 네, Starnion은 다중 사용자를 지원합니다. 각 사용자는 계정을 만들고 독립적인 대화와 설정을 유지합니다.

**Q: 대화 기록이 서버에 얼마나 보관되나요?**
A: 대화 기록은 PostgreSQL 데이터베이스에 저장됩니다. 별도의 삭제 정책이 없으면 영구 보관됩니다. 대화 삭제는 Settings에서 개별 대화를 삭제할 수 있습니다.

**Q: 인터넷이 없어도 사용할 수 있나요?**
A: Starnion 서버가 로컬에서 실행되고, Ollama 같은 로컬 LLM을 사용하는 경우 인터넷 연결 없이도 사용할 수 있습니다. 단, 날씨 조회, 웹 검색, Google 연동 등 외부 API를 사용하는 기능은 인터넷 연결이 필요합니다.

**Q: 모바일 브라우저에서도 사용할 수 있나요?**
A: 네, Starnion 웹 UI는 반응형으로 설계되어 모바일 브라우저에서도 사용할 수 있습니다. 다만, 스마트폰에서 편리하게 사용하려면 텔레그램 채널을 권장합니다.
