# 채널 (Channels)

외부 메시징 플랫폼을 Jiki에 연결하는 시스템. 사용자별로 독립된 봇 인스턴스를 운영하며, DM·그룹 정책을 각자 설정할 수 있다.

---

## 아키텍처 개요

```
사용자(Telegram) ─→ 개인 봇 토큰 ─→ BotManager ─→ Gateway gRPC ─→ AI Agent
                                          │
                                     user_channel_settings (DB)
```

- **BotManager**: 사용자별 봇 고루틴을 pool로 관리. 서버 재시작 시 `ReloadAll()`로 자동 복구.
- **Per-user 봇**: 전역 `.env` 토큰 없이 각 사용자가 자신의 봇 토큰을 등록.
- **Policy gate**: 모든 메시지는 DM/그룹 정책 검사를 통과한 후 AI로 전달됨.

---

## 데이터베이스 스키마

### `user_channel_settings`
사용자별 채널 설정 (봇 토큰, 활성화 여부, 정책).

```sql
CREATE TABLE user_channel_settings (
    user_id      TEXT        NOT NULL,
    channel      TEXT        NOT NULL,  -- 'telegram' | 'discord' | ...
    bot_token    TEXT        NOT NULL DEFAULT '',
    enabled      BOOLEAN     NOT NULL DEFAULT FALSE,
    dm_policy    TEXT        NOT NULL DEFAULT 'allow',  -- allow | pairing | deny
    group_policy TEXT        NOT NULL DEFAULT 'allow',  -- allow | mention | deny
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, channel)
);
```

### `telegram_approved_contacts`
페어링 정책에서 DM을 허용한 Telegram 사용자 목록.

```sql
CREATE TABLE telegram_approved_contacts (
    id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_user_id  TEXT        NOT NULL,
    telegram_id    TEXT        NOT NULL,
    display_name   TEXT        NOT NULL DEFAULT '',
    approved_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_user_id, telegram_id)
);
```

### `telegram_pairing_requests`
DM 정책이 `pairing`일 때 승인 대기 중인 요청.

```sql
CREATE TABLE telegram_pairing_requests (
    id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_user_id  TEXT        NOT NULL,
    telegram_id    TEXT        NOT NULL,
    display_name   TEXT        NOT NULL DEFAULT '',
    message_text   TEXT        NOT NULL DEFAULT '',
    requested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status         TEXT        NOT NULL DEFAULT 'pending',  -- pending | approved | denied
    resolved_at    TIMESTAMPTZ,
    UNIQUE (owner_user_id, telegram_id)
);
```

---

## Gateway 구현

### BotManager (`gateway/internal/telegram/manager.go`)

```go
// 핵심 원칙: 봇 고루틴은 항상 rootCtx(Gateway 수명)에서 파생
// HTTP 요청 컨텍스트(c.Request().Context())를 절대 사용하지 않는다.
// → 요청이 끝나면 컨텍스트가 취소되어 봇이 죽기 때문.

func (m *BotManager) StartBot(_ context.Context, userID, token string) error {
    botCtx, cancel := context.WithCancel(m.rootCtx) // rootCtx 사용
    go bot.Run(botCtx)
    return nil
}
```

| 메서드 | 설명 |
|---|---|
| `StartBot(_, userID, token)` | 봇 시작. 기존 봇이 있으면 먼저 중지 후 재시작 |
| `StopBot(userID)` | 봇 중지 (컨텍스트 취소) |
| `ReloadAll()` | 서버 시작 시 DB에서 활성 봇 전부 로드 |
| `ActiveCount()` | 현재 실행 중인 봇 수 반환 |

### Policy Gate (`gateway/internal/telegram/bot.go`)

모든 메시지는 `handleMessage()` 진입 시 정책 검사를 통과해야 AI로 전달된다.

```
메시지 수신
    │
    ├─ /start, /link 명령어 → 정책 무관하게 항상 처리
    │
    ├─ 그룹 메시지
    │   ├─ allow   → 처리
    │   ├─ mention → @봇이름 포함 시만 처리
    │   └─ deny    → 무시
    │
    └─ DM 메시지
        ├─ allow   → 처리
        ├─ pairing → 승인된 사용자면 처리, 미승인이면 페어링 요청 등록 후 반환
        └─ deny    → 거부 메시지 전송 후 반환
```

**policyCache**: DB 부하를 줄이기 위해 정책을 30초간 메모리에 캐시.

---

## Gateway API

Base: `http://gateway:8080/api`
인증: Next.js가 `?user_id=<uuid>` 쿼리 파라미터를 자동 주입.

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/channels/telegram` | 현재 봇 설정 및 상태 조회 |
| `POST` | `/channels/telegram` | 봇 설정 변경 (아래 action 참고) |
| `GET` | `/channels/telegram/pairing` | 대기 중인 페어링 요청 목록 |
| `POST` | `/channels/telegram/pairing/:id/approve` | 페어링 요청 승인 |
| `POST` | `/channels/telegram/pairing/:id/deny` | 페어링 요청 거부 |

### POST `/channels/telegram` 액션

```jsonc
// 봇 토큰 저장
{ "action": "set-token", "botToken": "1234:ABC..." }

// 봇 활성화/비활성화
{ "action": "set-enabled", "enabled": true }

// DM/그룹 정책 저장
{ "action": "set-policy", "dmPolicy": "pairing", "groupPolicy": "mention" }
```

---

## Next.js API 라우트

| 파일 | Gateway 연결 |
|---|---|
| `ui/app/api/channels/telegram/route.ts` | GET/POST `/channels/telegram` |
| `ui/app/api/channels/telegram/pairing/route.ts` | GET `/channels/telegram/pairing` |
| `ui/app/api/channels/telegram/pairing/[id]/approve/route.ts` | POST `…/approve` |
| `ui/app/api/channels/telegram/pairing/[id]/deny/route.ts` | POST `…/deny` |

모든 라우트는 `getServerSession()`으로 인증 확인 후 `session.user.id`를 `user_id` 파라미터로 전달한다.

---

## UI (`ui/components/channels-view.tsx`)

- **레이아웃**: 반응형 그리드 (`grid-cols-1` → `grid-cols-2` at lg)
- **채널 카드**: 채널 1개당 그리드 셀 1개 차지
- **Telegram 카드 구성**
  - 봇 토큰 입력 및 저장
  - 활성화/비활성화 토글 (Switch)
  - 채널 설정 (Collapsible): DM 정책, 그룹 정책, 계정 연결
  - 페어링 요청 카드 (DM 정책이 `pairing`일 때만 표시)

---

## 정책 설명

### DM 정책

| 값 | 동작 |
|---|---|
| `allow` | 누구나 DM 가능 |
| `pairing` | 승인된 사용자만 DM 가능. 미승인 사용자는 요청이 UI에 표시됨 |
| `deny` | 모든 DM 차단. 봇이 거부 메시지 반환 |

### 그룹 정책

| 값 | 동작 |
|---|---|
| `allow` | 모든 그룹 메시지에 응답 |
| `mention` | `@봇이름` 멘션이 포함된 메시지에만 응답 |
| `deny` | 그룹 메시지 전체 무시 |

> **캐시 주의**: 정책 변경 후 최대 30초 후 반영. 즉시 적용하려면 봇을 비활성화 후 다시 활성화.

---

## 봇 초기 설정 방법

1. Telegram에서 `@BotFather` 검색
2. `/newbot` 명령어 → 봇 이름 및 username 입력
3. 발급된 토큰을 채널 UI → 봇 토큰 입력창에 붙여넣기
4. 저장 후 토글을 켜면 봇 시작
5. (선택) `채널 설정`을 열어 DM/그룹 정책 변경
6. (선택) Telegram에서 `/link` 명령어로 계정 연결 코드를 받아 UI에서 연결

---

## Telegram 계정 연결 (`/link`)

봇에게 `/link` 명령어를 보내면 임시 코드(예: `JIKI-7A4B2F`)를 발급한다.
이 코드를 채널 UI → 채널 설정 → 계정 연결에 입력하면 Telegram 계정과 Jiki 계정이 연결된다.
연결된 계정은 봇이 대화 내역을 동일한 사용자로 저장한다.

---

## 페어링 워크플로우

```
1. DM 정책을 "페어링"으로 설정
2. 새 Telegram 사용자가 봇에게 DM 전송
3. 봇 응답: "연결 요청이 접수됐어요. 관리자 승인을 기다려주세요."
4. UI의 "페어링 요청" 카드에 요청 표시
5. 승인(✓): telegram_approved_contacts 에 추가 → 이후 DM 정상 처리
   거부(✗): 요청 목록에서 제거, 봇은 계속 대기 메시지만 반환
```

---

## 알려진 제약 사항

- 정책 캐시 TTL: 30초 (즉시 반영 불가)
- 그룹에서 `mention` 정책: 봇이 그룹에 admin으로 추가되어야 모든 메시지를 수신할 수 있음 (Telegram Privacy Mode 비활성화 필요)
- Discord, Slack 채널: 미구현 (향후 예정)
