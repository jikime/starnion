# 자율 스케줄링 고도화 (Level 4: User-Created Schedules)

## 개요

사용자가 자연어 대화를 통해 알림 스케줄을 직접 생성/조회/취소할 수 있는 기능.
기존 Level 1~3 (시스템 정의 규칙)과 달리, 사용자가 원하는 시간에 원하는 알림을 자유롭게 예약할 수 있다.

---

## 아키텍처

```
사용자 (Telegram)
  │
  ├─ "매주 월요일 9시에 주간 리포트 보내줘"
  │
  ▼
Python Agent (LangGraph ReAct)
  │
  ├─ create_schedule tool 호출
  │   → knowledge_base 테이블에 JSON 저장
  │     key: "schedule:{uuid8}"
  │     value: { title, type, report_type, schedule, status, ... }
  │
  ▼
Go Gateway (Cron Scheduler)
  │
  ├─ */15 * * * * : runUserSchedulesRule()
  │   → knowledge_base에서 active 스케줄 조회
  │   → 현재 시간과 매칭 확인 (15분 윈도우)
  │   → Fatigue 체크 후 알림 발송
  │   → 상태 업데이트 (last_sent / completed)
  │
  ▼
Telegram 알림 발송
```

---

## 구성 요소

### 1. Python Agent Tools (`agent/src/jiki_agent/tools/schedule.py`)

3개의 LangChain chat tool:

| Tool | 설명 | 주요 파라미터 |
|------|------|---------------|
| `create_schedule` | 알림 스케줄 생성 | title, report_type, schedule_type, hour, minute, day_of_week, date, message |
| `list_schedules` | 스케줄 목록 조회 | include_completed (bool) |
| `cancel_schedule` | 스케줄 취소 | schedule_id (8자리 hex) |

**지원 알림 유형 (`report_type`)**:

| 유형 | 설명 | 발송 방식 |
|------|------|-----------|
| `weekly` | 주간 리포트 | gRPC → Agent 생성 |
| `daily_summary` | 일간 요약 | gRPC → Agent 생성 |
| `monthly_closing` | 월간 마감 | gRPC → Agent 생성 |
| `pattern_insight` | 패턴 인사이트 | gRPC → Agent 생성 |
| `goal_status` | 목표 현황 | gRPC → Agent 생성 |
| `custom_reminder` | 커스텀 알림 | Telegram 직접 발송 (message 필드) |

**제약 사항**:
- 활성 스케줄 최대 10개 (`MAX_ACTIVE_SCHEDULES`)
- 시간: 0~23 (KST), 분: 0~59
- 1회(`one_time`): 날짜(YYYY-MM-DD) 필수
- 반복(`recurring`): 요일(monday~sunday) 선택, 미지정 시 매일
- `custom_reminder`: message 필수

### 2. 데이터 저장 (knowledge_base)

스케줄은 기존 `knowledge_base` 테이블을 재활용한다. 별도 테이블 생성 불필요.

```json
{
  "key": "schedule:a1b2c3d4",
  "value": {
    "title": "주간 리포트",
    "type": "recurring",
    "report_type": "weekly",
    "schedule": {
      "hour": 9,
      "minute": 0,
      "day_of_week": "monday",
      "date": ""
    },
    "status": "active",
    "message": "",
    "last_sent": "2026-03-01",
    "created_at": "2026-03-01T10:30:00"
  }
}
```

**상태 전이**:
```
active → completed  (one_time 발송 완료 시)
active → cancelled  (사용자 취소 시)
```

### 3. Go Gateway Polling (`gateway/internal/scheduler/schedule.go`)

Cron 스케줄: `*/15 * * * *` (15분마다 실행)

**처리 흐름**:

```
runUserSchedulesRule()
  │
  ├─ getActiveSchedules()
  │   → SELECT ... FROM knowledge_base
  │     WHERE key LIKE 'schedule:%'
  │       AND value::jsonb->>'status' = 'active'
  │
  ├─ for entry in entries:
  │   ├─ isScheduleDue(entry, now)
  │   │   ├─ one_time: 날짜 매칭 확인
  │   │   ├─ recurring: 요일 매칭 확인
  │   │   ├─ last_sent: 당일 중복 방지
  │   │   └─ 시간 윈도우: nowMins ∈ [schedMins, schedMins+15)
  │   │
  │   ├─ fatigue.canNotify(): 알림 피로도 체크
  │   │
  │   ├─ 발송:
  │   │   ├─ custom_reminder → telegram.SendMessage(chatID, message)
  │   │   └─ 기타 → GenerateAndSendType(userID, chatID, reportType)
  │   │
  │   └─ 상태 업데이트:
  │       ├─ one_time → markScheduleCompleted()
  │       └─ recurring → updateScheduleLastSent()
  │
  └─ 로그 출력
```

### 4. Agent 등록 (`agent/src/jiki_agent/graph/agent.py`)

```python
tools = [
    # ... 기존 12개 tools ...
    create_schedule,
    list_schedules,
    cancel_schedule,
]
```

### 5. Cron 등록 (`gateway/internal/scheduler/cron.go`)

```go
// Level 4: User-Created Schedules
{"*/15 * * * *", "user_schedules", s.runUserSchedulesRule},
```

---

## 변경 파일 목록

| File | Action | Description |
|------|--------|-------------|
| `agent/src/jiki_agent/tools/schedule.py` | NEW | 3개 chat tools (create, list, cancel) |
| `gateway/internal/scheduler/schedule.go` | NEW | Gateway 폴링 로직 (query, match, send, update) |
| `agent/src/jiki_agent/graph/agent.py` | MODIFIED | 3개 tool 임포트 및 등록 (12 → 15 tools) |
| `gateway/internal/scheduler/cron.go` | MODIFIED | Level 4 cron 엔트리 추가 |

---

## 테스트 방법

### Telegram에서 테스트

```
사용자: "매일 아침 8시에 일간 요약 보내줘"
봇: 알림을 예약했어요! '일간 요약'
    스케줄 ID: a1b2c3d4
    유형: 일간 요약
    발송: 매일 08:00 (KST)

사용자: "알림 목록 보여줘"
봇: [활성] 일간 요약 (ID: a1b2c3d4)
      유형: 일간 요약
      발송: 매일 08:00

사용자: "a1b2c3d4 취소해줘"
봇: '일간 요약' 알림을 취소했어요.
```

### DB에서 확인

```sql
-- 활성 스케줄 조회
SELECT key, value::jsonb->>'title' AS title,
       value::jsonb->>'status' AS status
FROM knowledge_base
WHERE key LIKE 'schedule:%'
ORDER BY created_at DESC;

-- 특정 유저의 스케줄
SELECT * FROM knowledge_base
WHERE user_id = 'YOUR_USER_ID'
  AND key LIKE 'schedule:%';
```

---

## 설계 결정

| 결정 | 선택 | 이유 |
|------|------|------|
| 저장소 | knowledge_base 재활용 | 새 테이블 불필요, 기존 CRUD repo 재사용 |
| 스케줄 ID | uuid4 hex 앞 8자리 | 사용자에게 보여주기에 적절한 길이 |
| 폴링 주기 | 15분 | 정밀도와 DB 부하 균형 |
| 시간 윈도우 | [scheduled, scheduled+15) | 폴링 주기와 동일하여 누락 방지 |
| custom_reminder | Telegram 직접 발송 | gRPC 불필요, 사용자 메시지 그대로 전달 |
| Fatigue 통합 | canNotify() 체크 | 기존 피로도 관리 체계와 일관성 |

---

**상태**: ✅ 구현 완료
**날짜**: 2026-03-02
