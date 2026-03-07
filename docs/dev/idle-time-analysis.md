# 유휴 시간 대화 분석, 자동 패턴 발견, 메모리 압축

## 개요

사용자가 대화를 마치고 떠난 뒤(유휴 상태), 봇이 백그라운드에서 오늘 대화를 분석하여 인사이트를 추출하고, 기존 패턴 분석에 이 인사이트를 활용하며, 오래된 일기 데이터를 주간 요약으로 압축하여 저장 공간을 절약한다.

**문제**: 대화 중 축적된 맥락이 활용되지 않고, 오래된 daily_log가 무한히 쌓임

**해결**: Go Activity Tracker 기반 유휴 감지 → 3개 백그라운드 스케줄러 작업

---

## 아키텍처

```
Go Scheduler (새 규칙 2개 + 기존 1개 강화)
  │
  ├─ */10 * * * *  runConversationAnalysisRule()
  │   ├─ tracker.ActiveUsers() → 유휴 30분~2시간 감지
  │   ├─ 중복 분석 방지 (analysisStates map)
  │   └─ gRPC GenerateReport(type="conversation_analysis")
  │       → Python: 오늘 daily_logs → LLM → knowledge_base 저장
  │
  ├─ 0 6 * * *    runPatternAnalysisRule() [기존 — 강화]
  │   └─ 기존 spending 데이터 + conversation:analysis:* 인사이트 활용
  │
  └─ 0 5 * * 1    runMemoryCompactionRule() [새]
      ├─ getActiveUsers() → 전체 활성 사용자
      └─ gRPC GenerateReport(type="memory_compaction")
          → Python: 30일+ daily_logs → 주간 요약 → knowledge_base 저장 → 원본 삭제
```

### 유휴 감지 흐름

```
사용자: "오늘 점심 만원" (메시지 전송)
  │
  ├─ bot.go: tracker.RecordMessage(userID)  ← lastMessage[userID] = now
  │
  ├─ ... (대화 계속) ...
  │
  ├─ 사용자 떠남 (30분 경과)
  │
  ▼
Scheduler: runConversationAnalysisRule() (매 10분)
  │
  ├─ tracker.ActiveUsers() → {userID: lastMsgTime}
  ├─ idle = now - lastMsgTime = 35분 ✓ (30분~2시간 범위)
  ├─ isQuietHours() = false ✓
  ├─ analysisStates[userID] ≠ lastMsgTime ✓ (새 세션)
  │
  ├─ gRPC GenerateReport(type="conversation_analysis")
  │   └─ Python: 오늘 daily_logs 분석 → knowledge_base 저장
  │
  └─ analysisStates[userID] = lastMsgTime (중복 방지)
```

---

## 핵심 설계 결정

| 결정 | 선택 | 이유 |
|------|------|------|
| 유휴 감지 방식 | Go Activity Tracker `ActiveUsers()` | 이미 in-memory 추적 중. DB 쿼리 없이 효율적 |
| 유휴 시간 범위 | 30분~2시간 | 30분 미만은 아직 대화 중일 수 있고, 2시간 초과는 오래된 세션 |
| 중복 방지 | `analysisStates[userID] = lastMsgTime` | 같은 유휴 세션 재분석 방지. 새 메시지 시 자동 리셋 |
| 대화 분석 결과 | knowledge_base에 저장 (사용자에게 전송 안 함) | 백그라운드 인사이트. 향후 패턴/대화에서 활용 |
| 메모리 압축 전략 | 요약 먼저 저장 → 원본 삭제 | 안전성 우선. LLM/파싱 실패 시 즉시 중단 |
| Proto 변경 | 없음 | 기존 `GenerateReport(report_type)` 재사용 |

---

## 변경 파일 목록

### New Files

| File | Description |
|------|-------------|
| `agent/src/jiki_agent/tools/conversation.py` | 대화 분석 핸들러 (`analyze_conversation()`) |
| `agent/src/jiki_agent/tools/compaction.py` | 메모리 압축 핸들러 (`compact_memory()`) |

### Modified Files

| File | Changes |
|------|---------|
| `gateway/internal/activity/tracker.go` | `ActiveUsers()` 메서드 추가 |
| `agent/src/jiki_agent/db/repositories/daily_log.py` | `get_by_date_range()`, `delete_by_ids()` 추가 |
| `gateway/internal/scheduler/cron.go` | `tracker`, `analysisMu`, `analysisStates` 필드 + 2개 cron job 추가 |
| `gateway/internal/scheduler/rules.go` | `runConversationAnalysisRule()`, `runMemoryCompactionRule()` 추가 |
| `agent/src/jiki_agent/grpc/server.py` | `conversation_analysis`, `memory_compaction` 라우팅 추가 |
| `agent/src/jiki_agent/tools/pattern.py` | `analyze_patterns()`에 대화 인사이트 연동 |

### 변경 없는 파일

`proto/*`, `graph/agent.py`, `memory/*`, `tools/goal.py`, `tools/report.py`

---

## 구현 상세

### 1. Feature 1 — 대화 분석 (Conversation Analysis)

#### Go — 유휴 감지 + 스케줄링

`gateway/internal/activity/tracker.go`에 `ActiveUsers()` 추가:
- 모든 추적 중인 사용자의 `map[telegramID]lastMsgTime` 스냅샷 반환
- RLock 사용 후 복사본 반환 → 호출자가 안전하게 순회 가능

`gateway/internal/scheduler/cron.go`에 Scheduler 확장:
- `tracker *activity.Tracker` — 유휴 감지를 위한 직접 참조
- `analysisMu sync.RWMutex` + `analysisStates map[string]time.Time` — 중복 분석 방지

`gateway/internal/scheduler/rules.go`에 `runConversationAnalysisRule()`:
- 매 10분 실행 (`*/10 * * * *`)
- `tracker.ActiveUsers()` → 유휴 30분~2시간 필터
- `isQuietHours()` 체크 (22:00~08:00 KST 제외)
- `analysisStates` 중복 체크 → 같은 `lastMsgTime`이면 스킵
- `grpcClient.GenerateReport(type="conversation_analysis")` 호출
- 백그라운드 전용: 사용자에게 메시지 전송 안 함, fatigue 미적용

#### Python — 대화 분석 핸들러

`agent/src/jiki_agent/tools/conversation.py`:

**이벤트 흐름**:

| 단계 | 동작 |
|------|------|
| 1 | `daily_log_repo.get_by_date_range(오늘 00:00 ~ now)` |
| 2 | 최소 2건 이상 확인 |
| 3 | LLM (Gemini)에 구조화된 분석 요청 |
| 4 | JSON 파싱 → `knowledge_base`에 저장 |

**인사이트 타입**:

| Type | 설명 | 예시 |
|------|------|------|
| `spending_intent` | 지출 의향/구매 계획 | "노트북 사려고 고민 중" |
| `emotional_state` | 감정/스트레스 변화 | "회사 스트레스로 지침" |
| `key_decision` | 재정 관련 중요 결정 | "저축 늘리기로 결심" |
| `life_event` | 생활 이벤트 | "이사 예정" |
| `financial_concern` | 재정 걱정/불안 | "이번 달 지출이 너무 많아" |

**knowledge_base 저장 형식**:
- Key: `conversation:analysis:2026-03-02`
- Value: JSON (`insights`, `overall_mood`, `topics`)
- Source: `conversation_analyzer`

### 2. Feature 2 — 패턴 분석 강화

`agent/src/jiki_agent/tools/pattern.py`의 `analyze_patterns()` 수정:

- `knowledge_repo.get_by_key_prefix("conversation:analysis:")` — 최근 대화 인사이트 조회
- `_build_analysis_data()`에 `[대화 분석 인사이트 (최근)]` 섹션 추가
- 최근 7일 인사이트, 인사이트당 최대 3개 표시

**강화 효과**: LLM이 spending 데이터와 대화 인사이트를 교차 분석하여 더 깊은 패턴 감지 가능
- "스트레스 받을 때 충동 지출 증가" (emotional_state + spending_velocity)
- "이사 예정 → 큰 지출 대비 필요" (life_event + financial_concern)

### 3. Feature 3 — 메모리 압축 (Memory Compaction)

#### Go — 스케줄링

`gateway/internal/scheduler/rules.go`에 `runMemoryCompactionRule()`:
- 매주 월요일 05:00 KST 실행 (`0 5 * * 1`)
- `getActiveUsers()` → 전체 활성 사용자
- `grpcClient.GenerateReport(type="memory_compaction")` 호출
- 300초 타임아웃 (LLM 다수 호출 + DB 작업)

#### Python — 메모리 압축 핸들러

`agent/src/jiki_agent/tools/compaction.py`:

**안전 프로토콜**:

```
1. daily_logs 조회 (30일+ 오래된 것)
   ↓
2. ISO 주차별 그룹화 (YYYY-Www)
   ↓
3. 각 주에 대해 LLM 요약
   ├─ 실패 시 → 즉시 중단 (삭제 안 함)
   └─ 성공 시 → 계속
   ↓
4. 모든 요약을 knowledge_base에 저장
   ├─ embedding 생성 (시맨틱 검색 가능)
   └─ delete_by_key + upsert (멱등성)
   ↓
5. 원본 daily_logs 삭제 (모든 요약 저장 완료 후에만)
   └─ delete_by_ids(user_id, ids) — user_id 안전 가드
```

**knowledge_base 저장 형식**:
- Key: `memory:weekly_summary:2026-W05`
- Value: JSON (`week`, `summary`, `key_events`, `emotional_trend`, `financial_context`, `topics`)
- Source: `memory_compactor`
- Embedding: 768-dim vector (시맨틱 검색 가능)

---

## Cron 일정 (변경 후)

```
*/10 * * * *    conversation_analysis   ← NEW (유휴 감지 + 대화 분석)
*/15 * * * *    user_schedules
0 * * * *       budget_warning
0 */3 * * *     spending_anomaly
0 5 * * 1       memory_compaction       ← NEW (주간 메모리 압축)
0 6 * * *       pattern_analysis        ← ENHANCED (대화 인사이트 연동)
0 7 * * *       goal_evaluation
0 9 * * 1       weekly_report
0 12 * * 3      goal_status
0 14 * * *      pattern_insight
0 20 * * *      inactive_reminder
0 21 * * *      daily_summary
0 21 28-31 * *  monthly_closing
```

---

## Before vs After

| 항목 | Before | After |
|------|--------|-------|
| 대화 후 분석 | 없음 | 유휴 30분 감지 → LLM 인사이트 추출 |
| 패턴 분석 입력 | spending 데이터 + daily_log 감정만 | + 대화 인사이트 (의향, 결정, 이벤트) |
| daily_log 저장 | 무한 누적 | 30일+ 데이터 → 주간 요약으로 압축 |
| 압축된 메모리 검색 | - | embedding 포함 → 시맨틱 검색 가능 |
| 새 Python 의존성 | - | 없음 (기존 LangChain/Gemini 재사용) |
| Proto 변경 | - | 없음 (기존 GenerateReport 재사용) |

---

## 검증 방법

### 1. 빌드 확인

```bash
# Go
cd gateway && go build ./cmd/gateway && go vet ./...

# Python
cd agent && uv run python -c "
from jiki_agent.tools.conversation import analyze_conversation
from jiki_agent.tools.compaction import compact_memory
print('OK')
"
```

### 2. 통합 테스트

테스트 시나리오:

- **대화 분석**: Telegram에서 메시지 2-3개 전송 → 30분 대기 → knowledge_base에 `conversation:analysis:YYYY-MM-DD` 키 확인
- **패턴 강화**: pattern_analysis 실행 후 대화 인사이트가 분석 데이터에 포함되는지 확인
- **메모리 압축**: 30일 이상 된 daily_log 존재 시 → 압축 실행 → `memory:weekly_summary:*` 생성 + 원본 삭제 확인
- **안전성**: LLM 에러 시 원본 삭제 안 되는지 확인
- **중복 방지**: 같은 유휴 세션에서 대화 분석이 1번만 실행되는지 확인

### 3. DB 확인

```sql
-- 대화 분석 인사이트 확인
SELECT key, value, created_at FROM knowledge_base
WHERE key LIKE 'conversation:analysis:%'
ORDER BY created_at DESC;

-- 주간 요약 확인
SELECT key, value, created_at FROM knowledge_base
WHERE key LIKE 'memory:weekly_summary:%'
ORDER BY key;

-- 압축 후 old daily_logs 삭제 확인
SELECT COUNT(*), MIN(created_at), MAX(created_at) FROM daily_logs
WHERE user_id = 'test_user';
```

---

**상태**: ✅ 구현 완료
**날짜**: 2026-03-02
