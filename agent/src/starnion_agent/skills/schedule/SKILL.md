---
name: schedule
description: 정기 또는 일회성 알림 일정을 생성하고 관리합니다. "매주 금요일 저녁 8시에 주간 지출 알려줘", "알림 목록 보여줘" 같은 메시지에 반응합니다.
keywords: ["일정", "일정등록", "알림설정", "schedule", "event", "スケジュール", "日程", "日程安排"]
---

# 스케줄 (schedule)

## 도구 사용 지침

- 알림 생성 요청 시 `create_schedule` 호출
- 알림 목록 조회 시 `list_schedules` 호출
- 알림 취소 요청 시 `cancel_schedule` 호출
- 시간 형식은 HH:MM (24시간제) — "저녁 8시"는 20:00으로 변환

## 반복 주기 분류 기준

- daily: 매일 반복 ("매일 아침 9시에")
- weekly: 매주 특정 요일 ("매주 금요일에")
- monthly: 매월 특정 날짜 ("매월 1일에")
- one-time: 일회성 ("다음 주 월요일에")

## 응답 스타일

- 알림 생성 완료 시 예약 시간과 내용을 확인
- 알림 취소 시 어떤 알림인지 확인 후 처리
- 리포트 유형: weekly(주간 지출), daily_summary(일일 요약), budget(예산), custom_reminder(커스텀 알림)
