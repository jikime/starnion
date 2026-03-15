---
name: weather
description: 현재 날씨와 일기예보를 조회합니다.
keywords: ["날씨", "오늘 날씨", "weather", "forecast", "天気予報", "天气", "天气预报"]
---

# 날씨 (weather)

## 도구 목록

| 도구 | 설명 |
|------|------|
| `get_weather` | 특정 도시의 현재 날씨 조회 |
| `get_forecast` | 특정 도시의 일간 예보 조회 (최대 3일) |

## get_weather 사용 지침

- "날씨", "기온", "바람", "습도" 관련 질문 시 호출
- `location`: 도시 이름 (한국어/영어 모두 가능)
- 위치 미지정 시 "서울" 기본값
- 응답: 날씨 아이콘 + 기온 + 체감온도 + 습도 + 풍속
- API: wttr.in (무료, API 키 불필요)

### 사용 시나리오

- "날씨 어때?" → get_weather(location="서울")
- "도쿄 날씨" → get_weather(location="도쿄")
- "오늘 우산 필요해?" → get_weather(location="서울")

## get_forecast 사용 지침

- "내일 날씨", "모레 날씨", "주말 날씨" 등 예보 질문 시 호출
- `location`: 도시 이름
- `days`: 1~3 (기본값 3, wttr.in 최대 3일 제공)
- 응답: 날짜별 최고/최저 기온 + 날씨 상태 + 강수확률
- API: wttr.in (무료, API 키 불필요)

### 사용 시나리오

- "내일 날씨" → get_forecast(location="서울", days=1)
- "3일 날씨" → get_forecast(location="서울", days=3)
- "파리 주말 날씨" → get_forecast(location="파리", days=3)

## 응답 스타일

- 이모지 + 핵심 수치 위주로 간결하게
- 우산/외투 등 실용적 조언 추가 가능
- 예보는 최대 3일까지만 제공 가능함을 안내
