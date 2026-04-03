# gRPC Server-Side Streaming (실시간 응답)

## 개요

기존 unary gRPC 호출(`Chat`)은 에이전트 응답이 완성될 때까지 블로킹 대기한다.
사용자는 typing indicator만 보면서 10~30초를 기다려야 하고, 에이전트가 tool call → 검색 → 생성하는 동안 진행 상황을 전혀 알 수 없다.

**문제**: 사용자 체감 대기시간이 길고 진행 상황 불투명

**해결**: Server-side streaming RPC로 토큰을 점진적으로 전달, Telegram EditMessage로 실시간 업데이트

---

## 아키텍처

```
사용자 (Telegram)
  │
  ├─ "지난주 식비 요약해줘"
  │
  ▼
Go Gateway (bot.go)
  │
  ├─ grpcClient.ChatStream(ChatRequest)     ← server-side streaming RPC
  │   └─ stream.Recv() loop
  │       ├─ chunk 1 (TEXT)  → SendMessage(첫 텍스트)
  │       ├─ chunk 2 (TEXT)  → EditMessage(누적 텍스트)
  │       ├─ chunk 3 (TEXT)  → EditMessage(누적 텍스트)  (500ms throttle)
  │       ├─ ...
  │       └─ STREAM_END      → EditMessage(최종 텍스트, Markdown) + 👍 reaction
  │
  ▼
Python Agent (gRPC server)
  │
  ├─ ChatStream() handler
  │   └─ self._agent.astream_events(version="v2")
  │       ├─ on_chat_model_stream → yield ChatResponse(content=token, type=TEXT)
  │       ├─ on_tool_start        → yield ChatResponse(type=TOOL_CALL, tool_name=...)
  │       ├─ on_tool_end          → yield ChatResponse(type=TOOL_RESULT, tool_result=...)
  │       └─ 완료 시              → yield ChatResponse(type=STREAM_END)
  │
  ▼
LangGraph Agent (.astream_events)
  ├─ Gemini 모델 토큰 생성
  ├─ Tool 호출/결과
  └─ 최종 응답
```

### Telegram UX 타임라인

```
t=0s    사용자: "지난주 식비 요약해줘"
t=0.1s  봇: 👀 reaction
t=0.5s  [gRPC stream 시작, agent 처리 중]
t=2s    봇: "식비 내역을" (첫 메시지 전송)
t=2.5s  봇: "식비 내역을 확인해볼게요. 지난주..." (edit)
t=3s    봇: "식비 내역을 확인해볼게요. 지난주 식비는 총 5건..." (edit)
t=5s    봇: [전체 응답 완료] (final edit with Markdown) + 👍 reaction
```

---

## 핵심 설계 결정

| 결정 | 선택 | 이유 |
|------|------|------|
| Streaming 방식 | `astream_events(version="v2")` | 토큰 단위 + tool call/result 이벤트 구분 가능. `astream()`은 node 단위로만 제공 |
| Proto RPC | `rpc ChatStream(...) returns (stream ChatResponse)` | 기존 `Chat()` unary 유지 (하위 호환). 새 RPC 추가 |
| Telegram UX | SendMessage → EditMessage 반복 | Telegram에서 실시간 타이핑 효과 구현 가능한 유일한 방법 |
| Edit 주기 | 500ms throttle | Telegram API rate limit (30 msg/min/chat) 준수 |
| 최소 edit 단위 | 변화 있을 때만 edit | 동일 내용 재전송 방지 |
| Fallback | ChatStream 실패 시 기존 `Chat()` 사용 | 안정성 보장 |
| 기존 `Chat()` | 유지 | 스케줄러, 리포트 등 비스트리밍 호출자들이 계속 사용 |

---

## Proto 변경

```protobuf
service AgentService {
  rpc Chat(ChatRequest) returns (ChatResponse);
  // ChatStream returns agent responses as a token stream.
  rpc ChatStream(ChatRequest) returns (stream ChatResponse);
  rpc GenerateReport(ReportRequest) returns (ReportResponse);
}
```

기존 `ChatRequest`, `ChatResponse`, `ResponseType` 그대로 재사용.
특히 `STREAM_END = 5`는 proto 최초 설계 시 예약해 둔 값.

---

## 변경 파일 목록

### Modified Files

| File | Changes |
|------|---------|
| `proto/jiki/v1/agent.proto` | `rpc ChatStream` 추가 (1줄) |
| `agent/src/jiki_agent/grpc/server.py` | `_build_message()` 헬퍼 추출, `ChatStream()` 스트리밍 핸들러 추가 |
| `gateway/internal/telegram/bot.go` | `handleMessageStream()` + `handleMessageUnary()` 분리, 스트리밍 우선 호출 |

### Auto-Generated Files (`scripts/gen-proto.sh` 실행)

| File | Description |
|------|-------------|
| `gateway/gen/jiki/v1/agent.pb.go` | Go message stubs |
| `gateway/gen/jiki/v1/agent_grpc.pb.go` | Go gRPC stubs (ChatStream client 추가) |
| `agent/src/jiki_agent/generated/jiki/v1/agent_pb2.py` | Python message stubs |
| `agent/src/jiki_agent/generated/jiki/v1/agent_pb2_grpc.py` | Python gRPC stubs (ChatStream servicer 추가) |

### 변경 없는 파일

`graph/agent.py`, `tools/*`, `db/*`, `memory/*` — 에이전트 로직 불변
`scheduler/*` — 기존 unary `Chat()` 계속 사용

---

## 구현 상세

### 1. Python — ChatStream 핸들러

`agent/src/jiki_agent/grpc/server.py`의 `AgentServiceServicer`에 추가:

- `_build_message(request)`: `Chat()`과 `ChatStream()` 양쪽에서 재사용하는 메시지 빌더
- `ChatStream(request, context)`: `astream_events(version="v2")`로 LangGraph 이벤트를 순회하며 `yield`

**이벤트 매핑**:

| LangGraph 이벤트 | gRPC ResponseType | 내용 |
|---|---|---|
| `on_chat_model_stream` | `TEXT` | LLM 토큰 (content) |
| `on_tool_start` | `TOOL_CALL` | 호출된 tool 이름 |
| `on_tool_end` | `TOOL_RESULT` | Tool 결과 (500자 truncate) |
| (루프 종료) | `STREAM_END` | 스트림 완료 시그널 |
| (예외 발생) | `ERROR` | 에러 메시지 |

### 2. Go Gateway — 스트리밍 수신

`gateway/internal/telegram/bot.go`의 메시지 처리 흐름:

```
handleMessage()
  ├─ 👀 reaction
  ├─ handleMessageStream() 시도
  │   ├─ ChatStream RPC 연결
  │   ├─ stream.Recv() 루프
  │   │   ├─ TEXT: 첫 청크 → SendMessage, 이후 → 500ms throttled EditMessage
  │   │   ├─ STREAM_END: Markdown final edit + 👍
  │   │   ├─ ERROR: 에러 메시지 표시 + 😢
  │   │   └─ TOOL_CALL/TOOL_RESULT: 무시 (향후 상태 표시 활용 가능)
  │   └─ 실패 시 error 반환
  │
  └─ (stream 실패 시) handleMessageUnary() fallback
      ├─ typing loop 시작
      ├─ Chat() unary RPC
      ├─ typing 중지
      └─ SendMessage + 👍
```

**Throttle 전략**:
- 500ms 간격 + 내용 변경 시에만 EditMessage 호출
- Telegram API rate limit (30 msg/min/chat) 안전 범위 내
- 최종 edit에만 Markdown 파싱 적용 (중간 edit는 plain text로 안정성 확보)

---

## Before vs After

| 항목 | Before | After |
|------|--------|-------|
| gRPC 방식 | Unary `Chat()` only | Streaming `ChatStream()` + Unary fallback |
| 사용자 대기 | 10~30초 typing indicator만 | ~2초 후 실시간 텍스트 표시 |
| Telegram 메시지 | 완성 후 한 번에 전송 | SendMessage → EditMessage 반복 (점진적) |
| Tool 호출 정보 | 없음 | `TOOL_CALL`/`TOOL_RESULT` 이벤트 제공 (향후 UI 활용 가능) |
| 에러 시 | 에러 메시지 전송 | 부분 응답 보존 + 에러 표시 / Unary fallback |
| 스케줄러/리포트 | `Chat()` 사용 | 변경 없음 (`Chat()` 유지) |
| 새 Python 의존성 | - | 없음 (LangGraph `astream_events` 내장) |

---

## 검증 방법

### 1. Proto 컴파일

```bash
./scripts/gen-proto.sh
```

### 2. 빌드 확인

```bash
# Go
cd gateway && go build ./cmd/gateway

# Python
cd agent && uv run python -c "
import sys; sys.path.insert(0, 'src/jiki_agent/generated')
from jiki.v1 import agent_pb2_grpc
assert hasattr(agent_pb2_grpc.AgentServiceServicer, 'ChatStream')
print('OK')
"
```

### 3. Telegram 통합 테스트

```bash
# Agent 실행
cd agent && uv run python -m jiki_agent

# Gateway 실행
cd gateway && go run ./cmd/gateway
```

테스트 시나리오:

- **실시간 스트리밍**: 일반 메시지 전송 → 텍스트가 점진적으로 나타나는지 확인
- **Markdown 최종 렌더링**: 응답 완료 시 Markdown 포맷 적용 확인
- **Tool 호출 포함 응답**: "지난주 식비 알려줘" → tool 호출 후에도 스트리밍 정상 동작 확인
- **에러 시 fallback**: Agent 에러 시 unary Chat()으로 자동 전환 확인
- **긴 응답**: "주간 리포트 작성해줘" 등 tool 호출이 많은 요청으로 안정성 확인

---

**상태**: ✅ 구현 완료
**날짜**: 2026-03-02
