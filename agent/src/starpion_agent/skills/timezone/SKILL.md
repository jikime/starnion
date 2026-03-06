---
skill_id: timezone
version: "1.0"
tools:
  - get_world_time
  - convert_timezone
---

# 세계시간 스킬

## 도구

### get_world_time
세계 각 도시의 현재 시간을 조회합니다.

**파라미터:**
- `city` (필수): 도시 이름 또는 IANA 타임존 (예: 서울, 뉴욕, Asia/Tokyo)

### convert_timezone
시간대를 변환합니다. 특정 시간을 다른 도시의 시간으로 변환합니다.

**파라미터:**
- `time_str` (필수): 변환할 시간 (예: 14:30, 2024-01-15 09:00)
- `from_tz` (선택, 기본값 "서울"): 원본 도시 또는 타임존
- `to_tz` (필수): 대상 도시 또는 타임존

**사용 시나리오:**
- "뉴욕 지금 몇 시야?" → get_world_time(city="뉴욕")
- "도쿄 현재 시간 알려줘" → get_world_time(city="도쿄")
- "서울 14:30이면 뉴욕은 몇 시야?" → convert_timezone(time_str="14:30", from_tz="서울", to_tz="뉴욕")
- "런던 9시면 서울은?" → convert_timezone(time_str="09:00", from_tz="런던", to_tz="서울")

**지원 도시:**
서울, 도쿄, 베이징, 뉴욕, LA, 런던, 파리, 베를린, 시드니, 두바이, 모스크바, 싱가포르, 방콕, 홍콩, 타이베이, 자카르타, 하노이, 뭄바이, 카이로, 이스탄불
또는 IANA 타임존 (예: America/Chicago, Europe/Rome) 직접 입력 가능
