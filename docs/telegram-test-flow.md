# Telegram Test Flow

Phase 2 구현 기능을 Telegram 봇으로 테스트하는 가이드입니다.

## 사전 준비

### 환경 설정

프로젝트 루트에 `.env` 파일이 설정되어 있어야 합니다.

```bash
# jiki/.env
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash
DATABASE_URL=postgresql://postgres:admin@localhost:5432/jiki
GRPC_PORT=50051
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
```

### 서비스 실행

```bash
# 터미널 1: PostgreSQL (이미 실행 중이면 생략)
cd docker && docker compose up postgres

# 터미널 2: Agent (Python gRPC 서버)
cd agent && uv run python -m jiki_agent
# → gRPC server starting on [::]:50051

# 터미널 3: Gateway (Go HTTP + Telegram polling)
cd gateway && go run ./cmd/gateway
# → Telegram bot polling started
```

### 정상 기동 확인

```bash
# Health check
curl localhost:8080/healthz
# → {"status":"ok"}
```

---

## 1. 기본 대화 + 가계부 (MVP)

| 순서 | Telegram 메시지 | 기대 응답 |
|------|-----------------|-----------|
| 1 | `/start` | 환영 인사 ("안녕하세요! 저는 지기예요...") |
| 2 | `점심 김치찌개 9000원` | "식비 9,000원 기록했어요. 이번 달 식비 누적: 9,000원" |
| 3 | `택시 15000원` | "교통 15,000원 기록했어요. 이번 달 교통 누적: 15,000원" |
| 4 | `이번 달 얼마 썼어?` | 카테고리별 지출 현황 목록 |

### 확인 포인트
- [ ] 자연어에서 카테고리, 금액 정확히 파싱
- [ ] 월별 누적 금액 정상 계산
- [ ] 한국어 응답, 친근한 톤

---

## 2. 예산 관리 (Phase 2C)

| 순서 | Telegram 메시지 | 기대 응답 |
|------|-----------------|-----------|
| 5 | `식비 예산 30만원으로 설정해줘` | "식비 월 예산을 300,000원으로 설정했어요" |
| 6 | `교통 예산 10만원 설정` | "교통 월 예산을 100,000원으로 설정했어요" |
| 7 | `예산 현황 보여줘` | 카테고리별 사용률 (%) 표시 |
| 8 | `점심 뷔페 25만원` | 식비 기록 + **예산 80% 이상 경고** |
| 9 | `커피 5만원` | 식비 기록 + **예산 초과 경고** (100% 이상) |

### 확인 포인트
- [ ] 예산 설정이 profiles.preferences JSONB에 저장됨
- [ ] 예산 현황 조회 시 사용률(%) 표시
- [ ] 지출 기록 시 80% 이상이면 주의 경고
- [ ] 지출 기록 시 100% 초과하면 초과 경고

---

## 3. 일상 기록 (Phase 2C)

| 순서 | Telegram 메시지 | 기대 응답 |
|------|-----------------|-----------|
| 10 | `오늘 회의가 너무 길었어` | "일상 기록을 저장했어요" |
| 11 | `날씨가 좋아서 산책했다` | "일상 기록을 저장했어요" |
| 12 | `요즘 피곤해` | "일상 기록을 저장했어요 (감정: ...)" |

### 확인 포인트
- [ ] daily_logs 테이블에 content + embedding 저장
- [ ] 감정(sentiment) 분석 결과 포함 (감정 지정 시)

---

## 4. 메모리/RAG 검색 (Phase 2B)

> 3번(일상 기록) 테스트 이후에 진행해야 검색할 데이터가 있습니다.

| 순서 | Telegram 메시지 | 기대 응답 |
|------|-----------------|-----------|
| 13 | `내가 최근에 뭐했었지?` | 저장된 일상 기록 기반 응답 (회의, 산책 등) |
| 14 | `지난번에 뭐 먹었어?` | 식비 기록 + 일상 기록 맥락 활용 |

### 확인 포인트
- [ ] retrieve_memory tool이 호출됨
- [ ] pgvector 유사도 검색으로 관련 기록 반환
- [ ] 과거 맥락을 자연스럽게 응답에 포함

---

## 5. 멀티모달 (Phase 2D)

| 순서 | Telegram 동작 | 기대 응답 |
|------|---------------|-----------|
| 15 | **사진** 전송 (아무 사진) | 이미지 분석 결과 설명 |
| 16 | **영수증 사진** + 캡션 `이거 기록해줘` | 영수증 인식 + 가계부 기록 |
| 17 | **PDF 문서** 전송 | "문서 처리했어요. 추출된 텍스트: N자, 섹션: N개" |
| 18 | **음성 메시지** 전송 | "음성 인식 결과: (변환된 텍스트)" |

### 확인 포인트
- [ ] Gateway가 Telegram API로 파일 다운로드 → file_url 생성
- [ ] 이미지: Gemini Vision으로 분석
- [ ] PDF: 텍스트 추출 → 청킹 → 벡터 DB 저장
- [ ] 음성: STT 변환 결과 표시

---

## 6. 종합 시나리오

하나의 대화 세션에서 여러 기능을 연속으로 테스트합니다.

```
사용자: 식비 예산 50만원 설정해줘
봇:     식비 월 예산을 500,000원으로 설정했어요.

사용자: 오늘 회식 8만원
봇:     식비 80,000원 기록했어요. 이번 달 식비 누적: 80,000원

사용자: 커피 5천원
봇:     식비 5,000원 기록했어요. 이번 달 식비 누적: 85,000원

사용자: 오늘 회식이 즐거웠어
봇:     일상 기록을 저장했어요.

사용자: 이번 달 식비 얼마나 썼어?
봇:     이번 달 식비 총 지출: 85,000원

사용자: 예산 현황 알려줘
봇:     식비: 85,000원 / 500,000원 (17%)

사용자: (영수증 사진 전송)
봇:     (이미지 분석 결과)

사용자: 내가 이번 주에 뭐 먹었는지 알려줘
봇:     (메모리 검색 → 회식, 커피 등 맥락 활용 응답)
```

---

## 7. HTTP API 테스트 (Telegram 없이)

Telegram 없이 HTTP API로 직접 테스트할 수도 있습니다.

```bash
# 텍스트 메시지
curl -X POST http://localhost:8080/api/v1/chat \
  -H 'Content-Type: application/json' \
  -d '{"user_id": "test-user", "message": "점심 만원"}'

# 응답 예시
# {"content":"식비 10,000원 기록했어요. 이번 달 식비 누적: 10,000원","type":"TEXT"}
```

---

## 트러블슈팅

### 대화 이력 깨짐 (INVALID_CHAT_HISTORY)

tool call 실패로 대화 이력이 깨진 경우:

```bash
# 특정 유저의 checkpoint 초기화
PGPASSWORD=admin psql -h localhost -U postgres -d jiki -c "
DELETE FROM checkpoint_writes WHERE thread_id = 'USER_TELEGRAM_ID';
DELETE FROM checkpoint_blobs WHERE thread_id = 'USER_TELEGRAM_ID';
DELETE FROM checkpoints WHERE thread_id = 'USER_TELEGRAM_ID';
"
```

> 서버에 자동 복구 로직이 있어 대부분 자동으로 처리됩니다.

### 임베딩 모델 에러 (404 NOT_FOUND)

`text-embedding-004` 모델 사용 불가 시 `embedding/service.py`에서 모델명 확인:

```python
EMBEDDING_MODEL = "gemini-embedding-001"  # 현재 사용 가능한 모델
```

### Agent 연결 실패

```bash
# Agent가 실행 중인지 확인
curl -v telnet://localhost:50051

# Gateway 로그에서 gRPC 연결 상태 확인
# "gRPC client connection configured" 메시지 확인
```
