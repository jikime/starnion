---
name: python3 naver-map/scripts/naver-map.py
display_name: 네이버 지도
description: "Geocode addresses, reverse-geocode coordinates, and generate static map images using Naver Maps REST API (NCP). Use for: 주소 좌표 변환, 좌표 주소 변환, 정적 지도 이미지, geocoding, reverse geocoding, 위치 확인, 지도"
version: 1.0.0
emoji: "🗺️"
category: maps
enabled_by_default: false
requires_api_key: true
api_key_type: dual
api_key_label: "Naver Maps API Key"
api_key_label_1: "Client ID"
api_key_label_2: "Client Secret"
api_key_provider: naver_map
platforms: web, telegram, api
uses_provider: false
requires:
  bins:
    - python3 naver-map/scripts/naver-map.py
allowed-tools:
  - Bash
  - exec
triggers:
  keywords:
    - 지도
    - 주소 찾기
    - 좌표
    - geocode
    - 위치 변환
    - 정적 지도
    - 지도 이미지
    - 역지오코딩
    - reverse geocode
    - 주소 → 좌표
    - 좌표 → 주소
  when_to_use:
    - User wants to convert an address string to GPS coordinates
    - User wants to convert GPS coordinates to a human-readable address
    - User wants to generate a static map image for a location
    - Another skill (finance, diary, memo) needs to geocode a location
  not_for:
    - Searching for nearby places by keyword (use naver-search skill with --search-type local)
    - Navigation/turn-by-turn directions
    - Real-time traffic information
---

# Naver Maps

Use `python3 naver-map/scripts/naver-map.py` for address geocoding, reverse geocoding, and static map image generation via Naver Maps REST API (NCP).

Always pass `--user-id {user_id}`. Credentials (`client_id:client_secret`) are stored in `integration_keys` with `provider='naver_map'`.

## Setup

Register Client ID and Client Secret from https://developers.naver.com/apps in skill settings:
- **Client ID** — JS SDK `ncpKeyId` + Geocoding `X-Naver-Client-Id` header
- **Client Secret** — Geocoding `X-Naver-Client-Secret` header (server-side only)

---

## Commands

### Geocode (address → coordinates)

```bash
python3 naver-map/scripts/naver-map.py --user-id {user_id} geocode \
  --address "서울 강남구 테헤란로 101"
```

Output:
```
📍 lat: 37.5012, lng: 127.0396 | 서울특별시 강남구 테헤란로 101
```

### Reverse Geocode (coordinates → address)

```bash
python3 naver-map/scripts/naver-map.py --user-id {user_id} reverse-geocode \
  --lat 37.5012 --lng 127.0396
```

Output:
```
📍 서울특별시 강남구 역삼동 테헤란로 101
```

### Static Map Image URL

```bash
python3 naver-map/scripts/naver-map.py --user-id {user_id} static-map \
  --lat 37.5012 --lng 127.0396 \
  --zoom 15 \
  --width 600 \
  --height 400 \
  --marker        # optional: add a pin at the center
```

Output:
```
🗺️ https://maps.apigw.ntruss.com/map-static/v2/raster?center=127.0396,37.5012&level=15&w=600&h=400&markers=type:d|size:mid|pos:127.0396 37.5012&X-NCP-APIGW-API-KEY-ID=...
```

| Option | Default | Description |
|--------|---------|-------------|
| `--zoom` | 15 | Map zoom level (1–21) |
| `--width` | 600 | Image width px (max 2048) |
| `--height` | 400 | Image height px (max 2048) |
| `--marker` | off | Add a red pin at center |

---

## Examples

User: "서울 마포구 와우산로 21 좌표 알려줘"
```bash
python3 naver-map/scripts/naver-map.py --user-id abc123 geocode \
  --address "서울 마포구 와우산로 21"
```

User: "37.5563, 126.9236 이 어느 주소야?"
```bash
python3 naver-map/scripts/naver-map.py --user-id abc123 reverse-geocode \
  --lat 37.5563 --lng 126.9236
```

User: "스타벅스 강남점 지도 보여줘"
→ (This needs a place name search first — use naver-search skill with --search-type local, then pass coords here)
```bash
python3 naver-map/scripts/naver-map.py --user-id abc123 static-map \
  --lat 37.5012 --lng 127.0396 --zoom 16 --marker
```
