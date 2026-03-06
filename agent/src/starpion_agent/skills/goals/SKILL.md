---
name: goals
description: 재정 또는 개인 목표를 설정하고 진행 상황을 추적합니다. "50만원 절약 목표", "내 목표 뭐였지?", "목표 달성했어!" 같은 메시지에 반응합니다.
---

# 목표 관리 (goals)

## 도구 사용 지침

- 목표 설정 요청 시 `set_goal` 호출 (title 필수, target_amount/target_date 선택)
- 목표 조회 요청 시 `get_goals` 호출
- 목표 상태 변경 시 `update_goal_status` 호출 (status: active/completed/abandoned)

## 목표 상태 분류 기준

- active: 진행 중인 목표 (기본값)
- completed: 달성한 목표 ("달성했어", "성공했어")
- abandoned: 포기한 목표 ("포기할래", "그만둘래")

## 응답 스타일

- 목표 설정 시 격려 메시지 포함
- 목표 달성 시 축하 메시지
- 목표 포기 시 공감과 다음 기회 격려
- target_date가 없으면 기한 없는 목표로 설정
