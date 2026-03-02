# OlyOwl Proactive Agent 설계

## 현재 vs 목표

| | 현재 (Reactive) | 목표 (Proactive) |
|---|---|---|
| **트리거** | 사용자 메시지 | 시간, 데이터 변화, 외부 이벤트 |
| **동작** | 질문 → 응답 | 스스로 판단 → 먼저 알림/실행 |
| **오프라인** | 아무것도 안 함 | 백그라운드 모니터링 + 분석 |
| **예측** | 없음 | 패턴 학습 → 선제 제안 |

---

## 구현 로드맵

### Level 1: Rule-Based Proactive (규칙 기반)

사용자 데이터를 기반으로 미리 정해둔 규칙에 따라 알림을 보내는 단계.

```
예시:
- "오늘 식비 3건 연속 지출 → 오늘 식비를 많이 쓰고 있어요"
- "이번 달 예산 90% 도달 → 예산 거의 다 썼어요"
- "3일간 기록 없음 → 요즘 어떻게 지내세요?"
- "매일 같은 시간에 커피 기록 → 오늘도 커피 한 잔 하셨나요?"
- "월말 접근 → 이번 달 지출 요약 미리 보내기"
```

**구현**: Go Scheduler에 규칙 엔진 추가. DB 쿼리 기반 조건 체크 → Telegram 발송.

**난이도**: 낮음. 현재 아키텍처로 충분.

### Level 2: Pattern-Learning Proactive (패턴 학습)

사용자의 행동 패턴을 학습해서 개인화된 타이밍에 개인화된 내용을 제안하는 단계.

```
예시:
- 매주 금요일 저녁에 외식 패턴 감지 → 금요일 오후 "오늘 외식 예산 남은 금액 알려드릴까요?"
- 월초에 구독료 결제 패턴 → "이번 달 구독료 정리해드릴까요?"
- 감정 패턴 분석 → 스트레스 지표 증가 시 "요즘 좀 힘드신 것 같아요. 괜찮으세요?"
- 지출 이상 탐지 → 평소 대비 200% 초과 시 알림
```

**구현**: Go Scheduler가 주기적으로 gRPC를 통해 Python Agent에 분석 요청. LLM이 패턴을 감지하고 `knowledge_base`에 JSON으로 저장. Go에서 트리거 조건을 매칭하여 알림 발송.

**상태**: ✅ 구현 완료

### Level 3: Autonomous Agent (자율 에이전트)

사용자가 목표(Goal)를 설정하면 에이전트가 스스로 계획을 세우고, 단계적으로 실행하며, 진행 상황을 보고하는 단계.

```
예시:
- "이번 달 식비 30만원 이내로 관리해줘"
  → 에이전트가 매일 지출 모니터링 → 페이스 조절 제안 → 위험 시 경고
  → 월말에 성공/실패 리포트

- "여행 자금 100만원 모으고 싶어"
  → 현재 지출 분석 → 절약 가능 항목 제안 → 매주 진행률 보고

- "건강한 식습관 만들고 싶어"
  → 식비 카테고리 세분화 제안 → 배달 vs 직접 조리 비율 추적 → 개선 제안
```

**구현**: 채팅 도구로 목표 설정 → knowledge_base에 저장 → 매일 LLM 평가 → 매주 수요일 진행률 알림.

**상태**: ✅ 구현 완료

---

## 아키텍처

```
현재:
  User Message → Gateway → Agent → Response → User

목표:
  User Message → Gateway → Agent → Response → User
                    ↑
  Background Worker ─┘ (주기적으로 스스로 Agent 호출)
       │
       ├─ Rule Engine (Level 1)
       ├─ Pattern Analyzer (Level 2)
       └─ Goal Executor (Level 3)
```

### 핵심 컴포넌트

1. **Event Queue**: 데이터 변경 이벤트를 감지하는 트리거 시스템
2. **Rule Engine**: 조건 충족 시 알림/실행 결정
3. **Notification Priority**: 알림 피로도 관리 (하루 최대 N건, 중요도 기반 필터링)

---

## Level 1 상세 설계

### 규칙 목록

| Rule | 트리거 | 조건 | 메시지 |
|------|--------|------|--------|
| budget_warning | 매 시간 | 예산 사용률 >= 90% | "예산 거의 다 썼어요" |
| daily_summary | 매일 21:00 | 오늘 지출 기록 존재 | "오늘 하루 정리" |
| inactive_reminder | 매일 20:00 | 3일간 기록 없음 | "요즘 어떻게 지내세요?" |
| monthly_closing | 매월 마지막날 | 해당 월 기록 존재 | "이번 달 마감 요약" |
| weekly_report | 매주 월 09:00 | 해당 주 기록 존재 | "주간 리포트" |

### 알림 피로도 관리

- 하루 최대 3건 프로액티브 알림
- 사용자가 최근 1시간 내 대화 중이면 알림 보류
- 야간 시간(22:00~08:00)에는 알림 금지
- `profiles.preferences`에 알림 on/off 설정

---

## Level 1 구현 상세

### 상태: ✅ 구현 완료

### 아키텍처

```
Telegram User
     ↑ (SendMessage)
     │
Go Gateway
├── telegram/bot.go
│   └── handleMessage() → tracker.RecordMessage(userID)
│
├── activity/tracker.go          ← Bot이 쓰고, Scheduler가 읽음
│   ├── RecordMessage(userID)
│   └── LastMessageTime(userID)
│
├── scheduler/
│   ├── cron.go                  ← 5개 cron job 등록
│   ├── rules.go                 ← 4개 규칙 평가 로직
│   ├── fatigue.go               ← 알림 피로도 관리
│   └── queries.go               ← 규칙 조건 체크 SQL
│
│                    gRPC (GenerateReport)
│                    ↓
Python Agent
├── grpc/server.py               ← report_type 라우팅
└── tools/report.py              ← weekly / daily_summary / monthly_closing 생성
```

### Cron 스케줄 (KST)

| Rule | Cron Expression | 시간 | 조건 체크 | 메시지 유형 |
|------|----------------|------|----------|------------|
| `weekly_report` | `0 9 * * 1` | 매주 월 09:00 | 최근 30일 활동 사용자 | LLM 생성 (gRPC) |
| `budget_warning` | `0 * * * *` | 매시간 | 카테고리별 예산 >= 90% | 템플릿 |
| `daily_summary` | `0 21 * * *` | 매일 21:00 | 오늘 지출 기록 존재 | LLM 생성 (gRPC) |
| `inactive_reminder` | `0 20 * * *` | 매일 20:00 | 3일간 기록 없음 | 템플릿 |
| `monthly_closing` | `0 21 28-31 * *` | 28~31일 21:00 | 월말 + 이번달 기록 존재 | LLM 생성 (gRPC) |

### 규칙 동작 흐름

#### 1. Budget Warning (예산 경고)

```
매시간 실행
  → getBudgetUsers(): budget 설정이 있는 사용자 조회
  → getCategorySpending(): 이번 달 카테고리별 지출 합계
  → 각 카테고리에 대해 사용률 계산
  → >= 90% 인 카테고리가 있으면 템플릿 메시지 생성
  → fatigue 체크 후 발송
```

**메시지 예시:**
```
⚠️ 예산 알림

식비 예산을 거의 다 사용했어요!
사용: 270,000원 / 300,000원 (90%)
남은 금액: 30,000원
```

#### 2. Daily Summary (일간 요약)

```
매일 21:00 KST 실행
  → getUsersWithRecordsToday(): 오늘 기록이 있는 사용자 조회
  → fatigue 체크
  → gRPC GenerateReport(report_type="daily_summary")
  → LLM이 오늘 지출 + 예산 현황으로 자연어 요약 생성
  → Telegram 발송
```

#### 3. Inactive Reminder (비활성 리마인더)

```
매일 20:00 KST 실행
  → getInactiveUsers(): 기록 있지만 최근 3일간 활동 없는 사용자
  → fatigue 체크 후 템플릿 메시지 발송
```

**메시지 예시:**
```
👋 요즘 어떻게 지내세요?

기록을 남기신 지 좀 됐어요.
간단하게라도 오늘 지출을 기록해 보는 건 어때요?
```

#### 4. Monthly Closing (월말 마감)

```
매달 28~31일 21:00 KST 실행
  → isLastDayOfMonth() 체크 (실제 월말인지 확인)
  → getUsersWithRecordsThisMonth(): 이번 달 기록이 있는 사용자
  → fatigue 체크
  → gRPC GenerateReport(report_type="monthly_closing")
  → LLM이 월간 지출 + 예산 대비 + 전월 비교로 마감 요약 생성
  → Telegram 발송
```

### 알림 피로도 관리 구현

`scheduler/fatigue.go`에서 4단계 체크:

```
canNotify(telegramID, preferences) → bool

1. notificationsEnabled(preferences)
   → profiles.preferences.notifications.enabled 확인
   → 기본값: true (opt-out 모델)
   → {"notifications": {"enabled": false}} 로 비활성화

2. isQuietHours()
   → KST 기준 22:00~08:00 차단

3. isRecentConversation(telegramID)
   → activity.Tracker에서 마지막 메시지 시간 조회
   → 1시간 이내 대화 중이면 알림 보류

4. dailyCount < 3
   → 인메모리 카운터 (날짜 변경 시 자동 리셋)
   → 하루 최대 3건 제한
```

### Activity Tracker

Bot과 Scheduler 간 대화 상태를 공유하는 컴포넌트:

```go
// Bot (쓰기)
func (b *Bot) handleMessage(...) {
    b.tracker.RecordMessage(userID) // 메시지 수신 시 기록
}

// Scheduler (읽기)
func (fm *fatigueManager) isRecentConversation(telegramID string) bool {
    lastMsg, ok := fm.tracker.LastMessageTime(telegramID)
    return ok && time.Since(lastMsg) < 1*time.Hour
}
```

### 파일 구조

```
gateway/internal/
├── activity/
│   └── tracker.go              # 사용자 활동 추적 (Bot ↔ Scheduler 공유)
├── scheduler/
│   ├── cron.go                 # Scheduler 구조체, cron job 등록, Start/Stop
│   ├── rules.go                # 4개 규칙 평가 로직 + 헬퍼 함수
│   ├── fatigue.go              # 알림 피로도 관리 (일 3건, 야간 금지, 대화 보류)
│   └── queries.go              # DB 쿼리 (예산 사용자, 카테고리 지출, 비활성 사용자 등)
└── telegram/
    └── bot.go                  # RecordMessage() 호출 추가

agent/src/jiki_agent/
├── tools/report.py             # generate_daily_summary(), generate_monthly_closing() 추가
└── grpc/server.py              # report_type 분기: daily_summary, monthly_closing
```

### gRPC 연동

기존 `GenerateReport` RPC를 재사용. `report_type` 필드로 분기:

| report_type | Python 함수 | 용도 |
|-------------|-------------|------|
| `"weekly"` | `generate_weekly_report()` | 주간 리포트 |
| `"daily_summary"` | `generate_daily_summary()` | 일간 요약 |
| `"monthly_closing"` | `generate_monthly_closing()` | 월말 마감 |

proto 변경 없이 기존 `ReportRequest.report_type` string 필드 활용.

### 수동 테스트

```bash
# Daily summary 테스트
curl -X POST http://localhost:8080/api/v1/report \
  -H 'Content-Type: application/json' \
  -d '{"user_id": "USER_ID", "report_type": "daily_summary"}'

# Monthly closing 테스트
curl -X POST http://localhost:8080/api/v1/report \
  -H 'Content-Type: application/json' \
  -d '{"user_id": "USER_ID", "report_type": "monthly_closing"}'

# Weekly report 테스트 (기존)
curl -X POST http://localhost:8080/api/v1/report \
  -H 'Content-Type: application/json' \
  -d '{"user_id": "USER_ID", "report_type": "weekly"}'
```

### 사용자 알림 설정

`profiles.preferences` JSONB에 저장:

```json
{
  "budget": {
    "식비": 300000,
    "교통": 100000
  },
  "notifications": {
    "enabled": true
  }
}
```

알림 끄기: `{"notifications": {"enabled": false}}` 설정 시 모든 프로액티브 알림 차단.

---

## Level 2 구현 상세

### 상태: ✅ 구현 완료

### 아키텍처

```
Daily 06:00 KST                     Every 3h                      Daily 14:00 KST
     |                                   |                              |
runPatternAnalysis()            runSpendingAnomaly()          runPatternInsight()
     |                                   |                              |
     | gRPC: "pattern_analysis"     Pure SQL (Go)                  SQL: read
     v                                   |                       knowledge_base
Python: analyze_patterns()               v                              |
  - 60일 지출 데이터 수집          오늘 총지출 vs                  오늘 트리거 매칭?
  - daily_logs 감정 분석            30일 일평균                        |
  - LLM → JSON 패턴 추출           > 200% ?                     YES → gRPC
  - knowledge_base 저장                  |                    "pattern_insight"
  (사용자에게 발송 안 함)          YES → 템플릿 알림                    |
                                                               Python: LLM 생성
                                                               → Telegram 발송
```

### Cron 스케줄 (KST)

| Rule | Cron Expression | 시간 | 동작 | 메시지 유형 |
|------|----------------|------|------|------------|
| `pattern_analysis` | `0 6 * * *` | 매일 06:00 | 사용자별 패턴 분석 → knowledge_base 저장 | 발송 안 함 |
| `spending_anomaly` | `0 */3 * * *` | 매 3시간 | 오늘 지출 vs 30일 평균, 200% 초과 시 알림 | 템플릿 |
| `pattern_insight` | `0 14 * * *` | 매일 14:00 | 저장된 패턴 트리거 매칭 → 맞춤 알림 | LLM 생성 (gRPC) |

### 패턴 분석 동작 흐름

#### 1. Pattern Analysis (패턴 분석) — 06:00 KST

```
매일 06:00 실행
  → getActiveUsers(): 최근 30일 활동 사용자 조회
  → 각 사용자에 대해 gRPC GenerateReport(report_type="pattern_analysis")
  → Python analyze_patterns():
      - finance_repo.get_daily_totals(30일) — 일별 지출 추이
      - finance_repo.get_weekday_spending(60일) — 요일별 패턴
      - finance_repo.get_recent(100건) — 최근 거래 내역
      - finance_repo.get_monthly_summary() — 이번 달 카테고리별
      - daily_log_repo.get_recent(30건) — 감정/일기 데이터
  → 7일 미만 데이터면 건너뜀
  → LLM에 구조화 JSON 응답 요구 → 패턴 감지
  → knowledge_base에 저장 (key: "pattern:analysis_result")
  → 사용자에게 발송하지 않음 (분석 결과만 저장)
```

#### 2. Spending Anomaly (지출 이상 탐지) — 매 3시간

```
매 3시간 실행
  → getUsersWithRecordsToday(): 오늘 기록이 있는 사용자
  → getDailySpendingStats(): 오늘 총 지출 + 30일 일평균
  → 7일 미만 데이터면 건너뜀
  → 오늘 지출 / 30일 평균 >= 200% 이면 알림
  → fatigue 체크 후 템플릿 메시지 발송
```

**메시지 예시:**
```
⚠️ 지출 이상 감지

오늘 총 지출: 150,000원
최근 30일 일평균: 45,000원 (333%)

평소보다 많이 사용하고 있어요. 한번 확인해 보세요!
```

#### 3. Pattern Insight (패턴 인사이트) — 14:00 KST

```
매일 14:00 실행
  → getActiveUsers(): 활동 사용자 조회
  → getStoredPatterns(): knowledge_base에서 패턴 JSON 읽기
  → parsePatterns(): JSON → Go 구조체 파싱
  → triggeredPatterns(): 오늘 날짜/요일과 트리거 조건 매칭
  → 매칭된 패턴이 있으면 gRPC GenerateReport(report_type="pattern_insight")
  → Python generate_pattern_insight():
      - 저장된 패턴 + 오늘 지출 + 예산 현황 조합
      - LLM이 친근한 맞춤 알림 메시지 생성
  → fatigue 체크 후 Telegram 발송
```

### 패턴 저장 형식

`knowledge_base` 테이블에 JSON으로 저장 (새 테이블 불필요):

```json
{
  "key": "pattern:analysis_result",
  "value": {
    "patterns": [
      {
        "type": "day_of_week_spending",
        "description": "금요일마다 외식에 평균 25,000원을 사용하는 패턴이 있어요",
        "trigger": { "day_of_week": "friday" },
        "category": "외식",
        "confidence": 0.85
      },
      {
        "type": "recurring_payment",
        "description": "매월 1~5일에 구독료 결제가 반복돼요",
        "trigger": { "day_of_month_from": 1, "day_of_month_to": 5 },
        "category": "구독",
        "confidence": 0.92
      },
      {
        "type": "spending_velocity",
        "description": "최근 1주일 지출 속도가 평소보다 빠르게 증가하고 있어요",
        "trigger": { "always": true },
        "confidence": 0.73
      }
    ]
  }
}
```

### 패턴 유형

| Type | 설명 | 트리거 조건 |
|------|------|------------|
| `day_of_week_spending` | 특정 요일 반복 지출 | `day_of_week` 매칭 |
| `recurring_payment` | 매월 특정 기간 반복 결제 | `day_of_month_from`~`to` 매칭 |
| `spending_velocity` | 지출 속도 변화 | `always: true` |
| `emotional_trend` | 감정/스트레스 패턴 변화 | `always: true` |

### Go 트리거 매칭 로직

`scheduler/patterns.go`에서 트리거 조건 평가:

```go
func (t patternTrigger) shouldTrigger(now time.Time) bool {
    if t.Always { return true }
    if t.DayOfWeek != "" {
        wd, ok := parseDayOfWeek(t.DayOfWeek)
        if ok && now.Weekday() == wd { return true }
    }
    if t.DayOfMonthFrom > 0 && t.DayOfMonthTo > 0 {
        day := now.Day()
        if day >= t.DayOfMonthFrom && day <= t.DayOfMonthTo { return true }
    }
    return false
}
```

### 파일 구조

```
gateway/internal/scheduler/
├── cron.go                 # 8개 cron job 등록 (Level 1: 5개 + Level 2: 3개)
├── rules.go                # 7개 규칙 평가 로직 (Level 1: 4개 + Level 2: 3개)
├── patterns.go             # 패턴 JSON 파싱 + 트리거 매칭 로직 (NEW)
├── fatigue.go              # 알림 피로도 관리 (Level 1/2 공유)
└── queries.go              # SQL 쿼리 (Level 1 + Level 2 추가)

agent/src/jiki_agent/
├── tools/
│   ├── report.py           # weekly, daily_summary, monthly_closing
│   └── pattern.py          # analyze_patterns(), generate_pattern_insight() (NEW)
├── db/repositories/
│   ├── finance.py          # get_daily_totals(), get_weekday_spending() 추가
│   └── knowledge.py        # delete_by_key() 추가
└── grpc/server.py          # pattern_analysis, pattern_insight 라우팅 추가
```

### gRPC 연동

기존 `GenerateReport` RPC 재사용. `report_type` 필드로 분기:

| report_type | Python 함수 | 용도 |
|-------------|-------------|------|
| `"weekly"` | `generate_weekly_report()` | 주간 리포트 |
| `"daily_summary"` | `generate_daily_summary()` | 일간 요약 |
| `"monthly_closing"` | `generate_monthly_closing()` | 월말 마감 |
| `"pattern_analysis"` | `analyze_patterns()` | 패턴 분석 (저장만) |
| `"pattern_insight"` | `generate_pattern_insight()` | 패턴 인사이트 (발송) |

### 수동 테스트

```bash
# 패턴 분석 실행 (knowledge_base에 저장, 사용자에게 발송 안 함)
curl -X POST http://localhost:8080/api/v1/report \
  -H 'Content-Type: application/json' \
  -d '{"user_id": "USER_ID", "report_type": "pattern_analysis"}'

# 패턴 인사이트 생성 (Telegram 발송)
curl -X POST http://localhost:8080/api/v1/report \
  -H 'Content-Type: application/json' \
  -d '{"user_id": "USER_ID", "report_type": "pattern_insight"}'
```

### 데이터 요구사항

- **최소 7일** 이상의 지출 기록이 있어야 패턴 분석 실행
- **이상 탐지**: 최근 30일 일평균 대비 200% 초과 시 알림
- **패턴 갱신**: 매일 06:00에 새로 분석하여 기존 결과 교체
- **피로도 관리**: Level 1 + Level 2 알림 합산하여 하루 3건 제한

---

## Level 3 구현 상세

### 상태: ✅ 구현 완료

### 아키텍처

```
User Chat                      Daily 07:00 KST              Wednesday 12:00 KST
     |                              |                              |
"식비 30만원 관리해줘"      runGoalEvaluationRule()       runGoalStatusRule()
     |                              |                              |
set_goal tool                 getUsersWithGoals()          getUsersWithGoals()
     |                              |                              |
knowledge_base 저장           gRPC: "goal_evaluate"        sendGeneratedNotification
(key: "goal:a1b2c3d4")             |                       gRPC: "goal_status"
                                   v                              |
                            Python: evaluate_goals()              v
                              - 활성 목표 읽기              Python: generate_goal_status()
                              - 지출 데이터 수집              - 목표 + 평가 결과 읽기
                              - LLM → JSON 평가              - LLM → 친근한 진행률 메시지
                              - last_evaluation 업데이트       → Telegram 발송
                              (사용자에게 발송 안 함)
```

### 채팅 도구

사용자가 채팅으로 목표를 관리할 수 있는 3개 도구가 LangGraph ReAct agent에 등록:

| Tool | 설명 | 예시 |
|------|------|------|
| `set_goal` | 목표 생성 | "이번 달 식비 30만원 이내로 관리해줘" |
| `get_goals` | 목표 조회 | "내 목표 보여줘" |
| `update_goal_status` | 목표 완료/취소 | "식비 목표 달성 완료!" |

활성 목표 최대 5개 제한.

### Cron 스케줄 (KST)

| Rule | Cron Expression | 시간 | 동작 | 메시지 유형 |
|------|----------------|------|------|------------|
| `goal_evaluation` | `0 7 * * *` | 매일 07:00 | 활성 목표 진행률 평가 → knowledge_base 업데이트 | 발송 안 함 |
| `goal_status` | `0 12 * * 3` | 매주 수 12:00 | 활성 목표 주간 진행률 리포트 | LLM 생성 (gRPC) |

### 목표 평가 동작 흐름

#### 1. Goal Evaluation (목표 평가) — 매일 07:00 KST

```
매일 07:00 실행
  → getUsersWithGoals(): knowledge_base에서 활성 목표가 있는 사용자 조회
  → 각 사용자에 대해 gRPC GenerateReport(report_type="goal_evaluate")
  → Python evaluate_goals():
      - knowledge_base에서 활성 목표 전체 읽기
      - 마감일 초과 시 expired로 변경
      - 목표별 관련 지출 데이터 수집
      - LLM에 구조화 JSON 평가 응답 요구
      - 각 목표의 last_evaluation 업데이트
  → 사용자에게 발송하지 않음 (평가 결과만 저장)
```

#### 2. Goal Status (목표 진행률) — 매주 수요일 12:00 KST

```
매주 수 12:00 실행
  → getUsersWithGoals(): 활성 목표 사용자 조회
  → fatigue 체크
  → gRPC GenerateReport(report_type="goal_status")
  → Python generate_goal_status():
      - 활성 목표 + last_evaluation 읽기
      - 이번 달 지출 + 예산 현황 조합
      - LLM이 코치 스타일의 주간 진행률 메시지 생성
  → Telegram 발송
```

### 목표 저장 형식

`knowledge_base` 테이블에 JSON으로 저장. key = `goal:{8자리-hex-id}`

```json
{
  "title": "이번 달 식비 30만원 이내로 관리",
  "type": "budget_limit",
  "target": {
    "category": "식비",
    "amount": 300000,
    "period": "monthly"
  },
  "status": "active",
  "created_at": "2026-03-01T10:30:00",
  "deadline": "2026-03-31T23:59:59",
  "last_evaluation": {
    "date": "2026-03-15",
    "progress_pct": 45,
    "summary": "15일 경과, 135,000원 사용. 목표 대비 45%.",
    "verdict": "on_track"
  }
}
```

### 목표 유형

| Type | 설명 | 예시 |
|------|------|------|
| `budget_limit` | 지출 제한 | "식비 30만원 이내" |
| `savings` | 저축 목표 | "여행 자금 100만원 모으기" |
| `habit` | 습관 개선 | "건강한 식습관 만들기" |

### 목표 상태

```
active → completed (사용자가 달성 처리)
active → cancelled (사용자가 취소)
active → expired   (마감일 초과, 평가 시 자동 변경)
```

### 평가 판정 기준

| Verdict | 설명 | 기준 |
|---------|------|------|
| `on_track` | 순조로움 | 현재 페이스로 달성 가능 |
| `warning` | 주의 | 목표 대비 70-90% 사용 |
| `critical` | 위험 | 목표 초과 임박/이미 초과 |
| `achieved` | 달성 | 목표 완료 |

### 파일 구조

```
gateway/internal/scheduler/
├── cron.go                 # 10개 cron job 등록 (L1: 5 + L2: 3 + L3: 2)
├── rules.go                # 9개 규칙 평가 로직 (L1: 4 + L2: 3 + L3: 2)
├── patterns.go             # 패턴 JSON 파싱 + 트리거 매칭 로직
├── fatigue.go              # 알림 피로도 관리 (전 레벨 공유)
└── queries.go              # SQL 쿼리 (L1 + L2 + L3 getUsersWithGoals 추가)

agent/src/jiki_agent/
├── tools/
│   ├── report.py           # weekly, daily_summary, monthly_closing
│   ├── pattern.py          # analyze_patterns(), generate_pattern_insight()
│   └── goal.py             # set_goal, get_goals, update_goal_status (도구)
│                           # evaluate_goals(), generate_goal_status() (리포트)
├── db/repositories/
│   ├── finance.py          # 지출 조회 쿼리
│   └── knowledge.py        # get_by_key_prefix() 추가
├── graph/agent.py          # goal 도구 등록 + 시스템 프롬프트 업데이트
└── grpc/server.py          # goal_evaluate, goal_status 라우팅 추가
```

### gRPC 연동

기존 `GenerateReport` RPC 재사용. 전체 `report_type` 목록:

| report_type | Python 함수 | 용도 | Level |
|-------------|-------------|------|-------|
| `"weekly"` | `generate_weekly_report()` | 주간 리포트 | L1 |
| `"daily_summary"` | `generate_daily_summary()` | 일간 요약 | L1 |
| `"monthly_closing"` | `generate_monthly_closing()` | 월말 마감 | L1 |
| `"pattern_analysis"` | `analyze_patterns()` | 패턴 분석 (저장만) | L2 |
| `"pattern_insight"` | `generate_pattern_insight()` | 패턴 인사이트 (발송) | L2 |
| `"goal_evaluate"` | `evaluate_goals()` | 목표 평가 (저장만) | L3 |
| `"goal_status"` | `generate_goal_status()` | 목표 진행률 (발송) | L3 |

### 수동 테스트

```bash
# 채팅으로 목표 설정
curl -X POST http://localhost:8080/api/v1/chat \
  -H 'Content-Type: application/json' \
  -d '{"user_id": "USER_ID", "message": "이번 달 식비 30만원 이내로 관리해줘"}'

# 목표 조회
curl -X POST http://localhost:8080/api/v1/chat \
  -H 'Content-Type: application/json' \
  -d '{"user_id": "USER_ID", "message": "내 목표 보여줘"}'

# 목표 평가 (knowledge_base 업데이트, 발송 안 함)
curl -X POST http://localhost:8080/api/v1/report \
  -H 'Content-Type: application/json' \
  -d '{"user_id": "USER_ID", "report_type": "goal_evaluate"}'

# 목표 진행률 리포트 (Telegram 발송)
curl -X POST http://localhost:8080/api/v1/report \
  -H 'Content-Type: application/json' \
  -d '{"user_id": "USER_ID", "report_type": "goal_status"}'
```

### 피로도 관리

Level 1 + Level 2 + Level 3 알림 합산하여 하루 3건 제한 유지.
목표 평가(goal_evaluate)는 저장만 하고 발송하지 않으므로 피로도에 영향 없음.
