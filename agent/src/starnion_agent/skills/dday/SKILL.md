---
name: 디데이
description: 중요한 날짜까지 남은 일수 추적
tools:
  - set_dday
  - list_ddays
  - delete_dday
keywords: ["디데이", "며칠 남았", "d-day", "countdown", "days until", "あと何日", "倒计时", "还有几天"]
---

# 디데이 스킬

## 도구

### set_dday
디데이를 설정합니다. 중요한 날짜까지 남은 일수를 추적합니다.

**파라미터:**
- `title` (필수): 디데이 이름 (예: 생일, 결혼기념일)
- `target_date` (필수): 목표 날짜 (YYYY-MM-DD 형식)
- `recurring` (선택, 기본값 false): 매년 반복 여부

**사용 시나리오:**
- "크리스마스 디데이 설정해줘" → set_dday(title="크리스마스", target_date="2026-12-25")
- "결혼기념일 매년 반복" → set_dday(title="결혼기념일", target_date="2026-05-20", recurring=true)

### list_ddays
디데이 목록을 조회합니다. 남은 일수를 함께 표시합니다.

**파라미터:**
- `include_past` (선택, 기본값 false): 지난 디데이도 포함

### delete_dday
디데이를 삭제합니다.

**파라미터:**
- `dday_id` (필수): 삭제할 디데이 ID

**주의사항:**
- 사용자가 자연어로 날짜를 말하면 YYYY-MM-DD 형식으로 변환하세요.
- 디데이는 최대 30개까지 설정할 수 있습니다.
- D-day(당일)이면 "D-Day!", 지난 날짜는 "D+N"으로 표시됩니다.
