---
title: Agent (Python)
nav_order: 3
parent: 아키텍처
grand_parent: 🇰🇷 한국어
---

# Agent (Python)

## 역할

Agent는 Starnion의 AI 두뇌입니다. Python으로 작성되었으며 LangGraph ReAct 아키텍처를 기반으로 동작합니다. Gateway로부터 gRPC 요청을 받아 AI 추론, 스킬 실행, 메모리 검색을 수행하고 최종 응답을 반환합니다.

**핵심 역할:**
- 사용자 메시지를 분석하여 의도 파악
- 적절한 스킬(Tool)을 선택하고 실행
- 4-Layer 메모리 시스템에서 관련 정보 검색
- 멀티 LLM 라우팅 (사용자 설정에 따라 모델 선택)
- gRPC 스트리밍으로 실시간 응답 전달

---

## LangGraph ReAct 아키텍처

Agent는 [LangGraph](https://github.com/langchain-ai/langgraph)의 ReAct(Reasoning + Acting) 패턴을 사용합니다.

```
사용자 메시지
      │
      ▼
┌─────────────────────────────────────────┐
│           ReAct 루프                    │
│                                         │
│  ┌──────────┐    생각(Think)            │
│  │  LLM     │──────────────────────┐   │
│  │ (추론)   │                      │   │
│  └──────────┘                      ▼   │
│       ▲              ┌─────────────────┐│
│       │ 관찰(Observe)│ 스킬 선택       ││
│       │              │ (Tool Selection)││
│  ┌────┴───────┐      └────────┬────────┘│
│  │ 스킬 결과  │               │ 실행    │
│  │ (Tool Res) │◄──────────────┘         │
│  └────────────┘                         │
│                                         │
│  [반복: 스킬이 더 필요하면 계속]        │
└─────────────────────────────────────────┘
      │ 최종 응답 결정
      ▼
   gRPC 스트리밍 응답
```

### 동작 흐름 요약

1. **입력 수신**: Gateway로부터 gRPC 요청 수신 (사용자 메시지 + 대화 ID + 사용자 ID)
2. **컨텍스트 로딩**: 대화 이력, 사용자 프로필, 현재 페르소나 로드
3. **메모리 검색**: 4-Layer 메모리에서 관련 정보 검색 (pgvector 유사도 검색)
4. **LLM 추론**: 시스템 프롬프트 + 대화 이력 + 메모리 컨텍스트를 LLM에 전달
5. **스킬 실행**: LLM이 필요한 스킬을 선택하면 해당 함수 실행
6. **반복**: 스킬 결과를 바탕으로 추가 추론이 필요하면 루프 반복
7. **응답 스트리밍**: 최종 답변을 gRPC 스트림으로 실시간 전송
8. **메모리 저장**: 대화 내용을 일일 로그에 기록

---

## 메시지 처리 흐름

```
사용자 입력: "이번 달 식비가 얼마야?"
      │
      ▼
[의도 파악]
  → "가계부 조회" 의도 감지
      │
      ▼
[메모리 검색]
  → 관련 가계부 데이터 검색 (Layer 4: SQL)
  → 이전 유사 질문 기억 검색 (Layer 1: pgvector)
      │
      ▼
[스킬 선택]
  → get_finance_summary(category="식비", period="this_month") 호출
      │
      ▼
[스킬 실행]
  → DB에서 이번 달 식비 트랜잭션 집계
  → 결과: {"total": 234500, "transactions": [...]}
      │
      ▼
[LLM 최종 응답 생성]
  → "이번 달 식비는 234,500원이에요. 지난달(198,000원)보다 18% 늘었네요."
      │
      ▼
[gRPC 스트리밍 전송]
  → 응답 토큰을 실시간으로 Gateway에 전송
      │
      ▼
[메모리 저장]
  → 이번 대화 내용을 일일 로그에 기록
```

---

## 멀티 LLM 라우팅

Agent는 사용자별로 등록된 LLM 프로바이더와 현재 선택된 페르소나(Persona)를 기반으로 호출할 모델을 결정합니다.

### 모델 선택 우선순위

```
1. 현재 대화에서 명시적으로 선택된 모델
      ↓ (없으면)
2. 현재 페르소나에 연결된 모델
      ↓ (없으면)
3. 사용자 기본 프로바이더의 첫 번째 활성 모델
      ↓ (없으면)
4. 시스템 기본값 (Gemini Flash)
```

### 지원 프로바이더

| 프로바이더 | 구현 방식 |
|-----------|----------|
| Gemini | `google-generativeai` SDK |
| OpenAI | `openai` SDK (ChatCompletion API) |
| Anthropic | `anthropic` SDK (Messages API) |
| Z.AI | OpenAI 호환 엔드포인트 |
| Custom | OpenAI 호환 베이스 URL |

---

## 4-Layer 메모리 시스템

Agent는 4개의 계층으로 구성된 메모리 시스템을 통해 사용자 컨텍스트를 관리합니다.

```
┌─────────────────────────────────────────────────────┐
│                 4-Layer Memory                      │
│                                                     │
│  Layer 1: 일일 로그                                 │
│  ┌──────────────────────────────┐                   │
│  │ pgvector, 768차원 임베딩     │                   │
│  │ 대화 기록, 감정, 키워드      │                   │
│  └──────────────────────────────┘                   │
│                 ↑ 유사도 검색                       │
│  Layer 2: 지식 베이스                               │
│  ┌──────────────────────────────┐                   │
│  │ pgvector, 768차원 임베딩     │                   │
│  │ 사용자 선호, 학습된 패턴     │                   │
│  └──────────────────────────────┘                   │
│                 ↑ 유사도 검색                       │
│  Layer 3: 문서 섹션                                 │
│  ┌──────────────────────────────┐                   │
│  │ pgvector, 768차원 임베딩     │                   │
│  │ 업로드된 문서의 청크         │                   │
│  └──────────────────────────────┘                   │
│                 ↑ SQL 쿼리                          │
│  Layer 4: 최근 가계부                               │
│  ┌──────────────────────────────┐                   │
│  │ PostgreSQL SQL               │                   │
│  │ 최근 30일 거래 내역          │                   │
│  └──────────────────────────────┘                   │
└─────────────────────────────────────────────────────┘
```

### Layer 1: 일일 로그

- **저장소**: PostgreSQL + pgvector 확장
- **임베딩 차원**: 768차원 (Gemini `text-embedding-004`)
- **내용**: 대화 내용, 감정 상태, 주요 키워드, 요약
- **검색 방식**: 코사인 유사도 기반 의미 검색
- **용도**: "저번에 뭐라고 했더라?" 같은 과거 대화 회상

### Layer 2: 지식 베이스

- **저장소**: PostgreSQL + pgvector
- **임베딩 차원**: 768차원
- **내용**: 사용자 선호, 반복 패턴, 학습된 개인화 정보
- **용도**: "사용자가 커피를 좋아한다", "매달 25일에 월급 입금" 등 개인화 컨텍스트

### Layer 3: 문서 섹션

- **저장소**: PostgreSQL + pgvector
- **임베딩 차원**: 768차원
- **내용**: 사용자가 업로드한 PDF, Word 등의 문서 청크
- **청킹 방식**: 의미 단위로 분할 (기본 512 토큰)
- **용도**: "내가 업로드한 계약서에서 위약금 조항 찾아줘"

### Layer 4: 최근 가계부

- **저장소**: PostgreSQL (일반 SQL, 벡터 없음)
- **내용**: 최근 30일 거래 내역
- **검색 방식**: SQL 집계 쿼리
- **용도**: "이번 달 식비 얼마야?", "어제 카페 지출 있었어?"

---

## 임베딩

모든 벡터 임베딩은 Google의 `text-embedding-004` 모델을 사용합니다.

| 항목 | 값 |
|------|-----|
| 모델 | `text-embedding-004` |
| 차원 | 768 |
| 유사도 함수 | 코사인 유사도 (`<=>` 연산자) |
| 언어 | 한국어 포함 다국어 지원 |

임베딩 생성 흐름:
```
텍스트 입력
    │
    ▼
Gemini Embedding API 호출
    │
    ▼
768차원 float 벡터 반환
    │
    ▼
PostgreSQL pgvector 컬럼에 저장
(예: VECTOR(768))
```

---

## gRPC 인터페이스

Agent는 gRPC 서버로 동작하며 기본 포트 `50051`을 사용합니다.

### 서비스 정의 (protobuf)

```protobuf
service AgentService {
  // 단방향 채팅 요청/응답
  rpc Chat(ChatRequest) returns (ChatResponse);

  // 서버 스트리밍: 응답 토큰을 실시간으로 전송
  rpc ChatStream(ChatRequest) returns (stream ChatStreamResponse);
}
```

### 통신 흐름

```
Gateway (Go)                    Agent (Python)
    │                               │
    │── ChatRequest ──────────────►│
    │   (message, user_id,          │
    │    conversation_id,           │  ReAct 루프 실행
    │    context, files)            │  스킬 실행
    │                               │
    │◄── ChatStreamResponse ────────│ (토큰 단위 스트리밍)
    │◄── ChatStreamResponse ────────│
    │◄── ChatStreamResponse ────────│
    │         ...                   │
    │◄── [stream end] ──────────────│
```

Gateway는 스트리밍 응답을 받아 WebSocket 또는 SSE(Server-Sent Events)로 클라이언트에 전달합니다.

---

## 스킬 실행 메커니즘

스킬은 LangChain Tool로 구현됩니다. LLM이 JSON 형식으로 호출할 스킬과 파라미터를 결정하면 Agent가 해당 Python 함수를 실행합니다.

### 스킬 카테고리

| 카테고리 | 스킬 예시 |
|---------|----------|
| 가계부 | 거래 추가/조회, 예산 확인, 통계 |
| 일정 | Google Calendar 연동 |
| 메모 | 메모 생성/조회/삭제 |
| 일기 | 일기 작성/조회 |
| 목표 | 목표 설정/체크인/평가 |
| D-Day | D-Day 등록/조회 |
| 문서 | 문서 검색, PDF 요약 |
| 웹 검색 | Tavily, 네이버 검색 API |
| 날씨 | 현재 날씨 조회 |
| 계산기 | 수식 계산 |
| 번역 | 다국어 번역 |

### 스킬 활성화

스킬은 사용자별로 활성화/비활성화를 제어할 수 있습니다. 비활성화된 스킬은 LLM의 Tool 목록에 포함되지 않으므로 호출되지 않습니다.

Settings → Skills 메뉴에서 토글로 제어하거나 API `POST /api/v1/skills/:id/toggle`을 사용합니다.

---

## Docker 구성

Agent는 `docker/Dockerfile.agent`를 사용하고 `docker-compose.yml`에서 다음과 같이 정의됩니다.

```yaml
agent:
  build:
    context: ../agent
    dockerfile: ../docker/Dockerfile.agent
  container_name: starnion-agent
  ports:
    - "${GRPC_PORT:-50051}:50051"  # gRPC 서버
  environment:
    DATABASE_URL: postgres://...   # PostgreSQL 연결
    GRPC_PORT: 50051
  depends_on:
    postgres:
      condition: service_healthy
```

Agent는 PostgreSQL이 준비된 후에 시작됩니다. Gateway는 Agent가 시작된 후 연결을 시도합니다.

---

## 기술 스택 요약

| 항목 | 선택 | 버전 |
|------|------|------|
| 언어 | Python | 3.13+ |
| AI 오케스트레이션 | LangGraph | 0.4+ |
| LLM 클라이언트 | langchain-google-genai, langchain-anthropic, langchain-openai | 최신 |
| 대화 상태 저장 | langgraph-checkpoint-postgres | 2.0+ |
| DB 드라이버 | psycopg (psycopg3) + psycopg-pool | 3.2+ |
| gRPC 서버 | grpcio | 1.70+ |
| 이미지 생성/분석 | google-genai (Gemini) | 1.0+ |
| 문서 파싱 | pypdf, python-docx, openpyxl, python-pptx | 최신 |
| 웹 검색 | tavily-python | 0.5+ |
| 브라우저 자동화 | playwright | 1.40+ |
| QR 코드 | qrcode[pil] | 8.0+ |
| PDF 생성 | reportlab | 4.4+ |

---

## 스킬 아키텍처

각 스킬은 독립된 Python 패키지로 구현됩니다.

```
agent/src/starnion_agent/skills/
├── finance/          # 가계부
│   ├── __init__.py   # 스킬 등록
│   ├── tools.py      # LangChain Tool 함수 정의
│   └── SKILL.md      # 스킬 설명 (LLM 시스템 프롬프트에 주입)
├── weather/
│   ├── __init__.py
│   ├── tools.py
│   └── SKILL.md
├── loader.py         # 스킬 동적 로딩
├── guard.py          # 스킬 접근 권한 검사
└── registry.py       # 전체 스킬 레지스트리
```

### SKILL.md의 역할

각 스킬 디렉터리의 `SKILL.md` 파일은 LLM 시스템 프롬프트에 직접 주입됩니다. 이를 통해 LLM이 각 스킬의 사용 조건과 방법을 정확히 알 수 있습니다.

```
시스템 프롬프트 = 기본 페르소나 + 활성 스킬의 SKILL.md 내용
```

### 스킬 가드 (Skill Guard)

사용자가 비활성화한 스킬은 `guard.py`에서 차단됩니다. 비활성 스킬의 도구(Tool)는 LLM에 노출되지 않아 호출 자체가 불가능합니다.

---

## 로그 및 HTTP 서버

Agent는 gRPC 포트(50051) 외에도 HTTP 서버(8082 포트)를 운영합니다.

| 포트 | 용도 |
|------|------|
| `50051` | gRPC 서버 (Gateway와 통신) |
| `8082` | HTTP 서버 (로그 스트리밍, 문서 인덱싱, 검색 임베딩) |

Gateway의 `/api/v1/logs/agent` 엔드포인트는 Agent의 8082 포트로 프록시하여 실시간 Agent 로그를 제공합니다.
