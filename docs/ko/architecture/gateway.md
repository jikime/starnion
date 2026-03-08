---
title: Gateway (Go)
nav_order: 2
parent: 아키텍처
---

# Gateway (Go)

## 역할

Gateway는 Starnion의 **트래픽 중심부**입니다. Go 언어로 작성되었으며 다음 역할을 수행합니다.

- **REST API 서버**: UI와 외부 클라이언트를 위한 API 엔드포인트 제공
- **WebSocket 서버**: 실시간 웹 채팅 허브(Hub) 운영
- **Telegram 봇 관리자**: 사용자별 다중 Telegram 봇 인스턴스 관리
- **Cron 스케줄러**: 주기적 알림, 리포트, 예산 경고 자동 실행
- **gRPC 클라이언트**: Python Agent와 통신하여 AI 응답 요청

---

## 시스템 다이어그램

```
클라이언트 (브라우저/앱)
        │
        ├── HTTP REST ──────────────────────────────────┐
        ├── WebSocket (wss://) ─────────────────────── │
        └── Telegram Bot API ─────────────────────────│
                                                        ▼
                                            ┌─────────────────────┐
                                            │   Gateway (Go)      │
                                            │                     │
                                            │  Echo Router        │
                                            │  BotManager         │
                                            │  Scheduler (Cron)   │
                                            │  WebSocket Hub      │
                                            └──────┬──────────────┘
                                                   │ gRPC
                                                   ▼
                                            ┌─────────────────────┐
                                            │   Agent (Python)    │
                                            │   gRPC :50051       │
                                            └─────────────────────┘
                                                   │
                                            ┌──────┴──────┐
                                            │  PostgreSQL  │
                                            │   pgvector   │
                                            └─────────────┘
```

---

## 주요 컴포넌트

### Echo 라우터

[labstack/echo](https://echo.labstack.com/) v4를 사용합니다. 모든 HTTP 요청은 `main.go`에서 라우트가 등록됩니다.

### BotManager

사용자별 Telegram 봇을 관리합니다. 각 사용자가 자신의 Telegram Bot Token을 등록하면 BotManager가 해당 봇 인스턴스를 생성하고 업데이트 폴링을 시작합니다. 서버 재시작 시 DB에 저장된 모든 봇 토큰을 자동으로 다시 로드합니다 (`ReloadAll()`).

### WebSocket Hub

웹 채팅을 위한 실시간 연결 허브입니다. JWT 인증을 통해 연결을 수락하고, Agent의 gRPC 스트리밍 응답을 클라이언트에 실시간으로 전달합니다.

### Cron 스케줄러

[robfig/cron](https://github.com/robfig/cron) v3를 사용하며, KST(UTC+9) 기준으로 실행됩니다. 자세한 내용은 아래 [Cron 스케줄](#cron-스케줄) 섹션을 참고하세요.

### gRPC 클라이언트

protobuf로 정의된 `AgentService`를 호출합니다. 단방향 요청(Chat), 서버 스트리밍(ChatStream) 두 가지 방식으로 통신합니다.

---

## 인증 방식

모든 API 요청은 JWT 기반 인증을 사용합니다.

```
Authorization: Bearer <jwt_token>
```

토큰은 `/auth/token` 엔드포인트에서 발급됩니다. 웹 사용자는 NextAuth 세션을 통해 자동으로 토큰을 획득합니다. Telegram 사용자는 플랫폼 ID 기반으로 토큰이 관리됩니다.

---

## 미들웨어

요청이 라우트 핸들러에 도달하기 전에 다음 미들웨어가 순서대로 실행됩니다.

| 미들웨어 | 기능 |
|---------|------|
| RequestID | 모든 요청에 고유 ID 부여 (`X-Request-ID`) |
| Recover | 핸들러 패닉을 500 응답으로 안전하게 복구 |
| CORS | 허용된 Origin, Method, Header 필터링 |
| RequestLogger | zerolog 기반 요청/응답 로깅 |

---

## API 엔드포인트 전체 목록

### 인증 (Auth)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/auth/register` | 이메일/비밀번호 회원가입 |
| POST | `/auth/login` | 이메일/비밀번호 로그인 |
| POST | `/auth/token` | 익명 JWT 토큰 발급 |
| POST | `/auth/link` | 웹 계정과 Telegram 계정 연결 |
| GET | `/auth/google/callback` | Google OAuth2 콜백 처리 |
| GET | `/auth/google/telegram` | Telegram 봇에서 Google OAuth 시작 |

### 채팅 (Chat)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/v1/chat` | 단방향 채팅 요청 |
| POST | `/api/v1/chat/stream` | SSE 스트리밍 채팅 (AI SDK 호환) |
| GET | `/ws` | WebSocket 실시간 채팅 연결 |

### 대화 관리 (Conversations)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/v1/conversations` | 대화 목록 조회 |
| POST | `/api/v1/conversations` | 새 대화 생성 |
| PATCH | `/api/v1/conversations/:id` | 대화 제목 수정 |
| GET | `/api/v1/conversations/:id/messages` | 대화 메시지 목록 조회 |

### 가계부 (Finance)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/v1/finance/summary` | 수입/지출 요약 |
| GET | `/api/v1/finance/transactions` | 거래 내역 목록 조회 |
| POST | `/api/v1/finance/transactions` | 새 거래 내역 추가 |
| PUT | `/api/v1/finance/transactions/:id` | 거래 내역 수정 |
| DELETE | `/api/v1/finance/transactions/:id` | 거래 내역 삭제 |
| GET | `/api/v1/budget` | 예산 조회 |
| PUT | `/api/v1/budget` | 예산 설정 |
| GET | `/api/v1/statistics` | 지출 통계 |
| GET | `/api/v1/statistics/insights` | 지출 인사이트 |

### 개인 데이터

| Method | Path | 설명 |
|--------|------|------|
| GET/POST | `/api/v1/diary/entries` | 일기 목록/생성 |
| GET/PUT/DELETE | `/api/v1/diary/entries/:id` | 일기 상세/수정/삭제 |
| GET/POST | `/api/v1/goals` | 목표 목록/생성 |
| POST | `/api/v1/goals/:id/checkin` | 목표 체크인 |
| GET/POST | `/api/v1/memos` | 메모 목록/생성 |
| PUT/DELETE | `/api/v1/memos/:id` | 메모 수정/삭제 |
| GET/POST | `/api/v1/ddays` | D-Day 목록/생성 |

### 설정 및 모델

| Method | Path | 설명 |
|--------|------|------|
| GET/PATCH | `/api/v1/profile` | 프로필 조회/수정 |
| GET/POST | `/api/v1/providers` | LLM 프로바이더 목록/등록 |
| POST | `/api/v1/providers/validate` | API 키 유효성 검증 |
| DELETE | `/api/v1/providers/:provider` | 프로바이더 삭제 |
| GET/POST | `/api/v1/personas` | 페르소나 목록/생성 |
| PUT/DELETE | `/api/v1/personas/:id` | 페르소나 수정/삭제 |

### 통합 (Integrations)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/v1/integrations/status` | 연동 상태 조회 |
| GET | `/api/v1/integrations/google/auth-url` | Google OAuth URL 생성 |
| DELETE | `/api/v1/integrations/google` | Google 연동 해제 |
| PUT | `/api/v1/integrations/notion` | Notion 연결 |
| PUT | `/api/v1/integrations/tavily` | Tavily 웹검색 연결 |
| PUT | `/api/v1/integrations/naver_search` | 네이버 검색 연결 |

### 파일 및 미디어

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/v1/upload` | 파일 업로드 (MinIO) |
| GET/POST/DELETE | `/api/v1/documents` | 문서 관리 |
| GET/DELETE | `/api/v1/images` | 이미지 갤러리 |
| GET/POST/DELETE | `/api/v1/audios` | 오디오 갤러리 |

### 분석 및 모니터링

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/v1/analytics` | 대화 분석 통계 |
| GET | `/api/v1/usage` | LLM 토큰 사용량 |
| GET | `/api/v1/logs` | 게이트웨이 로그 목록 |
| GET | `/api/v1/logs/stream` | 실시간 로그 스트리밍 (SSE) |
| GET | `/api/v1/logs/agent` | Python Agent 로그 프록시 |

---

## Cron 스케줄

스케줄러는 KST(UTC+9) 기준으로 동작합니다.

| 스케줄 | 작업 | 설명 |
|--------|------|------|
| 매주 월요일 09:00 | weekly_report | 주간 가계부 리포트 발송 |
| 매시간 | budget_warning | 예산 초과 경고 확인 |
| 매일 21:00 | daily_summary | 오늘 하루 요약 발송 |
| 매일 20:00 | inactive_reminder | 비활성 사용자 알림 |
| 매월 28~31일 21:00 | monthly_closing | 월말 결산 알림 |
| 매일 06:00 | pattern_analysis | 지출 패턴 분석 |
| 3시간마다 | spending_anomaly | 비정상 지출 감지 |
| 매일 14:00 | pattern_insight | 패턴 기반 인사이트 발송 |
| 10분마다 | conversation_analysis | 대화 분석 (유휴 감지) |
| 매일 07:00 | goal_evaluation | 목표 달성도 평가 |
| 매주 수요일 12:00 | goal_status | 목표 현황 알림 |
| 매일 08:00 | dday_notification | D-Day 알림 |
| 15분마다 | user_schedules | 사용자 정의 스케줄 실행 |
| 매주 월요일 05:00 | memory_compaction | 메모리 압축 (AI 로그 정리) |

---

## 로그 확인

Gateway의 로그는 zerolog 기반 구조적 JSON 로그로 기록됩니다.

### 웹 UI에서 확인

Settings > Logs 메뉴에서 실시간 로그 스트림을 확인할 수 있습니다. `GET /api/v1/logs/stream` SSE 엔드포인트를 통해 새 로그가 발생할 때마다 실시간으로 업데이트됩니다.

### Docker 로그

```bash
docker compose logs -f gateway
docker compose logs -f agent
```

### 로그 레벨

`LOG_LEVEL` 환경변수로 조정 가능합니다: `debug`, `info`, `warn`, `error`.

---

## 기술 스택 요약

| 항목 | 선택 | 버전 |
|------|------|------|
| 언어 | Go | 1.25 |
| 웹 프레임워크 | labstack/echo | v4.15 |
| gRPC | google.golang.org/grpc | v1.79 |
| WebSocket | gorilla/websocket | v1.5 |
| 데이터베이스 드라이버 | lib/pq | v1.11 |
| 스케줄러 | robfig/cron | v3 |
| 오브젝트 스토리지 | minio/minio-go | v7 |
| JWT | golang-jwt/jwt | v5 |
| 로거 | rs/zerolog | v1.34 |
| CLI | spf13/cobra | v1.10 |

---

## Identity Service: 멀티플랫폼 사용자 통합

같은 사용자가 웹과 텔레그램을 모두 사용할 때 동일한 `user_id`로 묶어줍니다.

```
텔레그램 chat_id: 12345  ──▶ platform_identities ──▶ user_id: "abc-uuid"
웹 session_id: "xxx"    ──▶ platform_identities ──▶ user_id: "abc-uuid"
```

계정 연결 흐름:

1. 텔레그램에서 `/link` 명령 입력
2. 10분 유효 연결 코드 `NION-XXXXXX` 발급
3. 웹에서 `POST /auth/link { "code": "NION-XXXXXX" }` 호출
4. 두 플랫폼이 같은 `user_id`로 통합됨
