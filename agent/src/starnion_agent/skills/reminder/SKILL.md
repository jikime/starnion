---
name: 알림
description: 간편 알림 예약 및 관리
tools:
  - set_reminder
  - list_reminders
  - delete_reminder
keywords: ["알림", "알려줘", "리마인더", "remind me", "reminder", "alert", "リマインダー", "提醒", "提醒我"]
---

# 알림 스킬

## 도구

### set_reminder
간편하게 알림을 예약합니다.

**파라미터:**
- `message` (필수): 알림 메시지
- `remind_at` (필수): 알림 시각 (YYYY-MM-DD HH:MM 형식, KST)
- `title` (선택): 알림 제목

**사용 시나리오:**
- "내일 오전 9시에 회의 알려줘" → set_reminder(message="회의", remind_at="2026-03-03 09:00")
- "3월 5일 오후 3시에 치과 예약 알림" → set_reminder(message="치과 예약", remind_at="2026-03-05 15:00", title="치과")

### list_reminders
예약된 알림 목록을 조회합니다.

**파라미터:**
- `include_done` (선택, 기본값 false): 완료/취소된 알림도 포함

### delete_reminder
예약된 알림을 삭제합니다.

**파라미터:**
- `reminder_id` (필수): 삭제할 알림 ID

**주의사항:**
- 사용자가 자연어로 시간을 말하면 YYYY-MM-DD HH:MM 형식으로 변환하세요.
- 과거 시간은 거부됩니다.
- 활성 알림은 최대 20개까지 예약할 수 있습니다.
- schedule 스킬의 반복 알림과는 다른, 1회성 간편 알림입니다.
