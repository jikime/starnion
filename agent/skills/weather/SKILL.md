---
name: weather
display_name: 날씨
description: "Get current weather and forecasts using wttr.in (no API key required). Use for: 날씨, 기온, 비, 눈, 우산, 미세먼지, 오늘 날씨, weather, forecast, temperature, humidity"
version: 1.0.0
emoji: "⛅"
category: utility
enabled_by_default: true
requires_api_key: false
platforms: web, telegram, api
uses_provider: false
allowed-tools:
  - Bash
  - exec
triggers:
  keywords:
    - 날씨
    - 기온
    - 기상
    - 비
    - 눈
    - 맑음
    - 흐림
    - 우산
    - 더워
    - 추워
    - 습도
    - 바람
    - 미세먼지
    - weather
    - forecast
    - temperature
    - rain
    - snow
    - humidity
  when_to_use:
    - User asks about current weather conditions
    - User asks for weather forecast (today, tomorrow, weekly)
    - User asks whether to bring umbrella or jacket
    - User mentions temperature or precipitation
---

# Weather

Use `python3 weather/scripts/weather.py` to get **current weather** or **forecasts** via wttr.in. No API key required.

Always pass `--user-id {user_id}`.

## Commands

### Current weather

```bash
python3 weather/scripts/weather.py \
  --user-id {user_id} current \
  --location "{city name}"
```

### Weather forecast (1–3 days)

```bash
python3 weather/scripts/weather.py \
  --user-id {user_id} forecast \
  --location "{city name}" \
  --days 3
```

**`--days`:** `1`, `2`, or `3` (default: `3`)

## Output

### current

```
☀️ Seoul, South Korea 현재 날씨: 맑음
🌡️ 기온: 13°C (체감 12°C)
💧 습도: 38%
💨 풍속: 18 km/h
☀️ UV 지수: 1
```

### forecast

```
📅 Seoul, South Korea 3일 예보

☀️ 2026-03-20: 맑음, 3°C ~ 12°C, 강수확률 0%
☀️ 2026-03-21: 맑음, 4°C ~ 13°C, 강수확률 0%
☁️ 2026-03-22: 흐림, 6°C ~ 13°C, 강수확률 0%
```

## Examples

**User:** "서울 날씨 어때?"

```bash
python3 weather/scripts/weather.py \
  --user-id abc123 current --location "Seoul"
```

**User:** "부산 3일 예보 알려줘"

```bash
python3 weather/scripts/weather.py \
  --user-id abc123 forecast --location "Busan" --days 3
```

**User:** "도쿄 내일 날씨는?"

```bash
python3 weather/scripts/weather.py \
  --user-id abc123 forecast --location "Tokyo" --days 1
```

## Notes

- Location can be a city name in English or Korean (e.g. `Seoul`, `서울`, `Tokyo`, `New York`)
- No API key or environment variables required
- Data source: [wttr.in](https://wttr.in) (free public weather service)
