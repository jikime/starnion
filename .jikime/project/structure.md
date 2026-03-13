# Starnion 프로젝트 구조

**Last Updated:** 2026-03-13

## 1. 아키텍처 개요

Starnion은 마이크로서비스 아키텍처로 구성되며, 세 개의 핵심 서비스가 독립적으로 동작한다.

```
┌─────────────────────────────────────────────────────┐
│                    클라이언트                          │
│              Web Browser / Telegram                   │
└──────────┬──────────────────┬───────────────────────┘
           │ HTTP/WebSocket    │ Telegram API
           ▼                   ▼
┌─────────────────────────────────────────────────────┐
│              Gateway (Go, :8080)                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ HTTP API │ │ WebSocket│ │ Telegram │ │Scheduler│ │
│  │ Handler  │ │  Chat    │ │   Bot    │ │  Cron   │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
└──────────────────────┬──────────────────────────────┘
                       │ gRPC (protobuf)
                       ▼
┌─────────────────────────────────────────────────────┐
│            Agent (Python LangGraph, :50051)          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │  ReAct   │ │ 46 Skills│ │ 4-Layer  │ │ Vector │ │
│  │  Graph   │ │  Modules │ │  Memory  │ │Embedding│ │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
└──────────┬──────────────────┬───────────────────────┘
           │ SQL               │ S3 API
           ▼                   ▼
┌────────────────────┐ ┌────────────────────┐
│  PostgreSQL 16     │ │      MinIO         │
│  + pgvector        │ │  (S3 호환 스토리지)  │
└────────────────────┘ └────────────────────┘
```

### 서비스 역할 요약

| 서비스 | 언어 | 포트 | 역할 |
|--------|------|------|------|
| **UI** | Next.js (TypeScript) | 3000 | 웹 대시보드, 사용자 인터페이스 |
| **Gateway** | Go | 8080 | HTTP API, WebSocket, Telegram 봇, 스케줄러 |
| **Agent** | Python (LangGraph) | 50051 | AI 에이전트, 스킬 실행, 메모리 관리 |

## 2. 디렉토리 구조

```
starnion/
├── ui/                           # Next.js Web UI (port 3000)
│   ├── app/
│   │   ├── (auth)/               # 인증 페이지 (로그인, 회원가입)
│   │   ├── (dashboard)/          # 대시보드 라우트
│   │   │   ├── chat/             #   채팅 (AI 대화)
│   │   │   ├── finance/          #   금융 관리
│   │   │   ├── diary/            #   일기/저널
│   │   │   ├── goals/            #   목표 추적
│   │   │   ├── garden/           #   가든 (시각화)
│   │   │   ├── usage/            #   사용량 모니터링
│   │   │   └── settings/         #   설정
│   │   └── api/                  # API 라우트 & Server Actions
│   │       └── settings/         #   설정 관련 API
│   │           ├── model-assignments/  # 모델 할당
│   │           └── providers/         # 프로바이더 관리
│   ├── components/               # 공유 React 컴포넌트
│   ├── messages/                 # i18n 다국어 메시지 (ko, en, ja, zh)
│   └── lib/                      # 유틸리티, 타입 정의
│
├── agent/                        # Python LangGraph Agent (port 50051, gRPC)
│   └── src/starnion_agent/
│       ├── graph/                # ReAct 에이전트 오케스트레이션
│       ├── skills/               # 46개 스킬 모듈
│       │   ├── audio/            #   음성 처리 (TTS/STT)
│       │   ├── compaction/       #   메모리 컴팩션
│       │   ├── conversation/     #   대화 관리
│       │   ├── goals/            #   목표 관리
│       │   ├── image/            #   이미지 생성/분석
│       │   ├── pattern/          #   패턴 분석
│       │   └── report/           #   리포트 생성
│       ├── db/                   # 데이터 접근 계층
│       │   └── repositories/     #   리포지토리 패턴
│       ├── memory/               # 4계층 메모리 시스템 (RAG)
│       ├── embedding/            # 벡터 임베딩
│       ├── grpc/                 # gRPC 서비스 정의
│       └── persona.py            # 페르소나 관리
│
├── gateway/                      # Go HTTP & Telegram Gateway (port 8080)
│   ├── cmd/
│   │   ├── gateway/              # 게이트웨이 서버 엔트리포인트
│   │   └── starnion/             # CLI 도구
│   └── internal/
│       ├── handler/              # HTTP 핸들러 (REST API)
│       ├── telegram/             # Telegram 봇 통합
│       ├── scheduler/            # Cron 기반 스케줄링
│       ├── wschat/               # WebSocket 채팅
│       └── cli/
│           └── migrations/       # DB 마이그레이션 스크립트
│
├── proto/                        # Protocol Buffer 정의 (gRPC)
├── docker/                       # Docker & 인프라 설정
│   ├── init.sql                  # DB 초기화 스크립트
│   └── migrations/
│       └── incremental/          # 증분 마이그레이션
├── docs/                         # 다국어 문서
├── scripts/                      # 빌드 스크립트
└── .jikime/                      # JikiME-ADK 설정
    ├── config/                   # 프로젝트 설정 (user, language, quality)
    ├── project/                  # 프로젝트 문서
    └── specs/                    # SPEC 문서
```

## 3. 서비스 통신

### 클라이언트 <-> Gateway

| 프로토콜 | 용도 | 설명 |
|----------|------|------|
| **REST API** | CRUD 작업 | HTTP JSON 기반 요청/응답 |
| **WebSocket** | 실시간 채팅 | 양방향 스트리밍 메시지 |
| **Telegram API** | 봇 통신 | Telegram 서버 경유 메시지 송수신 |

### Gateway <-> Agent

| 프로토콜 | 용도 | 설명 |
|----------|------|------|
| **gRPC** | AI 에이전트 호출 | Protocol Buffer 기반 고성능 RPC |

### 통신 흐름

```
사용자 요청 → Web UI (Next.js)
                  │
                  ├─ Server Action → Gateway REST API
                  └─ WebSocket ──→ Gateway WebSocket Handler
                                        │
                                        └─ gRPC ──→ Agent (LangGraph)
                                                        │
                                                        ├─ PostgreSQL (데이터)
                                                        ├─ MinIO (파일)
                                                        └─ LLM API (AI 추론)
```

## 4. 데이터 계층

### PostgreSQL 16 + pgvector

| 용도 | 설명 |
|------|------|
| **사용자 데이터** | 계정, 설정, 선호도 |
| **도메인 데이터** | 금융 거래, 일기, 목표 |
| **대화 히스토리** | 메시지, 세션, 컨텍스트 |
| **벡터 저장소** | pgvector 기반 임베딩 (HNSW 인덱스) |
| **프로바이더 설정** | LLM 프로바이더, 모델 할당 |

### MinIO (S3 호환 오브젝트 스토리지)

| 용도 | 설명 |
|------|------|
| **이미지** | 생성된 이미지, 업로드 파일 |
| **음성** | TTS 생성 파일, STT 입력 파일 |
| **문서** | PDF, 첨부 파일 |

### 마이그레이션 관리

- 초기 스키마: `docker/init.sql`, `gateway/internal/cli/migrations/init.sql`
- 증분 마이그레이션: `docker/migrations/incremental/v*.sql`
- Gateway CLI를 통한 마이그레이션 실행 지원
